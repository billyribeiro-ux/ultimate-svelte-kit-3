/**
 * SIGNING IN AND OUT
 * ==================
 *
 * Better Auth already exposes HTTP endpoints for this under `/api/auth/*`,
 * and a form could point at them directly. Wrapping them in remote `form`s
 * instead buys three things:
 *
 *   - the redirect afterwards is ours, so somebody who was sent to sign in
 *     lands back where they were going, in their language;
 *   - the error is ours to phrase — in three languages, through Paraglide,
 *     which knows the request's locale even in here;
 *   - the whole thing type-checks against the component that uses it, and
 *     works with JavaScript switched off.
 */

import * as v from 'valibot';
import { invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { isAPIError } from 'better-auth/api';
import { m } from '#lib/paraglide/messages.js';
import { localizeHref } from '#lib/paraglide/runtime.js';
import { EmailSchema, PasswordSchema } from '#lib/domain/schemas.ts';
import { auth } from '#lib/server/auth.ts';

/** The default landing place, used whenever we cannot trust what we were given. */
const HOME = '/trips';

/**
 * A redirect target we are willing to follow: one leading slash, and only
 * one. `//evil.example` starts with a slash and still leaves the site —
 * a protocol-relative URL — so the second character is checked too.
 *
 * Sanitised rather than rejected: the value lives in a hidden field the
 * person cannot see, so a crafted link would otherwise leave them staring
 * at "invalid redirect" with no way in. Falling back to `/trips` is safe.
 */
const SAFE_REDIRECT = /^\/(?!\/)[^\s]{0,512}$/;

const RedirectSchema = v.optional(
	v.pipe(
		v.string(),
		v.transform((value) => (SAFE_REDIRECT.test(value) ? value : HOME))
	),
	HOME
);

export const signIn = form(
	v.object({
		email: EmailSchema,
		password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),
		redirectTo: RedirectSchema
	}),
	async (data, issue) => {
		const { request } = getRequestEvent();

		try {
			await auth.api.signInEmail({
				body: { email: data.email, password: data.password },
				headers: request.headers
			});
		} catch {
			/*
			 * One message for both "no such account" and "wrong password", on
			 * purpose. Distinguishing them turns the sign-in form into a tool for
			 * discovering which email addresses have accounts.
			 */
			invalid(issue.password(m.auth_no_match()));
		}

		redirect(303, localizeHref(data.redirectTo));
	}
);

export const signUp = form(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Enter your name'), v.maxLength(80)),
		email: EmailSchema,
		password: PasswordSchema,
		redirectTo: RedirectSchema
	}),
	async (data, issue) => {
		const { request } = getRequestEvent();

		try {
			await auth.api.signUpEmail({
				body: { name: data.name, email: data.email, password: data.password },
				headers: request.headers
			});
		} catch (e) {
			// Better Auth answers a duplicate email with 422; anything else is ours.
			if (isAPIError(e) && e.status === 'UNPROCESSABLE_ENTITY') {
				invalid(issue.email(m.auth_email_taken()));
			}
			throw e;
		}

		redirect(303, localizeHref(data.redirectTo));
	}
);

/** A form with no fields: a button in the header that works without JavaScript. */
export const signOut = form(async () => {
	const { request } = getRequestEvent();
	await auth.api.signOut({ headers: request.headers });
	redirect(303, localizeHref('/'));
});
