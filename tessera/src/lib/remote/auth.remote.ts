/**
 * SIGN IN AND SIGN UP
 * ===================
 *
 * Both are `form()`s that call Better Auth's **server** API, rather than the
 * browser SDK.
 *
 * The browser SDK is perfectly good and would mean sign-in only works once the
 * client bundle has loaded and run. A sign-in page is the one screen where that
 * matters most: it is often somebody's first request, on a cold cache, and the
 * form is the entire content of the page. Here it is a real `<form>` that posts,
 * and the `sveltekitCookies` plugin attaches the session cookie to the response
 * on the way back out.
 */

import { error, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, getRequestEvent } from '$app/server';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { membership, workspace } from '#lib/server/db/schema.ts';

const email = v.pipe(v.string(), v.trim(), v.email('That does not look like an email address.'));
const password = v.pipe(v.string(), v.minLength(12, 'Use at least 12 characters.'));

/**
 * Where to go afterwards.
 *
 * Validated as a *path*, not a URL. Accepting a full URL here is the classic
 * open-redirect: `?from=https://example.invalid/login` sends somebody to a
 * convincing copy of this page immediately after they have proved they know
 * their password. Requiring a leading slash and rejecting `//` — which browsers
 * read as protocol-relative — removes the whole class.
 */
const destination = v.optional(
	v.pipe(
		v.string(),
		v.check((value) => value.startsWith('/') && !value.startsWith('//'), 'Invalid destination')
	),
	'/boards'
);

export const signIn = form(
	v.object({ email, password, from: destination }),
	async ({ email: address, password: secret, from }) => {
		const { request } = getRequestEvent();

		try {
			await auth.api.signInEmail({
				body: { email: address, password: secret },
				headers: request.headers
			});
		} catch {
			/*
			 * One message for both "no such account" and "wrong password".
			 *
			 * Distinguishing them is friendlier and tells anybody who asks which email
			 * addresses have accounts here — which for a tool people use at work is a
			 * list of who works where.
			 */
			error(401, 'That email address and password do not match.');
		}

		redirect(303, from);
	}
);

export const signUp = form(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.minLength(1, 'What should we call you?')),
		email,
		password
	}),
	async ({ name, email: address, password: secret }) => {
		const { request } = getRequestEvent();

		let created;
		try {
			created = await auth.api.signUpEmail({
				body: { name, email: address, password: secret },
				headers: request.headers
			});
		} catch {
			error(409, 'There is already an account with that email address.');
		}

		/*
		 * Everybody gets a workspace of their own on the way in.
		 *
		 * A new account with nowhere to put a board is a dead end, and "create your
		 * first workspace" is a screen that exists only because the model demanded
		 * it. The workspace can be renamed; it cannot be missing.
		 */
		const workspaceId = crypto.randomUUID();
		await db.insert(workspace).values({
			id: workspaceId,
			name: `${name}'s workspace`,
			// The id doubles as the slug. Deriving one from the name would need a
			// uniqueness loop, and nothing user-facing shows it yet.
			slug: workspaceId
		});

		await db.insert(membership).values({
			id: crypto.randomUUID(),
			workspaceId,
			userId: created.user.id,
			role: 'owner'
		});

		redirect(303, '/boards');
	}
);

export const signOut = form(async () => {
	const { request } = getRequestEvent();
	await auth.api.signOut({ headers: request.headers });
	redirect(303, '/');
});
