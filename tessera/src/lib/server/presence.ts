/**
 * WHO IS LOOKING AT THIS BOARD
 * ============================
 *
 * Deliberately not in the database.
 *
 * A cursor position is true for about thirty milliseconds. Writing it down means
 * sixty inserts a second per person, each one obsolete before the transaction
 * commits, plus a delete for every one of them — to store something whose
 * correct behaviour on a crash is to disappear. Presence *is* soft state, and
 * the honest representation of soft state is memory.
 *
 * The consequences are all good ones. A server restart drops the roster and
 * every client re-announces within a heartbeat. A process that runs out of
 * memory is holding one small object per open tab. And there is no cleanup job,
 * because expiry is a comparison rather than a delete.
 */

import { PRESENCE_TIMEOUT_MS, type Peer, type PresenceUpdate } from '#lib/sync/protocol.ts';

/** board id → actor → peer */
const boards = new Map<string, Map<string, Peer>>();

/**
 * A stable colour per person, derived rather than assigned.
 *
 * Assigning from a pool means the same colleague is amber today and cyan
 * tomorrow, and two people can swap between reloads — which makes "the green
 * cursor" useless as a way of referring to somebody mid-conversation. Hashing
 * the user id gives everybody one colour forever, at the cost of the occasional
 * collision, which is a much smaller problem than instability.
 */
export function hueFor(userId: string): number {
	let hash = 2166136261;
	for (let i = 0; i < userId.length; i += 1) {
		hash ^= userId.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 360;
}

export function announce(
	update: PresenceUpdate,
	who: { userId: string; name: string },
	now = Date.now()
): Peer[] {
	const peers = boards.get(update.boardId) ?? new Map<string, Peer>();

	peers.set(update.actor, {
		actor: update.actor,
		userId: who.userId,
		name: who.name,
		hue: hueFor(who.userId),
		cursor: update.cursor,
		selection: update.selection,
		viewport: update.viewport,
		at: now
	});

	boards.set(update.boardId, peers);
	return roster(update.boardId, now);
}

/** Everybody currently present, with the stale swept as a side effect of asking. */
export function roster(boardId: string, now = Date.now()): Peer[] {
	const peers = boards.get(boardId);
	if (!peers) return [];

	for (const [actor, peer] of peers) {
		/*
		 * Expiry rather than a goodbye message.
		 *
		 * A tab closed mid-drag sends nothing, and a laptop that goes to sleep keeps
		 * its connection nominally open for minutes. Waiting for a clean disconnect
		 * means a board slowly fills with ghosts that nobody can dismiss.
		 */
		if (now - peer.at > PRESENCE_TIMEOUT_MS) peers.delete(actor);
	}

	if (peers.size === 0) {
		boards.delete(boardId);
		return [];
	}

	// Sorted by actor so the roster is stable between polls and a keyed `{#each}`
	// does not reorder the avatars every time somebody moves their mouse.
	return [...peers.values()].sort((a, b) => (a.actor < b.actor ? -1 : 1));
}

/** Remove one replica immediately — called when its stream closes. */
export function depart(boardId: string, actor: string): void {
	const peers = boards.get(boardId);
	if (!peers) return;

	peers.delete(actor);
	if (peers.size === 0) boards.delete(boardId);
}
