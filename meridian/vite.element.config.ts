import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * THE STANDALONE ELEMENT
 * ======================
 *
 * A second Vite build, without SvelteKit, that turns `src/lib/embed` into one
 * file: `static/embed/meridian-route.js`. A host page includes it with a
 * `<script>` tag and writes `<meridian-route slug="…" origin="…">`.
 *
 * One file, an IIFE, no chunks — the opposite of the app's `bundleStrategy:
 * 'split'`, because a host page cannot resolve our chunk names. The Svelte
 * runtime is bundled in; a page that embeds a route should not need to know
 * what it was written with.
 *
 * SvelteKit copies `static/` into the build, so the app serves the result at
 * `/embed/meridian-route.js` with the same caching as everything else. The
 * `build` script runs this first (see `package.json`).
 */
export default defineConfig({
	plugins: [
		svelte({
			compilerOptions: {
				customElement: true,
				runes: true,
				experimental: { async: true }
			}
		})
	],
	build: {
		lib: {
			entry: 'src/lib/embed/element.ts',
			formats: ['iife'],
			name: 'Meridian',
			fileName: () => 'meridian-route.js'
		},
		outDir: 'static/embed',
		emptyOutDir: true,
		sourcemap: false
	}
});
