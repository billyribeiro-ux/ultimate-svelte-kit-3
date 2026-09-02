/**
 * WHAT DOES /@handle/slug MEAN
 * ===========================
 *
 * The endpoint the `reroute` hook in `src/hooks.ts` asks. It answers with the
 * route pathname for a vanity address, or `null`.
 *
 * A plain endpoint rather than a remote function, because a remote function
 * is called *by* the router once a route is known, and this runs *before* the
 * route is known — that is what rerouting is. The hook is given a `fetch` for
 * exactly this reason.
 *
 * Cached for an hour: the answer for a given handle and slug changes only if
 * the pattern is deleted, and a stale hit then lands on a 404 that says so.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { resolveVanity } from '#lib/server/patterns.ts';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const handle = url.searchParams.get('handle') ?? '';
	const slug = url.searchParams.get('slug') ?? '';

	const id = await resolveVanity(handle.toLowerCase(), slug.toLowerCase());

	setHeaders({ 'cache-control': id ? 'public, max-age=3600' : 'no-store' });
	return json({ pathname: id ? `/p/${id}` : null });
};
