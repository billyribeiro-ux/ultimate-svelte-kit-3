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

export interface LiveMessage {
	/** The sheet version after these operations. */
	version: number;
	ops: Op[];
	/** Which tab sent them, so that tab can ignore its own echo. */
	client: string | null;
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

export function broadcast(sheetId: string, message: Omit<LiveMessage, 'present'>): void {
	const room = rooms.get(sheetId);
	if (!room) return;
	const present = [...room.values()];
	for (const listener of room.keys()) listener({ ...message, present });
}

/** A cursor moved: update that tab's presence and tell the room. */
export function moveCursor(
	sheetId: string,
	client: string,
	cell: string | null,
	version: number
): void {
	const room = rooms.get(sheetId);
	if (!room) return;
	for (const presence of room.values()) if (presence.client === client) presence.cell = cell;
	broadcast(sheetId, { version, ops: [], client: null });
}

function announce(sheetId: string): void {
	broadcast(sheetId, { version: -1, ops: [], client: null });
}

export function openConnections(): number {
	let n = 0;
	for (const room of rooms.values()) n += room.size;
	return n;
}
