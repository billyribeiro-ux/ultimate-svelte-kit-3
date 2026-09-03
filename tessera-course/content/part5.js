/**
 * PART 5 — Local-first sync, and the four bugs in it
 * (chapters 21–25)
 *
 * The client half. A tab's identity, a durable outbox, the wire format, and the
 * engine that ties them together. The last chapter of this part is nothing but
 * the four bugs this file had, because they are all the same bug wearing
 * different hats and recognising the shape is worth more than the fixes.
 */

export const part5 = [
	{
		slug: 'identity-and-the-wire',
		title: 'A tab’s identity, and what crosses the network',
		summary:
			'One actor per tab and why that is a requirement rather than a simplification — plus two channels with opposite guarantees.',
		goal: 'Give this replica an identity that cannot collide, and describe every message in one file both sides import.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/sync/actor.ts',
				lang: 'ts',
				code: `
/**
 * THIS REPLICA'S IDENTITY
 * =======================
 *
 * One actor id per **tab**, not per user and not per device.
 *
 * That is not a simplification, it is the requirement. Two tabs open on the same
 * board can genuinely edit at the same time, and if they share an actor id they
 * share a clock — two independent \`tick()\` sequences issuing the same stamps,
 * which the CRDT resolves by keeping one character and discarding the other.
 * The symptom is typing that vanishes in one tab and not the other, and it is
 * miserable to track down.
 *
 * \`sessionStorage\` is per tab by definition, which makes it exactly the right
 * store: a reload keeps the id (so the clock resumes and no stamp is reissued),
 * a duplicated tab gets its own, and closing the tab forgets it.
 */`
			},
			{
				type: 'warn',
				text: 'Per **tab**, not per user and not per device. If two tabs share an actor id they share a clock — two independent `tick()` sequences issuing the same stamps — and the CRDT resolves that by keeping one character and discarding the other. The symptom is typing that vanishes in one tab and not the other.'
			},
			{
				type: 'p',
				text: '`sessionStorage` is per tab by definition, which makes it exactly right: a reload keeps the id, so the clock resumes and no stamp is reissued; a duplicated tab gets its own; closing the tab forgets it.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/actor.ts',
				lang: 'ts',
				code: `
/**
 * The id for this tab, created on first use.
 *
 * Falls back to an in-memory id when storage is unavailable — a private window,
 * or a browser configured to block site data. That replica still works
 * perfectly; it simply gets a new identity on every reload, which costs a little
 * tombstone growth and nothing else.
 */
export function actorId(): ActorId {
	if (cached) return cached;

	try {
		const stored = sessionStorage.getItem(KEY);
		if (stored && /^[0-9a-z]{8}$/.test(stored)) {
			cached = stored as ActorId;
			return cached;
		}
	} catch {
		// Storage is blocked. Carry on with a fresh id.
	}

	cached = newActorId();

	try {
		sessionStorage.setItem(KEY, cached);
	} catch {
		// As above. The id lives for as long as this page does.
	}

	return cached;
}`
			},
			{
				type: 'note',
				text: 'Both `try` blocks are there because a private window, or a browser configured to block site data, throws on `sessionStorage` access rather than returning null. The fallback replica works perfectly; it simply gets a new identity on every reload, which costs a little tombstone growth and nothing else. Degrade, do not fail.'
			},

			{ type: 'h3', id: 'the-wire', text: 'One file both sides import' },
			{
				type: 'code',
				file: 'src/lib/sync/protocol.ts',
				lang: 'ts',
				code: `
/**
 * THE WIRE
 * ========
 *
 * One file, imported by both sides, describing everything that crosses the
 * network. Client and server cannot drift, because there is nothing for them to
 * drift from.
 *
 * TWO CHANNELS, ON PURPOSE
 * ------------------------
 * Operations and presence look similar — small messages about a board, sent
 * often — and they have opposite requirements.
 *
 *   operations   must never be lost, must be ordered, must survive a
 *                disconnection, and are worth storing forever.
 *   presence     is worthless one second later. A cursor position that arrives
 *                late is not "delayed", it is wrong, and the correct handling of
 *                a dropped presence packet is to forget it happened.
 *
 * Sending both through the same durable path means either paying for durability
 * on cursor positions — writing sixty rows a second per person, to be deleted
 * moments later — or weakening the guarantee on operations. So: operations go
 * through a \`command()\` that writes to the log and returns a watermark; presence
 * goes through a \`command()\` that writes nowhere and is dropped if nobody is
 * listening. Both arrive back over the same SSE stream, tagged, because a second
 * connection per board would double the sockets to save nothing.
 */`
			},
			{
				type: 'why',
				title: 'Two channels, because the guarantees are opposite',
				text: 'Operations and presence look like the same kind of thing — small, frequent messages about a board. They need opposite handling. An operation must never be lost, must be ordered, must survive a disconnection, and is worth storing forever. A cursor position is **worthless one second later**: a presence packet that arrives late is not "delayed", it is wrong, and the correct response to a dropped one is to forget it happened. Push both down the same durable path and you either pay for durability on cursor positions — sixty rows a second per person, deleted moments later — or weaken the guarantee on operations.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/protocol.ts',
				lang: 'ts',
				code: `
/** 8 lowercase base-36 characters. See \`crdt/clock.ts\`. */
const actorId = v.pipe(v.string(), v.regex(/^[0-9a-z]{8}$/, 'Not an actor id'));

export const PushSchema = v.object({
	boardId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	actor: actorId,
	ops: BatchSchema
});

export type PushRequest = v.InferOutput<typeof PushSchema>;

export interface PushResult {
	/** How many operations were new. Re-sent ones are counted as accepted. */
	readonly accepted: number;
	/**
	 * The board's sequence after this batch.
	 *
	 * The client advances its cursor to this and nothing else. Advancing per
	 * operation is how a gap gets skipped — see \`crdt/version.ts\`.
	 */
	readonly watermark: number;
}

/** A viewport rectangle, in board coordinates, for the follow-me feature. */
export const ViewportSchema = v.object({
	x: v.pipe(v.number(), v.finite()),
	y: v.pipe(v.number(), v.finite()),
	w: v.pipe(v.number(), v.finite(), v.minValue(1)),
	h: v.pipe(v.number(), v.finite(), v.minValue(1))
});

export const PresenceSchema = v.object({
	boardId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	actor: actorId,
	cursor: v.nullable(
		v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) })
	),
	/*
	 * A cap, because this is echoed to every other viewer without being stored.
	 * Unbounded, one client selecting everything on a large board would multiply
	 * that array by the number of people watching, sixty times a second.
	 */
	selection: v.pipe(v.array(v.pipe(v.string(), v.maxLength(32))), v.maxLength(64)),
	viewport: v.nullable(ViewportSchema)
});

export type PresenceUpdate = v.InferOutput<typeof PresenceSchema>;`
			},
			{
				type: 'p',
				text: 'The `PushResult` doc comment is a warning to a future reader, and chapter 25 is the story of ignoring it: **the client advances its cursor to this and nothing else.** Advancing per operation is how a gap gets skipped.'
			},
			{
				type: 'p',
				text: 'And the cap on `selection` is there because presence is echoed to every other viewer without being stored. Unbounded, one client selecting everything on a large board multiplies that array by the number of people watching, sixty times a second.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/protocol.ts',
				lang: 'ts',
				code: `
export type ServerEvent =
	/** Sent once, first. Tells the client where the stream is starting from. */
	| { readonly type: 'hello'; readonly watermark: number }
	| { readonly type: 'ops'; readonly ops: readonly Operation[]; readonly watermark: number }
	| { readonly type: 'presence'; readonly peers: readonly Peer[] }
	/**
	 * A keep-alive.
	 *
	 * Not decoration. Proxies and load balancers close an idle connection after
	 * thirty to sixty seconds, and a closed SSE stream looks to the browser like a
	 * transient failure it should retry — so an idle board reconnects every minute
	 * forever, each time replaying a catch-up query. A comment frame every twenty
	 * seconds costs two bytes and removes the whole cycle.
	 */
	| { readonly type: 'ping' };

/**
 * How long a peer may go unheard-from before they are dropped from the roster.
 *
 * A browser that is closed mid-drag sends no goodbye, and the disconnect is only
 * noticed when the stream's \`cancel\` fires — which for a machine that went to
 * sleep can be minutes. Without an expiry, a board accumulates ghosts.
 */
export const PRESENCE_TIMEOUT_MS = 15_000;

/** How often a client re-sends its presence even if nothing moved, to stay alive. */
export const PRESENCE_HEARTBEAT_MS = 5_000;

/** The keep-alive interval on the server's side of the stream. */
export const STREAM_PING_MS = 20_000;

/**
 * The most operations a catch-up will send in one go.
 *
 * A client that has been offline for a week asks for everything since its
 * cursor, and "everything" can be a hundred thousand operations. Sending them as
 * one JSON array means the server builds the whole string in memory and the
 * client parses it in one blocking task — a spinner, then a frozen tab.
 *
 * Paging keeps both bounded: each page carries its own watermark, so an
 * interrupted catch-up resumes from where it stopped rather than starting again.
 */
export const CATCHUP_PAGE = 500;

/** Encode one SSE frame. Exported so the route and its tests agree on the format. */
export function frame(event: ServerEvent): string {
	if (event.type === 'ping') return ': ping\\n\\n';
	return \`data: \${JSON.stringify(event)}\\n\\n\`;
}`
			},
			{
				type: 'p',
				text: 'Four event types, three constants with their reasoning attached, and one function so that the route and its tests agree on the frame format. Note `frame` special-cases `ping` to a comment line — `: ping\\n\\n` — which the browser silently discards, so a keep-alive never reaches `onmessage`.'
			},

			{
				type: 'checkpoint',
				items: [
					'Two tabs on the same board have different actor ids.',
					'You can explain why presence and operations use different paths.',
					'Blocking site data degrades the app rather than breaking it.'
				]
			}
		]
	},

	{
		slug: 'the-outbox',
		title: 'The outbox',
		summary:
			'Sixty lines of IndexedDB wrapper, one compound key, and the `oncomplete` that is the difference between "saved" being true and being a message.',
		goal: 'Make an edit survive the laptop closing, and make an acknowledgement delete exactly what was acknowledged.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/sync/local.ts',
				lang: 'ts',
				code: `
/**
 * LOCAL-FIRST STORAGE
 * ===================
 *
 * IndexedDB, directly, with about sixty lines of promise wrapper.
 *
 * The wrapper is worth writing rather than depending on. IndexedDB's awkwardness
 * is almost entirely its event-based API; the transaction model underneath is
 * good, and the popular wrappers hide it well enough that people stop
 * understanding when their writes commit. Tessera cares a great deal about when
 * its writes commit — that is the difference between "your work is safe" being
 * true and being a message.
 *
 * WHAT IS STORED, AND WHY EACH
 * ----------------------------
 *   snapshots  the document as of a known server sequence. Opening a board reads
 *              this first and renders immediately, before any network call.
 *   outbox     operations made locally that the server has not acknowledged.
 *              This is the whole of the offline guarantee: close the laptop
 *              mid-edit, open it on a train, and the work is still there and
 *              still queued.
 *
 * Not stored: the operation log. It is on the server, and a client that has a
 * snapshot plus its outbox can reconstruct everything it needs. Keeping a local
 * log too would mean two logs that can disagree.
 */`
			},
			{
				type: 'p',
				text: 'The wrapper is written rather than installed, and the reason is specific: IndexedDB’s awkwardness is almost entirely its event-based API, but the **transaction model underneath is good**, and the popular wrappers hide it well enough that people stop understanding when their writes commit. This application cares a great deal about when its writes commit.'
			},
			{
				type: 'p',
				text: 'Note what is *not* stored: the operation log. A client with a snapshot plus its outbox can reconstruct everything it needs, and keeping a local log too would mean two logs that can disagree.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/local.ts',
				lang: 'ts',
				code: `
function open(): Promise<IDBDatabase> {
	opening ??= new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, VERSION);

		request.onupgradeneeded = () => {
			const database = request.result;

			if (!database.objectStoreNames.contains(SNAPSHOTS)) {
				database.createObjectStore(SNAPSHOTS, { keyPath: 'boardId' });
			}

			if (!database.objectStoreNames.contains(OUTBOX)) {
				/*
				 * A compound key of (board, stamp).
				 *
				 * Storing the outbox as one row per board — an array of pending
				 * operations — would be simpler and would make acknowledging *some* of
				 * them a read-modify-write, which races with the editor appending to
				 * the same array. One row per operation means an acknowledgement is a
				 * delete of exactly the keys that were confirmed.
				 */
				const store = database.createObjectStore(OUTBOX, { keyPath: ['boardId', 'stamp'] });
				store.createIndex('byBoard', 'boardId');
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open'));

		/*
		 * Another tab is holding an old version open.
		 *
		 * Without this the upgrade hangs forever and the board never loads, with no
		 * error anywhere. Rejecting turns it into a message the application can show.
		 */
		request.onblocked = () =>
			reject(new Error('Tessera is open in another tab with an older version. Reload it.'));
	});

	return opening;
}`
			},
			{
				type: 'why',
				title: 'The compound key',
				text: 'Storing the outbox as one row per board — an array of pending operations — is simpler and makes acknowledging *some* of them a read-modify-write, which races with the editor appending to the same array. One row per operation, keyed by `[boardId, stamp]`, means an acknowledgement is a delete of exactly the keys that were confirmed. No read, no merge, no race.'
			},
			{
				type: 'p',
				text: '`onblocked` is a small thing that saves a support ticket. Another tab holding an old version open makes the upgrade hang forever, and the board never loads with no error anywhere. Rejecting turns it into a sentence a person can act on.'
			},

			{ type: 'h3', id: 'commit', text: 'The most common bug in hand-rolled IndexedDB' },
			{
				type: 'code',
				file: 'src/lib/sync/local.ts',
				lang: 'ts',
				code: `
/** Run a transaction and resolve when it *commits*, not when the request succeeds. */
async function transact<T>(
	stores: string | string[],
	mode: IDBTransactionMode,
	body: (transaction: IDBTransaction) => Promise<T> | T
): Promise<T> {
	const database = await open();
	const transaction = database.transaction(stores, mode);

	const done = new Promise<void>((resolve, reject) => {
		/*
		 * \`oncomplete\`, not the last request's \`onsuccess\`.
		 *
		 * A request succeeding means the value is staged; the transaction can still
		 * abort afterwards — a quota error, or another handler throwing. Resolving
		 * early is how "saved" becomes a lie, and it is the single most common bug
		 * in hand-rolled IndexedDB code.
		 */
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
		transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
	});

	const result = await body(transaction);
	await done;
	return result;
}

function request<T>(source: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		source.onsuccess = () => resolve(source.result);
		source.onerror = () => reject(source.error ?? new Error('Request failed'));
	});
}`
			},
			{
				type: 'warn',
				text: '`transaction.oncomplete`, **not** the last request’s `onsuccess`. A request succeeding means the value is *staged*; the transaction can still abort afterwards — a quota error, another handler throwing. Resolving on `onsuccess` is how "your work is saved" becomes a lie, and it is the single most common bug in hand-rolled IndexedDB code.'
			},

			{ type: 'h3', id: 'the-two-stores', text: 'Reading and writing' },
			{
				type: 'code',
				file: 'src/lib/sync/local.ts',
				lang: 'ts',
				code: `
export async function enqueue(boardId: string, operations: readonly Operation[]): Promise<void> {
	if (operations.length === 0) return;

	await transact(OUTBOX, 'readwrite', (transaction) => {
		const store = transaction.objectStore(OUTBOX);
		const queuedAt = Date.now();
		for (const operation of operations) {
			store.put({ boardId, stamp: operation.stamp, operation, queuedAt } satisfies OutboxRow);
		}
	});
}

/** Everything still waiting, oldest first. */
export async function pending(boardId: string): Promise<Operation[]> {
	const rows = await transact(OUTBOX, 'readonly', (transaction) =>
		request<OutboxRow[]>(transaction.objectStore(OUTBOX).index('byBoard').getAll(boardId))
	);

	/*
	 * Sorted by stamp, not by \`queuedAt\`.
	 *
	 * Two operations queued in the same millisecond have the same \`queuedAt\`, and
	 * \`getAll\` returns them in key order — which for a compound key is board then
	 * stamp, so this is usually already right. Sorting explicitly makes it right
	 * by construction rather than by implementation detail, and stamp order is
	 * the order the operations were created in.
	 */
	return rows.map((row) => row.operation).sort((a, b) => (a.stamp < b.stamp ? -1 : 1));
}

export async function acknowledge(
	boardId: string,
	operations: readonly Operation[]
): Promise<void> {
	if (operations.length === 0) return;

	await transact(OUTBOX, 'readwrite', (transaction) => {
		const store = transaction.objectStore(OUTBOX);
		for (const operation of operations) store.delete([boardId, operation.stamp]);
	});
}

export async function outboxSize(boardId: string): Promise<number> {
	return transact(OUTBOX, 'readonly', (transaction) =>
		request<number>(transaction.objectStore(OUTBOX).index('byBoard').count(boardId))
	);
}`
			},
			{
				type: 'p',
				text: '`pending` sorts by **stamp**, not `queuedAt`. Two operations queued in the same millisecond share a `queuedAt`, and `getAll` returns them in key order — which for a compound key is board-then-stamp, so this is usually already right. Sorting explicitly makes it right by construction rather than by implementation detail, and stamp order is the order the operations were created in.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/local.ts',
				lang: 'ts',
				code: `
/** Forget a board entirely — used when the server says it is gone. */
export async function forget(boardId: string): Promise<void> {
	const operations = await pending(boardId);
	await transact([SNAPSHOTS, OUTBOX], 'readwrite', (transaction) => {
		transaction.objectStore(SNAPSHOTS).delete(boardId);
		const store = transaction.objectStore(OUTBOX);
		for (const operation of operations) store.delete([boardId, operation.stamp]);
	});
}

/** Is IndexedDB usable at all? Some privacy modes expose it and then throw. */
export function available(): boolean {
	try {
		return typeof indexedDB !== 'undefined' && indexedDB !== null;
	} catch {
		return false;
	}
}`
			},
			{
				type: 'note',
				text: '`available()` is a `try`/`catch` around a `typeof` check, which looks paranoid and is not. Some privacy modes *expose* `indexedDB` and then throw when you touch it, so the honest test is to touch it inside a guard.'
			},

			{
				type: 'checkpoint',
				items: [
					'An edit is in IndexedDB before any request is made.',
					'`writeSnapshot` resolves only when the transaction has committed.',
					'Acknowledging four of six operations leaves exactly two.'
				]
			}
		]
	},

	{
		slug: 'the-sync-engine',
		title: 'The sync engine',
		summary:
			'Three steps in order, four honest states, a stream with real backoff, and a flush with a lock.',
		goal: 'Get operations to the server eventually, without anything above waiting for it.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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
 * indicator at all, because people calibrate their trust against it. \`status\`
 * here means exactly what it says: \`live\` only while a stream is open and the
 * outbox is empty, and \`offline\` the moment either stops being true.
 */`
			},
			{
				type: 'p',
				text: 'Step 3 is allowed to fail, retry, or never happen. Nothing above it waits for it, and no part of the interface is disabled because of it. Everything else in this file is machinery for making step 3 eventually succeed without anybody watching.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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

const MAX_BACKOFF_MS = 30_000;`
			},
			{
				type: 'why',
				title: 'A tool that lies about its connection is worse than one with no indicator',
				text: 'People calibrate their trust against the badge. If `live` sometimes means "connected but eleven operations behind", then `live` means nothing and the honest response is to stop believing it — at which point you have a spinner that costs pixels and buys distrust. Here `live` means a stream is open **and** the outbox is empty, and `offline` the moment either stops being true.'
			},

			{ type: 'h3', id: 'lifecycle', text: 'Starting and stopping' },
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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
	 * \`online\` is a hint, not a promise — a captive portal reports online and
	 * refuses every request — so it triggers a reconnect attempt rather than a
	 * state change. \`offline\` is reliable in the other direction, and reacting
	 * to it immediately avoids a doomed request and its timeout.
	 */
	addEventListener('online', this.#onOnline);
	addEventListener('offline', this.#onOffline);

	/*
	 * A last chance to persist.
	 *
	 * \`visibilitychange\` rather than \`beforeunload\`, which is unreliable on
	 * mobile — a browser backgrounded and then killed by the OS never fires it.
	 * \`hidden\` fires in both cases and is the last event guaranteed to arrive.
	 */
	addEventListener('visibilitychange', this.#onHidden);
}`
			},
			{
				type: 'p',
				text: 'Three listeners, each with a reason. The presence heartbeat exists because the server expires a quiet peer, so somebody *reading* a board without touching it would otherwise vanish from everybody’s roster after fifteen seconds while still very much present.'
			},
			{
				type: 'p',
				text: '`online` is treated as a **hint, not a promise** — a captive portal reports online and refuses every request — so it triggers a reconnect attempt rather than a state change. `offline` is reliable in the other direction, and reacting to it immediately avoids a doomed request and its timeout.'
			},
			{
				type: 'warn',
				text: '`visibilitychange`, not `beforeunload`. `beforeunload` is unreliable on mobile: a browser backgrounded and then killed by the OS never fires it. `hidden` fires in both cases and is the last event guaranteed to arrive.'
			},

			{ type: 'h3', id: 'the-stream', text: 'The stream, with our own backoff' },
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
#connect(): void {
	if (this.#stopped || this.#source) return;

	this.status = this.queued > 0 ? 'saving' : 'connecting';

	const url = \`/api/boards/\${encodeURIComponent(this.boardId)}/stream?since=\${this.#watermark}&actor=\${this.actor}\`;
	const source = new EventSource(url);
	this.#source = source;

	source.onopen = () => {
		this.#attempt = 0;
		this.#settle();
	};

	source.onmessage = (event) => this.#receive(event.data);

	source.onerror = () => {
		/*
		 * \`EventSource\` retries on its own, and its schedule is not ours: a fixed
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
}`
			},
			{
				type: 'p',
				text: '`EventSource` retries on its own, and its schedule is not ours: a fixed few seconds, forever, with no jitter. A hundred clients reconnecting to a server that has just restarted arrive in lockstep and knock it over again. Closing it by hand costs a few lines and buys exponential backoff with **full jitter** — half the delay fixed so backoff still means something, half random so a herd spreads out.'
			},

			{ type: 'h3', id: 'receiving', text: 'Receiving' },
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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
			}`
			},
			{
				type: 'p',
				text: 'Re-validated on arrival, even though these came from our own server. They may have been written months ago by an older version of this application, and failing loudly on one operation is far better than feeding a shape the CRDT does not understand into a document somebody is about to keep working in.'
			},

			{ type: 'h3', id: 'flushing', text: 'Sending, with a lock' },
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Send what is queued.
 *
 * One request in flight at a time, always. Two concurrent pushes can arrive at
 * the server out of order, which is survivable, and can interleave their
 * outbox deletions, which is not — a batch could be marked acknowledged
 * because a *different* batch succeeded. The lock is one boolean and it makes
 * the whole path reasonable.
 */`
			},
			{
				type: 'p',
				text: 'One request in flight at a time, always. Two concurrent pushes can arrive at the server out of order, which is survivable, and can interleave their outbox deletions, which is not — a batch could be marked acknowledged because a *different* batch succeeded.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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
	await pushOps({ boardId: this.boardId, actor: this.actor, ops: batch });

	await local.acknowledge(this.boardId, batch).catch(() => {});`
			},
			{
				type: 'p',
				text: 'Persist **before** sending. If the tab dies between those two lines the work is in the outbox; the other order loses it. This is the same "which way do you want to be wrong" question as chapter 20’s subscribe-before-read, and the same answer: choose the failure the system already handles.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'why',
				title: 'Retryable or not',
				text: 'A network error is retryable and the outbox keeps the work. A 403 or 422 is not: sending it again fails identically, forever, and the operations would sit in the outbox for the life of the browser profile. Those are surfaced and **the queue is left alone** for a person to decide about. Losing somebody’s work silently in order to tidy up a queue is not a trade a tool gets to make on their behalf.'
			},

			{ type: 'h3', id: 'snapshots', text: 'Local snapshots, debounced' },
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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
			// \`untrack\` so serialising the document does not make this a dependency
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
}`
			},
			{
				type: 'p',
				text: 'Two seconds of idle is the worst case for how much replay a crash costs — and replay comes out of the outbox, which is written immediately. The `untrack` matters: serialising the whole document inside an effect would make every field of every node a dependency of that effect.'
			},

			{ type: 'h3', id: 'opening', text: 'Opening a board' },
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'p',
				text: 'The reconciliation is the interesting part, and it is four lines. Either side can be ahead — the server if somebody else has been editing, this device if it has been offline — so the newer snapshot wins as the starting point and the outbox is replayed on top. Replaying is **safe** because every operation is idempotent, and **necessary** because those operations are the ones the server has never seen.'
			},

			{
				type: 'checkpoint',
				items: [
					'Pull the network cable mid-drag: the board keeps working and the badge says offline.',
					'Plug it back in: everything you did arrives, in order, once.',
					'You can explain why `live` is a conjunction of two conditions.'
				]
			}
		]
	},

	{
		slug: 'four-bugs',
		title: 'Four bugs in one file',
		summary:
			'A stranded flush, a bad slice, a watermark from the wrong place, and an echo filter — all the same mistake, seen four times.',
		goal: 'Recognise the shape well enough to avoid the fifth one.',
		blocks: [
			{
				type: 'p',
				text: 'Everything in the last chapter works. Getting there took four bugs, and they are worth a chapter of their own because they are the same bug four times: **an optimisation that assumed something the system does not guarantee.**'
			},
			{
				type: 'p',
				text: 'Each one was found by an end-to-end test with two browser contexts, not by reading. That is the honest lesson: none of these are visible in a diff.'
			},

			{ type: 'h3', id: 'one', text: 'One: the stranded flush' },
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
/*
 * Skipped because one is already in flight.
 *
 * Nothing is scheduled here on purpose — the running flush reschedules
 * itself in its \`finally\` if anything is left. The first version of this
 * returned and *also* did not reschedule, which silently stranded the tail
 * of every fast burst: type five characters, the flush for the first four
 * is in flight when the fifth arrives, its timer fires, this returns, and
 * the fifth operation sits in \`#buffer\` for the rest of the session.
 *
 * The symptom was a label that read \`Alph\` on every other replica and
 * \`Alpha\` on the one that typed it, surviving a reload, because the
 * operation never reached the server at all. A randomised end-to-end test
 * found it about one run in three.
 */
if (this.#flushing || this.#stopped || this.readOnly) return;`
			},
			{
				type: 'p',
				text: 'The assumption: *if a flush is already running, the timer that fired can just return — the running one will pick up whatever arrived.* It will not, unless it is told to.'
			},
			{
				type: 'p',
				text: 'Type five characters quickly. The flush for the first four is in flight when the fifth arrives. Its timer fires, `#flushing` is true, this returns and schedules nothing. The running flush finishes and — in the first version — also scheduled nothing, because it had already sent everything *it* knew about. The fifth operation sits in `#buffer` for the rest of the session.'
			},
			{
				type: 'terminal',
				code: `
Replica A (typed it):  Alpha
Replica B:             Alph
after a reload of A:   Alph        ← the operation never left the tab

found: about one run in three, by a randomised end-to-end test`
			},
			{
				type: 'p',
				text: 'The fix is in the `finally`, and the comment on it is the general principle: **one place responsible for "the queue is not empty, come back", and no path that forgets.**'
			},
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
	} finally {
		this.#flushing = false;

		/*
		 * Always look again.
		 *
		 * Two things can be waiting by now: operations made while this request was
		 * in flight (in \`#buffer\`), and the remainder of a batch larger than
		 * \`BATCH_LIMIT\` (already in the outbox). Rescheduling here rather than at
		 * each of those sites means there is exactly one place responsible for
		 * "the queue is not empty, come back", and no path that forgets.
		 */
		if (this.#buffer.length > 0 || this.queued > 0) this.#scheduleFlush();
	}
}`
			},

			{ type: 'h3', id: 'two', text: 'Two: the broadcast slice' },
			{
				type: 'p',
				text: 'Server-side, from chapter 19. The assumption: *when a re-sent batch is partly duplicated, the duplicates are a prefix, so the new ones are the last N.*'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
// Before — plausible, and wrong.
const fresh = ops.slice(ops.length - inserted.length);

// After — cannot be wrong.
const accepted = new Set(inserted.map((row) => row.stamp));
const fresh = ops.filter((candidate) => accepted.has(candidate.stamp));`
			},
			{
				type: 'p',
				text: 'A client can legitimately resend a batch whose middle was already accepted. When it does, the broadcast drops a genuinely new operation and echoes one everybody already had — and the receiving replicas differ from the log until their next reconnect.'
			},

			{ type: 'h3', id: 'three', text: 'Three: the watermark from the push response' },
			{
				type: 'p',
				text: 'The assumption: *the server just told me the board’s sequence, so that is where my cursor should be.*'
			},
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
/*
 * The push response carries a watermark, and it is deliberately ignored.
 *
 * That number is the *board's* head, which includes operations from
 * everybody else that this replica has not received yet. Advancing the
 * cursor to it — which the first version did — means the next stream
 * connection asks for everything "since" a point past operations that were
 * never applied, and they are gone: the board is missing shapes, the
 * locally saved snapshot records the inflated watermark alongside the
 * incomplete content, and a reload makes it permanent.
 *
 * The cursor advances in exactly one place: \`#receive\`, from the watermark
 * that arrives *with* a batch of operations, once those operations have
 * been applied. That is the same rule \`crdt/version.ts\` states for version
 * vectors, and this is the second time ignoring it has cost an afternoon.
 */
this.queued = Math.max(0, waiting.length - batch.length);
this.refusal = null;
this.#settle();`
			},
			{
				type: 'p',
				text: 'That number is the *board’s* head, which includes operations from everybody else that this replica has not received yet. Advance to it and the next stream connection asks for everything since a point past operations that were never applied — and they are gone. The board is missing shapes, the local snapshot records the inflated watermark alongside the incomplete content, and a reload makes it permanent.'
			},
			{
				type: 'warn',
				text: 'This is chapter 07’s bug again, in a different file. A cursor may only advance past what has actually been applied. It cost an afternoon the first time and an afternoon the second time, which is a reasonable argument for writing the rule down where the next person will read it — which is what the comment on `PushResult.watermark` now does.'
			},

			{ type: 'h3', id: 'four', text: 'Four: the echo filter' },
			{
				type: 'p',
				text: 'The assumption: *re-applying my own operations when the server echoes them back is wasted work, so filter them out.*'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
// Before.
const incoming = event.ops
	.map(parseOperation)
	.filter((operation) => !operation.stamp.endsWith(this.actor));

// After.
this.document.applyAll(incoming);`
			},
			{
				type: 'p',
				text: 'It *is* wasted work, by a rounding error. And the filter is wrong for a reason that takes a reload to notice.'
			},
			{
				type: 'p',
				text: 'An actor id lives in `sessionStorage`, so it survives a refresh. After one, the catch-up replays this tab’s **entire history** — and every one of those operations still ends with this actor, so every one was discarded. The board came back empty, the cursor advanced to the board’s head anyway, and the next local snapshot wrote that emptiness down against a current watermark.'
			},
			{
				type: 'terminal',
				code: `
$ node trestore.mjs
local snapshot: {"watermark":190,"nodeEntries":0,"edgeEntries":0}
server says present: ["Before"]

an empty snapshot carrying a current watermark — permanent, and only
for the tab that had done the work`
			},
			{
				type: 'p',
				text: 'That two-line diagnostic is what pinned it. Everything else — the board rendering, the sync badge, the server’s own view — looked fine; only the *pair* of those two numbers was impossible.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape' },
			{
				type: 'ul',
				items: [
					'**Skip work that is already in flight** — assumed somebody else would come back for the rest.',
					'**Take the last N** — assumed an ordering the protocol never promised.',
					'**Trust the number in the response** — assumed it meant what this replica needed it to mean.',
					'**Filter out my own echo** — assumed "mine" and "already applied" were the same set.'
				]
			},
			{
				type: 'why',
				title: 'What they have in common, and the rule that falls out',
				text: 'Every one is an optimisation, every one is locally reasonable, and every one converts a *guarantee* into an *assumption*. In a system whose entire premise is "the network may do anything", that trade is almost never worth making — because the thing you bought is nanoseconds, and the thing you sold is the property that makes the design work. The rule this codebase now follows: **before removing work, say out loud what would have to be true for the removal to be safe, and then check whether anything actually guarantees it.** Three of these four would have died at that sentence.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can name the assumption behind each of the four bugs.',
					'You can explain why all four survived code review and died in an end-to-end test.',
					'You have a sentence you say before deleting work from a hot path.'
				]
			}
		]
	}
];
