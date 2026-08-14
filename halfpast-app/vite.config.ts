import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';

/*
 * SvelteKit 3 keeps ALL framework configuration here, inside the `sveltekit()`
 * plugin. There is no `svelte.config.js`.
 */
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes everywhere except node_modules, where a dependency may still be
				// written in legacy Svelte 4 style. Removable in Svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,

				// `await` at the top level of <script>, inside $derived, and directly in
				// markup. Remote functions are promises; this is what lets a component
				// await one without a load function in the middle. Default in Svelte 6.
				experimental: { async: true }
			},

			adapter: adapter(),

			experimental: {
				// `query()`, `query.batch()`, `query.live()`, `command()` and `form()`
				// from `$app/server`. The whole data layer of this app is built on them.
				remoteFunctions: true
			},

			prerender: {
				// A broken internal link fails the build instead of shipping a 404.
				handleHttpError: 'fail',
				handleMissingId: 'fail'
			}
		}),

		/*
		 * MUST come AFTER `sveltekit()`.
		 *
		 * `import { CalendarIcon } from 'phosphor-svelte'` resolves a barrel file
		 * re-exporting thousands of components. Production tree-shakes it, but the dev
		 * server has to crawl every one — turning a cold start into a coffee break.
		 * This rewrites those named imports into deep ones.
		 *
		 * Order matters and the failure is loud: Vite runs `transform` hooks in array
		 * order, and this plugin parses its input as JavaScript. Put it first and it
		 * receives raw `.svelte` source and dies on the first `<h1>`.
		 */
		sveltePhosphorOptimize()
	],

	test: {
		// A test that asserts nothing is a test that cannot fail. Vitest will now
		// treat one as an error rather than a pass.
		expect: { requireAssertions: true },
		projects: [
			{
				// Component tests — a real Chromium, not a DOM emulator. jsdom quietly
				// lies about layout, focus and `matchMedia`, which are exactly the things
				// a booking UI needs to get right.
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
				// Pure logic — plain Node, no browser, fast. The time engine and the
				// booking rules live here, and they are the tests that matter most.
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
