import { defineConfig, devices } from '@playwright/test';

/**
 * END-TO-END CONFIGURATION
 * ========================
 *
 * Against the **adapter's own output**, on its own database, in two viewports.
 *
 * WHY THE BUILT SERVER AND NOT `vite preview`
 * -------------------------------------------
 * `vite preview` serves the build through SvelteKit's preview server. That
 * is fine for most projects and not enough for this one: the Docker image
 * runs `node build`, the health endpoint and graceful shutdown belong to the
 * adapter, the prerendered guides are files the adapter serves, and the
 * Content Security Policy is applied by the built server. `node build/index.js`
 * is what a deployment runs, so it is what the suite runs.
 *
 * WHY TWO VIEWPORTS AND NOT A RESPONSIVE ASSERTION
 * ------------------------------------------------
 * Because the trip page genuinely renders different DOM at different widths:
 * the map sits beside the itinerary on a desktop and below it on a phone,
 * the header collapses into a menu, and the drag-and-drop uses a touch
 * pointer. Those are the parts most likely to break and the parts nobody
 * looks at, so they run as their own project rather than as a resize inside
 * a test.
 *
 * TWO PEOPLE ON ONE TRIP
 * ----------------------
 * `collab.e2e.ts` opens two browser contexts — two sessions, two cookies —
 * on the same trip and checks that a change in one arrives in the other
 * through the live query. Playwright's `browser.newContext()` is exactly
 * that: a second, independent browser profile in the same test.
 */
export default defineConfig({
	testDir: 'e2e',
	testMatch: /.*\.e2e\.ts/,

	/*
	 * Serial, deliberately. One SQLite file, one writer, and tests that create
	 * trips and stops and then expect to find them. A couple of minutes of
	 * wall clock buys a suite that fails only when something is broken.
	 */
	fullyParallel: false,
	workers: 1,

	retries: 0,
	forbidOnly: Boolean(process.env.CI),

	reporter: process.env.CI ? [['github'], ['list']] : [['list']],

	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},

	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{
			// A real phone profile, not a resized desktop: it brings a touch pointer
			// and a device pixel ratio with it, and both change what the map does.
			name: 'phone',
			use: { ...devices['Pixel 7'] }
		}
	],

	webServer: {
		/*
		 * Prepare the database, build everything, run the adapter's server.
		 *
		 * `PUBLIC_ORIGIN` must be identical here and in the build, because it is
		 * baked into the bundle at build time — `paths.origin` — and compared
		 * against the request origin at run time. A mismatch is a 403 on every
		 * form submission, and Better Auth's cookies are scoped to it too.
		 */
		command: 'node scripts/prepare-e2e-db.js && pnpm run build && node build/index.js',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000,
		env: {
			DATABASE_URL: 'file:e2e.db',
			PUBLIC_ORIGIN: 'http://localhost:4173',
			BETTER_AUTH_SECRET: 'e2e-only-secret-of-at-least-thirty-two-characters',
			STOP_LIMIT: '200',
			PORT: '4173'
		}
	}
});
