/**
 * PART 9 — Proving it, and running it
 * (chapters 42–45)
 *
 * A phone, two browser contexts, the verification gate, and a last chapter on
 * what to do with all of this. The theme of this part is that a collaborative
 * application has one test that matters and it cannot be written with one
 * browser.
 */

export const part9 = [
	{
		slug: 'mobile',
		title: 'The phone',
		summary:
			'Mobile-first with `min-width` only, a bottom sheet that becomes a sidebar, and a missing `flex-direction` that made the board 200 pixels wide.',
		goal: 'Make a canvas application genuinely usable on a 412-pixel screen, not merely not-broken.',
		blocks: [
			{
				type: 'p',
				text: 'Every breakpoint in this project is a `min-width`, with one deliberate exception. That is not a style rule — it changes which layout is the one you *thought about*.'
			},
			{
				type: 'code',
				file: 'src/lib/components/Workspace.svelte',
				lang: 'css',
				code: `
/*
	The panel is a bottom sheet on a phone and a sidebar from 62rem up.

	Mobile-first, and \`min-width\` only. The sheet is short enough to leave most
	of the board visible, because on a phone the board is the thing you are
	editing and the panel is the thing you consult.
*/
.workspace__panel {
	display: flex;
	flex-direction: column;
	border-top: 1px solid var(--border);
	background: var(--surface);
	height: 40dvh;
	flex: none;
}`
			},
			{
				type: 'warn',
				text: 'That comment is a real afternoon. `display: flex` with the default `row` puts the panel **beside** the canvas at every width — so on a 412-pixel phone the board got about 200 pixels, and the camera dutifully fitted the diagram at the minimum zoom. It looks like a rendering bug, or a broken camera, and it is a missing `flex-direction`.'
			},
			{
				type: 'p',
				text: 'This is exactly the failure mobile-first prevents. Write the desktop layout first and the phone is a series of overrides you discover by resizing; write the phone layout first and the desktop is one `@media (min-width: …)` that adds what a big screen affords.'
			},
			{
				type: 'code',
				file: 'src/lib/components/Workspace.svelte',
				lang: 'css',
				code: `
@media (min-width: 62rem) {
	.workspace__body {
		flex-direction: row;
	}

	.workspace__panel {
		height: auto;
		width: 18rem;
		border-top: none;
		border-left: 1px solid var(--border);
	}
}`
			},
			{
				type: 'p',
				text: 'The panel is a **bottom sheet on a phone and a sidebar from 62rem up**, and the whole transition is five properties. `40dvh` rather than `40vh`, because `dvh` accounts for the mobile browser’s collapsing address bar — with `vh` the sheet is the wrong height for the first scroll of every session.'
			},
			{
				type: 'code',
				file: 'src/lib/components/Workspace.svelte',
				lang: 'css',
				code: `
.workspace__toolbar {
	position: absolute;
	left: 50%;
	bottom: max(var(--space-4), env(safe-area-inset-bottom));
	transform: translateX(-50%);
	max-width: calc(100% - var(--space-6));
	z-index: var(--z-toolbar);
}`
			},
			{
				type: 'p',
				text: 'And the toolbar uses `max(var(--space-4), env(safe-area-inset-bottom))`, so it clears the home indicator on a notched phone without adding a gap on a device that has none.'
			},

			{ type: 'h3', id: 'the-exception', text: 'The one `max-width`' },
			{
				type: 'code',
				file: 'src/lib/components/Workspace.svelte',
				lang: 'css',
				code: `
/* The export buttons are the first thing to go on a narrow screen: nobody
   downloads a diagram on a phone, and the sync state has to stay visible. */
@media (max-width: 47.99rem) {
	.workspace__export {
		display: none;
	}
}`
			},
			{
				type: 'p',
				text: 'A `max-width` is honest when the rule is genuinely "remove this below a size" rather than "add this above one". Nobody downloads a diagram on a phone, and the sync state has to stay visible — so the export buttons are the first thing to go. Writing that as a `min-width` on the *other* elements would spread one decision across three selectors.'
			},

			{ type: 'h3', id: 'touch', text: 'Touch is not a small mouse' },
			{
				type: 'ul',
				items: [
					'**Two-finger pinch** is handled explicitly in `gestures.ts`, keyed off `pointerType === \'touch\'` and a `Map` of active pointers — pointer ids are not dense, so an array indexed by id is wrong.',
					'**Every button is at least 40px tall.** `min-height: 40px` on the tab strip is not decoration; it is the difference between a tab you can hit and one you keep missing.',
					'**The tab strip scrolls horizontally** rather than wrapping, so four tabs stay one row high and in a fixed, learnable order at every width.',
					'**`role="application"` and a keyboard** matter here too: a phone with a Bluetooth keyboard is a real configuration, and it is the same code path.'
				]
			},
			{
				type: 'note',
				text: 'The end-to-end suite runs the entire thing twice, on `Desktop Chrome` and on a `Pixel 7` profile. Not a narrow window — a real device profile, because touch targets, device pixel ratio and pointer type all differ, and a canvas cares about all three. Half the mobile bugs in this project were found by that second project and by nothing else.'
			},

			{
				type: 'checkpoint',
				items: [
					'The board is the largest thing on a phone.',
					'The panel is a sheet you can dismiss, not a column stealing half the screen.',
					'Every interactive target is at least 40 pixels tall.'
				]
			}
		]
	},

	{
		slug: 'testing-collaboration',
		title: 'The test the project exists to pass',
		summary:
			'Two browser contexts, why two tabs would prove nothing, and the fixture discipline that stops one suite rewriting another’s data.',
		goal: 'Assert that two genuinely separate replicas converge, in a test you can trust.',
		blocks: [
			{
				type: 'code',
				file: 'e2e/collaboration.e2e.ts',
				lang: 'ts',
				code: `
/**
 * TWO REPLICAS, ONE BOARD
 * =======================
 *
 * The test the whole project exists to pass.
 *
 * Two browser *contexts*, not two pages in one context. A context has its own
 * cookie jar, its own storage and its own IndexedDB — which is what makes these
 * genuinely separate replicas rather than two views of one. Two tabs in a single
 * context would share IndexedDB and quietly hide any bug in the local-first
 * layer.
 *
 * Each test works on a board it created, so nothing here can disturb the seeded
 * fixture the other suites read.
 */
/*
 * Ninety seconds, not the default thirty.
 *
 * These tests sign in twice, create a board, drive two multi-step drawing
 * gestures and then wait for one replica's work to reach the other. That is
 * legitimately slow, and when the default budget runs out mid-wait Playwright
 * reports whichever assertion was pending — so a timeout reads as "the other
 * replica never received it", which is the one conclusion it does not support.
 * The individual \`toBeVisible\` timeouts below are what actually bound the
 * propagation being tested.
 */
test.describe.configure({ timeout: 90_000 });`
			},
			{
				type: 'why',
				title: 'Contexts, not tabs',
				text: 'A browser **context** has its own cookie jar, its own storage and its own IndexedDB. Two tabs in one context share IndexedDB — so a test written that way would quietly hide any bug in the local-first layer, which is most of the interesting surface. It is one word in the setup and it decides whether the test means anything.'
			},
			{
				type: 'p',
				text: 'The timeout comment is worth copying as a habit. When a budget runs out mid-wait, Playwright reports whichever assertion was pending — so a timeout on a collaboration test reads as "the other replica never received it", which is the one conclusion it does not support. Set the *suite* budget generously and let the individual `toBeVisible` timeouts bound the thing actually being measured.'
			},
			{
				type: 'code',
				file: 'e2e/collaboration.e2e.ts',
				lang: 'ts',
				code: `
test('a shape drawn by one appears for the other', async ({ browser }) => {
	const alice = await browser.newContext();
	const bob = await browser.newContext();

	try {
		const alicePage = await context(alice, OWNER);
		const url = await newBoard(alicePage);

		const bobPage = await context(bob, OWNER);
		await bobPage.goto(url);
		await bobPage.getByRole('application').waitFor();

		await draw(alicePage, 'n', { x: 220, y: 220 }, 'Ledger');
		await expect(shape(alicePage, 'Ledger')).toBeVisible();

		// Bob's board is told by the stream, with no reload.
		await expect(shape(bobPage, 'Ledger')).toBeVisible({ timeout: 20_000 });
	} finally {
		await alice.close();
		await bob.close();
	}
});`
			},
			{
				type: 'p',
				text: 'Twenty lines, and it is the claim the whole project makes. Alice draws; Bob’s board is told by the stream, with no reload.'
			},

			{ type: 'h3', id: 'fixtures', text: 'Fixture discipline' },
			{
				type: 'code',
				file: 'e2e/helpers.ts',
				lang: 'ts',
				code: `
/**
 * Create a fresh board and return its URL.
 *
 * Every test that *changes* a board gets its own, rather than sharing the seeded
 * one. Two Playwright projects run against a single server and a single
 * database, so a test that renames a seeded shape silently rewrites the fixture
 * the next project asserts against — a failure that appears in a file nobody
 * touched, in the project that happens to run second.
 */
export async function newBoard(page: Page): Promise<string> {
	await page.goto('/boards');
	await page.getByRole('button', { name: 'New board' }).click();
	await page.waitForURL(/\\/boards\\/[0-9a-f-]{36}$/);
	await page.getByRole('application').waitFor();
	return page.url();
}`
			},
			{
				type: 'warn',
				text: 'Two Playwright projects run against a single server and a single database. A test that renames a seeded shape silently rewrites the fixture the *next project* asserts against — and the failure appears in a file nobody touched, in whichever project happens to run second. Every destructive test creates its own board.'
			},
			{
				type: 'p',
				text: 'The comments test in this suite was the last one to learn that lesson, and it learned it as a strict-mode violation: desktop posted "Is the queue really needed here?" to the shared board, mobile posted the same text again, and `getByText` found two elements. The assertion stopped meaning "my comment appeared" and started meaning "there are two of them".'
			},
			{
				type: 'code',
				file: 'e2e/helpers.ts',
				lang: 'ts',
				code: `
/**
 * A shape on the canvas, by its label.
 *
 * Scoped to \`[data-node]\` on purpose. The same words appear in the outline panel
 * and in the inspector heading, so a bare \`getByText('Orders')\` matches three
 * elements and fails Playwright's strict mode — which reads as "the board is
 * broken" and is in fact "the interface is doing its job three times".
 */
export function shape(page: Page, label: string) {
	return page.locator('[data-node]').filter({ hasText: label }).first();
}`
			},
			{
				type: 'p',
				text: 'And a locator scoped to `[data-node]`, because the same words appear in the outline panel and in the inspector heading. A bare `getByText(\'Orders\')` matches three elements and fails strict mode — which reads as "the board is broken" and is in fact "the interface is doing its job three times".'
			},

			{ type: 'h3', id: 'sign-in', text: 'Signing in through the real form' },
			{
				type: 'code',
				file: 'e2e/helpers.ts',
				lang: 'ts',
				code: `
/**
 * Sign in through the real form.
 *
 * Not by writing a session cookie directly. Seeding a cookie is faster and skips
 * the one flow every single user takes; a suite that never signs in is a suite
 * that cannot tell you sign-in is broken.
 */
export async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/boards');
}`
			},
			{
				type: 'p',
				text: 'Seeding a session cookie directly is faster and skips the one flow every single user takes. A suite that never signs in is a suite that cannot tell you sign-in is broken.'
			},

			{ type: 'h3', id: 'the-server', text: 'A real production build' },
			{
				type: 'code',
				file: 'playwright.config.ts',
				lang: 'ts',
				code: `
/**
 * End-to-end tests, against a real production build.
 *
 * Not the dev server. The dev server has different module resolution, no
 * minification and no adapter, and half the interesting deployment bugs only
 * exist in the built artefact — a native module that cannot be bundled, an
 * environment variable substituted at build time.
 *
 * That last one matters here more than usual. \`PUBLIC_ORIGIN\` is \`static: true\`,
 * so it is inlined during \`vite build\`; it has to be in the environment of the
 * *build*, not just the run. The \`webServer.command\` below does both, which is
 * why it is a compound command rather than a bare \`node build/index.js\`.
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
		stderr: 'pipe'`
			},
			{
				type: 'p',
				text: 'Not the dev server. It has different module resolution, no minification and no adapter, and half the interesting deployment bugs exist only in the built artefact — a native module that cannot be bundled, an environment variable substituted at build time.'
			},
			{
				type: 'warn',
				text: '`reuseExistingServer: false`. Reusing saves fifteen seconds and means a suite can pass against a build from twenty minutes ago while the code under test has changed underneath it. That happened in an earlier project in this series and cost an hour.'
			},
			{
				type: 'note',
				text: 'One worker, deliberately. Every test in the other suites shares one seeded board and several assert on its contents; in parallel, one test’s new shape appears in another’s count and the suite fails while the application behaves perfectly. The concurrency that actually matters — two replicas editing at once — is exercised *inside* a single test, which is the right level to test it at.'
			},

			{
				type: 'checkpoint',
				items: [
					'Two contexts, one board, and a shape crossing between them.',
					'Every destructive test owns its data.',
					'The suite runs against the artefact you would deploy.'
				]
			}
		]
	},

	{
		slug: 'the-gate',
		title: 'The gate',
		summary:
			'One command that has to pass, what each step in it catches, and the two things it deliberately does not check.',
		goal: 'Be able to say "this is green" and mean something specific by it.',
		blocks: [
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `
"verify": "npm run check && npm run lint && npm run test:unit -- --run && npm run build && npm run test:e2e"`
			},
			{
				type: 'p',
				text: 'Five steps, in an order chosen so the fastest thing that can fail fails first. Running it takes about ninety seconds, which is short enough that there is no excuse.'
			},
			{
				type: 'ul',
				items: [
					'**`check`** — `svelte-kit sync`, then `svelte-check`, then `tsc` over the service worker with its own config. The last is separate because a service worker has `WebWorker` lib and no DOM, and type-checking it with the app’s `tsconfig` is meaningless in both directions.',
					'**`lint`** — `prettier --check .` and `eslint .`. Formatting is checked rather than applied, so a badly formatted commit fails rather than silently rewriting somebody’s working tree.',
					'**`test:unit`** — 115 tests in about a second and a half, of which the interesting four are a few hundred thousand delivery schedules.',
					'**`build`** — the real one, including the service worker’s separate Vite environment and the adapter.',
					'**`test:e2e`** — 28 tests across two device profiles, against that build.'
				]
			},
			{
				type: 'terminal',
				code: `
$ pnpm run verify

  svelte-check   1530 files, 0 errors, 0 warnings
  prettier       all matched files use Prettier code style
  eslint         clean
  vitest         Test Files 9 passed (9) · Tests 115 passed (115)   1.36s
  vite build     ✓ built in 889ms   (+ service worker, 42ms)
  playwright     28 passed (42.6s)`
			},
			{
				type: 'why',
				title: 'Why the service worker gets its own tsconfig',
				text: 'It runs in a `WebWorker` global scope: no `document`, no `window`, a different `self`, and `caches` in the global namespace. Checked against the application’s config, every service-worker global is an error and every DOM API is wrongly available. `tsconfig.service-worker.json` is eight lines and it turns that file from unchecked into checked, which for a file that can serve a stale application to everybody is worth having.'
			},

			{ type: 'h3', id: 'what-it-misses', text: 'What the gate does not check' },
			{
				type: 'p',
				text: 'Being honest about this is more useful than the list of what it does.'
			},
			{
				type: 'ul',
				items: [
					'**Real network conditions.** Every test runs against localhost. The backoff, the reconnect and the offline transitions are exercised by unit tests and by hand, not by a lossy link.',
					'**More than two replicas.** The property test in chapter 12 covers up to nine, in memory. The end-to-end suite covers two browsers, because a third context doubles the runtime for a case the algebra already guarantees.',
					'**Clock drift between real machines.** `isPlausible` is unit-tested with an injected clock. Nothing sets a container’s date forward and watches what happens, and if this were shipping to customers it should.',
					'**Screen-reader behaviour.** The roles, the tree and the live regions are asserted structurally. Nobody in this repository has listened to it with VoiceOver, and structural assertions are not the same thing.'
				]
			},
			{
				type: 'note',
				text: 'A verification gate that claims more than it checks is worse than a small one, because people stop reading it. The four gaps above are each a sentence, and each is a piece of work somebody could pick up.'
			},

			{ type: 'h3', id: 'the-database', text: 'One operational gotcha' },
			{
				type: 'terminal',
				code: `
# prepare-e2e-db.js deletes and recreates e2e.db, so it MUST run before
# the server starts. Start the server first and it holds a deleted inode:
# every query succeeds against a file nothing else can see, and sign-in
# fails with no error that mentions the database.

"test:e2e": "node scripts/prepare-e2e-db.js && playwright test"`
			},

			{
				type: 'checkpoint',
				items: [
					'One command, ninety seconds, and a green result you can describe precisely.',
					'You can name four things the gate does not cover.',
					'The service worker is type-checked.'
				]
			}
		]
	},

	{
		slug: 'running-it',
		title: 'Running it, and what to take away',
		summary:
			'Deploying a single-instance local-first app, the seam where it stops being single-instance, and the six ideas worth keeping.',
		goal: 'Ship it, know what would have to change to scale it, and know what generalises.',
		blocks: [
			{
				type: 'terminal',
				code: `
pnpm install
cp .env.example .env        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm run db:migrate
pnpm run db:seed
pnpm run dev`
			},
			{
				type: 'p',
				text: 'The seed prints two sign-ins — an owner and a viewer on the same board — and the board’s short link. Open it in two windows and drag something. That is the whole demo, and it is the right first thing to do, because the rest of this course is an explanation of why it works.'
			},
			{
				type: 'terminal',
				code: `
PUBLIC_ORIGIN=https://tessera.example pnpm run build
node build/index.js`
			},
			{
				type: 'warn',
				text: '`PUBLIC_ORIGIN` is `static: true`, so it is inlined at build time. It has to be in the environment of the **build**, not just the run — set it only at run time and every POST comes back `403 Cross-site remote requests are forbidden` from an application whose GET requests all work. That is chapter 03’s scar, and it is the single most likely thing to go wrong on a first deployment.'
			},

			{ type: 'h3', id: 'scaling', text: 'The seam' },
			{
				type: 'p',
				text: 'Tessera runs on one Node process. The thing that makes it single-instance is `hub.ts`: a `Map` of listeners in memory. Two instances mean a client connected to A never hears about a write that landed on B — until it reconnects and catches up, which it *will*, but seconds later rather than milliseconds.'
			},
			{
				type: 'p',
				text: 'The fix is to replace `publish` with something that goes through Redis, NATS or Postgres `LISTEN/NOTIFY`, and **nothing else changes**. That is worth sitting with for a moment: the reason a horizontal-scaling change is one file is that the fan-out was never load-bearing for correctness. A missed broadcast is a slower recovery, not a wrong board.'
			},
			{
				type: 'ul',
				items: [
					'**The log** is already the source of truth and already indexed for "everything after this sequence".',
					'**Presence** is soft state and re-announces on a heartbeat, so it heals on its own.',
					'**Compaction** would need a lock, or to stay where it is — on the read path, per board.',
					'**libSQL** would become a hosted Turso database or Postgres; the Drizzle schema is portable and the two native-module lines in `vite.config.ts` go away.'
				]
			},

			{ type: 'h3', id: 'takeaways', text: 'Six ideas worth keeping' },
			{
				type: 'ol',
				items: [
					'**The server owns permission; the data structure owns merging.** Almost every design question in a collaborative system resolves to "which of those two is this?", and the answer is usually obvious once the question is asked.',
					'**Before removing work, say out loud what would have to be true for the removal to be safe.** Three of the four bugs in chapter 25 would have died at that sentence.',
					'**When two failure directions have different costs, pick the algorithm that can only fail in the cheap one.** Deliver twice rather than risk delivering zero; echo an operation rather than risk dropping one.',
					'**A guard belongs where the bad thing can still be prevented, and where the party being refused is the party at fault.** The clock check was in the wrong tier for a fortnight and read as defensive the whole time.',
					'**Determinism beats polish in a shared document.** Hysteresis on arrow routing would look better and would make two people see different diagrams.',
					'**Write down the reason next to the code.** Every chapter in this course that told you about a bug was quoting a comment somebody left in the file. That is not documentation overhead; it is the only form of it that survives.'
				]
			},

			{ type: 'h3', id: 'where-next', text: 'Where to go next' },
			{
				type: 'ul',
				items: [
					'**Add a seventh node kind.** It touches `types.ts`, one schema in `ops.ts`, one switch in `NodeShape.svelte` and three catalogues — and nothing else. If it touches anything else, that is a layering bug worth finding.',
					'**Add a fourth language.** One folder, per chapter 34. Time yourself.',
					'**Break something on purpose.** Put the echo filter back in `client.svelte.ts` and watch the restore test fail *only after a reload*. Then delete a line from the convergence spec’s shuffle and watch two hundred seeds stop finding anything.',
					'**Make the hub multi-instance.** It is one file, and it is the most realistic piece of production work left in the project.'
				]
			},
			{
				type: 'p',
				text: 'And the thing to actually take away: none of the hard parts of this application were framework problems. Svelte 5 and SvelteKit 3 made the interface layer small enough that the interesting problems — time, order, convergence, and what to do when the network lies — were the ones left to solve. That is the best thing you can say about a framework.'
			},

			{
				type: 'checkpoint',
				items: [
					'You have it running, with two windows open on one board.',
					'You know the one file that makes it single-instance.',
					'You can state at least three of the six ideas without looking.'
				]
			}
		]
	}
];
