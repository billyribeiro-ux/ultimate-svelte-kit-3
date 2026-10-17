import type { LayoutServerLoad } from './$types';
import { THEME_COOKIE, chosenTheme } from '#lib/ui/theme-cookie.ts';

/**
 * Who is signed in, for the header, and which theme they chose, for the one
 * picture that has two prints (`theme-cookie.ts` says why the server needs
 * to know). Both are about the shell around every page, which is exactly
 * the case a layout `load` exists for. Everything page-specific comes
 * through remote functions instead.
 */
export const load: LayoutServerLoad = ({ locals, cookies }) => ({
	user: locals.user ? { id: locals.user.id, name: locals.user.name } : null,
	theme: chosenTheme(cookies.get(THEME_COOKIE))
});
