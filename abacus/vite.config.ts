// `defineConfig` comes from `vitest/config` so the `test` block below type-checks;
// `loadEnv` is not re-exported from there, so it comes straight from Vite.
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { execSync } from 'node:child_process';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';
import adapter from '@sveltejs/adapter-node';
import { version as packageVersion } from './package.json' with { type: 'json' };

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
				 * function calls, and — since adapter-node 6 — a BUILD-time value the
				 * adapter bakes into the server, so that a process started on plain
				 * HTTP behind a proxy does not reconstruct `https://…` from headers
				 * and reject every POST as cross-site. The passkey ceremonies use the
				 * same value's hostname as the relying-party id (see `src/env.ts`).
				 */
				paths: { origin: env.PUBLIC_ORIGIN },

				compilerOptions: {
					// Runes everywhere except node_modules, where a dependency may still be
					// written in legacy Svelte 4 style. Removable in Svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true,

					/*
					 * `await` at the top level of `<script>`, inside `$derived`, and
					 * directly in markup — plus everything that hangs off it: `pending`
					 * snippets, `$effect.pending()`, `settled()` and `fork()`.
					 *
					 * A spreadsheet has more of this than it looks. Opening a sheet,
					 * importing a file, publishing, signing in with a passkey: every one
					 * is "wait, then draw", and the honest expression of that is an
					 * `await` inside a boundary rather than a `loading` boolean threaded
					 * through four components.
					 */
					experimental: { async: true }
				},

				/*
				 * ADAPTER-NODE
				 * ============
				 *
				 * Project 6 wrote an adapter from scratch to show what one is. This
				 * project deploys the way most Node apps do — `node build` behind a
				 * reverse proxy, in a container — and spends its deployment chapter on
				 * the things that make that safe: the origin, the body limit, graceful
				 * shutdown, a health check, and a Dockerfile that runs as nobody.
				 *
				 * `precompress` writes `.br` and `.gz` beside every asset at build time,
				 * so the server never compresses on the fly.
				 */
				adapter: adapter({ precompress: true }),

				experimental: {
					// `query()`, `query.batch()`, `query.live()`, `prerender()`, `command()`
					// and `form()` from `$app/server`. Every server call in this project
					// goes through one of them.
					remoteFunctions: true,

					/*
					 * FORKED PRELOADS: OFF, ON THE EVIDENCE OF TWO PROJECTS.
					 *
					 * The feature preloads the next route inside a Svelte `fork()`. Project
					 * 5's suite found a one-in-three failure opening a trace; project 6
					 * turned it on again and its suite found a back navigation that
					 * completed — URL changed, `navigation.complete` resolved — with the
					 * old page still on screen, five times in eight. Both bisected cleanly
					 * to this flag. It stays off here, and the studio↔workspace back
					 * navigation test in `e2e/sheet.e2e.ts` is the criterion for turning
					 * it on.
					 */
					forkPreloads: false
				},

				prerender: {
					// A broken internal link fails the build instead of shipping a 404.
					handleHttpError: 'fail',
					handleMissingId: 'fail'
				},

				/*
				 * CONTENT SECURITY POLICY
				 * =======================
				 *
				 * `mode: 'auto'`: hashes for prerendered pages, where the whole document
				 * is known at build time, and nonces for dynamically rendered ones,
				 * which stream `resolve(…)` scripts after the header has gone.
				 *
				 * The directives that are specific to a spreadsheet:
				 *   `worker-src 'self'`   the CSV importer is a Web Worker
				 *   `img-src blob:`       chart exports are drawn to a canvas and shown
				 *   `style-src 'unsafe-inline'` — a deliberate trade. A virtualised grid
				 *                         positions ten thousand cells with `style:`
				 *                         attributes, and column widths are numbers a
				 *                         person drags; attributes cannot be hashed and a
				 *                         nonce does not apply to them. The exposure is
				 *                         CSS injection, not script execution.
				 *   `frame-ancestors 'none'` everywhere except `/embed/[id]`, where
				 *                         `hooks.server.ts` replaces it per request.
				 */
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:', 'blob:'],
						'font-src': ['self', 'data:'],
						'connect-src': ['self'],
						'worker-src': ['self'],
						'form-action': ['self'],
						'frame-ancestors': ['none'],
						'object-src': ['none'],
						'base-uri': ['self']
					}
				},

				/*
				 * Nobody else may POST here. `trustedOrigins` exists for the case where a
				 * form on a partner's domain submits to this app; that case does not
				 * exist, so the list is empty and stays empty until somebody can name
				 * the domain.
				 */
				csrf: { trustedOrigins: [] },

				/*
				 * VERSIONING, SO A DEPLOY DOES NOT STRAND OPEN TABS
				 * ================================================
				 *
				 * Client-side navigation loads JavaScript by hashed filename. Deploy a
				 * new build while somebody has a sheet open and the next navigation
				 * asks for a file that no longer exists. `pollInterval` lets SvelteKit
				 * notice first, so the layout can offer a "reload for the new version"
				 * banner while the sheet being worked on is still saved.
				 *
				 * `name` is the commit, because it has to be deterministic: a value that
				 * differed between two builds of the same code would tell every open tab
				 * to reload for nothing.
				 */
				version: {
					name: commitHash() ?? packageVersion,
					pollInterval: 60_000
				},

				output: { bundleStrategy: 'split' },

				/*
				 * SERVER-SIDE ROUTE RESOLUTION
				 * ============================
				 *
				 * The other six projects resolve routes on the client: the route
				 * manifest ships to the browser and a click is matched locally. This
				 * one asks the server — `router.resolution: 'server'` — which is the
				 * other half of the trade and worth seeing once.
				 *
				 * What it buys: the manifest stays off the wire (a workspace can have
				 * thousands of sheets and the routes that serve them are the server's
				 * business), and a middleware could intercept a navigation before the
				 * client knows where it leads. What it costs: an unvisited path takes a
				 * round trip to resolve, which `data-sveltekit-preload-data="hover"` on
				 * the body hides for anything a pointer reaches first. Prerendered pages
				 * prerender their resolution too, so the landing page pays nothing.
				 */
				router: { type: 'pathname', resolution: 'server' }
			}),

			/*
			 * MUST come AFTER `sveltekit()`.
			 *
			 * `import { PlusIcon } from 'phosphor-svelte'` resolves a barrel file
			 * re-exporting thousands of components. Production tree-shakes it, but the
			 * dev server has to crawl every one. This rewrites those named imports into
			 * deep ones. Vite runs `transform` hooks in array order and this plugin
			 * parses its input as JavaScript, so putting it first hands it raw `.svelte`
			 * source and it dies on the first `<h1>`.
			 */
			sveltePhosphorOptimize()
		],

		/*
		 * Module workers. The CSV importer is `new Worker(new URL('./worker.ts',
		 * import.meta.url), { type: 'module' })`, and Vite's default worker format
		 * is an IIFE that cannot share chunks with the app. `'es'` lets the worker
		 * import the same parser the main thread uses without a second copy.
		 */
		worker: { format: 'es' },

		/*
		 * Do not bundle libSQL into the server build. It is a native addon: a
		 * compiled `.node` binary picked at runtime from a platform-specific package.
		 * A bundler can inline the JavaScript that goes looking for it but not the
		 * binary, so the built server starts and immediately dies with
		 * `Cannot find module '@libsql/linux-x64-gnu'`.
		 */
		ssr: { external: ['@libsql/client', 'libsql'] },

		test: {
			// A test that asserts nothing is a test that cannot fail.
			expect: { requireAssertions: true },
			projects: [
				{
					/*
					 * Component and grid tests — a real Chromium, not a DOM emulator.
					 *
					 * The grid virtualises on measured sizes, the clipboard is the
					 * clipboard, and `ResizeObserver` fires. jsdom has none of those and
					 * would pass every test you thought to write while doing nothing.
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
					// Pure logic — plain Node, no browser, fast. The formula language,
					// the engine, the locale layer, the CSV parser and the identity code
					// live here, and these are the tests that run on every save.
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],

						/*
						 * One file at a time: SQLite allows exactly one writer, and two
						 * spec files seeding the same database meet `SQLITE_BUSY` as a
						 * dozen unrelated assertions failing in whichever file lost the
						 * race.
						 */
						fileParallelism: false
					}
				}
			]
		}
	};
});

/**
 * The current commit, or `null` when there is no repository to ask.
 *
 * `null` rather than a throw: a Docker build context usually has no `.git`,
 * and a build that fails because it could not compute a version string is a
 * build that fails for the least important thing in it.
 */
function commitHash(): string | null {
	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return null;
	}
}
