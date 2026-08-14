/**
 * Every environment variable this app reads, declared in one place.
 *
 * SvelteKit 3 replaced the `$env/static/private` + `$env/dynamic/private` magic
 * modules with this file. The difference is not cosmetic:
 *
 *   - Nothing is implicit. If a variable is not declared here, importing it from
 *     `$app/env/private` is a *type error*, not a runtime `undefined`.
 *   - Each variable can carry a schema, so the app refuses to start with a bad
 *     value instead of failing at 3am when the first request reaches that branch.
 *   - `public: true` is an explicit, reviewable act. You cannot leak a secret to
 *     the browser by accident — you have to type the word `public` next to it.
 *
 * Read them with:
 *   import { DATABASE_URL } from '$app/env/private';   // server only, enforced
 *   import { PUBLIC_ORIGIN } from '$app/env/public';   // safe in the browser
 *
 * A schema may return a value that is not a string, and the imported type follows
 * it. `PORT` declared as a number arrives as a number. We use that below to turn
 * `DATABASE_AUTH_TOKEN` into `string | undefined` — the only honest type for a
 * variable that is genuinely optional.
 */
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

/** A non-empty string, with surrounding whitespace stripped. */
const required = v.pipe(v.string(), v.trim(), v.minLength(1));

/**
 * An absolute origin with no trailing slash: `https://halfpast.app`.
 *
 * We normalise rather than merely validate. Half the "why is my canonical URL
 * doubled up" bugs in the world are one config file ending in a slash and
 * another not, and the cheapest place to settle that argument is here, once.
 */
const origin = v.pipe(
	required,
	v.url('Must be an absolute URL including the protocol, e.g. https://halfpast.app'),
	v.transform((value) => value.replace(/\/+$/, ''))
);

/**
 * An IANA time zone identifier, checked against the runtime's own tz database
 * rather than a regex. `Intl.DateTimeFormat` throws `RangeError` for anything it
 * does not recognise, which is exactly the check we want: it is the same lookup
 * every date we format will perform later.
 */
const timeZone = v.pipe(
	required,
	v.check((value) => {
		try {
			new Intl.DateTimeFormat('en-GB', { timeZone: value });
			return true;
		} catch {
			return false;
		}
	}, 'Must be a valid IANA time zone identifier, e.g. Europe/London')
);

export const variables = defineEnvVars({
	/* ---------------------------------------------------------------- private */

	DATABASE_URL: {
		description:
			'libSQL connection string. `file:local.db` in development, a `libsql://…` Turso URL in production.',
		schema: required
	},

	DATABASE_AUTH_TOKEN: {
		description:
			'Auth token for a remote libSQL/Turso database. Leave unset when pointing at a local file.',
		// Returning `undefined` from a schema function is how you declare
		// "this one is genuinely allowed to be missing".
		schema: (value) => (value ? value.trim() : undefined)
	},

	ORIGIN: {
		description:
			'The absolute origin the server believes it is serving from, e.g. `http://localhost:5173`. Better Auth signs cookies against this and adapter-node uses it to build absolute URLs.',
		schema: origin
	},

	BETTER_AUTH_SECRET: {
		description:
			'Signing key for session tokens. Generate with `openssl rand -base64 32`. See https://www.better-auth.com/docs/installation.',
		schema: v.pipe(
			required,
			v.minLength(32, 'BETTER_AUTH_SECRET must be at least 32 characters of high entropy')
		)
	},

	/* ----------------------------------------------------------------- public */

	PUBLIC_ORIGIN: {
		description:
			'The public base URL used for canonical links, share URLs and structured data. No trailing slash — one is stripped for you if you leave it on.',
		public: true,
		// `static` inlines the value at build time, so it costs nothing at runtime
		// and dead code behind it can be eliminated. Only correct because this
		// value cannot differ between build and deploy.
		static: true,
		schema: origin
	},

	PUBLIC_DEFAULT_TIME_ZONE: {
		description:
			'IANA time zone used when we cannot detect the visitor’s own, e.g. `Europe/London`. Never `UTC` — UTC is not a place anyone lives, and showing it to a customer is how a 9am haircut gets booked for 4am.',
		public: true,
		static: true,
		schema: timeZone
	}
});
