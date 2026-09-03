import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types.js';
import { auth } from '#lib/server/auth.ts';

/**
 * SIGN IN, AS A FORM
 * ==================
 *
 * A `<form>` and two actions, not a remote function and not `fetch`. That is a
 * deliberate exception to how the rest of this application talks to the server,
 * and the reason is that this page has to work before any JavaScript has run.
 *
 * It is the first page a person loads. If the bundle fails — a flaky network on
 * a train, a corporate proxy mangling a script, a cache that served half a
 * deploy — every other recovery path in the product is behind this page. A form
 * that posts works with no JavaScript at all, and SvelteKit progressively
 * enhances it when the bundle does arrive.
 */
const Credentials = v.object({
	email: v.pipe(v.string(), v.trim(), v.email('That does not look like an email address.')),
	// The length rule lives in `auth.ts`; this one only catches the empty case, so
	// that the two cannot disagree about what "long enough" means.
	password: v.pipe(v.string(), v.minLength(1, 'Enter your password.'))
});

export const load: PageServerLoad = async ({ locals, url }) => {
	// Already signed in: go where they were heading, or to the front door.
	if (locals.user) redirect(303, url.searchParams.get('next') ?? '/');
	return {};
};

export const actions: Actions = {
	signIn: async ({ request }) => {
		const form = await request.formData();
		const parsed = v.safeParse(Credentials, {
			email: form.get('email'),
			password: form.get('password')
		});

		if (!parsed.success) {
			return fail(400, {
				// The email is returned so the field is not cleared; the password never
				// is. Re-populating a password field puts it in the HTML of a page that
				// may be cached, logged by a proxy, or printed.
				email: String(form.get('email') ?? ''),
				message: parsed.issues[0]?.message ?? 'Check the form and try again.'
			});
		}

		try {
			await auth.api.signInEmail({ body: parsed.output, headers: request.headers });
		} catch (cause) {
			/*
			 * ONE MESSAGE FOR EVERY FAILURE.
			 *
			 * "No account with that email" and "wrong password" are different facts and
			 * telling them apart turns the sign-in form into an account-existence
			 * oracle: an attacker with a list of addresses learns which ones are
			 * customers, one request at a time, with no credentials at all.
			 *
			 * The cost is a worse message for somebody who genuinely mistyped their
			 * address, and it is worth paying. The `instanceof` check is still here
			 * because an unexpected error — the database being down — must not be
			 * reported as a bad password.
			 */
			if (cause instanceof APIError) {
				return fail(400, {
					email: parsed.output.email,
					message: 'That email and password do not match an account.'
				});
			}
			throw cause;
		}

		redirect(303, '/');
	},

	signOut: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		redirect(303, '/sign-in');
	}
};
