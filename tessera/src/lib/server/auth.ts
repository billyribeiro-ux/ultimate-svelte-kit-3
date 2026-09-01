/**
 * Authentication.
 *
 * Better Auth with the Drizzle adapter, email and password, and nothing else.
 * Social providers are a configuration change rather than a design change, and
 * leaving them out keeps the seed data reproducible.
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
		// Slide the expiry when a session is used, so somebody who works on a board
		// every day is never signed out mid-drag.
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
