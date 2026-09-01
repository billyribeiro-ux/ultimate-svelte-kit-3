/**
 * THE SYNC ENGINE
 * ===============
 *
 * Local-first, stated as an order of operations:
 *
 *   1. the edit changes the document, synchronously, in the same frame as the
 *      input event
 *   2. it goes into a durable outbox on this device
 *   3. some time later — possibly much later — it reaches the server
 *
 * Step 3 is allowed to fail, retry, or never happen. Nothing above it waits for
 * it, and no part of the interface is disabled because of it. That is the whole
 * design, and everything below is the machinery for making step 3 eventually
 * succeed without anybody watching.
 *
 * FOUR STATES, HONESTLY REPORTED
 * ------------------------------
 * A collaborative tool that lies about its connection is worse than one with no
 * indicator at all, because people calibrate their trust against it. `status`
 * here means exactly what it says: `live` only while a stream is open and the
 * outbox is empty, and `offline` the moment either stops being true.
 */

import { untrack } from 'svelte';
import type { ActorId } from '#lib/crdt/index.ts';
import { BoardDocument, LoadedBoard, parseOperation, type Operation } from '#lib/board/index.ts';
import { BATCH_LIMIT } from '#lib/board/index.ts';
import {
	PRESENCE_HEARTBEAT_MS,
	type Peer,
	type PresenceUpdate,
	type ServerEvent
} from './protocol.ts';
import { pushOps, announcePresence } from '#lib/remote/sync.remote.ts';
import { actorId } from './actor.ts';
import * as local from './local.ts';

export type SyncStatus =
	/** Connected, and everything this device has made is acknowledged. */
	| 'live'
	/** Connected, with work still in the outbox. */
	| 'saving'
	| 'connecting'
	/** No stream. Editing continues; the outbox grows. */
	| 'offline'
	/** The server refused something. Editing continues locally, but this board is stale. */
	| 'refused';

/** How long to gather local operations before sending them. */
const FLUSH_MS = 80;

/** How long after the last change to write a new local snapshot. */
const SNAPSHOT_MS = 2_000;

const MAX_BACKOFF_MS = 30_000;

export class SyncClient {
	status = $state<SyncStatus>('connecting');
	/** How many operations are waiting to reach the server. */
	queued = $state(0);
	/**
	 * Everybody else on the board.
	 *
	 * `$state.raw` because the array is replaced wholesale on every roster update
	 * and nothing ever mutates a `Peer` in place. Deep reactivity here would wrap
	 * every peer, every cursor and every selection array in a proxy, sixty times a
	 * second, to support writes that do not exist.
	 */
	peers = $state.raw<readonly Peer[]>([]);
	/** Set when the server refuses; shown once, not on a loop. */
	refusal = $state<string | null>(null);

	readonly document: BoardDocument;
	readonly boardId: string;
	readonly actor: ActorId;
	readonly readOnly: boolean;

	#watermark: number;
	#buffer: Operation[] = [];
	#flushTimer: ReturnType<typeof setTimeout> | null = null;
	#snapshotTimer: ReturnType<typeof setTimeout> | null = null;
	#presenceTimer: ReturnType<typeof setInterval> | null = null;
	#source: EventSource | null = null;
	#reconnect: ReturnType<typeof setTimeout> | null = null;
	#attempt = 0;
	#flushing = false;
	#stopped = false;
	#detach: (() => void) | null = null;
	#lastPresence: PresenceUpdate | null = null;

	constructor(document: BoardDocument, boardId: string, watermark: number, readOnly: boolean) {
		this.document = document;
		this.boardId = boardId;
		this.actor = document.actor;
		this.#watermark = watermark;
		this.readOnly = readOnly;
	}

	/* ---------------------------------------------------------------- */
	/* Lifecycle                                                         */
	/* ---------------------------------------------------------------- */

	async start(): Promise<void> {
		this.#stopped = false;

		this.#detach = this.document.onLocalOperation((operation) => {
			this.#buffer.push(operation);
			this.queued += 1;
			this.#scheduleFlush();
			this.#scheduleSnapshot();
		});

		this.queued = await local.outboxSize(this.boardId).catch(() => 0);
		this.#connect();
		this.#scheduleFlush();

		/*
		 * Re-announce presence on a heartbeat even when nothing has moved.
		 *
		 * The server expires a peer that has been quiet, because a closed tab sends
		 * no goodbye. Without a heartbeat, somebody reading a board without touching
		 * it disappears from everybody else's roster after fifteen seconds while
		 * still very much present.
		 */
		this.#presenceTimer = setInterval(() => {
			if (this.#lastPresence) void this.#sendPresence(this.#lastPresence);
		}, PRESENCE_HEARTBEAT_MS);

		/*
		 * The browser's own connectivity signals.
		 *
		 * `online` is a hint, not a promise — a captive portal reports online and
		 * refuses every request — so it triggers a reconnect attempt rather than a
		 * state change. `offline` is reliable in the other direction, and reacting
		 * to it immediately avoids a doomed request and its timeout.
		 */
		addEventListener('online', this.#onOnline);
		addEventListener('offline', this.#onOffline);

		/*
		 * A last chance to persist.
		 *
		 * `visibilitychange` rather than `beforeunload`, which is unreliable on
		 * mobile — a browser backgrounded and then killed by the OS never fires it.
		 * `hidden` fires in both cases and is the last event guaranteed to arrive.
		 */
		addEventListener('visibilitychange', this.#onHidden);
	}

	stop(): void {
		this.#stopped = true;
		this.#detach?.();
		this.#source?.close();
		this.#source = null;

		for (const timer of [this.#flushTimer, this.#snapshotTimer, this.#reconnect]) {
			if (timer) clearTimeout(timer);
		}
		if (this.#presenceTimer) clearInterval(this.#presenceTimer);

		removeEventListener('online', this.#onOnline);
		removeEventListener('offline', this.#onOffline);
		removeEventListener('visibilitychange', this.#onHidden);

		void this.#saveSnapshot();
	}

	#onOnline = () => {
		this.#attempt = 0;
		this.#connect();
		void this.#flush();
	};

	#onOffline = () => {
		this.status = 'offline';
		this.#source?.close();
		this.#source = null;
	};

	#onHidden = () => {
		if (document.visibilityState === 'hidden') void this.#saveSnapshot();
	};

	/* ---------------------------------------------------------------- */
	/* The stream                                                        */
	/* ---------------------------------------------------------------- */

	#connect(): void {
		if (this.#stopped || this.#source) return;

		this.status = this.queued > 0 ? 'saving' : 'connecting';

		const url = `/api/boards/${encodeURIComponent(this.boardId)}/stream?since=${this.#watermark}&actor=${this.actor}`;
		const source = new EventSource(url);
		this.#source = source;

		source.onopen = () => {
			this.#attempt = 0;
			this.#settle();
		};

		source.onmessage = (event) => this.#receive(event.data);

		source.onerror = () => {
			/*
			 * `EventSource` retries on its own, and its schedule is not ours: a fixed
			 * few seconds, forever, with no jitter. A hundred clients reconnecting to a
			 * server that has just restarted then arrive in lockstep and knock it over
			 * again. Closing it here and rescheduling by hand costs a few lines and
			 * buys exponential backoff with jitter.
			 */
			source.close();
			this.#source = null;
			if (this.#stopped) return;

			this.status = 'offline';
			this.#scheduleReconnect();
		};
	}

	#scheduleReconnect(): void {
		if (this.#reconnect) clearTimeout(this.#reconnect);

		const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.#attempt);
		// Full jitter. Half of the delay is fixed so backoff still means something,
		// half is random so a thundering herd spreads out.
		const delay = base / 2 + Math.random() * (base / 2);
		this.#attempt += 1;

		this.#reconnect = setTimeout(() => this.#connect(), delay);
	}

	#receive(data: string): void {
		let event: ServerEvent;
		try {
			event = JSON.parse(data) as ServerEvent;
		} catch {
			// A truncated frame. The stream will resync; there is nothing to salvage
			// from half a message.
			return;
		}

		switch (event.type) {
			case 'hello':
				this.#settle();
				break;

			case 'ops': {
				const incoming: Operation[] = [];
				for (const candidate of event.ops) {
					/*
					 * Re-validated on arrival.
					 *
					 * These came from our own server, which validated them on the way in
					 * — but they may have been written months ago by an older version of
					 * this application. Failing loudly on one operation is far better
					 * than feeding a shape the CRDT does not understand into a document
					 * somebody is about to keep working in.
					 */
					try {
						incoming.push(parseOperation(candidate));
					} catch (thrown) {
						console.error('[tessera] rejected an operation from the server', thrown);
					}
				}

				/*
				 * Our own operations come back on this stream too, and applying them is
				 * a no-op. They are filtered anyway, because "no-op" still means walking
				 * the switch, touching the clock and re-materialising a label — for
				 * every keystroke, on the replica that is already busy typing.
				 */
				this.document.applyAll(
					incoming.filter((operation) => !operation.stamp.endsWith(this.actor))
				);

				this.#watermark = Math.max(this.#watermark, event.watermark);
				this.#scheduleSnapshot();
				break;
			}

			case 'presence':
				this.peers = event.peers.filter((peer) => peer.actor !== this.actor);
				break;

			case 'ping':
				break;
		}
	}

	/* ---------------------------------------------------------------- */
	/* Sending                                                           */
	/* ---------------------------------------------------------------- */

	#scheduleFlush(): void {
		if (this.#flushTimer) return;
		this.#flushTimer = setTimeout(() => {
			this.#flushTimer = null;
			void this.#flush();
		}, FLUSH_MS);
	}

	/**
	 * Send what is queued.
	 *
	 * One request in flight at a time, always. Two concurrent pushes can arrive at
	 * the server out of order, which is survivable, and can interleave their
	 * outbox deletions, which is not — a batch could be marked acknowledged
	 * because a *different* batch succeeded. The lock is one boolean and it makes
	 * the whole path reasonable.
	 */
	async #flush(): Promise<void> {
		/*
		 * Skipped because one is already in flight.
		 *
		 * Nothing is scheduled here on purpose — the running flush reschedules
		 * itself in its `finally` if anything is left. The first version of this
		 * returned and *also* did not reschedule, which silently stranded the tail
		 * of every fast burst: type five characters, the flush for the first four
		 * is in flight when the fifth arrives, its timer fires, this returns, and
		 * the fifth operation sits in `#buffer` for the rest of the session.
		 *
		 * The symptom was a label that read `Alph` on every other replica and
		 * `Alpha` on the one that typed it, surviving a reload, because the
		 * operation never reached the server at all. A randomised end-to-end test
		 * found it about one run in three.
		 */
		if (this.#flushing || this.#stopped || this.readOnly) return;

		// Persist before sending. If the tab dies between these two lines the work
		// is in the outbox; the other order loses it.
		const buffered = this.#buffer.splice(0);
		if (buffered.length > 0) await local.enqueue(this.boardId, buffered).catch(() => {});

		const waiting = await local.pending(this.boardId).catch(() => buffered);
		if (waiting.length === 0) {
			this.queued = 0;
			this.#settle();
			return;
		}

		this.queued = waiting.length;
		this.#flushing = true;

		try {
			const batch = waiting.slice(0, BATCH_LIMIT);
			const result = await pushOps({ boardId: this.boardId, actor: this.actor, ops: batch });

			await local.acknowledge(this.boardId, batch).catch(() => {});
			this.#watermark = Math.max(this.#watermark, result.watermark);
			this.queued = Math.max(0, waiting.length - batch.length);
			this.refusal = null;
			this.#settle();
		} catch (thrown) {
			this.#onPushFailure(thrown);
		} finally {
			this.#flushing = false;

			/*
			 * Always look again.
			 *
			 * Two things can be waiting by now: operations made while this request was
			 * in flight (in `#buffer`), and the remainder of a batch larger than
			 * `BATCH_LIMIT` (already in the outbox). Rescheduling here rather than at
			 * each of those sites means there is exactly one place responsible for
			 * "the queue is not empty, come back", and no path that forgets.
			 */
			if (this.#buffer.length > 0 || this.queued > 0) this.#scheduleFlush();
		}
	}

	/**
	 * A push failed. The distinction that matters is retryable or not.
	 *
	 * A network error is retryable and the outbox keeps the work. A 403 or 422 is
	 * not: sending it again will fail identically, forever, and the operations
	 * would sit in the outbox for the life of the browser profile. Those are
	 * surfaced and the queue is left alone for a person to decide about — losing
	 * their work silently to tidy up a queue is not an option.
	 */
	#onPushFailure(thrown: unknown): void {
		const status = (thrown as { status?: number }).status;

		if (status === 403 || status === 422) {
			this.refusal =
				(thrown as { body?: { message?: string } }).body?.message ?? 'The server refused a change.';
			this.status = 'refused';
			return;
		}

		this.status = 'offline';
		this.#scheduleFlush();
	}

	#settle(): void {
		if (this.status === 'refused') return;
		this.status = this.#source && this.queued === 0 ? 'live' : this.#source ? 'saving' : 'offline';
	}

	/* ---------------------------------------------------------------- */
	/* Presence                                                          */
	/* ---------------------------------------------------------------- */

	/**
	 * Tell everybody where this replica is looking.
	 *
	 * Fire and forget, and deliberately not awaited by the caller: a pointer move
	 * handler that awaits a network call is a pointer move handler that drops
	 * frames.
	 */
	present(update: Omit<PresenceUpdate, 'boardId' | 'actor'>): void {
		this.#lastPresence = { ...update, boardId: this.boardId, actor: this.actor };
		void this.#sendPresence(this.#lastPresence);
	}

	async #sendPresence(update: PresenceUpdate): Promise<void> {
		try {
			await announcePresence(update);
		} catch {
			// Presence is disposable by definition. A failure is the next heartbeat's
			// problem, and showing an error for a cursor position would be absurd.
		}
	}

	/* ---------------------------------------------------------------- */
	/* Local snapshots                                                   */
	/* ---------------------------------------------------------------- */

	#scheduleSnapshot(): void {
		if (this.#snapshotTimer) clearTimeout(this.#snapshotTimer);
		this.#snapshotTimer = setTimeout(() => void this.#saveSnapshot(), SNAPSHOT_MS);
	}

	/**
	 * Write the document to IndexedDB.
	 *
	 * Debounced rather than immediate: a drag produces a hundred and twenty
	 * operations a second and serialising the whole document that often would
	 * dominate the frame budget. Two seconds of idle is the worst case for how
	 * much replay a crash costs, and replay comes out of the outbox, which is
	 * written immediately.
	 */
	async #saveSnapshot(): Promise<void> {
		if (!local.available()) return;

		try {
			await local.writeSnapshot({
				boardId: this.boardId,
				// `untrack` so serialising the document does not make this a dependency
				// of whatever effect happens to be running.
				snapshot: untrack(() => this.document.toSnapshot()),
				watermark: this.#watermark
			});
		} catch (thrown) {
			// Quota exceeded, or storage disabled. The board still works from memory
			// and from the server; only the offline guarantee is lost, and saying so
			// once is more useful than failing silently.
			console.warn('[tessera] could not save a local snapshot', thrown);
		}
	}
}

/**
 * Open a board: reconcile what this device already has with what the server
 * sent, and start syncing.
 *
 * The reconciliation is the interesting part. Either side can be ahead — the
 * server if somebody else has been editing, this device if it has been offline —
 * so the newer snapshot wins as the starting point and the outbox is replayed on
 * top of it. Replaying is safe because every operation is idempotent, and
 * necessary because those operations are the ones the server has never seen.
 */
export async function connect(loaded: LoadedBoard): Promise<SyncClient> {
	const actor = actorId();
	const stored = local.available()
		? await local.readSnapshot(loaded.id).catch(() => undefined)
		: undefined;

	const useLocal = stored !== undefined && stored.watermark >= loaded.watermark;

	const document = useLocal
		? BoardDocument.fromSnapshot(actor, stored.snapshot)
		: loaded.hydrate(actor);

	const watermark = useLocal ? stored.watermark : loaded.watermark;

	if (local.available()) {
		const waiting = await local.pending(loaded.id).catch(() => []);
		document.applyAll(waiting);
	}

	const client = new SyncClient(document, loaded.id, watermark, loaded.readOnly);
	await client.start();
	return client;
}
