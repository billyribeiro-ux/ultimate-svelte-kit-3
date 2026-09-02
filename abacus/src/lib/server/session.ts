/**
 * THE CURRENT PERSON
 * ==================
 *
 * Helpers around the cookie in `identity.ts`, for remote functions to call.
 * `getRequestEvent()` is what makes them possible: a remote function has no
 * `event` argument, but it runs inside a request, and this reaches it.
 */

import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { SESSION_SECRET } from '$app/env/private';
import { COOKIE, SESSION_SECONDS, sign, type User } from './identity.ts';

/** Whoever this request is, or `null`. Read once per request by the `handle` hook. */
export function currentUser(): User | null {
	return getRequestEvent().locals.user ?? null;
}

/** Whoever this request is, or a 401 that the caller does not have to write. */
export function requireUser(): User {
	const user = currentUser();
	if (!user) error(401, 'Sign in with a passkey first');
	return user;
}

/**
 * Thirty days, `httpOnly` so a script on the page cannot read it,
 * `sameSite: 'lax'` so a link from elsewhere still arrives signed in, and
 * `secure` whenever the app is served over HTTPS — which `event.url.protocol`
 * knows and a constant would have to guess.
 */
export async function startSession(user: User): Promise<void> {
	const event = getRequestEvent();
	event.cookies.set(COOKIE, await sign(user, SESSION_SECRET), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: SESSION_SECONDS
	});
	event.locals.user = user;
}

export function endSession(): void {
	const event = getRequestEvent();
	event.cookies.delete(COOKIE, { path: '/' });
	delete event.locals.user;
}
