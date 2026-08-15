import { requireStaff } from '#lib/server/guards.ts';
import type { PageServerLoad } from './$types';

/**
 * Guard the page, and hand down the two things the component needs before its
 * first live query resolves: the studio's name and its time zone.
 *
 * The guard here is not what protects the data — `diary.remote.ts` re-checks on
 * every call, because a remote function is reachable whether or not this load
 * ever ran. What this does is fail *early* and *visibly*: somebody who is not
 * signed in gets sent to the sign-in page instead of watching an empty diary
 * fail to load.
 */
export const load: PageServerLoad = async ({ params }) => {
	const context = await requireStaff(params.slug);

	return {
		slug: params.slug,
		businessName: context.business.name,
		timeZone: context.business.timeZone
	};
};
