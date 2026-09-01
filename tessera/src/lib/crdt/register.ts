/**
 * LAST-WRITE-WINS REGISTERS
 * =========================
 *
 * The simplest useful CRDT, and the one that carries most of a diagram: a node's
 * x, y, width, height, fill, stroke and z-order are all single values where the
 * only sensible resolution of "we both set this" is "the later one".
 *
 * "Later" means `clock.ts`'s total order, not wall-clock time, so it is decided
 * identically on every replica and never ends in a tie — the actor id inside the
 * stamp is the final tiebreak.
 *
 * WHERE LWW IS THE WRONG TOOL
 * ---------------------------
 * LWW *discards* the losing write. That is correct for a position (two people
 * dragging one box: somebody's drag has to lose) and wrong for a set of members
 * (two people adding different collaborators: neither should lose). It is also
 * wrong for text, where the intuitive result is both edits, interleaved — which
 * is what `rga.ts` exists for.
 *
 * The rule of thumb this codebase follows: **use LWW when a human would accept
 * "somebody else got there first" as an explanation.** Nobody accepts that
 * explanation for a deleted paragraph.
 */

import { type Stamp, compare } from './clock';

/** A value with the stamp of the write that produced it. */
export interface Lww<T> {
	readonly value: T;
	readonly stamp: Stamp;
}

export function register<T>(value: T, stamp: Stamp): Lww<T> {
	return { value, stamp };
}

/**
 * Merge two registers. Commutative, associative and idempotent — the three laws
 * that make a CRDT a CRDT, and the three properties `crdt.spec.ts` checks by
 * brute force rather than by trusting this comment.
 *
 * Returns one of the two inputs rather than a fresh object, so merging a value
 * that has not changed is free and reference equality keeps working as a cheap
 * "did this change?" test for the reactive layer.
 */
export function mergeRegister<T>(a: Lww<T>, b: Lww<T>): Lww<T> {
	return compare(a.stamp, b.stamp) >= 0 ? a : b;
}

/**
 * Apply a write, keeping the register unchanged if the write is stale.
 *
 * Returns `undefined` when nothing changed, which the document uses to skip the
 * reactive invalidation entirely. Redelivery during a reconnect is common enough
 * that "this operation is old news" is a hot path, not an edge case.
 */
export function write<T>(current: Lww<T> | undefined, value: T, stamp: Stamp): Lww<T> | undefined {
	if (current !== undefined && compare(stamp, current.stamp) <= 0) return undefined;
	return { value, stamp };
}
