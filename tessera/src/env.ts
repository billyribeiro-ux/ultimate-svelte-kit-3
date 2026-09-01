/**
 * Every environment variable this app reads, declared once.
 *
 * SvelteKit 3 replaced the `$env/*` magic modules with this file. A variable not
 * declared here cannot be imported — a type error at build time rather than an
 * `undefined` that surfaces in production three weeks later — and `public: true`
 * is something you have to type, so a secret cannot reach the browser by
 * accident.
 *
 * The schemas are valibot. They run once, at boot, against the real environment.
 * A malformed `PUBLIC_ORIGIN` stops the server starting instead of producing a
 * fleet of 403s that look like a CSRF bug.
 */
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

const required = v.pipe(v.string(), v.trim(), v.minLength(1));

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'libSQL connection string. `file:local.db` in development.',
		schema: required
	},

	PUBLIC_ORIGIN: {
		description: 'Where the app is served from, with no trailing slash. Used for CSRF checks.',
		public: true,

		/*
		 * `static: true` means the value is inlined at build time rather than read
		 * from the environment at runtime. It has to be: `paths.origin` in
		 * `vite.config.ts` reads the same variable during the build, and a value
		 * that could differ between build and run would make the CSRF check compare
		 * two different origins.
		 */
		static: true,
		schema: v.pipe(
			required,
			v.url('Must be an absolute URL'),
			// A trailing slash makes `${PUBLIC_ORIGIN}/b/${id}` produce a double slash,
			// which most servers tolerate and canonical-URL checks do not.
			v.transform((value) => value.replace(/\/+$/, ''))
		)
	},

	BETTER_AUTH_SECRET: {
		description: 'Signs session cookies. Generate with `openssl rand -base64 32`.',

		/*
		 * Thirty-two characters is not a style preference. Better Auth derives its
		 * signing key from this string; a short one is a short key, and the failure
		 * mode of a short key is silent — everything works, and forging a session
		 * is cheap.
		 */
		schema: v.pipe(required, v.minLength(32, 'Use at least 32 characters'))
	},

	BOARD_LOG_RETENTION_DAYS: {
		description: 'How long a board keeps individual operations before compaction.',
		schema: v.optional(
			v.pipe(
				v.string(),
				v.transform(Number),
				v.number(),
				v.integer(),
				v.minValue(1, 'Compacting away today’s own edits would lose work')
			),
			'30'
		)
	}
});
