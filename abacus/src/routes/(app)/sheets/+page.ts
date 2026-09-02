import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import { whoAmI } from '#lib/remote/auth.remote.ts';

export const load: PageLoad = async ({ url }) => {
	const me = await whoAmI();
	if (!me) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);
	return { me };
};
