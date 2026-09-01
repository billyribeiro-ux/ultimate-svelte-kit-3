/**
 * Who is asking.
 *
 * `getRequestEvent()` works inside remote functions, load functions and hooks —
 * anywhere on the server that is handling a request — which is what lets these
 * helpers take no arguments and therefore be impossible to call with the wrong
 * user by mistake.
 */
import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import type { User } from 'better-auth';

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

/** The signed-in user, or `undefined` on the routes that allow anonymous access. */
export function maybeUser(): User | undefined {
	return getRequestEvent().locals.user;
}
