import { redirect } from '@sveltejs/kit';
import { businessesForUser, requireUser } from '#lib/server/guards.ts';
import type { PageServerLoad } from './$types';

/**
 * The front door for staff.
 *
 * Most people work at exactly one studio, so this route exists mainly to send
 * them straight through to it. Only somebody who works at two ever sees a page
 * here — which is the right trade: an extra click for the common case would be
 * an extra click forever.
 */
export const load: PageServerLoad = async () => {
	const user = requireUser();
	const memberships = await businessesForUser(user.id);

	if (memberships.length === 1) {
		redirect(303, `/manage/${memberships[0]!.business.slug}`);
	}

	return {
		memberships: memberships.map((entry) => ({
			slug: entry.business.slug,
			name: entry.business.name,
			role: entry.staff.role
		}))
	};
};
