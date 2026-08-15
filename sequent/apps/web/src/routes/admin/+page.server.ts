import { error, redirect } from '@sveltejs/kit';
import { can } from '@sequent/store';
import type { PageServerLoad } from './$types';

/**
 * Who may see the admin area, and which half of it.
 *
 * Two audiences share one route because they share a shape — settings screens —
 * and not a permission. A firm admin manages their own credentials; a venue
 * operator manages the market. Neither sees the other's panels, and the load
 * function decides that once rather than each panel deciding it again.
 *
 * The alternative — `/admin/firm` and `/admin/venue` — would be tidier and
 * would mean a firm admin who typed the venue URL got a 403 instead of simply
 * not being shown a section that has nothing to do with them.
 */
export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.viewer) {
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const target = { firmId: locals.viewer.firmId };

	const canManageKeys = can(locals.viewer, 'manage_api_keys', target).allowed;
	const canRunVenue = can(locals.viewer, 'set_phase', target).allowed;
	const canSeeQueue = can(locals.viewer, 'view_audit_log', target).allowed;
	// Billing is money, so it is gated on the ledger permission — the same one
	// the risk console uses, held by risk managers, firm admins and auditors.
	const canSeeLedger = can(locals.viewer, 'view_ledger', target).allowed;

	// Nothing to show is a 403, not an empty page. An empty admin screen reads as
	// a bug; a refusal reads as a rule.
	if (!canManageKeys && !canRunVenue && !canSeeQueue && !canSeeLedger) {
		error(403, 'Your role does not allow that.');
	}

	return { canManageKeys, canRunVenue, canSeeQueue, canSeeLedger, firmId: locals.viewer.firmId };
};
