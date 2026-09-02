import { defineConfig, devices } from '@playwright/test';

/**
 * END-TO-END CONFIGURATION
 * ========================
 *
 * Against the **adapter's own output**, on its own database, in two viewports.
 *
 * WHY THE BUILT SERVER AND NOT `vite preview`
 * -------------------------------------------
 * `vite preview` serves the build through SvelteKit's preview server, which is
 * fine for most projects and useless for this one: the adapter is part of what
 * is being tested. `node build/index.js` is what a deployment would run, so it
 * is what the suite runs — including the `pages`/`api` split and the
 * `applyReroute` hand-off between them, neither of which exists in preview.
 *
 * WHY TWO VIEWPORTS AND NOT A RESPONSIVE ASSERTION
 * ------------------------------------------------
 * Because the studio genuinely renders different DOM at different widths: the
 * mixer is a bottom sheet on a phone and a sidebar on a desktop, the step grid
 * pages sixteen steps at a time below 40rem, and the transport collapses to
 * icons. Those are the parts most likely to break and the parts nobody looks
 * at, so they run as their own project rather than as a resize inside a test.
 */
export default defineConfig({
	testDir: 'e2e',
	testMatch: /.*\.e2e\.ts/,

	/*
	 * Serial, deliberately. One SQLite file, one writer, and several tests that
	 * publish patterns and then expect to find them in the gallery in a known
	 * order. Two minutes of wall clock buys a suite that fails only when
	 * something is broken.
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
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		// Web Audio refuses to start without a user gesture. Playwright's clicks
		// count as gestures, but the studio also auto-resumes on the first
		// keypress, and a keypress is not one — so the flag makes the two paths
		// behave the same.
		serviceWorkers: 'block',
		launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
	},

	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{
			// A real phone profile, not a resized desktop: it brings a touch pointer
			// and a device pixel ratio with it, and both change what the knobs and the
			// step grid do.
			name: 'phone',
			use: { ...devices['Pixel 7'] }
		}
	],

	webServer: {
		/*
		 * Prepare the database, build everything, run the adapter's server.
		 *
		 * `PUBLIC_ORIGIN` must be identical here and in the build, because it is
		 * baked into the bundle at build time and compared against the request
		 * origin at run time. A mismatch is a 403 on every form submission and a
		 * confusing hour.
		 */
		command: 'node scripts/prepare-e2e-db.js && npm run build && node build/index.js',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 240_000,
		env: {
			DATABASE_URL: 'file:e2e.db',
			PUBLIC_ORIGIN: 'http://localhost:4173',
			SESSION_SECRET: 'e2e-only-secret-of-at-least-thirty-two-characters',
			TRACE_BUFFER: '200',
			PORT: '4173'
		}
	}
});
