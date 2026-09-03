import type { LayoutServerLoad } from './$types.js';
import { requireTenant } from '#lib/server/access.ts';

/**
 * The workspace gate.
 *
 * Every page under `/[tenant]` needs the same check, and putting it in a layout
 * load is what makes it impossible to forget on a new page. A helper called from
 * each `+page.server.ts` would be equivalent right up until somebody adds a
 * route and does not call it — and the failure mode of that omission is one
 * customer reading another's logs.
 *
 * The remote functions check *again*, and that is not redundant: a remote
 * function is its own endpoint and can be called directly, without ever passing
 * through this layout.
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
	const access = await requireTenant(locals.user?.id, params.tenant, 'viewer');

	return { tenant: access.slug, role: access.role };
};
