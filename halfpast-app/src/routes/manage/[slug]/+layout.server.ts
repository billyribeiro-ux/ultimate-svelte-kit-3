import { requireStaff } from '#lib/server/guards.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Guard every page under `/manage/[slug]`, and hand down what they all need.
 *
 * A layout load runs before its own page's load and before any child route's,
 * so putting the guard here means a new page added under this directory is
 * protected the moment it exists — nobody has to remember.
 *
 * It is not the *only* protection. Each remote function re-checks, because a
 * remote function is a public endpoint that never went through this load. This
 * is the fast, visible failure: an unauthenticated visitor is redirected to sign
 * in rather than watching an empty page fail to fetch.
 */
export const load: LayoutServerLoad = async ({ params }) => {
	const context = await requireStaff(params.slug);

	return {
		slug: params.slug,
		business: {
			name: context.business.name,
			timeZone: context.business.timeZone,
			currency: context.business.currency
		},
		/** The viewer's own role, so the UI can hide what they cannot do. */
		viewer: {
			staffId: context.staff.id,
			displayName: context.staff.displayName,
			role: context.staff.role
		}
	};
};
