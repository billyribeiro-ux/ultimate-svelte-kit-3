/**
 * Authentication for people.
 *
 * Machines do not use this — they send an API key, which `apikey.ts` checks. The
 * two paths are deliberately separate: a session is a browser with a cookie and
 * a CSRF story, and a key is a header with neither, and code that tries to
 * accept both on one path ends up accepting a key from a browser.
 */
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { PUBLIC_ORIGIN } from '$app/env/public';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';

export const auth = betterAuth({
	/*
	 * The same origin the CSRF check uses, from the same variable.
	 *
	 * Two sources of truth for "where is this app" is a bug waiting for a
	 * deployment: the cookie is issued for one origin and rejected by the check
	 * for another, and the symptom is a sign-in that appears to succeed and then
	 * lands back on the sign-in page with no error anywhere.
	 */
	baseURL: PUBLIC_ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),

	emailAndPassword: {
		enabled: true,
		// Eight is the usual default and is too short to be worth the reassurance
		// it gives. Twelve costs nothing to type and a great deal to guess.
		minPasswordLength: 12
	},

	session: {
		expiresIn: 60 * 60 * 24 * 30,
		// Slide the expiry when a session is used, so somebody watching a dashboard
		// all day is never signed out mid-incident.
		updateAge: 60 * 60 * 24
	},

	plugins: [
		/*
		 * MUST be last. The plugin wraps the response so that cookies set during a
		 * remote function call reach the browser; a plugin after it would see the
		 * response before that wrapping and its own cookies would be dropped.
		 */
		sveltekitCookies(getRequestEvent)
	]
});
