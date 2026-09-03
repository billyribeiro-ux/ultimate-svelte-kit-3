import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { localizeHref } from '#lib/paraglide/runtime.js';

/**
 * THE SIGNED-IN GROUP
 * ===================
 *
 * Every route under `(app)` needs a person. Checking once here, in a layout
 * `load`, means no page inside can forget — and it means the check happens
 * before rendering starts, so the answer is a real HTTP redirect rather than
 * a page that renders and then discovers it should not have.
 *
 * (The remote functions check too — `requireUser()` — because a remote
 * function can be called from anywhere, not just from these pages. Belt and
 * braces, on purpose.)
 *
 * The trip page itself is *not* in this group: a trip whose owner made it
 * visible by link is readable without an account.
 */
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) {
		const back = `${url.pathname}${url.search}`;
		redirect(303, localizeHref(`/signin?redirectTo=${encodeURIComponent(back)}`));
	}
	return {};
};
