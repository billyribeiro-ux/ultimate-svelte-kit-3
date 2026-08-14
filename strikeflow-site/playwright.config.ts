import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end test configuration.
 *
 * These run against a real production build in a real browser — not a dev server and
 * not a DOM emulator. That matters here: prerendering, the CSRF origin check and the
 * remote form's progressive enhancement all behave differently in a production build,
 * and those are exactly the things worth testing.
 */
export default defineConfig({
	testMatch: '**/*.e2e.{ts,js}',

	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		// Building takes a moment; the default 60s is tight on a cold cache.
		timeout: 180_000,
		reuseExistingServer: !process.env.CI
	},

	use: {
		baseURL: 'http://localhost:4173',
		// Only kept for failures — traces are large and mostly uninteresting when green.
		trace: 'retain-on-failure'
	},

	/*
	 * Two projects, because "works on desktop" and "works on a phone" are genuinely
	 * different claims and this site is built mobile-first. The mobile project uses a
	 * real device profile — touch events, viewport, and user agent — so the hover
	 * guards and the drawer are exercised the way a phone would exercise them.
	 */
	projects: [
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile',
			use: { ...devices['Pixel 7'] }
		}
	],

	// A failing e2e test is almost never flaky in this project — fail fast rather
	// than retrying and hiding a real bug.
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list'
});
