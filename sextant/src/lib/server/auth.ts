/**
 * Authentication for people.
 *
 * Machines do not use this — they send an API key, which `access.ts` checks. The
 * two paths are deliberately separate: a session is a browser with a cookie and
 * a CSRF story, and a key is a header with neither, and code that tries to
 * accept both on one path ends up accepting a key from a browser.
 *
 * The configuration itself is in `auth.options.ts`, which imports no `$app`
 * module, so that scripts can build the same instance without booting Vite. This
 * file is the ten lines that supply the environment.
 */
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { PUBLIC_ORIGIN } from '$app/env/public';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { createAuth } from './auth.options.ts';

export const auth = createAuth({
	db,
	baseURL: PUBLIC_ORIGIN,
	secret: BETTER_AUTH_SECRET,
	plugins: [
		/*
		 * MUST be last. The plugin wraps the response so that cookies set during a
		 * remote function call reach the browser; a plugin after it would see the
		 * response before that wrapping and its own cookies would be dropped.
		 */
		sveltekitCookies(getRequestEvent)
	]
});
