/**
 * PART 8 — Proof and production
 * (chapters 41–45)
 *
 * The tests at three scales, the security the server applies to every
 * response, the container and the pipeline that build and prove it, and an
 * honest list of what a ninth week would do.
 */

import { code } from './quote.js';

export const part8 = [
	{
		slug: 'unit-and-browser-tests',
		title: 'Unit and browser tests: two Vitest projects, one command',
		summary:
			'Vitest runs the pure logic in Node and the components in a real Chromium, from one config and one command. The maths and the money get example-based tests with the answers worked out by hand; the components get `vitest-browser-svelte`, which mounts them and gives back locators that retry. What each layer is for, and what each is not.',
		goal: 'Know which of the three test layers a given behaviour belongs to, write a browser component test that asserts on roles rather than markup, and run the whole unit suite in under a minute.',
		blocks: [
			{
				type: 'p',
				text: 'Every project in this series has had tests; this one has *three kinds*, and the useful thing to learn is the boundary between them. A **unit test** calls a function and checks the return value — no DOM, no server, milliseconds. A **component test** mounts one Svelte component in a real browser and interacts with it the way a person would — clicks, typed text, what is visible — with nothing behind it but props. An **end-to-end test** (chapter 42) drives the whole built application through a real browser against a real database. The first is for logic, the second for behaviour, the third for the seams between everything. A behaviour tested at the wrong layer is either slow and brittle (a fair-split rule checked by clicking through the expenses tab) or falsely reassuring (a drag-and-drop “tested” by calling the handler).'
			},

			{ type: 'h3', id: 'two-projects', text: 'Two projects in one config' },
			code('vite.config.ts', 276, 342),
			{
				type: 'p',
				text: 'Vitest’s `projects` are separate test environments that share one runner and one command. The `server` project is plain Node: it picks up every `*.spec.ts` and `*.test.ts` that is *not* a `.svelte.` test, and runs the domain maths, the schemas, the geodata builder and anything that touches the database. The `client` project is a real Chromium started by Playwright, and it picks up only the `.svelte.test.ts` files. Both `extends` the main config, so the same aliases, the same Svelte plugin and the same Paraglide plugin apply — a component test sees `#lib/…` and `m.some_message()` exactly as the app does.'
			},
			{
				type: 'p',
				text: 'Three settings deserve a sentence each. `expect.requireAssertions` makes a test that asserts nothing a *failing* test — the most common way a test quietly stops testing is an early `return` or a promise nobody awaited, and this catches both. `fileParallelism: false` on the server project is for SQLite: it allows one writer, and two spec files seeding the same file at once produce a dozen `SQLITE_BUSY` failures in whichever file lost the race, none of which are bugs. And the `optimizeDeps.include` list on the client project is a Vite detail worth knowing: the Phosphor plugin rewrites `phosphor-svelte` imports into deep ones *during* transform, after Vite’s dependency scan, so on a cold cache Vite discovers them in the middle of a test run, re-bundles, and reloads the page under the test. Naming them up front is the fix Vitest itself suggests in its warning.'
			},
			{
				type: 'why',
				title: 'Why a real browser and not jsdom',
				text: 'jsdom is a DOM written in JavaScript, and it is a good one, but it has no layout engine, no WebGL and no real events. The map needs WebGL; the drag-and-drop reads `getBoundingClientRect` and listens for pointer events with real coordinates; `animate:flip` measures positions; Bits UI’s date picker positions a popover. In jsdom every one of those would “pass” by doing nothing. Chromium under Vitest starts in about two seconds and runs the seven component tests in this project in under five, which is a cheap price for tests that mean something.'
			},

			{ type: 'h3', id: 'logic', text: 'The logic: worked examples, not just properties' },
			code('src/lib/domain/split.spec.ts', 1, 42),
			{
				type: 'p',
				text: 'The tests for `shares()` (chapter 10) are examples with the answers worked out by hand — a thousand cents three ways is 333, 333, 334 — and the two properties the function promises: the shares always sum to the whole, and the extra cent goes to the same person whatever order the participants came in. Property-based testing with a library like fast-check would generate thousands of random cases and is exactly right for a CRDT or a parser; for a function with four rules it is more machinery than the rules. The line: if you can enumerate the interesting inputs on one hand, enumerate them; if you cannot, generate them.'
			},
			code('src/lib/domain/split.spec.ts', 44, 87),
			{
				type: 'p',
				text: 'The settle-up tests pin down the two things a person would notice: the balances sum to zero (the money that was paid is the money that was owed), and the transfers are the greedy pairing of the largest debtor with the largest creditor, which produces at most `people − 1` payments. The last test is the one that would catch a refactor: it gives a ledger where the greedy choice matters and asserts the exact list, in order, so “equivalent but different” output is a failure until somebody decides the new order is the right one.'
			},
			code('packages/waypoint/src/lib/geo/geo.spec.ts', 19, 45),
			{
				type: 'p',
				text: 'The geodesy tests (chapter 05) use cities whose distances are public knowledge — London to Paris is 343 kilometres, and `toBeCloseTo(343.5, 0)` asks for that to the nearest whole number — together with the properties that do not need a reference: symmetry, zero to itself, a metre is a metre. Notice the third test creates its expected point *with the library’s own `destination()`* and then measures back; that is a round-trip test, and it is what makes the pair of functions trustworthy together even though each alone is checked only loosely.'
			},
			code('packages/waypoint/src/lib/route.svelte.test.ts', 27, 46),
			{
				type: 'p',
				text: 'A `.svelte.test.ts` file for a *class*, not a component: `Route` (chapter 06) is built on runes, and runes exist only in files the Svelte compiler processes. The `.svelte.` in the name is what asks for that. `flushSync()` from `svelte` forces the pending derivations to settle synchronously, so the test can assert on `route.total` the line after `route.add(…)` rather than awaiting a tick; without it, a `$derived` is lazy and would still be correct — but the assertion might read it before the effect that recomputes it had run.'
			},

			{ type: 'h3', id: 'components', text: 'Components: roles, not markup' },
			code('src/lib/ui/RouteThumb.svelte.test.ts', 14, 39),
			{
				type: 'p',
				text: '`render()` from `vitest-browser-svelte` mounts the component with props and returns a screen whose `getByRole`, `getByText` and friends are the same locators Playwright uses. `expect.element(locator)` *retries* until the assertion holds or a timeout passes, which is the property that makes browser tests stable: a component that renders in the next frame is not a failure. The assertions are on roles and names — `img` with the accessible name `Iberia` — because that is the contract a screen reader and a person share. Counting `circle` elements inside the SVG is a deliberate step down to markup, for a fact that has no role: three stops, three markers.'
			},
			code('src/lib/trip/StopCard.svelte.test.ts', 13, 27),
			{
				type: 'p',
				text: 'The fixture is a plain object of the database row’s shape, typed as `Stop` — and the `import type` is erased at compile time, so a browser test can name a server-only type without pulling the server, the driver or the schema into the bundle. Dates are `new Date(0)`: a fixed instant, so nothing in the test depends on today.'
			},
			code('src/lib/trip/StopCard.svelte.test.ts', 30, 46),
			{
				type: 'p',
				text: 'A callback prop is tested with `vi.fn()`: a function that records its calls. The component receives it as `onselect`, the test clicks the button and asserts the spy was called exactly once. There is no event bus and no store to inspect; Svelte 5 components communicate through props that are functions, and a function is the easiest thing in the world to fake. The second test in the file mounts the card twice, as a viewer and as an editor, and counts buttons — the cheapest possible proof that the edit and remove controls exist for one and not the other.'
			},
			code('src/lib/guides/Leg.svelte.test.ts', 10, 21),
			{
				type: 'p',
				text: '`Leg` is the component the Markdown guides embed (chapter 34). Its test does double duty: it proves the arithmetic and the compass point, and — because `Leg` imports the gazetteer and the geodesy package — it proves that the *workspace package* resolves from the app in a browser build. The second test is a rejection: `render()` of a component whose script throws returns a promise that rejects, and `rejects.toThrow(/atlantis/)` pins the message so a future refactor cannot turn a clear error into a blank component.'
			},

			{ type: 'h3', id: 'running', text: 'Running it' },
			code('package.json', 24, 28, { partial: true }),
			{
				type: 'terminal',
				code: `
$ pnpm run test:unit -- --run

 ✓ |server| src/lib/domain/split.spec.ts (9 tests)
 ✓ |server| src/lib/domain/itinerary.spec.ts (6 tests)
 ✓ |server| src/lib/domain/schemas.spec.ts (5 tests)
 ✓ |server| src/lib/domain/dates.spec.ts (4 tests)
 ✓ |server| src/lib/domain/money.spec.ts (4 tests)
 ✓ |server| src/lib/server/geodata.spec.ts (3 tests)
 ✓ |client| src/lib/trip/StopCard.svelte.test.ts (2 tests)
 ✓ |client| src/lib/ui/RouteThumb.svelte.test.ts (2 tests)
 ✓ |client| src/lib/guides/Leg.svelte.test.ts (2 tests)

 Test Files  9 passed (9)
      Tests  41 passed (41)`
			},
			{
				type: 'p',
				text: 'The library has its own suite — `pnpm --filter @meridian/waypoint test` — with the geodesy properties, the `Route` class and the `Compass` component, and chapter 08 runs it as part of `verify:package`. Both suites are under a minute, which is the number that decides whether people run them before every push or only when the pipeline complains.'
			},
			{
				type: 'note',
				text: 'What is *not* unit-tested, and why: the remote functions. They are thin — a schema, an authorisation check, a query — and every line of them is exercised by the end-to-end suite through the real HTTP path, the real cookie and the real database. A unit test would have to fake `getRequestEvent()`, the session and Drizzle, and would test the fakes. When the logic inside one grows past a screen, it moves into `src/lib/server/*.ts` where it can be called directly, which is what `listStops()` and the invite helpers already are.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which project a new test file lands in from its name alone, and why the server project runs files one at a time.',
					'You can write a browser test that mounts a component with a `vi.fn()` prop, clicks a role, and asserts the spy — with no markup selectors.',
					'You can explain what `expect.requireAssertions` protects against, and what `flushSync` is for in a test of a runes class.'
				]
			}
		]
	},

	{
		slug: 'end-to-end',
		title: 'End to end: the built server, two viewports, two people',
		summary:
			'Playwright runs against `node build/index.js` — the same process a deployment runs — on a database rebuilt from the seed before every run, in a desktop and a Pixel 7 profile. Five suites cover a stranger, an account, one trip’s every tab, two browsers on one trip, and invites plus the embed. How the suite is kept honest, the three mobile-only failures it found, and what each one taught.',
		goal: 'Run the end-to-end suite locally, read a failure’s call log and trace, and write a new test that signs in, does one thing, and cleans up after itself.',
		blocks: [
			{
				type: 'p',
				text: 'An end-to-end test is the only kind that can fail because of a **seam**: a cookie the hook did not read, a header the adapter did not send, a prerendered page that baked the wrong user in, a form the CSRF check refused. Those are exactly the failures that unit tests cannot see and that real people hit first. So the suite runs against the *built* application — the adapter’s output, its server, its database — and not against the dev server, and the configuration says why at length.'
			},
			code('playwright.config.ts', 34, 88),
			{
				type: 'p',
				text: 'Read the `webServer` block as a recipe: rebuild the database from the migrations and the seed, build the app, start the adapter’s server on port 4173. Playwright waits for the port, runs the suite, and stops the process. `reuseExistingServer` is on outside CI, so a developer who already has the built server running skips the three-minute build — and in CI it is off, so the pipeline always tests what it just built. The environment block matters more than it looks: `PUBLIC_ORIGIN` is **baked into the bundle** at build time (chapter 03), and the server compares it with each request’s origin; if the build said 5173 and the test hits 4173, every form submission is a 403. It took an afternoon to learn that the same value has to be present in both places, which is why the comment is there.'
			},
			{
				type: 'p',
				text: '`workers: 1` and `fullyParallel: false` are not timidity. The suite shares one SQLite file and its tests *create* things — a trip, a stop, an expense — and then expect to find them; two workers would race. Serial costs about a minute and a half of wall clock for thirty-six tests across both profiles — plus the build, the first time — and buys a suite whose failures are always real.'
			},
			code('scripts/prepare-e2e-db.js', 18, 47),
			{
				type: 'p',
				text: 'The database is deleted and rebuilt before every run — the file and its `-wal` and `-shm` sidecars — through the *migrations*, not `drizzle-kit push`. That is a small act of discipline with a large payoff: a schema change that was made in `schema.ts` and never turned into a migration fails here, on a developer’s machine, instead of in the container in chapter 44. The seed (chapter 13) then creates three people and two trips, and every test knows their names.'
			},

			{ type: 'h3', id: 'helpers', text: 'The helpers: what every test needs' },
			code('e2e/helpers.ts', 27, 59),
			{
				type: 'p',
				text: '`signIn` goes through the real form, not through an API call and a hand-made cookie: the test then exercises the sign-in remote form, the redirect guard and the session cookie’s attributes for free. `openMenu` is the phone-versus-desktop seam made explicit — the header’s links are behind a menu button under 48em — so a test written once runs unchanged in both projects. It waits for the root layout’s `data-hydrated` attribute first, because the menu button needs JavaScript and a click before hydration is a click nobody is listening to; the language-switch test found that one, about one run in twenty. `openTab` finds the tab strip by its accessible name and asserts the URL afterwards, because the tab *is* a URL (`?tab=expenses`) and a test that clicked a tab and moved on would not notice if the click had been swallowed.'
			},
			code('e2e/helpers.ts', 61, 78),
			{
				type: 'p',
				text: '`typeDate` exists because Bits UI’s date picker is not an `<input type="date">`; it is three editable segments per date, in the locale’s order, and Playwright’s `fill()` has nothing to fill. Clicking a segment and typing is what a person does, so it is what the helper does. When a control has a custom keyboard model, the helper that drives it belongs in one place with a comment saying what that model is.'
			},

			{ type: 'h3', id: 'suites', text: 'Five suites' },
			code('e2e/public.e2e.ts', 14, 34),
			{
				type: 'p',
				text: 'The stranger’s suite asserts things that are easy to break and hard to notice. That the guides page ships **no script at all** is the whole point of `csr = false` (chapter 34), and `script[src]` count zero is the only assertion that proves it. That `/de/guides` has `lang="de"` proves the reroute hook, the prerender entries and the `%paraglide.lang%` replacement all agree for a page that was built at compile time, with no request to consult. That the text inside a guide is `Lisbon → Sintra` with a distance proves a Svelte component inside Markdown ran the geodesy library at build time.'
			},
			code('e2e/public.e2e.ts', 71, 92),
			{
				type: 'p',
				text: 'The machine-facing test uses `request` — Playwright’s API client, with no browser — for the health endpoint and the route API, and the page for the embed frame. The interesting assertions are the negative ones: the private trip’s API is a 404, the private trip’s frame is a 404, and the public frame’s Content-Security-Policy contains `frame-ancestors *` — the one route the hook allows to be framed (chapter 43). A security rule with no test is a security rule that will be refactored away.'
			},
			code('e2e/account.e2e.ts', 13, 36),
			{
				type: 'p',
				text: 'A fresh account with a unique email per run, so the test can run twice against the same database. It walks the whole loop — refused at `/trips`, sent to sign in with `redirectTo` remembered, creates the account, lands on an empty trips page, signs out, signs back in — and the `openMenu` calls are the phone project earning its keep.'
			},
			code('e2e/trip.e2e.ts', 14, 30),
			{
				type: 'p',
				text: '`beforeEach` signs Ana in straight to her trip, and the first test presses `ControlOrMeta+k` — Playwright’s name for “Control on Linux and Windows, Command on a Mac” — to open the command palette and jump to a tab by typing part of its name. A keyboard shortcut is a feature people rely on and never think to report when it breaks.'
			},
			code('e2e/trip.e2e.ts', 60, 78),
			{
				type: 'p',
				text: 'The expenses test adds one row and asserts a *consequence*: that the settle-up now says Ben pays Ana. It then removes the row, so the next test — and the next run against a reused server — starts from the seed. Tests that clean up after themselves are the alternative to a database reset between every test, which would cost seconds each and would hide any test that depended on the order.'
			},
			code('e2e/collab.e2e.ts', 14, 60),
			{
				type: 'p',
				text: 'This is the test the project was built to pass. `browser.newContext()` twice gives two independent browser profiles — two cookie jars, two sessions — in one test. Ana and Ben sign in separately, and everything after that is a statement about the live query (chapter 18): Ben adds a stop and *Ana’s page* shows it, without a reload, because both pages hold the same `query.live` open and the server publishes to the room when the trip changes. The presence assertions ride on the same stream — Ana sees Ben arrive, and sees which stop he is looking at. The timeouts are longer than the default, deliberately: the presence heartbeat is fifteen seconds apart, and a test that asserts within five would be asserting on luck.'
			},
			code('e2e/invite.e2e.ts', 63, 93),
			{
				type: 'p',
				text: 'The settings test has a shape worth copying: `try … finally`. It flips the trip to visible-by-link, checks that the embed section appears and that the custom element inside it renders the trip *through the route API* — Playwright locators pierce shadow DOM, so `page.locator(\'meridian-route\').getByText(…)` reaches inside — and then, whatever happened, flips it back. Without the `finally`, one failure in the middle would leave the seeded trip public, and the stranger’s suite in the next run would fail on a 200 where it expects a 404, two files away from the cause.'
			},

			{ type: 'h3', id: 'found', text: 'What the suite found' },
			{
				type: 'p',
				text: 'A suite is worth what it catches. Before it went green this one caught six bugs that no unit test could have — one of them only in the phone project, one only in about one run in ten, and one that had been hiding behind a `.catch(() => {})`, which is the argument for a phone project and for never dismissing a flaky test in one paragraph.'
			},
			{
				type: 'ol',
				items: [
					'**The trip page was a 500 for signed-in members.** An `$effect` that sent the presence heartbeat read the heartbeat command’s own `pending` state, which the command updates synchronously — an effect that re-triggers itself, and Svelte stopped it with `effect_update_depth_exceeded`. The fix is in chapter 31: read the trip id once, and wrap the command call in `untrack`. The desktop test found this in the first run; the pages had looked fine in a browser because the stack trace was in the server log.',
					'**The place search never searched.** Bits UI’s `Combobox.Input` is a controlled input; binding its value is not the same as listening to it, and the `query` the component filtered on was never updated. Nobody noticed by hand because the seeded stops were already there. `pressSequentially` in the test — typing a character at a time, as a person does — found it.',
					'**The settings page did not update after Save.** The command used `.updates(tripBySlug(slug))` so the server sent the refreshed trip in the same response, and the cache was set — but the page read the query through a template `await`, which resolves once. Reading `query.current` in a `$derived` is the reactive way, and chapter 31 explains the difference.',
					'**Text typed before the page had hydrated vanished.** One run in ten, the sign-in helper filled the email, clicked, and nothing happened: the trace showed no request at all, and the screenshot showed an empty email field with the browser’s “Please fill out this field” bubble under it. Playwright had typed faster than the client bundle loaded, and when the remote form hydrated, its field wrote its *own* value — the empty string the server rendered — over the typed one. That is a real bug for a person on a slow connection, not a test artefact. The fix is `keepTyped()` in chapter 32: read the inputs before the template hydrates and make what is there the field’s value. The test that pins it holds the client bundle back with `page.route`, types, releases it, and waits for a `data-hydrated` attribute the root layout sets in `onMount` before asserting the text is still there.',
					'**The seed’s ids were not ids.** Ben clicked a seeded stop and Ana never saw him move to it, while a stop Ben had just added worked perfectly. The seed built its ids by hand — `00000000-0000-4000-8000-0000000a001` — and the last group was one character short of a UUID, so the presence heartbeat naming that stop failed the `IdSchema` check on the server, and the client’s `.catch(() => {})` on a fire-and-forget command swallowed the error. Every command that names a seeded row — remove this stop, edit that expense — was failing the same way, silently. The fix is in chapter 13: `seedId()` builds the fixed ids *through the schema*, so a malformed one throws at seed time instead of vanishing at run time. The lesson is older than the bug: the data you seed must pass the validation you run.',
					'**On a phone, the Add-an-expense button could not be clicked.** Playwright’s call log said `<h3> intercepts pointer events` — the button was where it should be, and the click landed somewhere else. The cause was two layers down: the expenses table is seven columns wide, the page’s grid column was implicitly `auto`, and an `auto` track will not be narrower than its content, so the whole page was 711 pixels wide on a 412-pixel screen. Mobile Chromium reacts to a page wider than the viewport by laying it out at a larger *layout* viewport, and Playwright’s coordinates and the browser’s stopped agreeing. `grid-template-columns: minmax(0, 1fr)` on the page grid, and the table scrolls inside its wrapper as it was meant to. The suite found a real mobile layout bug by failing to press a button.'
				]
			},
			{
				type: 'p',
				text: 'The last one is the reason to be suspicious of “element is not stable” and “intercepts pointer events” in a mobile project. They usually mean the *page* is wrong, not the test, and the useful next step is to measure `document.documentElement.scrollWidth` against `clientWidth` on that page. The same probe ran across every route afterwards, in both languages, and the expenses tab was the only offender.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm run test:e2e

Running 36 tests using 1 worker

  ✓  [desktop] › public.e2e.ts › the guides are prerendered, translated and shipped without JavaScript
  ✓  [desktop] › collab.e2e.ts › a change by one person reaches the other through the live query
  …
  ✓  [phone] › trip.e2e.ts › an expense is added and the settle-up follows
  ✓  [phone] › invite.e2e.ts › visibility by link switches the embed on, and the custom element renders the trip

  36 passed (1.4m)`
			},
			{
				type: 'note',
				text: 'When a test fails, `test-results/<test>/` holds a screenshot, an `error-context.md` with the accessibility tree at the moment of failure, and a `trace.zip` — open it with `pnpm exec playwright show-trace <file>` for a timeline with every action, every network request and a DOM snapshot at each step. The trace is almost always faster than a debugger.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the suite runs against `node build/index.js` and what `PUBLIC_ORIGIN` has to do with a 403.',
					'You can write a two-context test and say which assertion in it proves the live query rather than a reload.',
					'You can read a Playwright call log that says “intercepts pointer events” and name the first thing to measure.'
				]
			}
		]
	},

	{
		slug: 'security-headers-and-csp',
		title: 'Security: the policy, the headers, the redirect and the one framed route',
		summary:
			'What the server puts on every response and why: a Content Security Policy in `auto` mode with a hashed boot script, CSRF with no trusted origins, the headers that are always right, `Vary: Cookie`, a redirect target that is sanitised rather than rejected, a public API whose CORS is safe because its content is, and the single route whose frame policy is loosened per request.',
		goal: 'Read the project’s Content Security Policy directive by directive and say what each one blocks, and add a new route or a new third-party resource without weakening the policy for everything else.',
		blocks: [
			{
				type: 'p',
				text: 'Security in a web application is mostly a list of things that are true of *every* response, and the place to make them true is the one function every response passes through. In SvelteKit that is `handle` in `hooks.server.ts` (chapter 14), and the third handler in its sequence is where this chapter lives. The rest is a policy in `vite.config.ts` that SvelteKit applies for us, and a handful of decisions at the edges: what may be framed, what may be fetched from another origin, where a sign-in may redirect.'
			},

			{ type: 'h3', id: 'csp', text: 'The Content Security Policy' },
			code('vite.config.ts', 163, 209),
			{
				type: 'p',
				text: 'A Content Security Policy is a header that tells the browser which sources of script, style, image, font, connection and frame the page is allowed to use; anything else is blocked and reported to the console. Its purpose is to make cross-site scripting *not work*: an attacker who manages to inject `<script>` into a page gains nothing if inline scripts are refused. `default-src \'self\'` is the floor — nothing from anywhere but this origin — and every other directive is a narrow, commented exception.'
			},
			{
				type: 'p',
				text: '`mode: \'auto\'` is the interesting setting. SvelteKit’s own scripts are inline (the tiny module that starts the client), so the policy has to allow *those* while refusing everything else. Two mechanisms exist: a **nonce** — a random value generated per request, put on the header and on each allowed `<script>` — and a **hash** of the script’s content. A prerendered page has no request, so it cannot have a nonce; a dynamically rendered one streams `resolve()` scripts after the header has gone, so it cannot know all the hashes. `auto` uses hashes for prerendered pages and nonces for the rest, and the guides (chapter 34) are the reason the project needs both.'
			},
			code('src/app.html', 20, 25),
			code('vite.config.ts', 359, 364),
			{
				type: 'p',
				text: 'The theme boot script — the one that sets the dark class before first paint so a dark theme never flashes light — is the one inline script the app writes itself, and it appears on *every* page, prerendered or not. So it is allowed by hash, and the hash is computed at build time **from the template**, not kept as a second copy: edit the script and the hash follows. This is the kind of thing that fails silently otherwise — nothing errors at build, the script is simply blocked in production, and the first person to notice is the one with a dark system and a light flash. The regular expression reads the script from `app.html`, which is why the template must not put a `nonce` attribute on it: SvelteKit refuses to prerender a template containing `%sveltekit.nonce%`, and a prerendered page needs this script too.'
			},
			{
				type: 'ul',
				items: [
					'`worker-src \'self\' blob:` — MapLibre parses vector tiles in a Web Worker. Its URL comes from a Vite asset import, so `\'self\'` covers it; `blob:` is for the fallback MapLibre uses when the worker script is on another origin.',
					'`img-src \'self\' data: blob:` — MapLibre’s sprite sheet and the canvas exports are `data:` and `blob:` URLs; the enhanced images are `\'self\'`.',
					'`connect-src \'self\'` — deliberately no tile server. The map style is built from a bundled TopoJSON of the world (chapter 27), so the app works offline, in CI, with no keys and no third party learning where people plan to go. Adding a tile provider would mean adding its origin here, and the comment says so, so the change is one line and visible in review.',
					'`style-src \'self\' \'unsafe-inline\'` — the trade the comment owns up to. Markers and the itinerary position things with `style:` attributes, attributes cannot be hashed, and a nonce does not apply to them. The exposure is CSS injection, which can deface but cannot run code; the alternative is a design without a single inline style, which is a large price for a small gain.',
					'`frame-ancestors \'none\'` — nobody may put this app in an iframe, which closes clickjacking. One route needs the opposite, and the next section is about that.',
					'`form-action \'self\'`, `base-uri \'self\'`, `object-src \'none\'` — forms may only submit here, `<base>` may not be hijacked, plugins do not exist.'
				]
			},
			{
				type: 'p',
				text: '`csrf: { trustedOrigins: [] }` is the last line of the block and the easiest to get wrong. SvelteKit refuses form submissions whose `Origin` header does not match the app’s own, which is what stops another site from posting to `/signin` on a person’s behalf. An empty list means *nobody else*; the value to add here is a second origin of your own, never a wildcard.'
			},

			{ type: 'h3', id: 'headers', text: 'The headers, and the one route that may be framed' },
			code('src/hooks.server.ts', 97, 148),
			{
				type: 'p',
				text: 'Three headers are always right and cost nothing: `x-content-type-options: nosniff` (the browser trusts our content types and does not guess), `referrer-policy: strict-origin-when-cross-origin` (other sites learn our origin, not our paths — a trip’s slug is not their business), and a `permissions-policy` that turns off the microphone and the camera and keeps geolocation for this origin only, because “where am I” on the map is the one capability the app asks for. `Vary: Cookie` on pages is for shared caches: the header shows the person’s name and the locale cookie changes the language, so a cache must never serve one person’s page to another. API responses and the hashed `/_app/` assets are excluded because they do not depend on the cookie, and a `Vary` there would only defeat the cache.'
			},
			{
				type: 'p',
				text: 'The embed route is the exception that proves the policy was applied thoughtfully. `/embed/<slug>` exists to be framed — it is the read-only route summary the custom element loads (chapter 36) — and for that path, and only that path, the handler rewrites the `frame-ancestors` directive **after SvelteKit has built the header**. A regular expression on the header is cruder than a per-route config would be, but SvelteKit’s policy is global, the route is one, and the rewrite is six lines next to a comment that says exactly what it does. The end-to-end suite asserts the result on the public frame and the 404 on the private one.'
			},
			code('src/hooks.server.ts', 76, 85),
			{
				type: 'p',
				text: 'Identity is read once, here, into `locals` — so no page has to ask, and no page has to *remember* to ask. `svelteKitHandler` answers Better Auth’s own `/api/auth/*` routes and passes everything else on. The ordering in `sequence` matters: the locale handler runs first so an error page speaks the right language, and the security handler runs last so its headers are on every response including the ones Better Auth wrote.'
			},

			{ type: 'h3', id: 'edges', text: 'Three decisions at the edges' },
			code('src/lib/remote/auth.remote.ts', 27, 46),
			{
				type: 'p',
				text: 'An **open redirect** is a sign-in page that will send a person anywhere the `redirectTo` parameter says — including `https://evil.example/signin`, styled to look like ours. The guard is a regular expression that allows one leading slash and *only* one: `//evil.example` is a protocol-relative URL, starts with a slash, and still leaves the site. The choice to **sanitise** rather than reject is deliberate: the value lives in a hidden field the person cannot see, so a crafted link would otherwise leave them staring at “invalid redirect” with no way in. Falling back to `/trips` is safe and kind.'
			},
			code('src/routes/api/route/[slug=slug].json/+server.ts', 21, 51),
			{
				type: 'p',
				text: 'The route API is the one endpoint with `access-control-allow-origin: *`, and the comment explains why that is safe rather than assumes it: the response holds nothing that was not already public by link. The authorisation is *content-based* — a trip that is not visible by link is a 404 whether or not the caller is signed in — because the custom element runs on somebody else’s page, where our cookies are not sent and must not matter. That is the rule for any CORS-open endpoint: it may return only what an anonymous stranger could already see, and it must decide from the data, not the session.'
			},
			code('src/hooks.server.ts', 157, 165),
			{
				type: 'p',
				text: '`handleFetch` wraps every server-side `fetch` the app makes. Same-origin requests go through untouched; anything leaving the server gets a ten-second `AbortSignal.timeout` and a user agent that names the app. The project makes no external requests today — the map is offline — which is exactly when to put the guard in: the first person to add a weather lookup inherits a timeout instead of a server that hangs when the weather service does.'
			},
			code('src/hooks.server.ts', 178, 193),
			{
				type: 'p',
				text: 'Error handling is a security surface too. `handleError` receives a `kind` in SvelteKit 3 — `app`, `framework`, `validation` or `unknown` — and the code returns something only for the last two. A validation failure (a remote function argument that did not match its schema) is logged with the *path* of the field and answered with a fixed message, so a caller probing the API learns that the request was malformed and nothing about the schema. An unknown error gets an id that is logged with the stack and shown to the person, so a bug report can be matched to a log line; the message itself says nothing about what broke.'
			},
			{
				type: 'warn',
				text: 'The place a policy like this usually breaks is *the next feature*. A new analytics script, a font from a CDN, a tile server, a YouTube embed: each needs a source in exactly one directive, and the temptation is to add `\'unsafe-inline\'` or a wildcard because the console error is annoying. The discipline is to read the console error — it names the directive and the blocked URL — add that one origin to that one directive, and write the comment that says why, as every directive above has.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the boot script is allowed by hash and not by nonce, and what would happen if the template had a `nonce` attribute.',
					'You can say which directive a new tile server goes in and why `connect-src` is `\'self\'` today.',
					'You can describe the rule for a CORS-open endpoint and point at the line in the route API that applies it.'
				]
			}
		]
	},

	{
		slug: 'deploying',
		title: 'Deploying: three stages, one process, a health check and a pipeline that runs the container',
		summary:
			'The Dockerfile builds the library, the messages, the element and the app in one stage and copies only what running needs into a slim, non-root image whose one process migrates the database and then serves. Compose gives it a volume and a secret. The workflow verifies the project, builds and *runs* the image, and proves the course — because a Dockerfile that is never built is documentation.',
		goal: 'Build and run the image locally with one command, explain each stage and each environment variable, and read the workflow well enough to add a job to it.',
		blocks: [
			{
				type: 'p',
				text: 'Everything before this chapter runs on a developer’s machine with `pnpm`. Production is a different place: a machine that has never seen the repository, no `devDependencies`, no `.env`, and a process manager that will send `SIGTERM` when it wants the process gone. A container is the honest way to describe that place, because it *is* that place — the build runs in it, and what works there works in production for the same reasons.'
			},

			{ type: 'h3', id: 'stages', text: 'Three stages' },
			code('Dockerfile', 20, 38, { partial: true }),
			{
				type: 'p',
				text: 'The `deps` stage installs dependencies, and nothing else, so that the layer is cached until the lockfile changes. Three details are the difference between a Dockerfile that works and one that works reliably. **The workspace needs every `package.json` the lockfile mentions**, so the library’s manifest is copied beside the root’s before `pnpm install` — without it, pnpm refuses the frozen install because the lockfile describes a package that is not there. **`--frozen-lockfile`** fails the build if the lockfile disagrees with `package.json` instead of quietly resolving something newer; the lockfile is the contract. **`--ignore-scripts`** skips the root `prepare` script, which would try to build the library before its source has been copied; the build stage runs those steps itself, in order, where it can see them. The `--mount=type=cache` keeps pnpm’s store between builds without putting it in a layer.'
			},
			code('Dockerfile', 41, 61, { partial: true }),
			{
				type: 'p',
				text: 'The `build` stage is `prepare` spelled out: package the library, compile the messages, sync the types, then build the element and the app. `PUBLIC_ORIGIN` is a **build argument**, and the stage refuses to continue without it, because SvelteKit bakes `paths.origin` into the server bundle (chapter 03) and Better Auth derives its base URL from the same value. This is the fact that decides the deployment model: one image per origin. The other two variables are placeholders — `src/env.ts` validates that they exist at import time, and they are never read during a build — and they do not survive into the runtime stage. `pnpm prune --prod` then removes every devDependency: the compilers, the test runners, drizzle-kit, Playwright. That is most of `node_modules`. The `CI=true` in front of it is a scar from the first pipeline run: pnpm 11 asks for confirmation before it purges a modules directory, and with no terminal to ask on it aborts the build instead of asking — the variable is how you tell it nobody is there.'
			},
			code('Dockerfile', 64, 102, { partial: true }),
			{
				type: 'p',
				text: 'The `runtime` stage starts from a clean `node:slim` and copies five things from the build: the manifest, the pruned `node_modules`, the `build/` directory, the `drizzle/` migrations and the migration script. Nothing else — no source, no tests, no `.git`. It runs as the `node` user the base image ships with, because nothing here needs root and a process that does not need root should not have it. `/data` is a volume owned by that user, and `DATABASE_URL` points into it, so the database outlives the container.'
			},
			{
				type: 'ul',
				items: [
					'`HOST=0.0.0.0` — adapter-node binds to localhost by default, which inside a container means “reachable by nobody”.',
					'`SHUTDOWN_TIMEOUT=10` — on `SIGTERM`, adapter-node stops accepting connections, lets in-flight requests finish for this many seconds, and exits. An orchestrator’s grace period is usually thirty; a shutdown that outlasts it is a `SIGKILL` anyway, so this is shorter.',
					'`BODY_SIZE_LIMIT=8M` — the largest request body the server will read. Notes and expenses are kilobytes; this leaves room for the future without accepting a gigabyte.',
					'`HEALTHCHECK` — the same question a load balancer asks, so `docker ps` shows the truth about the container rather than whether the process exists.',
					'`STOPSIGNAL SIGTERM` and `CMD [\"node\", …]` in exec form — `node` is PID 1 and receives the signal directly. A `CMD` written as a shell string would put `sh` in front, and `sh` does not forward signals; the container would hang until it was killed.'
				]
			},
			code('scripts/migrate.ts', 20, 39),
			{
				type: 'p',
				text: 'The `CMD` is `node --import ./scripts/migrate.ts build`: the migration module runs to completion before the server’s entry point starts listening, in one process. A separate migration container is the alternative, and the right one for a fleet; for one service with one database, the simplest thing that cannot be forgotten is a server that migrates itself. Drizzle records which migrations have run, so a restart applies nothing and takes milliseconds. Node runs TypeScript directly — the file has no build step — which is what makes it possible to copy one source file into the image and run it.'
			},

			{ type: 'h3', id: 'health', text: 'The health endpoint and the first request' },
			code('src/routes/healthz/+server.ts', 19, 32),
			code('src/hooks.server.ts', 200, 204),
			{
				type: 'p',
				text: '“Healthy” means the database answers. A process that is up and cannot reach its data is a process that should not be receiving traffic, and `select 1` is the cheapest way to ask. The response carries the `version` — the commit the build was made from, through `kit.version.name` in chapter 03 — so “which version is live?” is one request, and `cache-control: no-store`, because a cached “healthy” is worse than none. `init` in the hooks reaches the database once before the first request, which turns “the deploy is broken” into a process that never claims to be healthy — and that is precisely what a rolling deployment needs in order to keep the old version serving.'
			},
			code('src/instrumentation.server.ts', 19, 27),
			{
				type: 'p',
				text: 'The tracing provider (chapter 35) is registered in `instrumentation.server.ts`, which adapter-node imports *before* the server — that ordering is the whole reason the file exists, and it is why the diagnostics page shows spans from the very first request in the container rather than from the second.'
			},

			{ type: 'h3', id: 'compose', text: 'Compose: the whole deployment on one machine' },
			code('compose.yaml', 10, 44),
			{
				type: 'terminal',
				code: `
$ PUBLIC_ORIGIN=http://localhost:3000 BETTER_AUTH_SECRET=$(openssl rand -base64 32) docker compose up --build
…
meridian-1  | Migrations applied in 41 ms
meridian-1  | Listening on http://0.0.0.0:3000

$ curl -s localhost:3000/healthz
{"ok":true,"version":"a1b2c3d","uptimeSeconds":12}

$ docker compose down     # SIGTERM, in-flight requests finish, exit code 0`
			},
			{
				type: 'p',
				text: 'The compose file adds what the image cannot know: the secret, which is *required* — the `:?` syntax makes compose refuse to start without it, with a message that says what is missing — the volume, the port, and a `stop_grace_period` slightly longer than the server’s own shutdown timeout, so compose never kills a server that is still finishing a request. The health check is repeated here because compose’s `depends_on: condition: service_healthy` reads it, so a reverse proxy in a larger file can wait for a healthy app rather than a started one.'
			},
			code('.dockerignore', 1, 27),
			{
				type: 'p',
				text: 'The ignore file is a security file as much as a size file. A local database, a `.env` with a real secret, the `.git` history: none of them may end up in a layer, where they would be visible to anyone who can pull the image. The generated directories are ignored too, because the build stage regenerates them and a stale copy from a developer’s machine would be a source of mysteries.'
			},

			{ type: 'h3', id: 'pipeline', text: 'The pipeline' },
			code('../.github/workflows/meridian.yml', 46, 90, { partial: true }),
			{
				type: 'p',
				text: 'The `verify` job runs exactly what a developer runs before pushing — `pnpm run verify`: type-check, formatting and lint, the unit and browser tests, the production build, the end-to-end suite in both profiles — and then `verify:package` for the library. Nothing in the job is a step a person could not run locally, which is the property that keeps a pipeline debuggable. One Chromium serves both Vitest’s browser project and Playwright. The traces are uploaded only on failure, because a green run has nothing to show.'
			},
			code('../.github/workflows/meridian.yml', 92, 135, { partial: true }),
			{
				type: 'p',
				text: 'The `image` job is the one this chapter is named for. It builds the Dockerfile with the same build argument compose uses, **starts the container**, polls the health endpoint for up to thirty seconds, fetches a prerendered guide in two languages out of the running image, and then stops the container and asserts that the exit code was zero — which is the graceful shutdown, tested. A Dockerfile that is built and never run proves that it builds; this proves that the migration ran, the database answered, the prerendered files were copied, and `SIGTERM` reaches the process.'
			},
			code('../.github/workflows/meridian.yml', 137, 164, { partial: true }),
			{
				type: 'p',
				text: 'The `course` job checks the thing you are reading: every quoted range is a whole thing in a real file, the pages build, and the built pages pass the reader-side checks — no horizontal overflow at a phone width, no console errors, every link resolves. Its last step diffs the committed `dist/` against a fresh build, so the course that is published is the course the source produces. The path filters at the top of the file keep this workflow from running for the other seven projects, each of which is verified the same way from its own folder.'
			},
			{
				type: 'why',
				title: 'Why adapter-node and a container, and not a platform adapter',
				text: 'The project could deploy to a serverless platform with a change of adapter, and for a marketing site it should. It does not, for three reasons that are all in this part. The live query is a long-lived server-sent stream and presence is a heartbeat; both want a process that stays up. The database is a file, and a file wants one writer on one disk. And the tracing exporter keeps spans in the process’s memory for the diagnostics page. A container running one process is the simplest shape that gives all three, and it runs identically on a laptop, a small VPS and a Kubernetes cluster. If the project outgrew one machine, the first move would be a libSQL server for the database and a pub/sub for the rooms — and the code that would change is in chapter 18 and chapter 13, not here.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why `PUBLIC_ORIGIN` is a build argument and what “one image per origin” means for a staging environment.',
					'You can say what each of the three stages produces and why the runtime stage copies exactly five things.',
					'You can describe what the `image` job proves that a `docker build` alone does not.'
				]
			}
		]
	},

	{
		slug: 'what-i-would-do-next',
		title: 'What I would do next, and what you now know',
		summary:
			'The project is complete and the suite is green, and it is still version one. An honest list of the next ten pieces of work, each with the chapter it would touch and the reason it was not done this week; a map from every Svelte and SvelteKit capability the course used to the chapter that used it; and how to keep the project current as the framework moves.',
		goal: 'Leave with a prioritised backlog you could start on tomorrow, a mental index of where each framework feature lives in the code, and a routine for upgrading without breaking the course.',
		blocks: [
			{
				type: 'p',
				text: 'A course that ends with “and now it is done” is lying to you. Software is finished when it is deleted; until then it has a backlog, and a good backlog is the most honest description of a project’s state. This one is ordered by what a real trip-planning team would ask for first, and every item names the chapter whose code it would change, because the chapters were written so that this list could be short.'
			},

			{ type: 'h3', id: 'backlog', text: 'The next ten' },
			{
				type: 'ol',
				items: [
					'**A real tile server, behind a feature flag.** The bundled world is the right default — offline, no keys, no third party — and it is too coarse for a city. A vector tile source is one origin in `connect-src` (chapter 43), one `style` swap in the map (chapter 27), and an environment variable in `src/env.ts` so the offline build stays the default. The flag is what keeps CI free of network.',
					'**Invites by email.** The invite *link* works; a mail with the link in it is a queue and a sender. The clean shape is an outbox table written in the same transaction as the invite (chapter 19) and a worker that drains it — the pattern the third project in this series built in full.',
					'**Offline notes.** Tiptap already holds the document (chapter 30); an IndexedDB copy and a queue of `saveNote` commands to replay on reconnect would make the notes tab survive a train tunnel. The fourth project’s service worker chapters are the blueprint, and `query.live`’s reconnect already handles the read side.',
					'**Photos on stops.** `@sveltejs/enhanced-img` handles the *static* images (chapter 22); uploads need object storage, a signed upload URL from a `command`, and a thumbnail pipeline. `BODY_SIZE_LIMIT` (chapter 44) is the first number to revisit.',
					'**Rate limiting the public surface.** Sign-in, sign-up, the join page and the route API are reachable by anyone. A token bucket keyed by IP in the security handler (chapter 43), backed by the database or memory, is a morning’s work and the first thing a penetration test would flag.',
					'**A libSQL server instead of a file.** The file is right for one machine; the moment there are two, `DATABASE_URL` becomes a `libsql://` URL (chapter 13) and the rooms need a pub/sub that both processes share (chapter 18). Drizzle and the migration script do not change.',
					'**Exporting the traces.** The in-memory ring buffer (chapter 35) is for one process and a curious developer. Pointing the same provider at an OTLP collector is a different exporter in `instrumentation.server.ts` and nothing else — which was the point of putting OpenTelemetry in rather than a custom logger.',
					'**More of the itinerary on the map.** The map shows stops and the route; it could show days as colours, the selected stop’s neighbours, and a “fly to” on selection using the same `interpolate()` the globe uses (chapter 28).',
					'**A fourth locale, right-to-left.** Paraglide makes a new locale a new JSON file (chapter 20); an Arabic or Hebrew one would also exercise `%paraglide.dir%` and every `inline-start` in the CSS (chapter 22), which is why the tokens were written logically from the start.',
					'**Accessibility audit with real assistive technology.** The roles and names are there and the tests assert them; a session with a screen reader on the itinerary’s drag-and-drop and the date picker would find what tests cannot, and svelte-dnd-action’s keyboard mode deserves a chapter of its own.'
				]
			},
			{
				type: 'p',
				text: 'Three things are deliberately *not* on the list. A native app: the web app is installable as it stands, and the map and the globe already work on a phone. A rewrite of the itinerary as a CRDT: the live query with last-write-wins per stop is the right trade for a few people planning a trip, and the fourth project in this series is the one to read if you need the other trade. And “more libraries”: chapter 37 spent as long on what was rejected as on what was chosen, and every item above is doable with what is installed.'
			},

			{ type: 'h3', id: 'map', text: 'Where everything lives' },
			{
				type: 'p',
				text: 'This is the index of the course by *capability* rather than by feature — the list to keep open when you start your own project and want to remember where a thing was done properly.'
			},
			{
				type: 'ul',
				items: [
					'**Runes** — `$state`, `$derived`, `$derived.by`, `$effect`, `$effect.pre`, `$props`, `$bindable`, `$state.raw`, `$state.snapshot`, assignable `$derived`: chapters 06, 24, 25, 31. `untrack` and the effect-loop it prevents: 31. Classes with runes in `.svelte.ts`: 06, 24.',
					'**Templates** — snippets and `{@render}`: 23, 25; `{#await}` and `await` in markup with `{const … = await …}`: 24, 33, 36; `<svelte:boundary>` with `pending` and `failed`: 24, 28; `{@attach}` attachments: 27, 30; `animate:flip` with `svelte-dnd-action`: 25; `<svelte:options customElement>`: 36; `{#key}`: 31.',
					'**Reactivity utilities** — `MediaQuery`, `createSubscriber`, `scrollY` from `svelte/reactivity/window`, `SvelteMap` versus a plain `Map`: 40; `Debounced` from runed: 35, 40.',
					'**Remote functions** — `query`, `query.batch`, `query.live`, `prerender`, `form`, `command`: 16, 17, 18; single-flight `.updates()` and `requested().refreshAll()`: 17, 18, 31; `invalid(issue.field())` and `fields.x.as(…)`: 17, 29; the transport hook: 14.',
					'**Routing and loading** — route groups, `defineParams` matchers, `resolve()` with typed route ids including groups: 03, 23, 33; `entries()` with `prerender` and `csr = false`: 34, 36; `reroute` for locales: 20; `+server.ts` endpoints with CORS and `OPTIONS`: 36, 43; the root layout with no `load` so prerendered pages do not bake a user in: 23.',
					'**Hooks** — `sequence`, `handleFetch`, `handleError` with `kind`, `init`, `transport`, `reroute`; hook types from `@sveltejs/kit/hooks`: 14, 43, 44.',
					'**Configuration** — everything in `vite.config.ts`: `dynamicCompileOptions` for a client-only custom element, `tracing`, `csp` in `auto` mode, `csrf`, `version`, `preprocess` for mdsvex, `optimizeDeps` for the browser tests: 03, 41, 43.',
					'**Build and runtime** — `@sveltejs/package` with publint and arethetypeswrong: 08; `@sveltejs/enhanced-img`: 22; `read()` for a bundled asset from an endpoint: 27; a second Vite config for the element’s IIFE: 36; `$app/env`’s `browser`, `building`, `version`: 14, 24, 44; view transitions with `onNavigate` and an update banner from `version.pollInterval`: 23.',
					'**The ecosystem** — headless (Bits UI, TanStack Table): 26, 29, 38; wrappers (svelte-maplibre, Threlte, LayerChart): 27, 28, 29, 39; imperative through an attachment (Tiptap, GSAP): 30, 22; compilers (Paraglide, mdsvex, Phosphor’s plugin): 20, 34, 22; the survey and the rejections: 37.',
					'**Proof** — Vitest projects and `vitest-browser-svelte`: 41; Playwright on the built server, two viewports, two contexts: 42; the container, the health check, the pipeline: 44; the course’s own checks: 44.'
				]
			},

			{ type: 'h3', id: 'upgrading', text: 'Keeping it current' },
			{
				type: 'terminal',
				code: `
$ pnpm outdated                       # what moved since the lockfile
$ pnpm update --latest --interactive  # pick, do not take everything blindly
$ pnpm run verify                     # check · lint · unit · build · e2e
$ pnpm run verify:package             # the library, as a consumer meets it
$ node ../meridian-course/verify.js   # every quoted range is still whole
$ node ../meridian-course/build.js && node ../meridian-course/tools/check-dist.js`
			},
			{
				type: 'p',
				text: 'The framework this course is built on moves every few weeks, and the versions in chapter 37 are dated for that reason. The routine above is the whole upgrade process, and the reason it is short is the reason the tests exist: `verify` is the same command in the pipeline and on a laptop, the suite runs against the built output, and the course reads the code rather than copying it — so a refactor that moves a function changes the course the next time it is built, and `verify.js` says which ranges need a human. When a SvelteKit release renames a thing, the Svelte documentation server and the `svelte-autofixer` used throughout this series are the fastest way to learn the new name; when it adds a thing, the question to ask is the one from chapter 01: is this the right shape, does it earn its bytes, could we remove it later.'
			},
			{
				type: 'p',
				text: 'You have built a collaborative application with a real-time document, three languages, a map, a globe, a shared ledger, an editor, a public API, an embeddable element, a published library, a container and a pipeline — and you have read every line of it with the reason beside the code. That is what “state of the art” means in practice: not the newest thing, but the right thing, chosen on purpose, and proven.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can pick one item from the backlog and name the files it would change before opening the editor.',
					'You can find the chapter for any capability in the map above without searching.',
					'You can run the upgrade routine end to end and say what each of its six commands protects.'
				]
			}
		]
	}
];
