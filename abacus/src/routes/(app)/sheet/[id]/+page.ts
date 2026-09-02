import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import { getProfile, whoAmI } from '#lib/remote/auth.remote.ts';
import { getSheet } from '#lib/remote/sheets.remote.ts';

/**
 * A stored sheet needs a person: the live query is per person, and the
 * operations are signed by one. Nobody signed in is sent to sign in and
 * brought back here afterwards. A universal `load`, so the remote queries
 * run on the server for the first visit and in the browser after.
 */
export const load: PageLoad = async ({ params, url }) => {
	const me = await whoAmI();
	if (!me) redirect(303, `/signin?next=${encodeURIComponent(url.pathname)}`);

	const [sheet, profile] = await Promise.all([getSheet(params.id), getProfile()]);
	return { sheet, locale: profile?.locale ?? 'en-US', me };
};
