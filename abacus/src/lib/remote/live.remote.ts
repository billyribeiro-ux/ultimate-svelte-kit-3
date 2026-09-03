/**
 * A SHEET, LIVE
 * =============
 *
 * `watchSheet` is a `query.live`: an async generator that yields every time
 * something happens on the sheet — an operation from another tab, a cursor
 * moving, somebody joining. SvelteKit streams each value to every browser
 * with the query open and stops iterating when the last one leaves, which
 * runs the `finally` and leaves the room.
 *
 * Operations go the other way through `send`, a command that applies them
 * to the stored document, numbers them, and broadcasts them. The sending
 * tab receives its own operations back with its `client` id and ignores
 * them; every other tab applies them without an undo entry.
 */

import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { OpSchema } from '#lib/sheet/ops.ts';
import { broadcast, join, moveCursor, presentIn, type LiveMessage } from '#lib/server/live.ts';
import { applySheetOps, opsSince, requireSheet } from '#lib/server/sheets.ts';
import { currentUser, requireUser } from '#lib/server/session.ts';

/**
 * A mailbox that holds one value. Live streams are not event logs: if the
 * sheet changes three times while a slow browser is still receiving the
 * first, it should get all three *operations*, but in one message. So a push
 * while nobody is waiting is merged into what is there, and a `next()` while
 * nothing is there waits.
 */
class Mailbox {
	#pending: LiveMessage | null = null;
	#waiting: ((message: LiveMessage | null) => void) | null = null;
	#closed = false;

	push(message: LiveMessage): void {
		if (this.#closed) return;
		if (this.#waiting) {
			const resolve = this.#waiting;
			this.#waiting = null;
			resolve(message);
			return;
		}
		this.#pending = this.#pending
			? {
					version: Math.max(this.#pending.version, message.version),
					ops: [...this.#pending.ops, ...message.ops],
					client: message.ops.length > 0 ? message.client : this.#pending.client,
					present: message.present
				}
			: message;
	}

	/** The next message, or `null` once the mailbox is closed. */
	next(): Promise<LiveMessage | null> {
		if (this.#pending) {
			const message = this.#pending;
			this.#pending = null;
			return Promise.resolve(message);
		}
		if (this.#closed) return Promise.resolve(null);
		return new Promise((resolve) => {
			this.#waiting = resolve;
		});
	}

	/**
	 * Wake whoever is waiting with nothing. An async generator suspended on an
	 * `await` cannot be interrupted from outside — `return()` queues behind the
	 * pending promise — so a browser that closed its tab would keep its seat in
	 * the room until the next message happened to arrive. Closing the mailbox
	 * resolves the wait now, the loop ends, and `finally` leaves the room.
	 */
	close(): void {
		this.#closed = true;
		if (this.#waiting) {
			const resolve = this.#waiting;
			this.#waiting = null;
			resolve(null);
		}
	}
}

const WatchSchema = v.object({
	id: v.string(),
	/** One id per tab, so a tab can recognise its own operations coming back. */
	client: v.pipe(v.string(), v.minLength(4), v.maxLength(40)),
	/** The version this tab already has; operations after it are replayed first. */
	since: v.pipe(v.number(), v.integer(), v.minValue(0))
});

export const watchSheet = query.live(WatchSchema, async function* ({ id, client, since }) {
	const user = requireUser();
	const sheet = await requireSheet(id, user);

	const mailbox = new Mailbox();
	const leave = join(id, { client, userId: user.id, name: user.name, cell: null }, (m) =>
		mailbox.push(m)
	);

	// The request's signal fires when the browser goes away — a closed tab, a
	// navigation, a lost connection. That is the moment to give up the seat.
	// (`getRequestEvent` reaches the event from anywhere on the server; the
	// adapter wires the socket's close to this signal.)
	const { signal } = getRequestEvent().request;
	signal.addEventListener('abort', () => mailbox.close(), { once: true });

	try {
		// Catch up first: whatever happened between the page load and now.
		const missed = await opsSince(id, since);
		yield {
			version: sheet.version,
			ops: missed.flatMap((m) => m.ops),
			client: null,
			present: presentIn(id)
		} satisfies LiveMessage;

		while (true) {
			const message = await mailbox.next();
			if (message === null) break;
			yield message;
		}
	} finally {
		leave();
	}
});

export const send = command(
	v.object({
		id: v.string(),
		client: v.string(),
		ops: v.pipe(v.array(OpSchema), v.minLength(1), v.maxLength(100))
	}),
	async ({ id, client, ops }) => {
		const { version } = await applySheetOps(id, requireUser(), ops);
		broadcast(id, { version, ops, client });
		return { version };
	}
);

export const setCursor = command(
	v.object({ id: v.string(), client: v.string(), cell: v.nullable(v.string()) }),
	async ({ id, client, cell }) => {
		const sheet = await requireSheet(id, currentUser());
		moveCursor(id, client, cell, sheet.version);
	}
);
