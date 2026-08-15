// `defineConfig` comes from `vitest/config` so the `test` block below type-checks;
// `loadEnv` is not re-exported from there, so it comes straight from Vite.
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';

/*
 * SvelteKit 3 keeps ALL framework configuration here, inside the `sveltekit()`
 * plugin. There is no `svelte.config.js`.
 *
 * The config is a *function* so it can read the environment before building. It
 * needs to, because of `paths.origin` below.
 */
export default defineConfig(({ mode }) => {
	/*
	 * `loadEnv` reads `.env`, `.env.local` and `.env.[mode]` the way Vite does at
	 * runtime, and merges in `process.env`. The empty prefix means "give me
	 * everything", not just `VITE_`-prefixed variables — this is build
	 * configuration, not client code, so nothing here reaches the browser
	 * unless we put it there deliberately.
	 */
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			sveltekit({
				/*
				 * THE ORIGIN, AND WHY IT IS HERE RATHER THAN AN ENV VAR
				 * ====================================================
				 *
				 * `paths.origin` is new in SvelteKit 3, and it is the trusted origin
				 * for CSRF checks on both form submissions and remote function calls.
				 *
				 * It matters more than it looks, because `adapter-node` v6 changed how
				 * this works and the failure is baffling. `ORIGIN` used to be a runtime
				 * environment variable; it is now substituted from this value at BUILD
				 * time. Leave it unset and the adapter falls back to reconstructing the
				 * origin from request headers — where, with no `PROTOCOL_HEADER`
				 * configured, **it assumes `https`**.
				 *
				 * So a server on plain HTTP computes `https://localhost:4173`, the
				 * browser sends `Origin: http://localhost:4173`, the two do not match,
				 * and every POST comes back
				 * `403 {"message":"Cross-site remote requests are forbidden"}` — from an
				 * app that looks entirely correct and works perfectly for GET requests.
				 *
				 * Behind a reverse proxy that terminates TLS, the alternative is to set
				 * `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`
				 * so the adapter trusts the proxy instead. Either is fine; leaving both
				 * unset is what is not.
				 */
				paths: { origin: env.PUBLIC_ORIGIN },

				compilerOptions: {
					// Runes everywhere except node_modules, where a dependency may still be
					// written in legacy Svelte 4 style. Removable in Svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true,

					// `await` at the top level of <script>, inside $derived, and directly in
					// markup. Remote functions are promises; this is what lets a component
					// await one without a load function in the middle. Default in Svelte 6.
					experimental: { async: true }
				},

				adapter: adapter(),

				experimental: {
					// `query()`, `query.batch()`, `query.live()`, `command()` and `form()`
					// from `$app/server`. The whole data layer of this app is built on them.
					remoteFunctions: true
				},

				prerender: {
					// A broken internal link fails the build instead of shipping a 404.
					handleHttpError: 'fail',
					handleMissingId: 'fail'
				}
			}),

			/*
			 * MUST come AFTER `sveltekit()`.
			 *
			 * `import { CalendarIcon } from 'phosphor-svelte'` resolves a barrel file
			 * re-exporting thousands of components. Production tree-shakes it, but the dev
			 * server has to crawl every one — turning a cold start into a coffee break.
			 * This rewrites those named imports into deep ones.
			 *
			 * Order matters and the failure is loud: Vite runs `transform` hooks in array
			 * order, and this plugin parses its input as JavaScript. Put it first and it
			 * receives raw `.svelte` source and dies on the first `<h1>`.
			 */
			sveltePhosphorOptimize()
		],

		ssr: {
			/*
			 * Do not bundle libSQL into the server build.
			 *
			 * `libsql` is a native addon: a compiled `.node` binary picked at runtime
			 * from a platform-specific package (`@libsql/linux-x64-gnu` here). A
			 * bundler can inline the JavaScript that goes looking for it, but it
			 * cannot inline the binary — so the built server starts up and immediately
			 * dies with `Cannot find module '@libsql/linux-x64-gnu'`, from a stack
			 * trace that points into a generated chunk and explains nothing.
			 *
			 * Marking it external leaves the `require` alone, so it resolves from
			 * `node_modules` at runtime the way the package intends. The rule
			 * generalises: anything with a native binding — database drivers, image
			 * processing, argon2 — belongs here.
			 */
			external: ['@libsql/client', 'libsql']
		},

		test: {
			// A test that asserts nothing is a test that cannot fail. Vitest will now
			// treat one as an error rather than a pass.
			expect: { requireAssertions: true },
			projects: [
				{
					// Component tests — a real Chromium, not a DOM emulator. jsdom quietly
					// lies about layout, focus and `matchMedia`, which are exactly the things
					// a booking UI needs to get right.
					extends: './vite.config.ts',
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [{ browser: 'chromium', headless: true }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**']
					}
				},
				{
					// Pure logic — plain Node, no browser, fast. The time engine and the
					// booking rules live here, and they are the tests that matter most.
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	};
});
