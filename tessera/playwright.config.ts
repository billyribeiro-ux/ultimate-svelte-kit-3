import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

/**
 * End-to-end tests, against a real production build.
 *
 * Not the dev server. The dev server has different module resolution, no
 * minification and no adapter, and half the interesting deployment bugs only
 * exist in the built artefact — a native module that cannot be bundled, an
 * environment variable substituted at build time.
 *
 * That last one matters here more than usual. `PUBLIC_ORIGIN` is `static: true`,
 * so it is inlined during `vite build`; it has to be in the environment of the
 * *build*, not just the run. The `webServer.command` below does both, which is
 * why it is a compound command rather than a bare `node build/index.js`.
 */
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',

	webServer: {
		command: 'npm run build && node build/index.js',
		port: PORT,
		env: {
			DATABASE_URL: 'file:e2e.db',
			PUBLIC_ORIGIN: ORIGIN,
			BETTER_AUTH_SECRET: 'e2e-secret-not-used-for-anything-real-000000',
			PORT: String(PORT)
		},

		/*
		 * Never reuse a server that is already running.
		 *
		 * It saves fifteen seconds and it means a suite can pass against a build
		 * from twenty minutes ago while the code under test has changed underneath
		 * it. That happened in an earlier project in this series and cost an hour.
		 */
		reuseExistingServer: false,
		timeout: 180_000,

		// Playwright swallows server output by default, so a 500 in a test looks
		// like "the page said Internal Error" with the explanation in a stdout
		// nobody is reading.
		stdout: 'pipe',
		stderr: 'pipe'
	},

	use: {
		baseURL: ORIGIN,
		locale: 'en-GB',
		timezoneId: 'Europe/London',
		trace: 'retain-on-failure'
	},

	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,

	/*
	 * One worker.
	 *
	 * Every test shares one seeded board, and several of them assert on its
	 * contents. Running them in parallel means one test's new shape appears in
	 * another's count, and the suite fails while the application behaves
	 * perfectly. The concurrency that actually matters — two replicas editing at
	 * once — is exercised inside a single test in `collaboration.e2e.ts`, which is
	 * the right level to test it at.
	 */
	workers: 1,

	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{
			// A real phone profile, not a narrow window. Touch targets, device pixel
			// ratio and pointer type all differ, and a canvas cares about all three.
			name: 'mobile',
			use: { ...devices['Pixel 7'] }
		}
	]
});
