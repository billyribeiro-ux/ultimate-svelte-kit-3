import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { viewerFromSession } from '@sequent/store';
import { PUBLIC_ORIGIN } from '$app/env/public';
import { db } from '#lib/server/db.ts';

/* -------------------------------------------------------------------------- */
/* Cross-site request forgery                                                  */
/* -------------------------------------------------------------------------- */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuse a state-changing request that a cookie authenticated from elsewhere.
 *
 * ## What the attack actually is
 *
 * A browser attaches your cookies to a request for our domain **whoever asked
 * for it**. So a page on `evil.example` can contain a form that posts to
 * `sequent/api/v1/orders`, and the browser will send it with your session
 * cookie attached, and the venue will happily place the order. You never
 * clicked anything on our site. That is CSRF.
 *
 * What stops it is the `Origin` header: the browser sets it to the site the
 * request came *from*, and a page cannot lie about it. Same origin, or no
 * origin at all on a plain navigation — fine. Different origin — refuse.
 *
 * ## Why the `Authorization` header is exempt
 *
 * CSRF works only because credentials travel automatically. Cookies do; an
 * `Authorization` header does not. There is no way for `evil.example` to make
 * your browser attach a Bearer token it does not have, so a token-authenticated
 * request cannot be forged this way. The exemption is not a convenience — it is
 * a statement about which credential the attack applies to.
 *
 * This replaces Kit's built-in check, which is looser in one direction (it lets
 * cross-origin JSON POSTs through) and tighter in another (it blocks a body-less
 * `DELETE` from a legitimate API client). See `vite.config.ts`.
 */
const handleCsrf: Handle = async ({ event, resolve }) => {
	if (SAFE_METHODS.has(event.request.method)) return resolve(event);

	const authorization = event.request.headers.get('authorization');
	if (authorization?.startsWith('Bearer ')) return resolve(event);

	const origin = event.request.headers.get('origin');

	/*
	 * A missing `Origin` on a non-GET is refused rather than trusted.
	 *
	 * Every browser has sent `Origin` on cross-origin form submissions for years,
	 * so "no origin" here means a non-browser client — which should be using a
	 * token, not a cookie. Trusting the absence is the mistake that turns this
	 * check into decoration, because it is the one thing an attacker can arrange.
	 */
	if (origin !== PUBLIC_ORIGIN) {
		return new Response('Cross-site request refused.', {
			status: 403,
			headers: { 'content-type': 'text/plain' }
		});
	}

	return resolve(event);
};

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Attach the viewer to every request, once.
 *
 * Only the session cookie is resolved here. API keys are handled inside the API
 * routes, because a key needs a rate-limit decision at the same moment it is
 * verified and the hook has nowhere to put one.
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('sequent_session');

	event.locals.viewer = sessionId
		? ((await viewerFromSession(db, sessionId, Date.now())) ?? null)
		: null;

	return resolve(event);
};

const handleHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	return response;
};

// Order matters: refuse forged requests before spending a database round trip
// resolving who they claim to be.
export const handle: Handle = sequence(handleCsrf, handleAuth, handleHeaders);

/**
 * `kind` is one of 'app' | 'framework' | 'validation' | 'unknown'.
 *
 * Only 'unknown' is a surprise. Logging the others at error level trains
 * everybody to ignore the log.
 */
export const handleError: HandleServerError = ({ kind, error: thrown, event }) => {
	if (kind !== 'unknown') return {};

	const id = crypto.randomUUID().slice(0, 8);
	console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, thrown);

	return { id, message: 'Something went wrong at our end.' };
};
