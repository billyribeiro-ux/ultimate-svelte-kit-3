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
				},

				/*
				 * ONE COMPONENT COMPILED AS A CUSTOM ELEMENT
				 * =========================================
				 *
				 * `<svelte:options customElement>` is what actually produces the element.
				 * In Svelte 5 the client compile emits
				 * `customElements.define('tessera-board', …)` from that tag whether or
				 * not `customElement: true` is set — identical output, byte for byte,
				 * either way. What the compile option changes is whether the compiler
				 * warns:
				 *
				 *     The `customElement` option is used when generating a custom
				 *     element. Did you forget the `customElement: true` compile option?
				 *
				 * That is a question worth answering rather than muting, because it is
				 * the compiler asking whether this file was *meant* to be an element.
				 * Setting the option here answers yes for this folder only; setting it
				 * globally would answer yes for every component in the application.
				 *
				 * `dynamicCompileOptions` is the seam that makes "this folder only"
				 * expressible: it is called per file, and — since vite-plugin-svelte
				 * 7.3.0 — per environment.
				 */
				dynamicCompileOptions({ filename, environment }) {
					/*
					 * `environment` as well as `filename`, since vite-plugin-svelte 7.3.0.
					 *
					 * BE HONEST ABOUT WHAT THIS LINE DOES: today, nothing to the output.
					 * The Svelte compiler already ignores `customElement` when generating
					 * for the server, and emits the element for the client either way,
					 * because `<svelte:options customElement>` is what actually drives it:
					 *
					 *   generate: 'server'  customElement: false → 5,209 bytes, no wrapper
					 *   generate: 'server'  customElement: true  → 5,209 bytes, no wrapper
					 *   generate: 'client'  customElement: false → 7,732 bytes, wrapper
					 *   generate: 'client'  customElement: true  → 7,732 bytes, wrapper
					 *
					 * What the option changes here is the *warning*, and what this guard
					 * changes is the claim. `customElement: true` says "compile this as a
					 * custom element", and a custom element is a browser thing — it
					 * registers with `customElements.define` and has no server-rendered
					 * form. Asking for one in the SSR pass is asking for something that
					 * cannot exist, and it worked only because the compiler quietly
					 * declined. That is a behaviour to depend on deliberately or not at
					 * all, and the second argument is what makes "not at all" expressible.
					 */
					if (environment.name !== 'client') return {};
					if (filename.split(/[/\\]/).includes('embed')) return { customElement: true };
					return {};
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
