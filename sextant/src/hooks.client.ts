/**
 * CLIENT HOOKS
 * ============
 *
 * One hook: what an error that happened in the browser says to the person in
 * front of it.
 */

import type { HandleClientError } from '@sveltejs/kit/hooks';

/**
 * What `fetch` rejects with when no response came back at all.
 *
 * A `TypeError`, which is also what a bug throws, so the type alone cannot tell
 * "the server never answered" from "this code read a property of `undefined`".
 * The messages can. There is one per engine — Chromium, Firefox, WebKit — and
 * they have been stable for years, which is the most a message can promise. A
 * new wording would fall through to SvelteKit's own default, "Internal Error":
 * less helpful, never wrong in a misleading direction.
 */
const NO_RESPONSE = new Set([
	'Failed to fetch',
	'NetworkError when attempting to fetch resource.',
	'Load failed'
]);

/**
 * A request that never reached the server says so.
 *
 * Without this, SvelteKit's default for `kind: 'unknown'` stands: a 500 that
 * reads "Internal Error". For a dropped connection that is the wrong story —
 * it tells somebody the server broke, when the server never heard from them,
 * and the one thing worth doing, trying again once the connection is back, is
 * exactly what the sentence does not suggest. The explore page's "Try again"
 * exists for this case, and now its refusal names it.
 *
 * Everything else passes through. "Errors that were already transformed by the
 * server-side hook are not passed to the client-side hook a second time", so a
 * refusal arrives here only if no server shaped it, and returning nothing keeps
 * SvelteKit's default: an `app` error's own body, a `framework` error's safe
 * message.
 */
export const handleError: HandleClientError = ({ kind, error }) =>
	kind === 'unknown' && error instanceof TypeError && NO_RESPONSE.has(error.message)
		? { message: 'Sextant could not be reached. Check your connection, then try again.' }
		: undefined;
