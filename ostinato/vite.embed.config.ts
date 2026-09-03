import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * THE STANDALONE PLAYER
 * =====================
 *
 * A second Vite build, without SvelteKit, that turns `src/lib/embed` into one
 * file: `static/embed/ostinato-player.js`. A host page includes it with a
 * `<script>` tag and writes `<ostinato-player pattern="…">`.
 *
 * One file, an IIFE, no chunks — the opposite of the app's `bundleStrategy:
 * 'split'`, because a host page cannot resolve our chunk names. The Svelte
 * runtime is bundled in; a page that embeds a player should not need to know
 * what it was written with.
 *
 * SvelteKit copies `static/` into the build, so the app serves the result at
 * `/embed/ostinato-player.js` with the same caching as everything else.
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
			name: 'Ostinato',
			fileName: () => 'ostinato-player.js'
		},
		outDir: 'static/embed',
		emptyOutDir: true,
		// A player is not a page; nobody wants a source map for it on a host site.
		sourcemap: false
	}
});
