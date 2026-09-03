/**
 * TIME TRAVEL
 * ===========
 *
 * Replaying a board to a point in its log, and working out what would have to
 * happen for the present to look like the past.
 *
 * RESTORE IS AN EDIT, NOT A REWIND
 * --------------------------------
 * Nothing here deletes an operation. "Restore to Tuesday" computes the
 * difference between now and Tuesday and appends it as ordinary operations —
 * so the restore is itself in the history, can itself be undone, and merges with
 * whatever a colleague is doing at the same moment like any other edit.
 *
 * A rewind cannot do any of that. It would also be a lie the moment somebody
 * else's replica, which still holds the operations you deleted, reconnects.
 *
 * WHY THIS RUNS ON THE SERVER
 * ---------------------------
 * The rest of the system keeps the server out of the document's business. This
 * is the deliberate exception: a restore has to compare two full states, one of
 * which the client does not have, and it is an explicit administrative action
 * rather than something that happens sixty times a second. It is authored under
 * the requesting user's id and lands in the log like any other batch.
 */

import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { BoardDocument, emptySnapshot, parseSnapshot, type Operation } from '#lib/board/index.ts';
import type { EdgeFields, NodeFields } from '#lib/board/index.ts';
import { Clock, newActorId, type ActorId } from '#lib/crdt/index.ts';
import { BoardRevision } from '#lib/history/revision.ts';
import { db } from './db/index.ts';
import { board, checkpoint, operation, user } from './db/schema.ts';

/** Replay a board up to and including `seq`. Pass `Infinity` for the present. */
export async function documentAt(boardId: string, seq: number): Promise<BoardDocument> {
	const rows = await db
		.select({ snapshot: board.snapshot, snapshotSeq: board.snapshotSeq })
		.from(board)
		.where(eq(board.id, boardId))
		.limit(1);

	const found = rows[0];
	if (!found) throw new Error(`No such board: ${boardId}`);

	/*
	 * The stored snapshot is only usable when it is not already past the point we
	 * are aiming for. Compaction moves it forward, so a board compacted this
	 * morning cannot be used to reconstruct last week — that replay starts from
	 * nothing, which is slower and correct.
	 */
	const usable = found.snapshot && found.snapshotSeq <= seq;

	const document = BoardDocument.fromSnapshot(
		newActorId(),
		usable ? parseSnapshot(JSON.parse(found.snapshot!)) : emptySnapshot()
	);

	let cursor = usable ? found.snapshotSeq : 0;

	for (;;) {
		const page = await db
			.select({ seq: operation.seq, payload: operation.payload })
			.from(operation)
			.where(
				and(
					eq(operation.boardId, boardId),
					gt(operation.seq, cursor),
					Number.isFinite(seq) ? lte(operation.seq, seq) : undefined
				)
			)
			.orderBy(operation.seq)
			.limit(1_000);

		if (page.length === 0) break;

		document.applyAll(page.map((row) => JSON.parse(row.payload) as Operation));
		cursor = page.at(-1)!.seq;

		if (page.length < 1_000) break;
	}

	return document;
}

/**
 * The operations that would make `present` look like `past`.
 *
 * Written against the reactive projections rather than the CRDT internals,
 * because what a person means by "restore" is "the picture I had", not "the
 * merge history I had".
 */
export function diffToward(
	present: BoardDocument,
	past: BoardDocument,
	actor: ActorId,
	clock: Clock
): Operation[] {
	const ops: Operation[] = [];

	/* Nodes that exist now and did not exist then: remove them. */
	for (const node of present.nodes.values()) {
		if (past.nodes.has(node.id)) continue;
		ops.push({
			kind: 'node.remove',
			stamp: clock.tick(),
			target: node.id,
			observed: present.observedNodeAdds(node.id)
		});
	}

	for (const wanted of past.nodes.values()) {
		const current = present.nodes.get(wanted.id);
		const fields: NodeFields = {
			kind: wanted.kind,
			x: wanted.x,
			y: wanted.y,
			w: wanted.w,
			h: wanted.h,
			fill: wanted.fill,
			order: wanted.order,
			parent: wanted.parent
		};

		if (!current) {
			// Gone since: bring it back with the same id, so every edge that pointed
			// at it points at it again.
			ops.push({ kind: 'node.add', stamp: clock.tick(), id: wanted.id, fields });
			ops.push(...textOps(clock, wanted.id, '', wanted.label));
			continue;
		}

		for (const [field, value] of Object.entries(fields)) {
			const key = field as keyof NodeFields;
			if (current[key] === value) continue;
			ops.push({
				kind: 'node.set',
				stamp: clock.tick(),
				target: wanted.id,
				field: key,
				value
			} as Operation);
		}

		if (current.label !== wanted.label) {
			ops.push(...textOps(clock, wanted.id, current.label, wanted.label, present));
		}
	}

	for (const edge of present.edges.values()) {
		if (past.edges.has(edge.id)) continue;
		ops.push({
			kind: 'edge.remove',
			stamp: clock.tick(),
			target: edge.id,
			observed: present.observedEdgeAdds(edge.id)
		});
	}

	for (const wanted of past.edges.values()) {
		if (present.edges.has(wanted.id)) continue;
		const fields: EdgeFields = {
			from: wanted.from,
			to: wanted.to,
			kind: wanted.kind,
			fromPort: wanted.fromPort,
			toPort: wanted.toPort
		};
		ops.push({ kind: 'edge.add', stamp: clock.tick(), id: wanted.id, fields });
	}

	void actor;
	return ops;
}

/**
 * Replace a label wholesale.
 *
 * Deliberately not a character diff. A restore is a coarse action — "put it back
 * how it was" — and a minimal edit script would interleave with whatever
 * somebody is typing right now in a way nobody could predict. Deleting the
 * current text and inserting the old text is blunt, obvious, and produces the
 * result the button promises.
 */
function textOps(
	clock: Clock,
	target: string,
	from: string,
	to: string,
	present?: BoardDocument
): Operation[] {
	const ops: Operation[] = [];

	if (from.length > 0 && present) {
		const chars = present.label(target as never).idsBetween(0, [...from].length);
		if (chars.length > 0) {
			ops.push({ kind: 'text.delete', stamp: clock.tick(), target: target as never, chars });
		}
	}

	let after: string | null = null;
	for (const character of [...to]) {
		const stamp = clock.tick();
		ops.push({
			kind: 'text.insert',
			stamp,
			target: target as never,
			after: after as never,
			value: character
		});
		after = stamp;
	}

	return ops;
}

/**
 * The history list: every named checkpoint, plus how much happened between them.
 *
 * Returned as `BoardRevision` instances, which cross the wire intact because
 * `hooks.ts` registers them with `transport` — so the component renders one by
 * asking it to describe itself rather than by re-implementing the rules.
 */
export async function revisionsOf(boardId: string, limit = 40): Promise<BoardRevision[]> {
	const marks = await db
		.select({
			seq: checkpoint.seq,
			label: checkpoint.label,
			createdAt: checkpoint.createdAt,
			author: user.name
		})
		.from(checkpoint)
		.innerJoin(user, eq(user.id, checkpoint.authorId))
		.where(eq(checkpoint.boardId, boardId))
		.orderBy(desc(checkpoint.seq))
		.limit(limit);

	const latest = await db
		.select({ seq: operation.seq, createdAt: operation.createdAt, author: user.name })
		.from(operation)
		.innerJoin(user, eq(user.id, operation.authorId))
		.where(eq(operation.boardId, boardId))
		.orderBy(desc(operation.seq))
		.limit(1);

	const revisions: BoardRevision[] = [];

	// "Now" first, unless the newest checkpoint already is now.
	const head = latest[0];
	if (head && head.seq !== marks[0]?.seq) {
		const since = marks[0]?.seq ?? 0;
		const counted = await db
			.select({ total: sql<number>`count(*)` })
			.from(operation)
			.where(and(eq(operation.boardId, boardId), gt(operation.seq, since)));

		revisions.push(
			new BoardRevision(head.seq, head.createdAt, null, head.author, counted[0]?.total ?? 0)
		);
	}

	for (const [index, mark] of marks.entries()) {
		const previous = marks[index + 1]?.seq ?? 0;
		const counted = await db
			.select({ total: sql<number>`count(*)` })
			.from(operation)
			.where(
				and(
					eq(operation.boardId, boardId),
					gt(operation.seq, previous),
					lte(operation.seq, mark.seq)
				)
			);

		revisions.push(
			new BoardRevision(mark.seq, mark.createdAt, mark.label, mark.author, counted[0]?.total ?? 0)
		);
	}

	return revisions;
}

/** A clock for server-authored operations. One per call; never reused. */
export function serverClock(): { actor: ActorId; clock: Clock } {
	const actor = newActorId();
	return { actor, clock: new Clock(actor) };
}
