import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from './db/index.ts';

/**
 * Authentication for the people who *work* here.
 *
 * Note who this is not for. Customers never sign up — they book with a name, an
 * email and a link. Forcing an account on somebody who wants a haircut is how a
 * booking page loses half its traffic, and it would also make us responsible for
 * a password database we have no reason to want.
 *
 * So `user` means staff, and everything customer-shaped lives in the `customer`
 * table with no credentials attached at all.
 *
 * `better-auth/minimal` is the import to reach for when you are not using the
 * social providers, plugins and organisation features — it pulls in a fraction
 * of the code of the full entry point, and everything below still works.
 */
export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,

	database: drizzleAdapter(db, { provider: 'sqlite' }),

	emailAndPassword: {
		enabled: true,
		// The default is 8. Length is the only password rule that reliably helps;
		// the ones about symbols mostly teach people to append "!1".
		minPasswordLength: 12,
		maxPasswordLength: 256,
		// No public sign-up flow: an owner invites staff. Left enabled here because
		// the seeding script and the tests create accounts through it, and the
		// route that exposes it is the thing we actually control.
		autoSignIn: true
	},

	session: {
		expiresIn: 60 * 60 * 24 * 30, // thirty days
		// Slide the expiry forward at most once a day, so an active user is not
		// logged out mid-week but we are not writing a session row on every request.
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			// The session cookie carries a short-lived signed copy of the session so
			// most requests need no database read at all. Five minutes is short
			// enough that revoking access still bites quickly.
			maxAge: 5 * 60
		}
	},

	advanced: {
		// `ORIGIN` is https in production, so let the cookie say so.
		useSecureCookies: ORIGIN.startsWith('https://'),
		cookiePrefix: 'halfpast'
	},

	plugins: [
		// Must be last. It reaches into SvelteKit's request event to set cookies on
		// the response Kit is building, which only works once everything else has
		// decided what those cookies should be.
		sveltekitCookies(getRequestEvent)
	]
});

export type Auth = typeof auth;
