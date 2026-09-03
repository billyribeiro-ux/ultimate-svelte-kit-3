import type { LayoutServerLoad } from './$types.js';
import { tenantsFor } from '#lib/server/access.ts';

/**
 * WHO IS HERE, AND WHERE THEY MAY GO
 * ==================================
 *
 * The root layout's load runs on every navigation and therefore has to be cheap.
 * It is two things: the signed-in user, which `hooks.server.ts` already resolved
 * into `locals`, and the list of workspaces they belong to, which is one indexed
 * join.
 *
 * Nothing else belongs here. The temptation in a layout load is to fetch
 * anything more than one page needs, because it is convenient — and the cost is
 * paid on every navigation in the application, forever, including the ones that
 * do not use it.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user;

	if (!user) return { user: null, tenants: [] };

	return {
		/*
		 * Deliberately narrowed.
		 *
		 * `locals.user` is Better Auth's full record and includes fields — the
		 * email verification state, the raw timestamps — that no part of the
		 * interface reads. Returning the whole object would put them in the
		 * serialised payload of every page, which is both a larger document and a
		 * quiet way for a field to end up somewhere it was never meant to be.
		 */
		user: { id: user.id, name: user.name, email: user.email },
		tenants: await tenantsFor(user.id)
	};
};
