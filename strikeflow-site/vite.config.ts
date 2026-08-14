import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';

/*
 * SvelteKit 3 puts ALL framework configuration here, inside the `sveltekit()` plugin.
 * There is no `svelte.config.js` any more.
 *
 * That's not cosmetic. In SvelteKit 2 the Vite plugin had to asynchronously load your
 * config file before it could do anything, which made a whole class of setup ordering
 * problems possible. Now Vite hands the config straight to the plugin. Everything that
 * used to live under `kit.*` is a top-level option here.
 */
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode everywhere except node_modules, where a dependency may
				// still be written in legacy Svelte 4 style. Removable in Svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,

				// Lets us `await` at the top level of a <script>, inside $derived, and
				// directly in markup. Required for remote functions to be awaited in
				// components. Becomes the default in Svelte 6.
				experimental: { async: true }
			},

			adapter: adapter(),

			experimental: {
				// Enables `query()`, `form()` and `command()` from `$app/server` —
				// the type-safe client/server bridge we use for the ebook signup.
				remoteFunctions: true
			},

			prerender: {
				// Fail the build on a broken internal link rather than shipping a 404.
				// A dead link is the cheapest SEO bug to prevent and the most annoying
				// to discover in Search Console two months later.
				handleHttpError: 'fail',
				handleMissingId: 'fail'
			}
		}),

		/*
		 * MUST come AFTER `sveltekit()`.
		 *
		 * `import { PulseIcon } from 'phosphor-svelte'` reads nicely but resolves a
		 * barrel file re-exporting roughly nine thousand components. Production builds
		 * tree-shake it, but the dev server has to crawl every one of those modules —
		 * which turns a cold start into a coffee break.
		 *
		 * This plugin rewrites those named imports into deep ones
		 * (`phosphor-svelte/lib/PulseIcon.svelte`). You write the readable version; the
		 * bundler gets the fast one.
		 *
		 * The ordering matters and the failure is loud: Vite runs `transform` hooks in
		 * array order, and this plugin parses its input as JavaScript. Put it first and
		 * it receives raw `.svelte` source — markup and all — and dies on the first
		 * `<h1>` with "Unexpected JSX expression". Placed here, it sees the compiled
		 * JavaScript the Svelte plugin produced, where the imports still exist.
		 */
		sveltePhosphorOptimize()
	],

	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				// Component tests — run in a real Chromium, not a DOM emulator.
				// Worth the extra seconds: jsdom quietly lies about layout and focus,
				// which are exactly the things a component test should verify.
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
				// Pure logic tests — plain Node, no browser, fast.
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
});
