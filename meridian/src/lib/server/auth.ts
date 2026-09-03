/**
 * WHO IS THIS
 * ===========
 *
 * Better Auth, the `minimal` entry point: email and password, sessions in
 * the database, nothing else. The social providers, the organisation plugin
 * and the rest are a fraction of the code this app would ship for features
 * it does not have; a trip's companions are a `member` table of our own,
 * not an organisation.
 *
 * Three things are SvelteKit-specific and worth seeing:
 *
 *   - `baseURL` is `PUBLIC_ORIGIN`, the same value `vite.config.ts` bakes
 *     into `paths.origin`. Better Auth uses it to decide which origins may
 *     call it and where its cookies are valid.
 *   - `drizzleAdapter` points it at our `db`, so its four tables live in the
 *     same SQLite file as the trips, in the same migrations.
 *   - `sveltekitCookies(getRequestEvent)` is the plugin that lets a session
 *     cookie set inside a remote function reach the response SvelteKit is
 *     building. It must be last.
 */

import { BETTER_AUTH_SECRET } from '$app/env/private';
import { PUBLIC_ORIGIN } from '$app/env/public';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { db } from './db/index.ts';

export const auth = betterAuth({
	baseURL: PUBLIC_ORIGIN,
	secret: BETTER_AUTH_SECRET,

	database: drizzleAdapter(db, { provider: 'sqlite' }),

	emailAndPassword: {
		enabled: true,
		// Length is the only password rule that reliably helps; the ones about
		// symbols mostly teach people to append "!1".
		minPasswordLength: 12,
		maxPasswordLength: 256,
		autoSignIn: true
	},

	session: {
		expiresIn: 60 * 60 * 24 * 30, // thirty days
		// Slide the expiry forward at most once a day, so an active person is
		// not logged out mid-trip but we are not writing a row on every request.
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			// A short-lived signed copy of the session rides in the cookie, so most
			// requests need no database read. Five minutes keeps revocation quick.
			maxAge: 5 * 60
		}
	},

	advanced: {
		useSecureCookies: PUBLIC_ORIGIN.startsWith('https://'),
		cookiePrefix: 'meridian'
	},

	plugins: [
		// Must be last: it reaches into SvelteKit's request event to set cookies on
		// the response Kit is building, once everything else has decided them.
		sveltekitCookies(getRequestEvent)
	]
});

export type Auth = typeof auth;
