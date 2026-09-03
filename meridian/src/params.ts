import { defineParams } from '@sveltejs/kit/params';
import * as v from 'valibot';
import { SLUG } from '#lib/domain/ids.ts';

/**
 * PARAMETER MATCHERS
 * ==================
 *
 * One file, not a folder. SvelteKit 2 had `src/params/slug.js` exporting
 * `match(param)`; SvelteKit 3 has this single `src/params.ts` exporting
 * `params` from `defineParams`, and each entry is a Standard Schema — so a
 * matcher can *transform* as well as accept, and the route's `params.slug`
 * arrives typed by the schema rather than as `string`.
 *
 * `/t/[slug=slug]`: a trip's share link. Anything that does not look like
 * one of ours — an uppercase letter, a `0`, a thirty-three-character string
 * — is a 404 before any route code runs, and before the database is asked.
 */
export const params = defineParams({
	slug: v.pipe(v.string(), v.regex(SLUG))
});
