/**
 * COMMENTS
 * ========
 *
 * Threads anchored to a shape, in their own table rather than in the CRDT.
 *
 * A comment is an event with an author and a time, not a value two people edit
 * into a merged state — "we both replied at once" wants both replies, which is
 * two rows and not a register. Keeping them out of the document also means a
 * `commenter` can be given comment rights without being handed the ability to
 * write to the board at all.
 */

import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { command, form, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { comment, user } from '#lib/server/db/schema.ts';
import { AccessError, requireAccess } from '#lib/server/rbac.ts';
import { requireUser } from '#lib/server/session.ts';

const boardId = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const body = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000));

function rethrow(thrown: unknown): never {
	if (thrown instanceof AccessError) error(thrown.status, thrown.message);
	throw thrown;
}

export interface Thread {
	id: string;
	anchor: string | null;
	author: string;
	body: string;
	createdAt: Date;
	resolvedAt: Date | null;
	replies: { id: string; author: string; body: string; createdAt: Date }[];
}

/** Every thread on a board, oldest first, with its replies. */
export const threads = query(boardId, async (id): Promise<Thread[]> => {
	const who = requireUser();
	await requireAccess(id, who.id, 'viewer').catch(rethrow);

	const rows = await db
		.select({
			id: comment.id,
			anchor: comment.anchor,
			parentId: comment.parentId,
			body: comment.body,
			createdAt: comment.createdAt,
			resolvedAt: comment.resolvedAt,
			author: user.name
		})
		.from(comment)
		.innerJoin(user, eq(user.id, comment.authorId))
		.where(eq(comment.boardId, id))
		.orderBy(asc(comment.createdAt))
		.limit(500);

	/*
	 * One query, assembled in memory.
	 *
	 * The alternative is a query for roots and one for each root's replies, which
	 * on a board with forty threads is forty-one round trips to answer a question
	 * the database could answer once. Threads are one level deep by design, so the
	 * assembly is a single pass.
	 */
	const roots = new Map<string, Thread>();

	for (const row of rows) {
		if (row.parentId === null) {
			roots.set(row.id, { ...row, replies: [] });
		}
	}

	for (const row of rows) {
		if (row.parentId === null) continue;
		roots.get(row.parentId)?.replies.push({
			id: row.id,
			author: row.author,
			body: row.body,
			createdAt: row.createdAt
		});
	}

	return [...roots.values()];
});

/**
 * Start a thread, or reply to one.
 *
 * A `form()` so that it works without JavaScript, and so the reply boxes can be
 * created with `postComment.for(threadId)` — one form instance per thread, each
 * with its own pending state and its own validation issues, from one definition.
 */
export const postComment = form(
	v.object({
		boardId,
		body,
		anchor: v.optional(v.string()),
		parentId: v.optional(v.string())
	}),
	async ({ boardId: id, body: text, anchor, parentId }) => {
		const who = requireUser();

		// `commenter` is enough. That is the whole point of the role.
		await requireAccess(id, who.id, 'commenter').catch(rethrow);

		await db.insert(comment).values({
			id: crypto.randomUUID(),
			boardId: id,
			anchor: anchor || null,
			parentId: parentId || null,
			authorId: who.id,
			body: text
		});

		await threads(id).refresh();
	}
);

export const resolveThread = command(
	v.object({ boardId, id: v.pipe(v.string(), v.minLength(1)), resolved: v.boolean() }),
	async ({ boardId: board, id, resolved }) => {
		const who = requireUser();
		await requireAccess(board, who.id, 'commenter').catch(rethrow);

		await db
			.update(comment)
			.set({
				resolvedAt: resolved ? new Date() : null,
				resolvedBy: resolved ? who.id : null
			})
			// Only a root comment can be resolved; a reply has no independent state.
			.where(and(eq(comment.id, id), isNull(comment.parentId)));

		await threads(board).refresh();
	}
);
