import { requireOwner } from '#lib/server/guards.ts';
import type { PageServerLoad } from './$types';

/**
 * Owner-only.
 *
 * The remote functions this page calls already check — they have to, because
 * they are public endpoints reachable without ever loading this page. This load
 * exists so a member who follows a stale link gets an immediate, explained 403
 * instead of a page that renders and then fails to fetch anything.
 *
 * Two checks for one rule is not duplication. One of them is the boundary; the
 * other is the manners.
 */
export const load: PageServerLoad = async ({ params }) => {
	await requireOwner(params.slug);
	return {};
};
