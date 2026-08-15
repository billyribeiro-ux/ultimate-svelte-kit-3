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

/** The default landing place, used whenever we cannot trust what we were given. */
const HOME = '/manage';

/**
 * A redirect target we are willing to follow.
 *
 * One leading slash, and only one. `/manage/willow-lane` is ours;
 * `https://evil.example` obviously is not; and `//evil.example` is the one that
 * catches people out — a protocol-relative URL, which starts with a slash and
 * still leaves your site. No whitespace, and a length cap so nobody can stuff a
 * novel into the query string.
 */
const SAFE_REDIRECT = /^\/(?!\/)[^\s]{0,512}$/;

const signInSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.email('Enter the email address you signed up with')),
	password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),
	/**
	 * Where to go afterwards.
	 *
	 * An unchecked redirect target is an open redirect: a link to
	 * `/sign-in?redirectTo=https://evil.example` sends somebody who has just
	 * typed their password to a site of the attacker's choosing, from a URL that
	 * genuinely begins with your domain.
	 *
	 * We *sanitise* rather than reject. Rejecting is equally safe but worse to
	 * be on the end of: the value lives in a hidden field the person cannot see
	 * or correct, so a crafted link would leave them staring at "invalid
	 * redirect" with no way to sign in at all. Quietly falling back to the
	 * dashboard is safe and still lets them in.
	 */
	redirectTo: v.optional(
		v.pipe(
			v.string(),
			v.transform((value) => (SAFE_REDIRECT.test(value) ? value : HOME))
		),
		HOME
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
