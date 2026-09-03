import type { LayoutServerLoad } from './$types';

/**
 * What every page needs, resolved once.
 *
 * Deliberately small. `locals.user` is a Better Auth `User` with more fields
 * than any page renders, and returning it whole would put an email address into
 * the HTML of every prerendered marketing page. Three fields is what the
 * interface uses.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	return {
		locale: locals.locale,
		user: locals.user
			? { id: locals.user.id, name: locals.user.name, email: locals.user.email }
			: null
	};
};
