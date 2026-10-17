import { redirect } from '@sveltejs/kit';
import { can } from '@sequent/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	// A redirect rather than a 401: this guards a page a human is looking at, and
	// `redirectTo` turns "you were logged out" from an annoyance into a hiccup.
	if (!locals.viewer) {
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}

	return {
		accountIds: locals.viewer.accountIds,
		/*
		 * Whether the Positions panel should ask at all.
		 *
		 * Every role that opens the terminal may see the book, and one of them — the
		 * venue operator — holds no positions. Deciding that here, from the same
		 * rule `getMyPositions` enforces, turns a certain refusal into a branch in
		 * the markup. The query still checks for itself: this is a courtesy to the
		 * page, and the remote function is the control.
		 */
		canSeePositions: can(locals.viewer, 'view_positions', { firmId: locals.viewer.firmId }).allowed
	};
};
