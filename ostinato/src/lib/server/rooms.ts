/**
 * JAM ROOMS
 * =========
 *
 * A room is one pattern that several browsers edit together. The database row
 * is the truth, and the *broadcaster* below is how everybody hears that the
 * truth changed: each write notifies every open `query.live` stream for that
 * room, which yields the new snapshot to its browser.
 *
 * ONE PROCESS, AND SAID SO
 * ------------------------
 * Subscribers live in a `Map` in this module, so two instances of the server
 * would each know only their own listeners. That is the honest limit of an
 * in-memory broadcaster; the fix is a shared channel — a Postgres `NOTIFY`, a
 * Redis stream — and it is the first thing to reach for when this runs on more
 * than one machine. Saying so here beats a deployment discovering it.
 */

import { eq, sql } from 'drizzle-orm';
import { fromDto, parseStored, toDto } from '#lib/pattern/dto.ts';
import { PatternSchema, type Pattern } from '#lib/pattern/model.ts';
import { preset } from '#lib/pattern/presets.ts';
import * as v from 'valibot';
import { db, schema } from './db/index.ts';
import type { Artist } from './identity.ts';

export const LOBBY = 'lobby';

export interface Presence {
	id: string;
	handle: string;
}

export interface RoomSnapshot {
	id: string;
	name: string;
	pattern: Pattern;
	version: number;
	updatedAt: number;
	/** Who has the room open right now, by connection. */
	present: Presence[];
}

type Listener = (snapshot: RoomSnapshot) => void;

/** Open streams per room. A connection is a listener plus who it belongs to. */
const connections = new Map<string, Map<Listener, Presence>>();

function presentIn(room: string): Presence[] {
	const seen = new Map<string, Presence>();
	for (const presence of connections.get(room)?.values() ?? []) seen.set(presence.id, presence);
	return [...seen.values()];
}

export async function getRoom(id: string): Promise<RoomSnapshot | null> {
	const row = await db.query.rooms.findFirst({ where: eq(schema.rooms.id, id) });
	if (!row) return null;

	return {
		id: row.id,
		name: row.name,
		pattern: parseStored(row.data),
		version: row.version,
		updatedAt: row.updatedAt,
		present: presentIn(id)
	};
}

/**
 * Change a room's pattern and tell everybody.
 *
 * `mutate` runs on a freshly parsed copy, and the result is validated before
 * it is written — a command that sets a step to velocity 900 is refused here,
 * not stored and refused by every browser that reads it.
 */
export async function updateRoom(
	id: string,
	mutate: (pattern: Pattern) => void
): Promise<RoomSnapshot> {
	const current = await getRoom(id);
	if (!current) throw new Error(`No room ${id}`);

	const next = fromDto(toDto(current.pattern));
	mutate(next);
	const valid = v.parse(PatternSchema, next);

	const [row] = await db
		.update(schema.rooms)
		.set({
			data: JSON.stringify(toDto(valid)),
			version: sql`${schema.rooms.version} + 1`,
			updatedAt: Date.now()
		})
		.where(eq(schema.rooms.id, id))
		.returning();

	const snapshot: RoomSnapshot = {
		id,
		name: row!.name,
		pattern: valid,
		version: row!.version,
		updatedAt: row!.updatedAt,
		present: presentIn(id)
	};

	broadcast(id, snapshot);
	return snapshot;
}

function broadcast(room: string, snapshot: RoomSnapshot): void {
	for (const listener of connections.get(room)?.keys() ?? []) listener(snapshot);
}

/**
 * Join a room: register a listener and who it is. Returns the leave function.
 * Joining and leaving both re-broadcast, because "who is here" is part of the
 * snapshot and it just changed.
 */
export function join(room: string, who: Artist | null, listener: Listener): () => void {
	const presence: Presence = who ?? {
		id: `anon-${Math.random().toString(36).slice(2, 8)}`,
		handle: 'someone'
	};

	let listeners = connections.get(room);
	if (!listeners) {
		listeners = new Map();
		connections.set(room, listeners);
	}
	listeners.set(listener, presence);
	void announce(room);

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) connections.delete(room);
		void announce(room);
	};
}

async function announce(room: string): Promise<void> {
	const snapshot = await getRoom(room);
	if (snapshot) broadcast(room, snapshot);
}

/** How many streams are open across all rooms — the diagnostics page shows it. */
export function openConnections(): number {
	let n = 0;
	for (const listeners of connections.values()) n += listeners.size;
	return n;
}

/** The room that always exists. */
export async function ensureLobby(): Promise<void> {
	const existing = await db.query.rooms.findFirst({ where: eq(schema.rooms.id, LOBBY) });
	if (existing) return;

	await db.insert(schema.rooms).values({
		id: LOBBY,
		name: 'The lobby',
		data: JSON.stringify(toDto(preset('four-on-the-floor')))
	});
}
