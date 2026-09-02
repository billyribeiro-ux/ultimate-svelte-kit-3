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
		description:
			'Where the app is served from, with no trailing slash. The CSRF origin and the passkey relying party.',
		public: true,

		/*
		 * `static: true` means the value is inlined at build time rather than read
		 * from the environment at runtime. It has to be: `paths.origin` in
		 * `vite.config.ts` reads the same variable during the build, and a value
		 * that could differ between build and run would make the CSRF check compare
		 * two different origins — and would let a passkey be registered for one
		 * hostname and asserted against another.
		 */
		static: true,
		schema: v.pipe(
			required,
			v.url('Must be an absolute URL'),
			v.transform((value) => value.replace(/\/+$/, ''))
		)
	},

	SESSION_SECRET: {
		description: 'Signs the session cookie. Generate with `openssl rand -base64 32`.',
		schema: v.pipe(required, v.minLength(32, 'Use at least 32 characters'))
	},

	CELL_LIMIT: {
		description: 'The largest sheet the server will store, in cells.',
		/*
		 * A string in, a number out. Environment variables are always strings, and
		 * the place to turn one into a number is here — once — rather than in every
		 * file that reads it with a `Number()` and a hopeful default.
		 */
		schema: v.optional(
			v.pipe(
				v.string(),
				v.transform(Number),
				v.number(),
				v.integer(),
				v.minValue(1000, 'A thousand cells is the smallest useful sheet'),
				v.maxValue(5_000_000, 'Five million cells is a database, not a sheet')
			),
			'200000'
		)
	}
});
