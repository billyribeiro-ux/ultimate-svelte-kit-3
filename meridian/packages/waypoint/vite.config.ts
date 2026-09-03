import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

/*
 * A LIBRARY'S CONFIG, IN SVELTEKIT 3
 * ==================================
 *
 * `svelte-package` used to read `svelte.config.js` for the preprocessors and
 * the aliases it needed. SvelteKit 3 has no such file, so `@sveltejs/package`
 * 3 asks Vite instead: it calls `resolveConfig()` on this file, finds the
 * `sveltekit()` plugin, and reads its options back. That is why a package with
 * no `src/routes` to speak of still has a `vite.config.ts` with the SvelteKit
 * plugin in it — the plugin *is* the configuration.
 *
 * There is no adapter, because nothing here is ever deployed. `src/routes` is
 * a sandbox page for trying the components while developing them.
 */
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: { runes: true }
		})
	],

	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				// The components and the reactive `Route` class, in a real browser.
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				// The geodesy: pure functions, plain Node.
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
