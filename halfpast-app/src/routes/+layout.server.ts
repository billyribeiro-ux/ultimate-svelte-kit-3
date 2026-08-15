import type { LayoutServerLoad } from './$types';

/**
 * Who is signed in, for every page.
 *
 * A layout load runs for every route beneath it, and its data is merged into
 * `data` for each of them. That is what lets the header know a name without
 * every page having to fetch one.
 *
 * Only three fields are passed on. `locals.user` from Better Auth carries more
 * than that — timestamps, verification flags — and none of it is needed in the
 * browser. Whatever is returned here is serialised into the HTML of every page,
 * so the question to ask each field is "does the browser need this, and am I
 * happy for it to be in view-source". Name, id and email pass; the rest does not.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: locals.user
			? { id: locals.user.id, name: locals.user.name, email: locals.user.email }
			: undefined
	};
};
