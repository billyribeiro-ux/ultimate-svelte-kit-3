/**
 * A SHEET, SHARED
 * ===============
 *
 * The glue between a `Sheet` in this tab and the same sheet on the server
 * and in every other tab. Local commands become operations, batched for a
 * hundred milliseconds and sent with `send`; the live query delivers
 * everybody's batches, and each one this tab has not seen — and did not send
 * — is applied with no undo entry. Cursor moves go the same way, throttled.
 *
 * `status` is the honest state of the connection — live, saving, offline,
 * or refused — and the page shows it, because a sheet that silently
 * stopped saving is worse than one that says so.
 */

import { isHttpError } from '@sveltejs/kit';
import { send, setCursor } from '#lib/remote/live.remote.ts';
import type { LiveMessage, Presence } from '#lib/server/live.ts';
import { toA1, type Address } from './address.ts';
import { tabId } from './local.ts';
import type { Op } from './ops.ts';
import type { Sheet } from './sheet.svelte.ts';

/**
 * Where this tab stands with the server, as one value.
 *
 * `refused` carries the server's own sentence, and nothing can leave it: once
 * the server has turned a batch down, this tab holds edits the stored sheet
 * does not, and every later operation would be built on that difference. Only
 * a reload — the stored sheet, read again — brings the two back together. A
 * separate `problem` field beside a `status` string could say "Saved" and a
 * stale reason at the same time; one union cannot.
 */
export type LiveStatus =
	| { readonly kind: 'live' }
	| { readonly kind: 'saving' }
	| { readonly kind: 'offline' }
	| { readonly kind: 'refused'; readonly message: string };

// One object per plain state, so writing the state a tab is already in is the
// same value — and a `$state.raw` given the value it holds notifies nobody.
const LIVE: LiveStatus = { kind: 'live' };
const SAVING: LiveStatus = { kind: 'saving' };
const OFFLINE: LiveStatus = { kind: 'offline' };

export class LiveSheet {
	readonly sheet: Sheet;
	readonly id: string;
	readonly client = tabId();

	/** Replaced, never mutated, so `$state.raw`: there is nothing inside it to watch. */
	status = $state.raw<LiveStatus>(LIVE);
	/** Everybody else on the sheet. */
	present = $state<Presence[]>([]);

	#queue: Op[] = [];
	#timer: ReturnType<typeof setTimeout> | null = null;
	#inflight = false;
	#cursorTimer: ReturnType<typeof setTimeout> | null = null;
	#lastCursor: string | null = null;

	/** The version of the document this tab loaded: every batch up to it is already in the sheet. */
	readonly #loaded: number;
	/**
	 * Every later batch this tab has taken in — applied, or sent itself — by
	 * version. A set rather than a high-water mark, because two batches can
	 * arrive out of order, and the earlier one must still be applied. Plain,
	 * not reactive: nothing on screen reads it.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
	readonly #seen = new Set<number>();

	constructor(id: string, sheet: Sheet, version: number) {
		this.id = id;
		this.sheet = sheet;
		this.#loaded = version;
		sheet.onop = (op) => this.#enqueue(op);
	}

	/**
	 * Apply the room's messages as they arrive, until `signal` aborts.
	 *
	 * A live query is async-iterable, and iterating it is SvelteKit's API for
	 * the *stream* — each value as it comes — where `current` is the API for
	 * the latest value. An effect that read `current` would see a message only
	 * if Svelte happened to run it before the next one landed.
	 *
	 * Iterating has a rule of its own: "if values arrive faster than the
	 * consumer drains the iterator, only the latest pending value is kept". So
	 * the loop never keeps the stream waiting. `receive` is synchronous, and the
	 * loop asks for the next message in the same turn as it was handed the last
	 * — before the connection can deliver another, since that takes at least
	 * one more trip through the promise queue, which runs in order.
	 *
	 * One loop lasts as long as the stream. A dropped connection does not end
	 * it: SvelteKit reconnects behind the same iterator, and the loop simply
	 * waits. It ends when the server ends the stream or refuses it, and
	 * `reconnect()` opens a new one. A new iterator starts with the latest
	 * message, which this tab may already have applied; `receive` skips what it
	 * has seen.
	 */
	async follow(stream: AsyncIterable<LiveMessage>, signal: AbortSignal): Promise<void> {
		const messages = stream[Symbol.asyncIterator]();
		signal.addEventListener('abort', () => void messages.return?.(), { once: true });
		try {
			for (let next = await messages.next(); !next.done; next = await messages.next()) {
				this.receive(next.value);
			}
		} catch {
			// The server refused the stream. The query is `done`, the page offers
			// Reconnect, and the page starts a new loop when it reconnects.
		}
	}

	/**
	 * A message from the live query.
	 *
	 * The same batch can arrive more than once. A reconnect replays every batch
	 * since the page was loaded; a new iterator starts with the last message; a
	 * batch committed while the server was reading the catch-up is in both. So
	 * a batch is taken in once, by its version: cells written twice would come
	 * out the same, but a row inserted twice is two rows.
	 */
	receive(message: LiveMessage): void {
		this.present = message.present.filter((p) => p.client !== this.client);
		let applied = false;
		for (const batch of message.batches) {
			if (batch.version <= this.#loaded || this.#seen.has(batch.version)) continue;
			this.#seen.add(batch.version);
			// This tab's own batch is on screen already: it was applied as it was typed.
			if (batch.client === this.client) continue;
			for (const op of batch.ops) this.sheet.applyRemote(op);
			applied = true;
		}
		// Somebody else's operations are on the server by definition.
		if (applied) this.sheet.markSaved();
	}

	/** The active cell moved; tell the room, at most a few times a second. */
	cursor(cell: Address): void {
		const a1 = toA1(cell);
		if (a1 === this.#lastCursor) return;
		this.#lastCursor = a1;
		if (this.#cursorTimer) return;
		this.#cursorTimer = setTimeout(() => {
			this.#cursorTimer = null;
			void setCursor({ id: this.id, client: this.client, cell: this.#lastCursor }).catch(() => {});
		}, 150);
	}

	get pending(): boolean {
		return this.#queue.length > 0 || this.#inflight;
	}

	/** Send what is queued now — before the page is left. Never rejects; `status` says how it went. */
	flush(): Promise<void> {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		return this.#send();
	}

	dispose(): void {
		this.sheet.onop = null;
		void this.flush();
	}

	#enqueue(op: Op): void {
		// Refused once, refused for good. The edit stays on screen, and the page
		// already says that nothing after the refusal reaches the server.
		if (this.status.kind === 'refused') return;
		this.#queue.push(op);
		this.status = SAVING;
		this.#timer ??= setTimeout(() => {
			this.#timer = null;
			void this.#send();
		}, 100);
	}

	/**
	 * Send up to a hundred queued operations.
	 *
	 * Two kinds of failure, told apart by whether the server answered. A 4xx is
	 * the server refusing *this batch* — too many cells, a sheet that is gone, a
	 * session that ended — and sending it again would be refused again, so the
	 * tab stops and says so. Anything else — no answer at all, or a 5xx — may
	 * well work in a moment, so the operations go back on the queue.
	 *
	 * Nothing is thrown. Every caller is fire-and-forget — a timer, the page's
	 * `beforeNavigate` — and the outcome is `status`, which the page renders.
	 */
	async #send(): Promise<void> {
		if (this.#inflight || this.#queue.length === 0) return;
		const ops = this.#queue.splice(0, 100);
		this.#inflight = true;
		try {
			const { version } = await send({ id: this.id, client: this.client, ops });
			this.#seen.add(version);
			this.status = this.#queue.length > 0 ? SAVING : LIVE;
			if (this.#queue.length === 0) this.sheet.markSaved();
		} catch (error) {
			if (isHttpError(error) && error.status < 500) {
				// An `HttpError` carries the server's words in `body`, not on itself.
				this.status = { kind: 'refused', message: error.body.message };
				this.#queue.length = 0;
				return;
			}
			this.#queue.unshift(...ops);
			this.status = OFFLINE;
			this.#timer ??= setTimeout(() => {
				this.#timer = null;
				void this.#send();
			}, 2000);
		} finally {
			this.#inflight = false;
			if (this.#queue.length > 0 && !this.#timer && this.status.kind === 'saving')
				void this.#send();
		}
	}
}
