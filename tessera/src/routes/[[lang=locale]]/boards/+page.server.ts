import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { membership } from '#lib/server/db/schema.ts';
import { userOrSignIn } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

/**
 * The board list needs one thing the layout does not carry: which workspace a
 * new board should go into.
 *
 * A person can belong to several. Picking the first is a placeholder for a
 * workspace switcher, and it is marked as such rather than dressed up — the
 * alternative is a "smart" default that guesses wrong and creates a board
 * somewhere the person cannot find it.
 */
export const load: PageServerLoad = async () => {
	const user = userOrSignIn();

	/*
	 * Only a workspace where this person may create boards, and the oldest of
	 * those, so the answer does not depend on the order SQLite happens to return
	 * rows in. A viewer in somebody else's workspace who also owns their own
	 * must not be handed the one where "New board" can only be refused.
	 */
	const rows = await db
		.select({ workspaceId: membership.workspaceId })
		.from(membership)
		.where(and(eq(membership.userId, user.id), inArray(membership.role, ['owner', 'editor'])))
		.orderBy(asc(membership.createdAt))
		.limit(1);

	return { workspaceId: rows[0]?.workspaceId ?? null };
};
