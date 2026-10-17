import { defineConfig, devices } from '@playwright/test';

/**
 * END-TO-END CONFIGURATION
 * ========================
 *
 * Against the production build, on a database of its own, seeded fresh.
 *
 * WHY A BROWSER, IN A PROJECT THAT TESTS IN NODE
 * ----------------------------------------------
 * Everything else in Sequent is a Vitest test in Node, against pure functions
 * and real SQLite files. `@playwright/test` was dropped once, when it was a
 * dependency with no suite behind it. It came back for `e2e/errors.e2e.ts`,
 * and it stays only while `pnpm verify` runs that suite.
 *
 * Those six tests need a browser because each bug they guard was in how the
 * server, the network and the page meet, and showed only on the page: a
 * Cancel handler that dropped its promise, a sign-in refusal that replaced
 * the form, a query awaited where its failure took the whole terminal, a
 * failure card SvelteKit's own boundary made unreachable, a password echoed
 * into the page a form without JavaScript gets back, and a failed panel with
 * no way to try again. The one piece of all that which lifts out cleanly —
 * reading the message from a refusal — did lift out, into `#lib/errors.ts`,
 * and is a Vitest test now. The rest is wiring, and was checked rather than
 * assumed: with the Cancel button put back to `void cancelOrder(...)`, every
 * Vitest test passes and the cancel test here fails, because no alert ever
 * appears.
 *
 * The lighter shape was weighed and turned down: mount the terminal under
 * jsdom with its remote functions mocked. A mock rejects with whatever its
 * author believes a refusal looks like, and believing it was an `Error` was
 * the bug. A test that mocks the thing it is about asserts the assumption.
 *
 * WHY THE BUILD AND NOT THE DEV SERVER
 * ------------------------------------
 * `PUBLIC_ORIGIN` is inlined at build time and every command is checked
 * against it, so a suite that passes on `vite dev` and has never met
 * `vite build` finds out on deploy that every POST is refused as cross-site.
 * The bundle, the adapter and the environment are the ones a member firm
 * would actually meet.
 *
 * So this runs `node build` and does not build: `pnpm verify` builds
 * immediately before it, with the same environment. On its own, build first —
 * `PUBLIC_ORIGIN=http://localhost:4173 pnpm build` — or every command in the
 * suite is a 403.
 *
 * WHY ITS OWN DATABASE
 * --------------------
 * The seed deletes the file it is given and starts again. Pointed at whatever
 * `DATABASE_URL` happens to be in the environment, a test run would wipe the
 * venue somebody was developing against. `e2e.db` is pinned here, not read
 * from outside, so that cannot happen by accident.
 */
const DATABASE_URL = 'file:e2e.db';

export default defineConfig({
	testDir: 'e2e',
	testMatch: /.*\.e2e\.ts/,

	/*
	 * Serial. One SQLite file has one writer, and the seed is shared: two workers
	 * would meet `SQLITE_BUSY`, and a test that changes the venue would change it
	 * underneath another one reading it.
	 */
	fullyParallel: false,
	workers: 1,

	// A test that passes on its second attempt is a flake, and a retried flake is
	// one nobody fixes. `forbidOnly` keeps a stray `.only` out of CI.
	retries: 0,
	forbidOnly: Boolean(process.env['CI']),

	reporter: 'list',

	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},

	projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],

	webServer: {
		// Seed, then serve. In one command so the seed has finished with the file
		// before the server opens it; a `globalSetup` runs after the web server
		// has already started.
		command: 'node scripts/seed.ts && node build',
		port: 4173,
		/*
		 * Never a server that is already listening. 4173 is also where
		 * `vite preview` goes, and a reused server skips the seed above and serves
		 * whatever database it was started with — so the suite would run against
		 * the venue somebody is developing on, the thing `e2e.db` exists to
		 * prevent. A port in use fails the run, and says why.
		 */
		reuseExistingServer: false,
		env: { DATABASE_URL, PORT: '4173' }
	}
});
