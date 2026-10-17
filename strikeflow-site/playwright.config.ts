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

	webServer: [
		{
			command: 'pnpm run build && pnpm run preview',
			port: 4173,
			// Building takes a moment; the default 60s is tight on a cold cache.
			timeout: 180_000,

			/*
			 * Deliberately NOT `reuseExistingServer: !process.env.CI`, which is the
			 * common default.
			 *
			 * Reusing a server you happen to have running is faster, and it means the
			 * suite can silently test a build from twenty minutes ago. That bit me while
			 * writing this project: a motion test failed, I spent time diagnosing the
			 * code, and the code was fine — the server was stale.
			 *
			 * A test suite that can pass or fail against the wrong build is worse than a
			 * slow one, because it makes every result untrustworthy. Always build fresh.
			 */
			reuseExistingServer: false
		},
		{
			/*
			 * A second server over the SAME build, with the lead store pointed at a
			 * file where it expects a directory. Every signup then fails for real —
			 * `ENOTDIR` from the file system, not a mock — which is the only honest
			 * way to test what a visitor sees when the server breaks.
			 *
			 * Only `e2e/failure.e2e.ts` talks to this port, so the server above stays
			 * healthy for everything else. Playwright starts web servers one after
			 * another, so this one starts after the build above has finished.
			 */
			command: 'pnpm exec vite preview --port 4174 --strictPort',
			port: 4174,
			env: { LEADS_DIR: 'package.json' },
			reuseExistingServer: false
		}
	],

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
	// than retrying and hiding a real bug. That holds in CI as much as locally, so
	// there are no retries anywhere.
	retries: 0,
	reporter: process.env.CI ? 'github' : 'list'
});
