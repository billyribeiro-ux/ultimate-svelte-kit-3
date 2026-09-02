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
 *   3. generates one manifest per function with `builder.generateManifest`;
 *   4. bundles its own runtime — `files/` — together with the server, so a
 *      deployment needs only the production dependencies;
 *   5. wires `instrumentation.server.js` in front of the entrypoint, so tracing
 *      is set up before any application code runs.
 *
 * Everything after step 2 is about *this* adapter. Everything up to it is
 * every adapter.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { partition } from './partition.js';

const files = fileURLToPath(new URL('./files', import.meta.url).href);
const partition_path = fileURLToPath(new URL('./partition.js', import.meta.url).href);

/** @param {string} str */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @typedef {object} Options
 * @property {string} [out] where the deployable program is written. Default `build`.
 * @property {boolean} [precompress] write `.gz` and `.br` beside every asset. Default `true`.
 */

/**
 * @param {Options} [options]
 * @returns {import('@sveltejs/kit').Adapter}
 */
export default function ostinato({ out = 'build', precompress = true } = {}) {
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
			 * function gets a manifest that knows *only* its own routes.
			 *
			 * The third manifest has no routes at all. A `Server` built from it can
			 * still run the hooks — and when `reroute` changes the path of a request
			 * it received, SvelteKit sets an `x-sveltekit-rerouted-url` header on the
			 * response, which is what `applyReroute` reads in `files/handler.js`.
			 */
			const split = partition(builder.routes);
			builder.log.info(
				`pages: ${split.pages.length} routes · api: ${split.api.length} routes · ` +
					`${split.prerendered.length} prerendered`
			);

			const server = builder.getServerDirectory();
			const manifest = (/** @type {typeof split.pages} */ routes) =>
				`export const manifest = ${builder.generateManifest({ relativePath: './', routes })};`;

			writeFileSync(`${server}/manifest-pages.js`, manifest(split.pages));
			writeFileSync(`${server}/manifest-api.js`, manifest(split.api));
			writeFileSync(`${server}/manifest-router.js`, manifest([]));

			/*
			 * What the runtime needs to know that only the build knows: the origin
			 * baked in for CSRF, which paths are prerendered files, and the route
			 * patterns each function answers to — as regex sources, because a RegExp
			 * does not survive `JSON.stringify` and a string does.
			 */
			writeFileSync(
				`${server}/entries.js`,
				[
					`export const origin = ${JSON.stringify(builder.config.paths.origin || null)};`,
					`export const base = ${JSON.stringify(builder.config.paths.base)};`,
					`export const appDir = ${JSON.stringify(builder.config.appDir)};`,
					`export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
					`export const patterns = ${JSON.stringify({
						pages: split.pages.map((route) => route.pattern.source),
						api: split.api.map((route) => route.pattern.source)
					})};`,
					`export const precompress = ${JSON.stringify(precompress)};`
				].join('\n')
			);

			builder.log.minor('Building server');

			// Copy the runtime beside the server output, then bundle the two together
			// so that shared modules exist once.
			const entries = `${tmp}/entries`.replace(/\\/g, '/');
			builder.copy(files, entries);

			/** @type {Record<string, string>} */
			const input = {
				index: `${entries}/index.js`,
				handler: `${entries}/handler.js`
			};

			if (builder.hasServerInstrumentationFile()) {
				input['instrumentation.server'] = `${server}/instrumentation.server.js`;
			}

			const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

			const bundle = await rolldown({
				input,
				external: [
					// Production dependencies stay external; they are installed on the
					// target. Everything else — including this adapter's own `sirv` — is
					// bundled in, which is what lets `build/` run with `pnpm install --prod`.
					...Object.keys(pkg.dependencies || {}).map(
						(d) => new RegExp(`^${escapeRegex(d)}(\\/.*)?$`)
					),
					// The SvelteKit runtime and `instrumentation.server.js` must share one
					// copy of the OpenTelemetry API, or the spans go to two different worlds.
					/^@opentelemetry\/api(\/.*)?$/
				],
				platform: 'node',
				resolve: { conditionNames: ['node'] },
				plugins: [
					{
						// The runtime imports these by name; they exist only after the build.
						name: 'adapter-ostinato:resolve-app',
						resolveId(id) {
							if (id === 'SERVER') return `${server}/index.js`;
							if (id === 'MANIFEST_PAGES') return `${server}/manifest-pages.js`;
							if (id === 'MANIFEST_API') return `${server}/manifest-api.js`;
							if (id === 'MANIFEST_ROUTER') return `${server}/manifest-router.js`;
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
				 * chunk under `server/chunks/` it would report that folder instead, and
				 * every static file would 404.
				 */
				codeSplitting: { groups: [{ name: 'dir', test: `${entries}/dir.js` }] },
				chunkFileNames: (chunk) =>
					chunk.name === 'dir' ? '[name].js' : 'server/chunks/[name]-[hash].js'
			});

			/*
			 * `builder.instrument` renames `index.js` to `start.js` and writes a new
			 * `index.js` that imports the instrumentation file and *then* dynamically
			 * imports `start.js`. That order is the whole feature: an OpenTelemetry
			 * SDK has to be registered before the modules it patches are loaded.
			 */
			if (builder.hasServerInstrumentationFile()) {
				builder.instrument({
					entrypoint: `${out}/index.js`,
					instrumentation: `${out}/instrumentation.server.js`,
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
		 * ADAPTER-PROVIDED VITE PLUGINS (SvelteKit 3.0.0-next.18)
		 * -------------------------------------------------------
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
								`export const entries = ['pages', 'api', 'router'];`,
								`export const precompress = ${JSON.stringify(precompress)};`
							].join('\n');
						}
					}
				]
			}
		}
	};
}
