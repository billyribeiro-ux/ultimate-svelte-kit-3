/**
 * Who is asking.
 *
 * `getRequestEvent()` works inside remote functions, load functions and hooks —
 * anywhere on the server that is handling a request — which is what lets these
 * helpers take no arguments and therefore be impossible to call with the wrong
 * user by mistake.
 */
import { error, redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { resolve } from '$app/paths';
import type { User } from 'better-auth';
import { langParam } from '#lib/i18n/index.ts';

/**
 * The signed-in user, or a 401.
 *
 * `error()` throws, so the return type is honest: past this line the caller has
 * a user. Returning `User | null` and letting each call site check is the same
 * code written thirty times, and the thirty-first forgets.
 */
export function requireUser(): User {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Sign in to continue.');
	return locals.user;
}

/**
 * The signed-in user, or a redirect to the sign-in page — for page loads.
 *
 * A page answers a signed-out visitor differently from a remote function. A 401
 * in the middle of a page is a dead end: a heading, the server's sentence, and
 * nothing to click. A redirect to the sign-in form, carrying `from` so it can
 * send them straight back, is the whole recovery in one hop — and the board's
 * URL is the one people paste into chat, so it is the one most often opened by
 * somebody whose session has lapsed.
 *
 * `from` is the URL's own path, never a `resolve()`d one: during a request
 * `resolve()` returns a path *relative* to the page being served, and the
 * sign-in form accepts only an absolute path, so nobody can be bounced to
 * another site.
 */
export function userOrSignIn(): User {
	const { locals, url } = getRequestEvent();
	if (locals.user) return locals.user;

	const signIn = resolve('/[[lang=locale]]/sign-in', { lang: langParam(locals.locale) });
	redirect(303, `${signIn}?from=${encodeURIComponent(url.pathname + url.search)}`);
}

/** The signed-in user, or `undefined` on the routes that allow anonymous access. */
export function maybeUser(): User | undefined {
	return getRequestEvent().locals.user;
}
