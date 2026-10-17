import * as v from 'valibot';
import { invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { isAPIError } from 'better-auth/api';
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
	/**
	 * The leading underscore keeps the password out of the page that comes back.
	 *
	 * Without JavaScript, a submission that fails validation re-renders this page
	 * with every field filled in again, so nobody retypes their email. That is a
	 * kindness for the email and a leak for the password: it went back to the
	 * browser in the HTML, in the input's `value`. SvelteKit never sends back a
	 * field whose name starts with `_`, which is the whole of the fix.
	 */
	_password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),
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
			body: { email: data.email, password: data._password },
			headers: request.headers
		});
	} catch (thrown) {
		/*
		 * Only Better Auth's own refusal is an answer about this form. It throws
		 * an `APIError` with status 401 for a wrong password *and* for an unknown
		 * email — one message for both, on purpose, because distinguishing them
		 * turns the sign-in form into a tool for discovering which of your
		 * customers' email addresses have accounts.
		 *
		 * Everything else is rethrown. A bare `catch {}` here once turned a
		 * database outage into "that password is wrong": no log line, no
		 * reference id, and a customer retyping a correct password at a server
		 * that could not read it. Rethrown, it reaches `handleError` as
		 * `unknown`, which logs it and shows the generic sentence.
		 *
		 * `invalid`, not `error`. A refused password is an answer about this form,
		 * so it belongs in the form: `invalid('…')` with a plain string is an issue
		 * for the form as a whole — the page shows it from `fields.issues()` on the
		 * form itself — and the email stays filled in. `error(401, …)` hands the
		 * request to `+error.svelte` instead, which replaces the form with a
		 * failure screen — the right place for "this page could not load", the
		 * wrong one for "try that password again".
		 */
		if (isAPIError(thrown) && thrown.statusCode === 401) {
			invalid('That email and password do not match an account.');
		}
		throw thrown;
	}

	redirect(303, data.redirectTo);
});

/**
 * Signing out is a `form` too, not a `command`, and the difference is not taste.
 *
 * A `command` cannot redirect. SvelteKit's docs say so plainly — `redirect(...)`
 * works inside `query`, `form` and `prerender`, and "It is *not* possible
 * inside `command` functions" — and the browser enforces it: a command whose
 * response is a redirect throws `remote_command_redirect` in the page. This
 * function used to be a command ending in `redirect(303, '/')`. The session was
 * deleted, the cookie cleared, and the page threw, leaving the signed-in
 * dashboard on screen with the owner's name still in the header.
 *
 * As a `form` it is a real `<form method="POST">`: it may redirect, a
 * successful submission refreshes every load function so the header changes
 * to "Sign in", and it signs you out with JavaScript switched off.
 *
 * No schema, because there is no input; and no permission check, because
 * signing out a visitor who has no session is a harmless no-op that Better
 * Auth already handles.
 */
export const signOut = form(async () => {
	const { request } = getRequestEvent();
	await auth.api.signOut({ headers: request.headers });
	redirect(303, '/');
});
