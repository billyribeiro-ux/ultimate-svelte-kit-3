/**
 * VERSION VECTORS
 * ===============
 *
 * "What do I already have, and what do I still need from you?"
 *
 * The usual version vector maps a replica to a sequence number: actor `a3f1` is
 * at operation 412. Tessera's maps a replica to a **stamp** instead, because
 * `clock.ts` already guarantees that every stamp an actor produces is strictly
 * greater than the last one it produced. A stamp *is* that actor's sequence
 * number, with a readable date attached and nothing extra to keep in step.
 *
 * The consequences are pleasant:
 *
 *   - "Have I seen this operation?" is `stamp <= vector[actor]`, a string
 *     comparison.
 *   - "What do you need?" is `SELECT * WHERE actor = ? AND stamp > ?`, one index
 *     scan per actor, no join, no scan of anything you already have.
 *   - A vector is a small JSON object that compresses well and reads clearly in
 *     a log.
 *
 * WHAT THIS IS NOT FOR
 * --------------------
 * A vector is a **sync cursor**, not a delivery filter. The distinction cost an
 * afternoon.
 *
 * The first version of `apply` started with `if (has(version, stamp)) return`,
 * on the reasoning that an operation already covered by the vector is one we
 * have already applied. That reasoning holds only while each actor's operations
 * arrive in order. They usually do — a client keeps one request in flight and
 * the server replays in stamp order — but "usually" is not a property you can
 * build on, and when delivery *was* shuffled the vector jumped over a gap and
 * the skipped operation was discarded in silence.
 *
 * So nothing gates on this. Every structure in this folder is idempotent on its
 * own, which makes `apply` safe under any delivery order and makes the fast path
 * worthless anyway. The vector's job is to tell the server where to resume, and
 * `sync/client.svelte.ts` advances it from the **watermark** the server sends
 * with each batch — a point the server guarantees is complete — never from the
 * stamps of individual operations.
 */

import { type ActorId, type Stamp, actorOf, max } from './clock';

/** A frozen point in a document's history. */
export type VersionVector = ReadonlyMap<ActorId, Stamp>;

/** The wire form: a plain object, because JSON has no Map. */
export type EncodedVersion = Record<string, string>;

/** The empty vector — a replica that has seen nothing. */
export function empty(): VersionVector {
	return new Map();
}

/**
 * Has this vector already observed `stamp`?
 *
 * Note `<=` rather than `<`: the vector stores the *last* stamp seen, inclusive.
 * Getting this wrong makes every sync redeliver exactly one operation per actor
 * forever — a bug that looks like a performance problem and is a correctness one,
 * because those redelivered operations also re-trigger any effect watching them.
 */
export function has(vector: VersionVector, stamp: Stamp): boolean {
	const seen = vector.get(actorOf(stamp));
	return seen !== undefined && stamp <= seen;
}

/**
 * The vector after observing `stamp`. Returns a new Map; vectors are values.
 *
 * Copying rather than mutating costs an allocation per operation and buys the
 * ability to hand a vector to a component and know it will not change underneath
 * the render. In a document with a hot loop this would be the wrong trade; a
 * vector has one entry per replica that has ever touched the board, which is
 * tens, not thousands.
 */
export function observe(vector: VersionVector, stamp: Stamp): VersionVector {
	const actor = actorOf(stamp);
	const seen = vector.get(actor);
	if (seen !== undefined && stamp <= seen) return vector;

	const next = new Map(vector);
	next.set(actor, stamp);
	return next;
}

/** The least upper bound of two vectors: everything either side has seen. */
export function merge(a: VersionVector, b: VersionVector): VersionVector {
	const next = new Map(a);
	for (const [actor, stamp] of b) {
		const seen = next.get(actor);
		next.set(actor, seen === undefined ? stamp : max(seen, stamp));
	}
	return next;
}

/**
 * Does `a` dominate `b` — has it seen everything `b` has?
 *
 * Two vectors where neither dominates the other are *concurrent*, which is the
 * interesting case and the reason a CRDT exists at all.
 */
export function dominates(a: VersionVector, b: VersionVector): boolean {
	for (const [actor, stamp] of b) {
		const seen = a.get(actor);
		if (seen === undefined || seen < stamp) return false;
	}
	return true;
}

/** Do these two vectors describe exactly the same set of operations? */
export function equal(a: VersionVector, b: VersionVector): boolean {
	return a.size === b.size && dominates(a, b);
}

/**
 * Filter a batch down to the operations `vector` has not seen.
 *
 * The server does this with SQL. The client does it in memory, on every incoming
 * batch, because a reconnect can legitimately redeliver: the client's cursor is
 * what it last *persisted*, and it may have applied operations after that.
 */
export function unseen<T extends { readonly stamp: Stamp }>(
	vector: VersionVector,
	operations: readonly T[]
): T[] {
	return operations.filter((operation) => !has(vector, operation.stamp));
}

export function toJSON(vector: VersionVector): EncodedVersion {
	return Object.fromEntries(vector);
}

export function fromJSON(encoded: EncodedVersion): VersionVector {
	return new Map(Object.entries(encoded) as [ActorId, Stamp][]);
}
