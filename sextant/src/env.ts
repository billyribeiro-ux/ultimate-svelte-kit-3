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

/** A positive integer read from a string, with a default and a reason for it. */
function count(fallback: string, minimum: number, why: string) {
	return v.optional(
		v.pipe(v.string(), v.transform(Number), v.number(), v.integer(), v.minValue(minimum, why)),
		fallback
	);
}

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
			v.transform((value) => value.replace(/\/+$/, ''))
		)
	},

	BETTER_AUTH_SECRET: {
		description: 'Signs session cookies. Generate with `openssl rand -base64 32`.',
		schema: v.pipe(required, v.minLength(32, 'Use at least 32 characters'))
	},

	/*
	 * THE FOUR NUMBERS THAT DECIDE WHETHER THIS SURVIVES A BAD DAY
	 * -----------------------------------------------------------
	 * An observability platform fails in a specific way: the thing it is watching
	 * breaks, the volume of telemetry goes up by two orders of magnitude, and the
	 * platform falls over at the exact moment somebody needs it. Every limit below
	 * exists to make that a refusal with a `Retry-After` rather than an outage.
	 */

	INGEST_MAX_BATCH: {
		description: 'Most events one ingest request may carry.',
		schema: count(
			'5000',
			1,
			'A batch of zero is a client bug; refusing it is more useful than accepting it'
		)
	},

	INGEST_RATE_PER_MINUTE: {
		description: 'Events per minute per tenant before ingest starts refusing.',
		schema: count('600000', 60, 'Below one per second the limiter is the outage')
	},

	SERIES_CARDINALITY_LIMIT: {
		description: 'Distinct label combinations a tenant may create per metric.',

		/*
		 * The single most important number in a metrics system.
		 *
		 * One well-meaning `user_id` label turns one series into a million, and a
		 * million series is not "a bigger bill" — it is a query planner choosing a
		 * different plan, a rollup table larger than the raw data, and a dashboard
		 * that stops loading. The limit has to exist, it has to be per metric rather
		 * than global so one bad metric cannot starve the rest, and exceeding it has
		 * to be *visible* rather than silently dropped, which is what
		 * `series_rejected` in the schema is for.
		 */
		schema: count('10000', 100, 'Below a hundred series, ordinary labels break')
	},

	RETENTION_DAYS: {
		description: 'How long raw events are kept before the retention job deletes them.',
		schema: count('14', 1, 'Deleting today’s telemetry would leave nothing to debug with')
	}
});
