import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { verifySecret } from '@sequent/store';
import { db } from '#lib/server/db.ts';

/** One leading slash, and only one. `//evil.example` leaves the site. */
const SAFE_REDIRECT = /^\/(?!\/)[^\s]{0,512}$/;
const HOME = '/terminal';

export const signIn = form(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.email('Enter the email you signed up with')),
		password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),
		redirectTo: v.optional(
			v.pipe(
				v.string(),
				// Sanitise rather than reject: the value lives in a hidden field the
				// person cannot see or correct, so a crafted link would otherwise
				// leave them unable to sign in at all.
				v.transform((value) => (SAFE_REDIRECT.test(value) ? value : HOME))
			),
			HOME
		)
	}),
	async (data) => {
		const event = getRequestEvent();

		const result = await db.execute({
			sql: 'SELECT user_id, password_hash, is_active FROM venue_user WHERE email = ?',
			args: [data.email.toLowerCase()]
		});

		const row = result.rows[0];

		/*
		 * One message for "no such account" and "wrong password".
		 *
		 * Distinguishing them turns this form into a tool for discovering which
		 * firms are members of the venue.
		 */
		if (!row || Number(row['is_active']) !== 1) {
			error(401, 'That email and password do not match an account.');
		}
		if (!verifySecret(data.password, String(row['password_hash']))) {
			error(401, 'That email and password do not match an account.');
		}

		const sessionId = crypto.randomUUID();
		const expiresAt = Date.now() + 12 * 60 * 60 * 1000;

		await db.execute({
			sql: 'INSERT INTO session (session_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
			args: [sessionId, String(row['user_id']), expiresAt, Date.now()]
		});

		event.cookies.set('sequent_session', sessionId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !event.url.hostname.includes('localhost'),
			expires: new Date(expiresAt)
		});

		redirect(303, data.redirectTo);
	}
);

export const signOut = form(v.object({}), async () => {
	const event = getRequestEvent();
	const sessionId = event.cookies.get('sequent_session');

	if (sessionId) {
		await db.execute({ sql: 'DELETE FROM session WHERE session_id = ?', args: [sessionId] });
		event.cookies.delete('sequent_session', { path: '/' });
	}

	redirect(303, '/sign-in');
});
