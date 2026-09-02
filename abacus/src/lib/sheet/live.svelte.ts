/**
 * A SHEET, SHARED
 * ===============
 *
 * The glue between a `Sheet` in this tab and the same sheet on the server
 * and in every other tab. Local commands become operations, batched for a
 * hundred milliseconds and sent with `send`; the live query delivers
 * everybody's operations, and the ones that are not this tab's echo are
 * applied with no undo entry. Cursor moves go the same way, throttled.
 *
 * `status` is the honest state of the connection — live, saving, offline,
 * or in conflict — and the page shows it, because a sheet that silently
 * stopped saving is worse than one that says so.
 */

import { isHttpError } from '@sveltejs/kit';
import { send, setCursor } from '#lib/remote/live.remote.ts';
import type { LiveMessage, Presence } from '#lib/server/live.ts';
import { toA1, type Address } from './address.ts';
import { tabId } from './local.ts';
import type { Op } from './ops.ts';
import type { Sheet } from './sheet.svelte.ts';

export type LiveStatus = 'live' | 'saving' | 'offline' | 'conflict';

export class LiveSheet {
	readonly sheet: Sheet;
	readonly id: string;
	readonly client = tabId();

	/** The server version this tab has caught up to. */
	version = $state(0);
	status = $state<LiveStatus>('live');
	/** Everybody else on the sheet. */
	present = $state<Presence[]>([]);

	#queue: Op[] = [];
	#timer: ReturnType<typeof setTimeout> | null = null;
	#inflight = false;
	#cursorTimer: ReturnType<typeof setTimeout> | null = null;
	#lastCursor: string | null = null;

	constructor(id: string, sheet: Sheet, version: number) {
		this.id = id;
		this.sheet = sheet;
		this.version = version;
		sheet.onop = (op) => this.#enqueue(op);
	}

	/** A message from the live query. */
	receive(message: LiveMessage): void {
		this.present = message.present.filter((p) => p.client !== this.client);
		if (message.client !== this.client) {
			for (const op of message.ops) this.sheet.applyRemote(op);
		}
		if (message.version > this.version) this.version = message.version;
		if (message.ops.length > 0 && message.client !== this.client) this.sheet.markSaved();
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

	/** Send what is queued now — before the page is left. */
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
		this.#queue.push(op);
		this.status = 'saving';
		this.#timer ??= setTimeout(() => {
			this.#timer = null;
			void this.#send();
		}, 100);
	}

	async #send(): Promise<void> {
		if (this.#inflight || this.#queue.length === 0) return;
		const ops = this.#queue.splice(0, 100);
		this.#inflight = true;
		try {
			const { version } = await send({ id: this.id, client: this.client, ops });
			if (version > this.version) this.version = version;
			this.status = this.#queue.length > 0 ? 'saving' : 'live';
			if (this.#queue.length === 0) this.sheet.markSaved();
		} catch (error) {
			if (
				isHttpError(error) &&
				(error.status === 409 || error.status === 413 || error.status === 404)
			) {
				this.status = 'conflict';
				this.#queue.length = 0;
				throw error;
			}
			// A network failure: keep the operations and try again shortly.
			this.#queue.unshift(...ops);
			this.status = 'offline';
			this.#timer ??= setTimeout(() => {
				this.#timer = null;
				void this.#send();
			}, 2000);
		} finally {
			this.#inflight = false;
			if (this.#queue.length > 0 && !this.#timer && this.status !== 'offline') void this.#send();
		}
	}
}
