import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

/**
 * End-to-end tests, against a real production build.
 *
 * Not the dev server. The dev server has different module resolution, no
 * minification, no adapter, and it will happily run code that the real build
 * externalises or drops. Half the interesting deployment bugs — a native module
 * that cannot be bundled, an environment variable that is validated at boot —
 * only exist in the built artefact, so that is what gets tested.
 */
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',

	/*
	 * `ORIGIN` must match the URL the tests actually use.
	 *
	 * SvelteKit refuses cross-site form POSTs by comparing the request's `Origin`
	 * header against the origin it believes it is serving from. Point the server
	 * at :5173 and drive it on :4173 and every form submission is a 403 — which
	 * looks like a broken app and is in fact the CSRF protection doing its job.
	 */
	webServer: {
		command: 'npm run build && node build/index.js',
		port: PORT,
		env: {
			DATABASE_URL: 'file:e2e.db',
			ORIGIN,
			PUBLIC_ORIGIN: ORIGIN,
			PUBLIC_DEFAULT_TIME_ZONE: 'Europe/London',
			BETTER_AUTH_SECRET: 'e2e-secret-not-used-for-anything-real-0000',
			PORT: String(PORT)
		},
		/*
		 * Never reuse a server that is already running.
		 *
		 * It is tempting — it saves fifteen seconds — and it means a suite can pass
		 * against a build from twenty minutes ago while the code under test has
		 * changed underneath it. That happened in the previous project in this
		 * series and cost an hour of confusion.
		 */
		reuseExistingServer: false,
		timeout: 120_000,

		/*
		 * Show the server's output.
		 *
		 * Playwright swallows it by default, which means a 500 in a test looks like
		 * "the page said Internal Error" with no stack trace anywhere — and the
		 * `handleError` hook has already written the explanation to a stdout nobody
		 * is reading. Piping it turns a guessing game into a log line.
		 */
		stdout: 'pipe',
		stderr: 'pipe'
	},

	use: {
		baseURL: ORIGIN,

		/*
		 * Pin the browser's clock settings.
		 *
		 * A headless browser reports whatever the machine is set to, which in CI is
		 * UTC. This app converts every time into the viewer's zone, so an unpinned
		 * browser makes "book the 09:00" assert against "08:00" locally and "09:00"
		 * on a developer's laptop in London — a test that fails depending on where
		 * you are standing. Pinning it to the studio's own zone makes the assertions
		 * read the way a person would say them; a separate test overrides it to
		 * check the cross-zone behaviour deliberately.
		 */
		timezoneId: 'Europe/London',
		locale: 'en-GB',

		// A trace for anything that failed, so a CI failure is debuggable without
		// trying to reproduce it locally.
		trace: 'retain-on-failure'
	},

	// Fail the build if somebody leaves a `test.only` in.
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,

	/*
	 * One worker, deliberately.
	 *
	 * Every test shares one seeded diary, and the app's whole purpose is that two
	 * people cannot hold the same slot. Run the desktop and mobile projects in
	 * parallel and they race for the same 09:00 — one wins, the other gets
	 * "That time is no longer available", and the suite fails while the
	 * application behaves perfectly. That is a test-harness problem masquerading
	 * as a bug, and chasing it wastes an afternoon.
	 *
	 * The app's concurrency safety is proven properly in `scheduling.spec.ts`,
	 * where ten simultaneous requests fight over one slot and exactly one wins.
	 * That is the right level to test a race at; end-to-end is the wrong one.
	 */
	workers: 1,

	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{
			// A real phone profile, not a narrow desktop window. Touch targets,
			// device pixel ratio and viewport all differ, and this app is used
			// standing up more often than sitting down.
			name: 'mobile',
			use: { ...devices['Pixel 7'] }
		}
	]
});
