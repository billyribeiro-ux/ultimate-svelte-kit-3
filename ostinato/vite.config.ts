// `defineConfig` comes from `vitest/config` so the `test` block below type-checks;
// `loadEnv` is not re-exported from there, so it comes straight from Vite.
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { execSync } from 'node:child_process';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';
import ostinato from './adapters/ostinato/index.js';
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
				 * function calls. A BUILD-time value: the adapter bakes it into the
				 * server so that a process started on plain HTTP behind a proxy does not
				 * reconstruct `https://…` from headers and reject every POST as
				 * cross-site.
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
					 * A groovebox is a natural fit. Decoding a sample, rendering a pattern
					 * to a WAV, fetching a published pattern: every one of those is "wait,
					 * then draw", and the honest expression of that is an `await` inside a
					 * boundary rather than a `loading` boolean threaded through four
					 * components.
					 */
					experimental: { async: true }
				},

				/**
				 * WHICH FILES ARE CUSTOM ELEMENTS
				 * ==============================
				 *
				 * `src/lib/embed/` holds the one component that is compiled as a custom
				 * element — `<ostinato-player>`, the thing people paste into their own
				 * pages. `dynamicCompileOptions` is called per file and, since
				 * vite-plugin-svelte 7.3.0, per *environment*, which is what lets this
				 * say "for the client build of this folder only".
				 *
				 * The `environment` guard matters more than it looks. A custom element
				 * registers itself with `customElements.define` and has no server
				 * rendered form; asking the SSR pass to compile one is asking for
				 * something that cannot exist. The compiler used to decline quietly, and
				 * a behaviour you depend on quietly is a behaviour that changes quietly.
				 */
				dynamicCompileOptions({ filename, environment }) {
					if (environment.name !== 'client') return {};
					if (filename.split(/[/\\]/).includes('embed')) return { customElement: true };
					return {};
				},

				/*
				 * OUR OWN ADAPTER
				 * ===============
				 *
				 * `adapters/ostinato` is a small adapter written for this project — a
				 * Node server that deploys the app as two functions, `pages` and `api`,
				 * with a catch-all that uses SvelteKit 3's `applyReroute` to hand a
				 * request from one to the other when the `reroute` hook says so. It
				 * exists to show what an adapter *is*; the end-to-end suite runs against
				 * its output, which is the only proof of an adapter that counts.
				 */
				adapter: ostinato(),

				experimental: {
					// `query()`, `query.batch()`, `query.live()`, `prerender()`, `command()`
					// and `form()` from `$app/server`. Every server call in this project
					// goes through one of them.
					remoteFunctions: true,

					/*
					 * FORKED PRELOADS: OFF, AND THIS TIME IT IS THE SECOND PROJECT TO SAY SO.
					 *
					 * The feature preloads the next route inside a Svelte `fork()` — the
					 * new page's state is run speculatively and adopted or discarded.
					 * Project 5 turned it off after its suite found a one-in-three failure
					 * opening a trace. This project turned it *on*, with the same
					 * acceptance criterion — the end-to-end suite — and the suite found a
					 * different bug: navigate from the studio to the gallery and press
					 * back, and five times in eight the navigation *completes* — the URL
					 * changes, `navigation.complete` resolves, the view transition runs —
					 * while the gallery stays on screen. The studio never renders.
					 *
					 * The bisect was clean: fifteen runs with the flag off, fifteen passes,
					 * on both the desktop and the phone profile. Nothing else changed.
					 * Speculative state that is discarded rather than committed is exactly
					 * the sort of thing that would produce a navigation with no page, and a
					 * preload is a latency optimisation that is not worth a blank screen.
					 * Off, with the test that found it left in the suite as the criterion
					 * for turning it back on.
					 */
					forkPreloads: false
				},

				/*
				 * TRACING
				 * =======
				 *
				 * OpenTelemetry spans for `handle`, `load`, form actions and remote
				 * functions. A top-level option in SvelteKit 3 — it graduated from
				 * `experimental.tracing` — and the matching `instrumentation.server.ts`
				 * no longer needs a flag at all: if the file exists and the adapter says
				 * it can (`supports.instrumentation`), it runs before the app.
				 *
				 * The spans go to an in-memory ring rather than to a collector, and the
				 * diagnostics page reads them back out, so "why was that publish slow"
				 * has an answer without a second service.
				 */
				tracing: { server: true },

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
				 * The directives that are specific to an instrument:
				 *   `media-src blob:`  the exported WAV is played back from a Blob URL
				 *   `img-src data:`    the share card is an SVG data URL in the studio
				 *   `style-src 'unsafe-inline'` — a deliberate trade. Knobs and the
				 *                      playhead set `style:--angle` per frame; attributes
				 *                      cannot be hashed and a nonce does not apply to them.
				 *                      The exposure is CSS injection, not script execution.
				 */
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:'],
						'media-src': ['self', 'blob:'],
						'font-src': ['self', 'data:'],
						'connect-src': ['self'],
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
				 * new build while somebody has the studio open and the next navigation
				 * asks for a file that no longer exists. SvelteKit falls back to a full
				 * reload when that fails; `pollInterval` lets it *notice first*, so the
				 * layout can offer a "reload for the new version" banner while the
				 * pattern being worked on is still saved.
				 *
				 * `name` is the commit, because it has to be deterministic: a value that
				 * differed between two builds of the same code would tell every open tab
				 * to reload for nothing.
				 */
				version: {
					name: commitHash() ?? packageVersion,
					pollInterval: 60_000
				},

				/*
				 * `bundleStrategy: 'split'` (the default) is right for an app with a
				 * landing page and a studio: somebody reading the landing page should not
				 * download the audio engine. `'inline'` — one file, no separate chunks —
				 * is what the embeddable player wants, and it gets it from its own build
				 * in `vite.embed.config.ts` rather than from this one.
				 *
				 * There is no `preloadStrategy` any more. SvelteKit 3 removed the option
				 * and always emits `<link rel="modulepreload">`; the alternatives existed
				 * for browsers that no longer exist.
				 */
				output: { bundleStrategy: 'split' },

				/*
				 * Route resolution on the client, which is the default and worth stating
				 * because the alternative was considered. `'server'` keeps the route
				 * manifest off the wire and lets a middleware intercept navigations, at
				 * the cost of a round trip for every unvisited path. This app has nine
				 * routes; its manifest is smaller than the round trip.
				 */
				router: { type: 'pathname', resolution: 'client' }
			}),

			/*
			 * MUST come AFTER `sveltekit()`.
			 *
			 * `import { PlayIcon } from 'phosphor-svelte'` resolves a barrel file
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

		test: {
			// A test that asserts nothing is a test that cannot fail.
			expect: { requireAssertions: true },
			projects: [
				{
					/*
					 * Component and engine tests — a real Chromium, not a DOM emulator.
					 *
					 * Non-negotiable for an audio application: jsdom has no
					 * `AudioContext`, no `OfflineAudioContext` and no layout, so the
					 * scheduler, the knobs and the waveform would all pass every test you
					 * thought to write while doing nothing at all.
					 */
					extends: './vite.config.ts',
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright({
								// Web Audio starts suspended without a user gesture. The tests
								// are not a person, so the flag says so.
								launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
							}),
							instances: [{ browser: 'chromium', headless: true }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**']
					}
				},
				{
					// Pure logic — plain Node, no browser, fast. The pattern model, the
					// codec, the identity cookie and the adapter's route partition live
					// here, and these are the tests that run on every save.
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}', 'adapters/**/*.{test,spec}.js'],
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
