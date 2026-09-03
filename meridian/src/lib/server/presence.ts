/**
 * WHO IS HERE
 * ===========
 *
 * Presence is not data. It is not stored, it is not migrated, and if the
 * process restarts everybody is simply "here" again a few seconds later.
 * So it lives in a `Map` in memory, per trip, with a time-to-live: a browser
 * that closed without saying goodbye drops out after thirty seconds, and one
 * that is still open touches its entry every fifteen.
 */

import { publish } from './live.ts';

export interface Presence {
	readonly userId: string;
	readonly name: string;
	/** The stop under this person's pointer or keyboard focus, if any. */
	readonly stopId: string | null;
	readonly at: number;
}

const TTL_MS = 30_000;

const rooms = new Map<string, Map<string, Presence>>();

/** Record that somebody is here, and tell the room if anything changed. */
export function touch(tripId: string, who: Omit<Presence, 'at'>): void {
	let room = rooms.get(tripId);
	if (!room) {
		room = new Map();
		rooms.set(tripId, room);
	}

	const before = room.get(who.userId);
	room.set(who.userId, { ...who, at: Date.now() });

	// A heartbeat that changes nothing visible should not wake every watcher.
	if (!before || before.stopId !== who.stopId || before.name !== who.name) publish(tripId);
}

export function leave(tripId: string, userId: string): void {
	const room = rooms.get(tripId);
	if (!room?.delete(userId)) return;
	if (room.size === 0) rooms.delete(tripId);
	publish(tripId);
}

/** Everybody still within the time-to-live, oldest arrival first. */
export function list(tripId: string, now = Date.now()): Presence[] {
	const room = rooms.get(tripId);
	if (!room) return [];

	for (const [userId, entry] of room) {
		if (now - entry.at > TTL_MS) room.delete(userId);
	}
	if (room.size === 0) rooms.delete(tripId);

	return [...room.values()].sort((a, b) => a.at - b.at);
}
