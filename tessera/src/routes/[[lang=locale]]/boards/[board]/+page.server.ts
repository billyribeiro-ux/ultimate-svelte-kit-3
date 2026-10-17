import { userOrSignIn } from '#lib/server/session.ts';
import type { PageServerLoad } from './$types';

/**
 * Signed out? The sign-in page first, and straight back here afterwards.
 *
 * The board itself comes from `openBoard`, a remote query, and a query cannot
 * redirect a visitor anywhere useful — it can only fail, and a 401 inside the
 * page's boundary is a heading with nothing to click. A board link is the URL
 * that gets pasted into chat, so it is the one most often opened by somebody
 * who is not signed in on that device. The guard lives in the route, where a
 * redirect means a whole navigation.
 */
export const load: PageServerLoad = () => {
	userOrSignIn();
};
