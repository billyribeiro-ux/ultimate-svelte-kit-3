/**
 * LIVE SHEETS
 * ===========
 *
 * A sheet somebody has open is a *room*: every browser on it holds a live
 * query, every operation is broadcast to the others, and who is where is
 * part of what is broadcast. The database row is the truth (`sheets.ts`
 * applies every operation to it before anybody hears about it); this module
 * is only how everybody hears.
 *
 * ONE PROCESS, AND SAID SO
 * ------------------------
 * Subscribers live in a `Map` in this module, so two instances of the server
 * would each know only their own listeners. The fix is a shared channel — a
 * Postgres `NOTIFY`, a Redis stream — and it is the first thing to reach for
 * when this runs on more than one machine.
 */

import type { Op } from '#lib/sheet/ops.ts';

export interface Presence {
	/** One per tab, so the same person in two tabs is two cursors. */
	client: string;
	userId: string;
	name: string;
	/** `B3`, or `null` between selections. */
	cell: string | null;
}

/**
 * One `send`: the operations it carried, and the version they produced.
 *
 * The version is what makes a batch recognisable. A browser can be handed
 * the same batch twice — a reconnect replays everything since the page was
 * loaded — and a batch it has already applied must not be applied again:
 * cells written twice come out the same, but a row inserted twice is two
 * rows.
 */
export interface Batch {
	version: number;
	/** Which tab sent it, so that tab can skip its own echo; `null` from before it was recorded. */
	client: string | null;
	ops: Op[];
}

export interface LiveMessage {
	/** Oldest first. Empty when all that changed is who is here. */
	batches: Batch[];
	present: Presence[];
}

type Listener = (message: LiveMessage) => void;

const rooms = new Map<string, Map<Listener, Presence>>();

export function presentIn(sheetId: string): Presence[] {
	return [...(rooms.get(sheetId)?.values() ?? [])];
}

export function join(sheetId: string, presence: Presence, listener: Listener): () => void {
	let room = rooms.get(sheetId);
	if (!room) {
		room = new Map();
		rooms.set(sheetId, room);
	}
	room.set(listener, presence);
	announce(sheetId);
	return () => {
		room.delete(listener);
		if (room.size === 0) rooms.delete(sheetId);
		announce(sheetId);
	};
}

/** Tell the room about a batch — or, with `null`, only about who is here. */
export function broadcast(sheetId: string, batch: Batch | null): void {
	const room = rooms.get(sheetId);
	if (!room) return;
	const message: LiveMessage = { batches: batch ? [batch] : [], present: [...room.values()] };
	for (const listener of room.keys()) listener(message);
}

/** A cursor moved: update that tab's presence and tell the room. */
export function moveCursor(sheetId: string, client: string, cell: string | null): void {
	const room = rooms.get(sheetId);
	if (!room) return;
	for (const presence of room.values()) if (presence.client === client) presence.cell = cell;
	broadcast(sheetId, null);
}

function announce(sheetId: string): void {
	broadcast(sheetId, null);
}

export function openConnections(): number {
	let n = 0;
	for (const room of rooms.values()) n += room.size;
	return n;
}
