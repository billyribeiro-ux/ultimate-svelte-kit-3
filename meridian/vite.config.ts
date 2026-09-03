// `defineConfig` comes from `vitest/config` so the `test` block below type-checks;
// `loadEnv` is not re-exported from there, so it comes straight from Vite.
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { mdsvex } from 'mdsvex';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';
import adapter from '@sveltejs/adapter-node';
import { version as packageVersion } from './package.json' with { type: 'json' };

/*
 * SvelteKit 3 keeps ALL framework configuration here, inside the `sveltekit()`
 * plugin. There is no `svelte.config.js` — and that matters for this project
 * more than for the seven before it, because three of the plugins below used
 * to be configured *through* `svelte.config.js` and now are not:
 *
 *   - mdsvex is a preprocessor, passed to `sveltekit()` as `preprocess`, with
 *     the extra `extensions` it handles;
 *   - `@sveltejs/package` (the library in `packages/waypoint`) reads its
 *     config back out of Vite's resolved config — see that folder's own
 *     `vite.config.ts`;
 *   - Paraglide is a Vite plugin in its own right and never needed the file.
 *
 * The config is a *function* because it has to read the environment before the
 * build starts — `paths.origin` below is substituted into the output.
 */
export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			/*
			 * MUST come BEFORE `sveltekit()`.
			 *
			 * `<enhanced:img src="./hero.jpg">` is rewritten by a preprocessor into a
			 * `<picture>` with AVIF and WebP sources at several widths, generated at
			 * build time by sharp. The rewrite has to happen before the Svelte
			 * compiler sees the file, which is why the order is not negotiable.
			 */
			enhancedImages(),

			sveltekit({
				/*
				 * The trusted origin for CSRF checks on form submissions and remote
				 * function calls, and — since adapter-node 6 — a BUILD-time value the
				 * adapter bakes into the server, so that a process started on plain
				 * HTTP behind a proxy does not reconstruct `https://…` from headers
				 * and reject every POST as cross-site. Better Auth uses the same value
				 * as its `baseURL` (see `src/lib/server/auth.ts`).
				 */
				paths: { origin: env.PUBLIC_ORIGIN },

				/*
				 * MARKDOWN COMPONENTS
				 * ===================
				 *
				 * mdsvex turns a `.svx` file into a Svelte component: Markdown for
				 * the prose, and any Svelte component in the middle of it. The travel
				 * guides in `src/content/guides` are written that way, and rendered
				 * by a prerendered route — so the Markdown is compiled once, at build
				 * time, and never shipped as a parser.
				 *
				 * `extensions` tells SvelteKit that `.svx` is a component too, so
				 * `import Guide from './lisbon.svx'` works like any other import.
				 */
				preprocess: [mdsvex({ extensions: ['.svx'] })],
				extensions: ['.svelte', '.svx'],

				/*
				 * ONE FOLDER OF CUSTOM ELEMENTS
				 * =============================
				 *
				 * `src/lib/embed` holds `<meridian-route>`, which is compiled as a
				 * custom element — `customElements.define`, a shadow root — rather
				 * than as an ordinary component. That is a per-file compiler option,
				 * and `dynamicCompileOptions` is how a per-file option is set.
				 *
				 * `environment.name === 'client'` because a custom element has no
				 * server-rendered form: it registers itself with the browser and is
				 * imported on mount. The server build compiles the same file as a
				 * plain component it never renders.
				 */
				dynamicCompileOptions({ filename, environment }) {
					if (environment.name !== 'client') return {};
					if (filename.split(/[/\\]/).includes('embed')) return { customElement: true };
					return {};
				},

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
					 * A trip planner is full of it: the globe is a three-hundred-kilobyte
					 * import that loads when a person asks for it, a place search is a
					 * request per keystroke, and opening a trip is "wait, then draw".
					 */
					experimental: { async: true }
				},

				/*
				 * ADAPTER-NODE
				 * ============
				 *
				 * `node build` behind a reverse proxy, in a container. `precompress`
				 * writes `.br` and `.gz` beside every asset at build time, which
				 * matters here: MapLibre and three.js are the two largest chunks any
				 * project in this series has shipped, and neither should be gzipped
				 * per request.
				 */
				adapter: adapter({ precompress: true }),

				experimental: {
					// `query()`, `query.batch()`, `query.live()`, `prerender()`, `command()`
					// and `form()` from `$app/server`. Every server call in this project
					// goes through one of them.
					remoteFunctions: true,

					/*
					 * FORKED PRELOADS: OFF, ON THE EVIDENCE OF THREE PROJECTS.
					 *
					 * Projects 5, 6 and 7 each turned this on and each found a
					 * navigation that completed without rendering. It stays off here;
					 * the trip↔trips back navigation in `e2e/trip.e2e.ts` is the
					 * criterion for turning it on.
					 */
					forkPreloads: false
				},

				/*
				 * OBSERVABILITY
				 * =============
				 *
				 * `tracing.server` makes SvelteKit emit OpenTelemetry spans for
				 * `handle`, `load`, form actions and remote functions, and puts the
				 * root span on `event.tracing.root`. It graduated out of
				 * `experimental` in SvelteKit 3, and so did the instrumentation file:
				 * `src/instrumentation.server.ts` is loaded before any application
				 * code whenever it exists, with nothing to switch on. That file is
				 * where the exporter is set up, and the diagnostics page reads the
				 * spans back.
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
				 * The directives that are specific to a map and a globe:
				 *   `worker-src 'self' blob:`  MapLibre parses tiles in a Web Worker.
				 *                              Its URL is set from a Vite asset import,
				 *                              so `'self'` is enough; `blob:` is for the
				 *                              fallback MapLibre uses when the worker
				 *                              script is on another origin.
				 *   `img-src data: blob:`      MapLibre sprites and the canvas exports.
				 *   `connect-src 'self'`       Deliberately no tile server: the map
				 *                              style is built from a bundled TopoJSON
				 *                              of the world, so the app works offline
				 *                              and in CI with no keys and no leaks.
				 *   `style-src 'unsafe-inline'` — a deliberate trade. Markers and the
				 *                              itinerary position things with `style:`
				 *                              attributes; attributes cannot be hashed
				 *                              and a nonce does not apply to them. The
				 *                              exposure is CSS injection, not script.
				 *   `frame-ancestors 'none'`   everywhere except `/embed/[slug]`, where
				 *                              `hooks.server.ts` replaces it per request.
				 */
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						// `'self'` plus the hash of the one inline script in `app.html`.
						'script-src': ['self', themeBootHash()],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:', 'blob:'],
						'font-src': ['self', 'data:'],
						'connect-src': ['self'],
						'worker-src': ['self', 'blob:'],
						'form-action': ['self'],
						'frame-ancestors': ['none'],
						'object-src': ['none'],
						'base-uri': ['self']
					}
				},

				// Nobody else may POST here.
				csrf: { trustedOrigins: [] },

				/*
				 * VERSIONING, SO A DEPLOY DOES NOT STRAND OPEN TABS
				 * ================================================
				 *
				 * Client-side navigation loads JavaScript by hashed filename. Deploy a
				 * new build while somebody has a trip open and the next navigation asks
				 * for a file that no longer exists. `pollInterval` lets SvelteKit notice
				 * first, so the layout can offer a "reload for the new version" banner.
				 *
				 * `name` is the commit, because it has to be deterministic.
				 */
				version: {
					name: commitHash() ?? packageVersion,
					pollInterval: 60_000
				},

				output: { bundleStrategy: 'split' }
			}),

			/*
			 * INTERNATIONALISATION
			 * ====================
			 *
			 * Paraglide compiles `messages/{locale}.json` into one typed function per
			 * message — `m.trip_created({ name })` — which the bundler tree-shakes
			 * like any other function. There is no dictionary shipped at runtime and
			 * no `t('key')` that can misspell a key without the compiler noticing.
			 *
			 * `strategy` is the order in which the locale is worked out. The URL
			 * first (`/de/trips` is German, `/trips` is English, the base locale),
			 * then a cookie the switcher sets, then the browser's `Accept-Language`,
			 * then English. `src/hooks.ts` and `src/hooks.server.ts` do the two halves
			 * of the URL part: `reroute` strips the prefix so `/de/trips` is served by
			 * `src/routes/trips`, and the middleware reads the locale for the request.
			 */
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide',
				emitTsDeclarations: true,
				strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
				cookieName: 'meridian_locale'
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
					 * Component tests — a real Chromium, not a DOM emulator.
					 *
					 * The map needs WebGL, the drag-and-drop needs real pointer events
					 * and `getBoundingClientRect`, and the itinerary animates with
					 * `animate:flip`. jsdom has none of those and would pass every test
					 * you thought to write while doing nothing.
					 */
					extends: './vite.config.ts',
					/*
					 * The icons the tested components use, pre-bundled before the first
					 * test runs. `sveltePhosphorOptimize()` rewrites `phosphor-svelte`
					 * imports into deep ones *during* transform, after Vite's dependency
					 * scan — so on a cold cache Vite discovers them mid-run, re-bundles,
					 * and reloads the test in the middle of itself. Naming them here is
					 * the fix Vitest asks for in its own warning.
					 */
					optimizeDeps: {
						include: [
							'phosphor-svelte/lib/BedIcon',
							'phosphor-svelte/lib/DotsSixVerticalIcon',
							'phosphor-svelte/lib/ForkKnifeIcon',
							'phosphor-svelte/lib/LightbulbIcon',
							'phosphor-svelte/lib/MapPinIcon',
							'phosphor-svelte/lib/PencilSimpleIcon',
							'phosphor-svelte/lib/TicketIcon',
							'phosphor-svelte/lib/TrainIcon',
							'phosphor-svelte/lib/TrashIcon'
						]
					},
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
					// Pure logic — plain Node, no browser, fast. Splits, ordering, dates,
					// schemas, the geodata build, the identity helpers.
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
 * The SHA-256 of the theme boot script in `src/app.html`, as a CSP source.
 *
 * Read from the template rather than kept as a second copy here, so the two
 * cannot drift: edit the script and the hash follows. A stale hash is the
 * worst kind of CSP bug — nothing errors at build time, and the script is
 * silently blocked in production.
 *
 * A hash and not a nonce, on purpose. `%sveltekit.nonce%` is filled per
 * request, and a prerendered page has no request: SvelteKit refuses to
 * prerender a template that contains it. The hash is the same for every
 * page, prerendered or not, which is exactly what a static script wants.
 */
function themeBootHash(): `sha256-${string}` {
	const html = readFileSync('src/app.html', 'utf8');
	const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
	if (!script) throw new Error('src/app.html: theme boot script not found');
	return `sha256-${createHash('sha256').update(script).digest('base64')}`;
}

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
