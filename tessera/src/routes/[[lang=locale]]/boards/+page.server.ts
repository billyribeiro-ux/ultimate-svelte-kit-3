import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { membership } from '#lib/server/db/schema.ts';
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
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/sign-in?from=${encodeURIComponent(url.pathname)}`);

	const rows = await db
		.select({ workspaceId: membership.workspaceId })
		.from(membership)
		.where(eq(membership.userId, locals.user.id))
		.limit(1);

	return { workspaceId: rows[0]?.workspaceId ?? null };
};
