import type { PageLoad } from './$types.js';
import { getPattern } from '#lib/remote/patterns.remote.ts';

/**
 * The pattern, loaded up front so that `preloadData` has something to
 * preload: the gallery calls it on hover, and by the time somebody clicks,
 * this has run and the remote query's cache is warm.
 */
export const load: PageLoad = async ({ params }) => {
	return { published: await getPattern(params.id) };
};
