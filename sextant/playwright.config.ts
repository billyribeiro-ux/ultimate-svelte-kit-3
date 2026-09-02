import { defineConfig, devices } from '@playwright/test';

/**
 * END-TO-END CONFIGURATION
 * ========================
 *
 * Against a **production build**, on its own database, in two viewports.
 *
 * WHY THE BUILD AND NOT THE DEV SERVER
 * ------------------------------------
 * The dev server and the built server differ in the ways that break things:
 * different module resolution, no minification, no `adapter-node` request
 * handling, and — the one that matters most here — `PUBLIC_ORIGIN` is inlined at
 * build time for the CSRF check. A suite that passes against `vite dev` and has
 * never run against `vite build` will discover on deploy that every POST is
 * rejected as cross-site.
 *
 * WHY TWO VIEWPORTS AND NOT A RESPONSIVE ASSERTION
 * ------------------------------------------------
 * Because this application genuinely renders different DOM at different widths:
 * the results table has no header row on a phone, the waterfall stacks, the
 * trace drawer is a bottom sheet rather than a side panel. Those are the parts
 * most likely to break and the parts nobody looks at, so they run as their own
 * project rather than as a resize inside one test.
 */
export default defineConfig({
	testDir: 'e2e',
	testMatch: /.*\.(e2e|setup)\.ts/,

	/*
	 * Serial, and this is a deliberate cost.
	 *
	 * The suite runs against one SQLite file with one writer. Parallel workers
	 * would meet `SQLITE_BUSY` and — worse — would sign in as the same user in
	 * two contexts and race on the same saved views. Two minutes of wall clock
	 * buys a suite that fails only when something is broken.
	 */
	fullyParallel: false,
	workers: 1,

	// A failing test that passes on the second run is a flake, and a flake that is
	// retried is a flake nobody fixes. `forbidOnly` keeps a stray `.only` out of CI.
	retries: 0,
	forbidOnly: Boolean(process.env.CI),

	reporter: process.env.CI ? [['github'], ['list']] : [['list']],

	use: {
		baseURL: 'http://localhost:4173',
		// Traces on failure only: they are large, and the one you want is always the
		// one that failed.
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},

	projects: [
		/*
		 * Sign in once, in its own project, and hand the cookie to the rest.
		 *
		 * A password hash is deliberately slow, so signing in before every test
		 * turns a two-minute suite into a ten-minute one and covers the login form
		 * forty times instead of covering anything else once.
		 */
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },

		{
			name: 'desktop',
			// The setup file matches the top-level `testMatch`, so without this it also
			// runs as an ordinary test in every project — and it fails there, because a
			// browser that is already signed in is redirected away from `/sign-in`.
			testIgnore: /.*\.setup\.ts/,
			use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/state.json' },
			dependencies: ['setup']
		},
		{
			// A real phone profile, not a resized desktop: it brings a touch pointer
			// and a device pixel ratio with it, and both change what this application
			// renders.
			name: 'phone',
			testIgnore: /.*\.setup\.ts/,
			use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/state.json' },
			dependencies: ['setup']
		}
	],

	webServer: {
		/*
		 * Build and preview, with the e2e database.
		 *
		 * `PUBLIC_ORIGIN` must be identical here and in `prepare-e2e-db.js`, because
		 * it is baked into the bundle at build time and compared against the request
		 * origin at run time. A mismatch is a 403 on every form submission and a
		 * confusing hour.
		 */
		command: 'vite build && vite preview --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			DATABASE_URL: 'file:e2e.db',
			PUBLIC_ORIGIN: 'http://localhost:4173',
			BETTER_AUTH_SECRET:
				process.env.BETTER_AUTH_SECRET ?? 'e2e-only-secret-of-at-least-thirty-two-characters',
			INGEST_MAX_BATCH: '5000',
			INGEST_RATE_PER_MINUTE: '600000',
			SERIES_CARDINALITY_LIMIT: '10000',
			RETENTION_DAYS: '14'
		}
	}
});
