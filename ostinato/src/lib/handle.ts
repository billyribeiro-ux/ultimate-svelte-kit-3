/**
 * What a handle may look like — shared by the server, which enforces it, and
 * the publish form's preflight, which says so before a request is made.
 *
 * In its own file rather than in `server/identity.ts` because nothing under
 * `src/lib/server` may be imported by client code; SvelteKit refuses at build
 * time, which is the guard that keeps a secret from wandering into a bundle.
 */

import * as v from 'valibot';

/** Three to twenty characters, letters, digits and underscores — a Twitter-shaped handle. */
export const HandleSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.regex(/^[a-z0-9_]{3,20}$/, 'Three to twenty letters, digits or underscores')
);
