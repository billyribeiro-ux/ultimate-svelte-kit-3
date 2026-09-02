/**
 * THE AUTH CONFIGURATION, WITHOUT THE ENVIRONMENT
 * ===============================================
 *
 * Better Auth's options as a function of its inputs, importing nothing from
 * `$app/*`.
 *
 * WHY THIS IS A SEPARATE FILE
 * ---------------------------
 * `auth.ts` reads `$app/env/private` and `$app/server`, which are modules
 * SvelteKit's Vite plugin generates. They do not exist under plain Node, so any
 * script that imports `auth.ts` — the seed, a migration, a one-off — either has
 * to boot Vite or cannot run at all.
 *
 * The alternative people reach for is to configure Better Auth twice: once in
 * the app and once in the script. That works until the day the two disagree
 * about the password minimum or the session length, at which point the seed
 * produces an account the app rejects, and the error says nothing about why.
 *
 * One function, two callers, no drift.
 */

import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export interface AuthInput {
	/** Any Drizzle database. Typed loosely on purpose — see the note below. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	db: any;
	baseURL: string;
	secret: string;
	/** Request-scoped plugins. Empty in a script, `sveltekitCookies` in the app. */
	plugins?: NonNullable<BetterAuthOptions['plugins']>;
}

/*
 * `db: any`, and it is the honest choice rather than laziness.
 *
 * The precise type is `ReturnType<typeof drizzle<typeof schema>>`, which would
 * mean importing `db/index.ts` — the file that imports `$app/env/private`, which
 * is exactly what this module exists to avoid. Importing `drizzle` here purely
 * to name a type would also pull the libSQL native addon into a module that has
 * no business loading it.
 *
 * The adapter validates the shape at runtime, and the two call sites both pass a
 * real Drizzle instance. Naming the escape hatch and saying why beats a chain of
 * generics whose only purpose is to avoid writing this comment.
 */
export function createAuth({ db, baseURL, secret, plugins = [] }: AuthInput) {
	return betterAuth({
		/*
		 * The same origin the CSRF check uses, from the same variable.
		 *
		 * Two sources of truth for "where is this app" is a bug waiting for a
		 * deployment: the cookie is issued for one origin and rejected by the check
		 * for another, and the symptom is a sign-in that appears to succeed and then
		 * lands back on the sign-in page with no error anywhere.
		 */
		baseURL,
		secret,
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

		plugins
	});
}
