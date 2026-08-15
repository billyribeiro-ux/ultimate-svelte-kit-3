import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	// A redirect rather than a 401: this guards a page a human is looking at, and
	// `redirectTo` turns "you were logged out" from an annoyance into a hiccup.
	if (!locals.viewer) {
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}

	return { accountIds: locals.viewer.accountIds };
};
