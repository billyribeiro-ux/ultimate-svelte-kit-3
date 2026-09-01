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
 * The config is a *function* because it has to read the environment before the
 * build starts — `paths.origin` below is substituted into the output.
 */
export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			sveltekit({
				/*
				 * The trusted origin for CSRF checks on form submissions and remote
				 * function calls, and — since adapter-node v6 — a BUILD-time value
				 * rather than a runtime `ORIGIN` variable.
				 *
				 * Leave it unset and the adapter reconstructs the origin from request
				 * headers, where with no `PROTOCOL_HEADER` configured it assumes
				 * `https`. A server on plain HTTP then computes `https://localhost:4173`,
				 * the browser sends `http://localhost:4173`, and every POST comes back
				 * `403 {"message":"Cross-site remote requests are forbidden"}` from an
				 * app whose GET requests all work perfectly.
				 */
				paths: { origin: env.PUBLIC_ORIGIN },

				compilerOptions: {
					// Runes everywhere except node_modules, where a dependency may still be
					// written in legacy Svelte 4 style. Removable in Svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true,

					/*
					 * `await` at the top level of `<script>`, inside `$derived`, and
					 * directly in markup.
					 *
					 * Tessera leans on this harder than a CRUD app would. Opening a board
					 * means awaiting IndexedDB, and the honest way to express "this board
					 * is still coming out of local storage" is an `await` inside a
					 * `<svelte:boundary>` with a `pending` snippet — not a `loading`
					 * boolean threaded through four components.
					 */
					experimental: { async: true }
				},

				adapter: adapter(),

				experimental: {
					// `query()`, `query.batch()`, `query.live()`, `command()` and `form()`
					// from `$app/server`.
					remoteFunctions: true,

					/*
					 * Preload the next route inside a Svelte *fork*: the framework
					 * speculatively runs the new page's state without committing it, then
					 * either adopts the result or throws it away.
					 *
					 * Worth having here because the board list preloads boards on hover,
					 * and a board's `load` opens an IndexedDB transaction. Without forking,
					 * an abandoned preload leaves that transaction's effects behind.
					 */
					forkPreloads: true
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
			 * `import { CursorIcon } from 'phosphor-svelte'` resolves a barrel file
			 * re-exporting thousands of components. Production tree-shakes it, but the
			 * dev server has to crawl every one. This rewrites those named imports into
			 * deep ones.
			 *
			 * Order matters and the failure is loud: Vite runs `transform` hooks in
			 * array order and this plugin parses its input as JavaScript, so putting it
			 * first hands it raw `.svelte` source and it dies on the first `<h1>`.
			 */
			sveltePhosphorOptimize()
		],

		/*
		 * Do not bundle libSQL into the server build. It is a native addon: a
		 * compiled `.node` binary picked at runtime from a platform-specific package.
		 * A bundler can inline the JavaScript that goes looking for it but not the
		 * binary, so the built server starts and immediately dies with
		 * `Cannot find module '@libsql/linux-x64-gnu'`.
		 */
		ssr: { external: ['@libsql/client', 'libsql'] },

		/*
		 * Cross-origin isolation for the dev server.
		 *
		 * The export worker uses `OffscreenCanvas` and a `SharedArrayBuffer` to hand
		 * pixel data back without copying it. Browsers only expose
		 * `SharedArrayBuffer` on a cross-origin-isolated page, and the failure with
		 * these headers missing is a `ReferenceError` in a worker — which reaches no
		 * console anybody is watching. The production equivalents are set in
		 * `hooks.server.ts`, where they can be scoped to the routes that need them.
		 */
		server: {
			headers: {
				'cross-origin-opener-policy': 'same-origin',
				'cross-origin-embedder-policy': 'require-corp'
			}
		},

		test: {
			// A test that asserts nothing is a test that cannot fail.
			expect: { requireAssertions: true },
			projects: [
				{
					/*
					 * Component tests — a real Chromium, not a DOM emulator.
					 *
					 * Non-negotiable for this app. jsdom has no layout, so
					 * `getBoundingClientRect()` returns zeroes; a canvas whose entire job is
					 * turning pointer coordinates into document coordinates cannot be
					 * tested against a DOM that thinks every element is 0×0.
					 */
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
					// Pure logic — plain Node, no browser, fast. The CRDT lives here, and
					// these are the tests that matter most.
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
