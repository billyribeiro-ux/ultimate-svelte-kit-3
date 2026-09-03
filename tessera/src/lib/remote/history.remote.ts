/**
 * VERSION HISTORY
 * ===============
 *
 * Checkpoints are labels on a sequence number. Restoring is an edit.
 */

import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { command, form, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { checkpoint } from '#lib/server/db/schema.ts';
import { AccessError, requireAccess } from '#lib/server/rbac.ts';
import { requireUser } from '#lib/server/session.ts';
import { documentAt, diffToward, revisionsOf, serverClock } from '#lib/server/history.ts';
import { ingest, watermarkOf } from '#lib/server/ingest.ts';

const boardId = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

function rethrow(thrown: unknown): never {
	if (thrown instanceof AccessError) error(thrown.status, thrown.message);
	throw thrown;
}

/** Every named point in a board's history, newest first. */
export const revisions = query(boardId, async (id) => {
	const user = requireUser();
	await requireAccess(id, user.id, 'viewer').catch(rethrow);
	return revisionsOf(id);
});

export const saveCheckpoint = form(
	v.object({ boardId, label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)) }),
	async ({ boardId: id, label }) => {
		const user = requireUser();
		await requireAccess(id, user.id, 'editor').catch(rethrow);

		await db.insert(checkpoint).values({
			id: crypto.randomUUID(),
			boardId: id,
			label,
			// The board's current sequence. Recorded rather than computed later,
			// because "the checkpoint I saved at 3pm" must not drift as the board does.
			seq: await watermarkOf(id),
			authorId: user.id
		});

		await revisions(id).refresh();
	}
);

/**
 * Put the board back the way it was, by writing the difference as new operations.
 *
 * The log is never rewound. A restore is an ordinary batch of edits that happens
 * to undo a lot at once, so it appears in the history, can itself be restored
 * past, and merges with whatever somebody else is doing at that moment.
 */
export const restoreTo = command(
	v.object({ boardId, seq: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
	async ({ boardId: id, seq }) => {
		const user = requireUser();
		const access = await requireAccess(id, user.id, 'editor').catch(rethrow);

		const [present, past] = await Promise.all([documentAt(id, Infinity), documentAt(id, seq)]);

		const { actor, clock } = serverClock();
		const ops = diffToward(present, past, actor, clock);

		if (ops.length === 0) return { applied: 0 };

		await ingest({ boardId: id, userId: user.id, role: access.role, actor, ops });
		await revisions(id).refresh();

		return { applied: ops.length };
	}
);

/** Delete a checkpoint. The operations it pointed at are untouched. */
export const forgetCheckpoint = command(
	v.object({ boardId, id: v.pipe(v.string(), v.minLength(1)) }),
	async ({ boardId: board, id }) => {
		const user = requireUser();
		await requireAccess(board, user.id, 'editor').catch(rethrow);

		await db.delete(checkpoint).where(eq(checkpoint.id, id));
		await revisions(board).refresh();
	}
);
