import type { LayoutServerLoad } from './$types';

/**
 * Who is signed in, for the header. The only `load` in the project: identity
 * is needed by every page and by the shell around them, which is exactly the
 * case a layout `load` exists for. Everything page-specific comes through
 * remote functions instead.
 */
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user ? { id: locals.user.id, name: locals.user.name } : null
});
