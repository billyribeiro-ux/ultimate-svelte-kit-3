/**
 * INGESTION
 * =========
 *
 * The only way an operation enters a board. Everything a client sends arrives
 * here, and everything that leaves here is trustworthy — which is the property
 * the rest of the server relies on when it stops re-validating.
 *
 * Four gates, in this order:
 *
 *   1. shape      — `parseBatch`, which has already run by the time we are called
 *   2. permission — per operation, not per batch
 *   3. clock      — a stamp too far in the future is refused here, at the one
 *                   boundary where refusing it still keeps it out of the log
 *   4. identity   — the `actor` is recorded as claimed, the `authorId` is not
 *
 * Gate 4 is the one worth staring at. `actor` is minted in the browser and can
 * be anything; it is fine to store, because it is only used for ordering and for
 * ignoring one's own echo. `authorId` comes from the session and is what
 * attribution, rate limiting and "who deleted this" use. Confusing the two gives
 * you an audit log a client can write whatever it likes into.
 */

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { actorOf, isPlausible } from '#lib/crdt/index.ts';
import { parseOperation, type Operation } from '#lib/board/index.ts';
import type { PushResult } from '#lib/sync/protocol.ts';
import { db } from './db';
import { board, operation } from './db/schema';
import { mayApply, refusalFor } from './rbac';
import type { Role } from './db/schema';
import { publish } from './hub';

/** Refused with a reason the client can show somebody. */
export class IngestError extends Error {
	constructor(
		readonly status: 403 | 409 | 422,
		message: string
	) {
		super(message);
		this.name = 'IngestError';
	}
}

export interface IngestInput {
	readonly boardId: string;
	readonly userId: string;
	readonly role: Role;
	readonly actor: string;
	readonly ops: readonly Operation[];
	/** Injectable so the drift test does not depend on what time it is. */
	readonly now?: number;
}

export async function ingest({
	boardId,
	userId,
	role,
	actor,
	ops,
	now = Date.now()
}: IngestInput): Promise<PushResult> {
	for (const candidate of ops) {
		if (!mayApply(role, candidate)) throw new IngestError(403, refusalFor(role));

		/*
		 * The clock guard, in the one place it does any good.
		 *
		 * A stamp two years in the future drags every replica's clock with it,
		 * permanently, and no correct local time pulls an HLC back. Rejecting it in
		 * the browser was the first design and protected nothing — by then the
		 * operation is already in the log. Here it never gets in.
		 */
		if (!isPlausible(candidate.stamp, now)) {
			throw new IngestError(
				422,
				'Your device clock is too far ahead of the server. Check the time and try again.'
			);
		}

		/*
		 * The stamp says who made it, and it must agree with who says they made it.
		 *
		 * Not a security boundary — `actor` is self-declared either way — but a
		 * consistency one: an operation filed under one actor whose stamp says
		 * another breaks the per-actor cursor query, and the client that "sent" it
		 * would never be told to skip its own echo.
		 */
		if (actorOf(candidate.stamp) !== actor) {
			throw new IngestError(422, 'Operation stamp does not match the sending replica.');
		}
	}

	if (ops.length === 0) {
		return { accepted: 0, watermark: await watermarkOf(boardId) };
	}

	const rows = ops.map((candidate) => ({
		boardId,
		stamp: candidate.stamp,
		actor,
		authorId: userId,
		kind: candidate.kind,
		payload: JSON.stringify(candidate)
	}));

	const inserted = await db.transaction(async (tx) => {
		/*
		 * `onConflictDoNothing` against the (board, stamp) unique index makes the
		 * whole request idempotent. A client whose connection dropped mid-flight
		 * does not know whether the batch landed, so it sends it again; without
		 * this, the log grows a duplicate of everything sent during a flaky minute.
		 *
		 * The CRDT would survive that — applying an operation twice is a no-op — but
		 * the *log* would be wrong, and the log is what history replays from.
		 */
		const written = await tx
			.insert(operation)
			.values(rows)
			.onConflictDoNothing()
			.returning({ seq: operation.seq });

		if (written.length > 0) {
			await tx
				.update(board)
				.set({ updatedAt: new Date(now) })
				.where(eq(board.id, boardId));
		}

		return written;
	});

	const watermark = await watermarkOf(boardId);

	/*
	 * Broadcast only what was actually new.
	 *
	 * Echoing a re-sent operation is harmless — every replica is idempotent — but
	 * it is also pure waste, and during a reconnect storm it is the difference
	 * between a quiet catch-up and every client re-parsing the same batch.
	 */
	if (inserted.length > 0) {
		const fresh = ops.slice(ops.length - inserted.length);
		publish(boardId, { type: 'ops', ops: fresh, watermark });
	}

	return { accepted: ops.length, watermark };
}

/** The board's current sequence: the greatest `seq` any of its operations has. */
export async function watermarkOf(boardId: string): Promise<number> {
	const rows = await db
		.select({ seq: operation.seq })
		.from(operation)
		.where(eq(operation.boardId, boardId))
		.orderBy(desc(operation.seq))
		.limit(1);

	return rows[0]?.seq ?? 0;
}

/**
 * Read a page of a board's history after `since`.
 *
 * Ordered by `seq`, which is the server's total order and the only order a
 * client should replay in. Ordering by stamp instead would interleave two
 * replicas' work by wall clock and hand a client an operation before the one it
 * depends on — which the CRDT survives and the reader would not enjoy watching.
 */
export async function since(
	boardId: string,
	seq: number,
	limit: number
): Promise<{
	ops: Operation[];
	watermark: number;
}> {
	const rows = await db
		.select({ seq: operation.seq, payload: operation.payload })
		.from(operation)
		.where(and(eq(operation.boardId, boardId), gt(operation.seq, seq)))
		.orderBy(operation.seq)
		.limit(limit);

	return {
		/*
		 * Re-parsed, not cast.
		 *
		 * These rows were validated on the way in, so this is belt and braces — but
		 * they are also the oldest data in the system, written by a version of this
		 * code that may no longer exist. A board from six months ago whose format
		 * has since changed should fail here, loudly, rather than reach the CRDT and
		 * converge on something nonsensical.
		 */
		ops: rows.map((row) => parseOperation(JSON.parse(row.payload))),
		watermark: rows.at(-1)?.seq ?? seq
	};
}

/** How many operations a board has. Used by the compaction job and the board list. */
export async function countOperations(boardId: string): Promise<number> {
	const rows = await db
		.select({ total: sql<number>`count(*)` })
		.from(operation)
		.where(eq(operation.boardId, boardId));

	return rows[0]?.total ?? 0;
}
