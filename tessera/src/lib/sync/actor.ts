/**
 * THIS REPLICA'S IDENTITY
 * =======================
 *
 * One actor id per **tab**, not per user and not per device.
 *
 * That is not a simplification, it is the requirement. Two tabs open on the same
 * board can genuinely edit at the same time, and if they share an actor id they
 * share a clock — two independent `tick()` sequences issuing the same stamps,
 * which the CRDT resolves by keeping one character and discarding the other.
 * The symptom is typing that vanishes in one tab and not the other, and it is
 * miserable to track down.
 *
 * `sessionStorage` is per tab by definition, which makes it exactly the right
 * store: a reload keeps the id (so the clock resumes and no stamp is reissued),
 * a duplicated tab gets its own, and closing the tab forgets it.
 */

import { newActorId, type ActorId } from '#lib/crdt/index.ts';

const KEY = 'tessera:actor';

let cached: ActorId | null = null;

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
}
