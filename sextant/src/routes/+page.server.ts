import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { DEFAULT_RANGE } from '#lib/time/range.ts';

/**
 * The front door.
 *
 * There is no landing page: this is a tool people have already decided to use,
 * and a marketing page between them and their logs is a click they pay every
 * morning. Signed in, it goes to the first workspace; signed out, to sign-in.
 *
 * A 307 rather than the default 302, because the distinction matters here: this
 * redirect depends on who is asking, and a cache that treats it as permanent
 * would send the next person to somebody else's workspace.
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { tenants } = await parent();

	const first = tenants[0];
	if (!first) redirect(307, '/sign-in');

	redirect(
		307,
		`/${first.slug}/explore?q=${encodeURIComponent('from logs')}&range=${DEFAULT_RANGE}`
	);
};
