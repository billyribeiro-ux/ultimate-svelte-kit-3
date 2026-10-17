/**
 * ADAPTER-OSTINATO
 * ================
 *
 * A SvelteKit adapter, written for this project so that the course can show
 * what one *is*: the thing that takes SvelteKit's build output and turns it
 * into a program for a particular place. This one targets a plain Node
 * process, like `@sveltejs/adapter-node`, and is smaller than it in every way
 * that does not matter and one that does: it deploys the app as two functions
 * and a catch-all, and joins them with `applyReroute`.
 *
 * WHAT AN ADAPTER DOES, IN ORDER
 * ------------------------------
 *   1. clears its output directory;
 *   2. writes the client assets, the prerendered pages and the server code
 *      with `builder.writeClient`, `writePrerendered` and `writeServer` (the
 *      last one implicitly, through `getServerDirectory()`);
 *   3. generates one server instance per function with
 *      `builder.generateServerInstance` — a module exporting a ready-made
 *      `server` whose manifest knows only that function's routes;
 *   4. bundles each function on its own, and its runtime — `files/` — once
 *      more beside them, so a deployment needs only the production
 *      dependencies;
 *   5. wires `instrumentation.server.js` in front of the entrypoint, so tracing
 *      is set up before any application code runs.
 *
 * Steps 1 to 4 are what every adapter does, in the order SvelteKit's guide
 * to writing one gives them: clear, write, generate a server, bundle. What is
 * *this* adapter is the plural in 3 and 4 — a server and a bundle for each
 * function — and step 5, which only an adapter that runs
 * `instrumentation.server.js` needs.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { partition } from './partition.js';

const files = fileURLToPath(new URL('./files', import.meta.url).href);

/** The three deployables, in the order `files/handler.js` tries them. */
const FUNCTIONS = /** @type {const} */ (['pages', 'api', 'router']);
const partition_path = fileURLToPath(new URL('./partition.js', import.meta.url).href);

/** @param {string} str */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @typedef {object} Options
 * @property {string} [out] where the deployable program is written. Default `build`.
 * @property {boolean} [precompress] write `.gz` and `.br` beside every asset. Default `true`.
 * @property {Record<string, string>} [headers] response headers for every file the runtime
 *   serves itself — assets and prerendered pages, which no hook ever sees. Default none.
 */

/**
 * @param {Options} [options]
 * @returns {import('@sveltejs/kit').Adapter}
 */
export default function ostinato({ out = 'build', precompress = true, headers = {} } = {}) {
	const startedAt = Date.now();

	return {
		name: 'adapter-ostinato',

		async adapt(builder) {
			const tmp = builder.getBuildDirectory('adapter-ostinato');

			rmSync(out, { force: true, recursive: true });
			rmSync(tmp, { force: true, recursive: true });
			mkdirSync(tmp, { recursive: true });

			builder.log.minor('Copying assets');
			builder.writeClient(`${out}/client${builder.config.paths.base}`);
			builder.writePrerendered(`${out}/prerendered${builder.config.paths.base}`);

			if (precompress) {
				builder.log.minor('Compressing assets');
				await Promise.all([
					builder.compress(`${out}/client`),
					builder.compress(`${out}/prerendered`)
				]);
			}

			/*
			 * THE SPLIT
			 * ---------
			 * `builder.routes` is every route with its pattern and its prerender
			 * setting. `partition` decides which function owns which, and each
			 * function gets a server whose manifest knows *only* its own routes.
			 *
			 * `generateServerInstance` writes a whole module — the manifest, the
			 * import of the runtime, and `export const server`, already constructed.
			 * SvelteKit 3.0 replaced `generateManifest` with it, and the difference is
			 * what the adapter gets to see: a manifest string to pair with a `Server`
			 * class before, and no server manifest at all now. The shape of one is
			 * SvelteKit's business, and an adapter that read it would break on the
			 * next change to it; `routes` is still the hook for a subset, and
			 * `builder.manifest` is there for an adapter that wants `$app/manifest`'s
			 * list of the app's files.
			 *
			 * The third server has no routes at all. It can still run the hooks — and
			 * when `reroute` changes the path of a request it received, SvelteKit sets
			 * an `x-sveltekit-rerouted-url` header on the response, which is what
			 * `applyReroute` reads in `files/handler.js`.
			 */
			const split = partition(builder.routes);
			builder.log.info(
				`pages: ${split.pages.length} routes · api: ${split.api.length} routes · ` +
					`${split.prerendered.length} prerendered`
			);

			const server = builder.getServerDirectory();
			builder.generateServerInstance(`${server}/server-pages.js`, { routes: split.pages });
			builder.generateServerInstance(`${server}/server-api.js`, { routes: split.api });
			builder.generateServerInstance(`${server}/server-router.js`, { routes: [] });

			/*
			 * What the runtime needs to know that only the build knows: the origin
			 * baked in for CSRF, which paths are prerendered files, the route
			 * patterns each function answers to — as regex sources, because a RegExp
			 * does not survive `JSON.stringify` and a string does — and the headers
			 * the files it serves itself must carry.
			 */
			writeFileSync(
				`${server}/entries.js`,
				[
					`export const origin = ${JSON.stringify(builder.config.paths.origin || null)};`,
					`export const base = ${JSON.stringify(builder.config.paths.base)};`,
					`export const appDir = ${JSON.stringify(builder.config.appDir)};`,
					`export const functions = ${JSON.stringify(FUNCTIONS)};`,
					`export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
					`export const patterns = ${JSON.stringify({
						pages: split.pages.map((route) => route.pattern.source),
						api: split.api.map((route) => route.pattern.source)
					})};`,
					`export const precompress = ${JSON.stringify(precompress)};`,
					`export const headers = ${JSON.stringify(headers)};`
				].join('\n')
			);

			builder.log.minor('Building server');

			const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

			/*
			 * Production dependencies stay external; they are installed on the
			 * target. Everything else — including this adapter's own `sirv` — is
			 * bundled in, which is what lets `build/` run with `pnpm install --prod`.
			 * The SvelteKit runtime and `instrumentation.server.js` must share one
			 * copy of the OpenTelemetry API, or the spans go to two different worlds.
			 */
			const external = [
				...Object.keys(pkg.dependencies || {}).map(
					(d) => new RegExp(`^${escapeRegex(d)}(\\/.*)?$`)
				),
				/^@opentelemetry\/api(\/.*)?$/
			];

			/*
			 * ONE BUNDLE PER FUNCTION
			 * -----------------------
			 * SvelteKit 3 configures a server as *module-level* state: `server.init`
			 * writes the manifest into the runtime that `server.respond` reads, and
			 * one module graph holds exactly one of them. Put three servers in one
			 * bundle and the last `init` wins — every route answers 404, from the
			 * right function, which is how this was found. (SvelteKit 2's `Server`
			 * class kept its manifest on the instance, so the first version of this
			 * adapter shared one bundle; 3.0 took that away along with the class.)
			 *
			 * So each function is bundled on its own, with its own copy of the app
			 * and of the runtime, and the process imports the three results by path.
			 * Bigger than one bundle, and also the truth: on a real multi-function
			 * platform a function *is* its own deployment, and nothing it keeps in a
			 * module variable is visible to its neighbours. `lib/server/tracing.ts`
			 * says what that cost the span ring.
			 */
			for (const fn of FUNCTIONS) {
				const bundle = await rolldown({
					input: { index: `${server}/server-${fn}.js` },
					external,
					platform: 'node',
					resolve: { conditionNames: ['node'] }
				});
				await bundle.write({
					dir: `${out}/functions/${fn}`,
					format: 'esm',
					sourcemap: true,
					chunkFileNames: 'chunks/[name]-[hash].js'
				});
			}

			/*
			 * THE PROCESS
			 * -----------
			 * `files/` is the HTTP server and the dispatcher, bundled once more on
			 * its own. The three functions are not in this bundle at all: `handler.js`
			 * loads `functions/<name>/index.js` with a dynamic `import()` of a path it
			 * computes from `dir.js` when the process starts, and a bundler leaves a
			 * computed path alone. That is the whole reason their module graphs stay
			 * apart — and why the list of names travels through `entries.js` rather
			 * than being spelled twice.
			 */
			const entries = `${tmp}/entries`.replace(/\\/g, '/');
			builder.copy(files, entries);

			/** @type {Record<string, string>} */
			const input = {
				index: `${entries}/index.js`,
				handler: `${entries}/handler.js`
			};

			/*
			 * INSTRUMENTATION, PART ONE: THE INITIALIZER
			 * ------------------------------------------
			 * Since 3.0 the environment variables are populated *before*
			 * `instrumentation.server.js` runs, so that an exporter can read its
			 * endpoint from `$app/env/private` like any other module. The code that
			 * does the populating is generated here by
			 * `createInstrumentationInitializer`, and it goes through the same
			 * bundling step as the file it serves: it imports the runtime's `env.js`,
			 * and the two must end up sharing one copy of that module or the
			 * initializer would fill in an environment nobody reads. Hence an entry
			 * of its own, and `initializer` pointing at the *bundled* file when
			 * `instrument` runs below.
			 */
			let initializer = null;
			if (builder.hasServerInstrumentationFile()) {
				input['instrumentation.server'] = `${server}/instrumentation.server.js`;
				input['env-init'] = builder.createInstrumentationInitializer({ outputDirectory: tmp });
				initializer = `${out}/env-init.js`;
			}

			const bundle = await rolldown({
				input,
				external,
				platform: 'node',
				resolve: { conditionNames: ['node'] },
				plugins: [
					{
						// The runtime imports these by name; they exist only after the build.
						name: 'adapter-ostinato:resolve-app',
						resolveId(id) {
							if (id === 'ENTRIES') return `${server}/entries.js`;
							// The runtime shares `pick` with the build step; it lives beside
							// this file, not beside the copied runtime.
							if (id === 'PARTITION') return partition_path;
							return null;
						}
					}
				]
			});

			await bundle.write({
				dir: out,
				format: 'esm',
				sourcemap: true,
				/*
				 * `dir.js` must land at the top of `build/`, on its own, because it
				 * computes the build directory from its *own* location. Bundled into a
				 * chunk under `chunks/` it would report that folder instead, and every
				 * static file — and every function — would be looked for in the wrong
				 * place. Nothing else gets a promise about where it lands: `handler.js`
				 * is an entry and *still* ends up mostly in a chunk, because `index.js`
				 * imports it and a bundler puts shared code in one place. Which is why
				 * everything that needs a location asks `dir.js` for it.
				 */
				codeSplitting: { groups: [{ name: 'dir', test: `${entries}/dir.js` }] },
				chunkFileNames: (chunk) => (chunk.name === 'dir' ? '[name].js' : 'chunks/[name]-[hash].js')
			});

			/*
			 * INSTRUMENTATION, PART TWO: THE FACADE
			 * -------------------------------------
			 * `builder.instrument` renames `index.js` to `start.js` and writes a new
			 * `index.js` that imports the initializer, then the instrumentation file,
			 * and *then* dynamically imports `start.js`. That order is the whole
			 * feature: an OpenTelemetry SDK has to be registered before the modules
			 * it patches are loaded, and the environment has to exist before the SDK
			 * asks for it.
			 */
			if (initializer) {
				builder.instrument({
					entrypoint: `${out}/index.js`,
					instrumentation: `${out}/instrumentation.server.js`,
					initializer,
					module: { exports: ['server', 'host', 'port'] }
				});
			}
		},

		/**
		 * During `vite dev`, `vite build` and `vite preview` there is no adapter
		 * runtime, so `event.platform` would be `undefined` and every read of it
		 * would need a guard. The emulator fills it in with the same shape the
		 * runtime produces, marked so a page can say which it is looking at.
		 */
		emulate() {
			return {
				platform: () => ({ adapter: 'adapter-ostinato (emulated)', entry: 'pages', startedAt })
			};
		},

		supports: {
			// `read()` from `$app/server` works: the runtime streams files from `client/`.
			read: () => true,
			// `instrumentation.server.js` is loaded before the app — see `builder.instrument` above.
			instrumentation: () => true
		},

		/*
		 * ADAPTER-PROVIDED VITE PLUGINS
		 * -----------------------------
		 * An adapter can contribute Vite plugins, placed before (`pre`) or after
		 * (`post`) SvelteKit's own. This one provides a virtual module so that the
		 * app can say which adapter built it without hard-coding the name — the
		 * diagnostics page imports it. `pre`, because a module that other modules
		 * import has to be resolvable before SvelteKit's plugins start asking.
		 */
		vite: {
			plugins: {
				pre: [
					{
						name: 'adapter-ostinato:virtual-module',
						resolveId(id) {
							return id === 'virtual:adapter' ? '\0virtual:adapter' : null;
						},
						load(id) {
							if (id !== '\0virtual:adapter') return null;
							return [
								`export const name = 'adapter-ostinato';`,
								`export const entries = ${JSON.stringify(FUNCTIONS)};`,
								`export const precompress = ${JSON.stringify(precompress)};`
							].join('\n');
						}
					}
				]
			}
		}
	};
}
