/**
 * Every environment variable this app reads, declared once.
 *
 * SvelteKit 3 replaced the `$env/*` magic modules with this file. A variable
 * not declared here cannot be imported — a type error rather than a runtime
 * `undefined` three weeks later — and `public: true` is something you have to
 * type, so a secret cannot reach the browser by accident.
 */
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

const required = v.pipe(v.string(), v.trim(), v.minLength(1));

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'libSQL connection string. `file:sequent.db` in development.',
		schema: required
	},
	PUBLIC_ORIGIN: {
		description: 'Where the app is served from. Used for CSRF checks.',
		public: true,
		static: true,
		schema: v.pipe(
			required,
			v.url('Must be an absolute URL'),
			v.transform((value) => value.replace(/\/+$/, ''))
		)
	}
});
