/**
 * ENVIRONMENT VARIABLES
 * =====================
 *
 * This is a SvelteKit 3 feature and it is a genuine upgrade over the old `$env/*`
 * modules, so it's worth understanding rather than copying.
 *
 * In SvelteKit 2, *every* variable in your environment was implicitly importable.
 * That's convenient and slightly dangerous: nothing stopped you from importing a
 * secret into a component, and nothing told you a variable was missing until the
 * code path that used it happened to run — often in production, at 3am.
 *
 * In SvelteKit 3 you declare variables here, explicitly, and get three things:
 *
 *   1. TYPE SAFETY — `import { PUBLIC_SITE_URL } from '$app/env/public'` is typed.
 *      A typo is a build error, not a runtime `undefined`.
 *
 *   2. VALIDATION — the `schema` runs at startup. A malformed URL kills the boot
 *      with a clear message instead of silently emitting broken canonical tags.
 *
 *   3. LEAK PROTECTION — anything without `public: true` lives in `$app/env/private`,
 *      which physically cannot be imported into browser code. The build fails if
 *      you try. This is the important one.
 *
 * `static: true` means the value is inlined into the bundle at build time, which
 * allows dead-code elimination. Use it for values that can't change between build
 * and run. `static: false` (the default) reads at runtime, which is what you want
 * for anything set by your host.
 */

import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

export const variables = defineEnvVars({
	/**
	 * The canonical origin of the site — no trailing slash.
	 *
	 * Every absolute URL the site emits derives from this: canonical tags, Open Graph
	 * URLs, the sitemap, and JSON-LD `@id` values. Getting it wrong doesn't break the
	 * site visibly; it quietly tells Google your pages live somewhere they don't.
	 *
	 * It's `static` because it's baked into prerendered HTML at build time anyway.
	 */
	PUBLIC_SITE_URL: {
		public: true,
		static: true,
		description: 'Canonical origin, e.g. https://strikeflow.io — no trailing slash.',
		schema: v.pipe(
			v.optional(v.string(), 'http://localhost:5173'),
			v.url('PUBLIC_SITE_URL must be a valid absolute URL'),
			// A trailing slash here produces "https://site.com//about" downstream.
			// Strip it once, here, rather than defensively everywhere else.
			v.transform((url) => url.replace(/\/+$/, ''))
		)
	},

	/**
	 * Directory where captured leads are appended.
	 *
	 * Private: the browser has no business knowing where we write.
	 */
	LEADS_DIR: {
		description: 'Directory for the newline-delimited JSON lead log.',
		schema: v.optional(v.string(), '.data')
	},

	/**
	 * Secret used to sign ebook download tokens (HMAC-SHA256).
	 *
	 * Optional on purpose: leaving it unset lets a student clone and run the project
	 * with zero setup. When it's missing we generate a random one at boot, which means
	 * download links stop working after a restart — a small, visible annoyance that
	 * pushes you to set it properly before deploying. See `src/lib/server/tokens.ts`.
	 */
	EBOOK_TOKEN_SECRET: {
		description: 'HMAC key for signing ebook download links. Set this in production.',
		schema: v.optional(v.pipe(v.string(), v.minLength(32, 'Use at least 32 characters')))
	}
});
