import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, getRequestEvent } from '$app/server';
import { auth } from '#lib/server/auth.ts';

/**
 * Signing in and out.
 *
 * Better Auth already exposes HTTP endpoints for this under `/api/auth/*`, and
 * we could point a form at them directly. Wrapping them in a remote `form`
 * instead buys three things worth having:
 *
 *   - the redirect afterwards is ours to decide, so somebody who was sent to
 *     sign in lands back where they were going;
 *   - the error message is ours to phrase, rather than whatever the library
 *     happens to say;
 *   - the whole thing type-checks against the component that uses it.
 */

const signInSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.email('Enter the email address you signed up with')),
	password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),
	/**
	 * Where to go afterwards.
	 *
	 * Constrained to a root-relative path, and that check is not decoration. An
	 * unchecked redirect target is an open redirect: a link to
	 * `/sign-in?redirectTo=https://evil.example` sends somebody who has just
	 * typed their password to a site of the attacker's choosing, from a URL that
	 * genuinely begins with your domain. Requiring a leading `/` and forbidding a
	 * second one — `//evil.example` is a protocol-relative URL and goes
	 * off-site — closes it.
	 */
	redirectTo: v.optional(
		v.pipe(v.string(), v.regex(/^\/(?!\/)[^\s]*$/, 'Invalid redirect'), v.maxLength(512)),
		'/manage'
	)
});

export const signIn = form(signInSchema, async (data) => {
	const { request } = getRequestEvent();

	try {
		await auth.api.signInEmail({
			body: { email: data.email, password: data.password },
			headers: request.headers
		});
	} catch {
		/*
		 * One message for both "no such account" and "wrong password", on purpose.
		 * Distinguishing them turns the sign-in form into a tool for discovering
		 * which of your customers' email addresses have accounts.
		 */
		error(401, 'That email and password do not match an account.');
	}

	redirect(303, data.redirectTo);
});

export const signOut = command(async () => {
	const { request } = getRequestEvent();
	await auth.api.signOut({ headers: request.headers });
	redirect(303, '/');
});
