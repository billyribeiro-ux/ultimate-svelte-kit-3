import { error, redirect } from '@sveltejs/kit';
import { can } from '@sequent/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.viewer) {
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	/*
	 * The server-side control. Hiding the nav link is manners; this is the rule.
	 *
	 * Gated on `view_ledger` rather than `view_positions`, and the difference
	 * matters: every trader can see their own positions, so the first version of
	 * this let traders straight into the risk console. `view_ledger` is held by
	 * exactly the roles this screen is for — risk managers, firm admins and
	 * auditors.
	 *
	 * The lesson generalises: gate a screen on the permission that *describes*
	 * it, not on the first permission that happens to sound related.
	 */
	const decision = can(locals.viewer, 'view_ledger', { firmId: locals.viewer.firmId });
	if (!decision.allowed) error(403, 'Your role does not allow that.');

	return {
		canStop: can(locals.viewer, 'engage_kill_switch', { firmId: locals.viewer.firmId }).allowed,
		canSeeLedger: can(locals.viewer, 'view_ledger', { firmId: locals.viewer.firmId }).allowed
	};
};
