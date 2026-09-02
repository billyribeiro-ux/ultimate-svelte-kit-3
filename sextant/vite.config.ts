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
				 * headers, assuming `https` with no `PROTOCOL_HEADER` configured. A
				 * server on plain HTTP then computes `https://localhost:4173`, the
				 * browser sends `http://localhost:4173`, and every POST comes back
				 * `403 {"message":"Cross-site remote requests are forbidden"}` from an
				 * application whose GET requests all work perfectly.
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
					 * This application is mostly "run a query, wait, draw the answer", and
					 * the honest expression of that is an `await` inside a
					 * `<svelte:boundary>` with a `pending` snippet — not a `loading`
					 * boolean threaded through four components. It is also what makes
					 * `getAbortSignal()` usable, which is how a query is cancelled when
					 * the time range moves under it.
					 */
					experimental: { async: true }
				},

				adapter: adapter(),

				experimental: {
					// `query()`, `query.batch()`, `query.live()`, `command()` and `form()`
					// from `$app/server`. `query.batch` matters here more than in most
					// applications: a results table draws one sparkline per row.
					remoteFunctions: true,

					/*
					 * FORKED PRELOADS: OFF, AND MEASURED RATHER THAN ASSUMED.
					 *
					 * The feature preloads the next route inside a Svelte *fork* — the
					 * framework speculatively runs the new page's state without committing
					 * it, then adopts the result or throws it away. It is exactly what this
					 * application wants in principle: navigating to a trace starts a remote
					 * query, and without forking an abandoned preload leaves that query
					 * running against the database.
					 *
					 * It was turned on, and the end-to-end suite found it. Opening a trace
					 * from the traces list on the phone profile fails intermittently: the
					 * remote `trace` query comes back as a bare `Bad Request` and the page
					 * renders its error branch, while loading the same URL directly always
					 * works. The bisect is unambiguous — three runs on, three failures;
					 * three runs off, three passes; nothing else changed.
					 *
					 * So it is off. A preload is a latency optimisation; a page that fails
					 * to load one time in three is not a trade worth making, and shipping
					 * an experimental flag because it sounded right is how a rare bug gets
					 * blamed on the database for a month. Worth revisiting when the flag
					 * settles — with the same test as the acceptance criterion.
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
				 * The last line of defence for a product whose pages are made of other
				 * people's logs. Everything upstream — the projection in `storage.ts`,
				 * the escaping Svelte does, the fact that log bodies are rendered as
				 * text — already stops a log line from becoming a script. A CSP is what
				 * stands there when one of those is wrong.
				 *
				 * `mode: 'auto'`, and the reason is a bug the end-to-end test found.
				 *
				 * `'hash'` was the first choice, on the argument that hashes are fixed at
				 * build time while nonces are per-response and make a page uncacheable.
				 * That argument is sound and does not apply here, which is the sort of
				 * thing only a test notices. This application **streams**: a page renders
				 * its shell, and each `await` in markup resolves later by appending a
				 * `<script>__sveltekit_….resolve(1, …)</script>` to the response body.
				 * Those scripts are generated *after* the header has been sent, so no
				 * hash for them can possibly be in it — and the browser blocks every one,
				 * which means every streamed result silently never arrives.
				 *
				 * `'auto'` is the answer SvelteKit already has: hashes for prerendered
				 * pages, where the whole document is known at build time, and nonces for
				 * dynamically rendered ones, where it is not. The cacheability argument
				 * costs nothing here, because these pages carry `Vary: Cookie` and are
				 * per-tenant — a shared cache was never going to hold them.
				 *
				 * Svelte 5.57 types the hash half: `Sha256Source`, a template literal
				 * type of `sha256-${string}` from `svelte/server`. `src/lib/security
				 * /csp.ts` uses it so the policy's shape is checked by the compiler and a
				 * unit test rather than by reading the header and squinting.
				 *
				 * DIRECTIVE BY DIRECTIVE, BECAUSE EACH ONE IS A DECISION
				 * ------------------------------------------------------
				 *   `default-src 'self'`   nothing loads from anywhere else by default.
				 *   `script-src 'self'`    plus the hashes SvelteKit adds. No `unsafe-
				 *                          inline`, which is the directive that makes the
				 *                          whole policy decorative.
				 *   `style-src` with `'unsafe-inline'` — and this one is a genuine
				 *                          compromise, not an oversight. Svelte writes
				 *                          `style="..."` attributes for the virtualizer's
				 *                          transforms and the waterfall's bar widths,
				 *                          recomputed per frame; hashing them is not
				 *                          possible and a nonce does not apply to
				 *                          attributes. The exposure is CSS injection,
				 *                          which is real but is not script execution.
				 *   `img-src` with `data:` for the canvas charts, which read themselves
				 *                          back as data URLs for the "copy as image".
				 *   `font-src` with `data:` — found by the end-to-end test rather than
				 *                          by reasoning. Vite inlines any asset under
				 *                          `assetsInlineLimit` (4KB), and one JetBrains
				 *                          Mono subset is under it, so the built
				 *                          stylesheet carries a `src:url(data:font/woff2
				 *                          ;base64,…)`. With `font-src 'self'` the
				 *                          browser blocks it and the monospace column of
				 *                          every log line falls back — silently, because
				 *                          a blocked font is a console message nobody is
				 *                          watching in production.
				 *   `connect-src 'self'`   the tail stream and remote functions, and
				 *                          nothing else — so an injected script cannot
				 *                          exfiltrate a query result to another host.
				 *   `frame-ancestors 'none'` and `object-src 'none'`: this application is
				 *                          never framed and has no plugins.
				 *   `base-uri 'self'`      stops an injected `<base>` from repointing
				 *                          every relative URL on the page.
				 */
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:'],
						'font-src': ['self', 'data:'],
						'connect-src': ['self'],
						'form-action': ['self'],
						'frame-ancestors': ['none'],
						'object-src': ['none'],
						'base-uri': ['self']
					}
				}
			}),

			/*
			 * MUST come AFTER `sveltekit()`.
			 *
			 * `import { ChartLineIcon } from 'phosphor-svelte'` resolves a barrel file
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
					 * Component tests — a real Chromium, not a DOM emulator.
					 *
					 * Non-negotiable here. The virtualizer measures rows with
					 * `getBoundingClientRect()`, and jsdom has no layout: every element is
					 * 0×0, so a virtualizer under jsdom renders zero rows and passes every
					 * assertion you thought to write.
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
					// Pure logic — plain Node, no browser, fast. The query language, the
					// sketches and the downsampler live here, and these are the tests that
					// matter most.
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],

						/*
						 * One file at a time.
						 *
						 * SQLite allows exactly one writer. `ingest.spec.ts` and
						 * `storage.spec.ts` both seed real rows, and run in parallel they
						 * meet `SQLITE_BUSY` — which surfaces as a dozen unrelated
						 * assertions failing at random, in whichever file lost the race.
						 *
						 * WAL and a busy timeout (see `db/index.ts`) make the *application*
						 * tolerate concurrent writers, and are worth having for their own
						 * sake. They do not make a test suite deterministic, because a
						 * timeout that is long enough is still a race. Serialising the files
						 * costs about two seconds and removes the whole class.
						 */
						fileParallelism: false
					}
				}
			]
		}
	};
});
