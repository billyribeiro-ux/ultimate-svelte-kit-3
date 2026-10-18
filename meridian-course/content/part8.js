/**
 * PART 8 — Proof and production
 * (chapters {{unit-and-browser-tests}}–{{what-i-would-do-next}})
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
				text: 'Every project in this series has had tests; this one has *three kinds*, and the useful thing to learn is the boundary between them. A **unit test** calls a function and checks the return value — no DOM, no server, milliseconds. A **component test** mounts one Svelte component in a real browser and interacts with it the way a person would — clicks, typed text, what is visible — with nothing behind it but props. An **end-to-end test** (chapter {{end-to-end}}) drives the whole built application through a real browser against a real database. The first is for logic, the second for behaviour, the third for the seams between everything. A behaviour tested at the wrong layer is either slow and brittle (a fair-split rule checked by clicking through the expenses tab) or falsely reassuring (a drag-and-drop “tested” by calling the handler).'
			},

			{ type: 'h3', id: 'two-projects', text: 'Two projects in one config' },
			code('vite.config.ts', 330, 404),
			{
				type: 'p',
				text: 'Vitest’s `projects` are separate test environments that share one runner and one command. The `server` project is plain Node: it picks up every `*.spec.ts` and `*.test.ts` that is *not* a `.svelte.` test, and runs the domain maths, the schemas, the geodata builder and anything that touches the database. The `client` project is a real Chromium started by Playwright, and it picks up only the `.svelte.test.ts` files. Neither names an `extends`: since Vitest 5 an inline project inherits the config that declares it (naming the file again would load the Svelte plugin twice, and Vitest says so), so the same aliases, the same Svelte plugin and the same Paraglide plugin apply — a component test sees `#lib/…` and `m.some_message()` exactly as the app does.'
			},
			{
				type: 'p',
				text: 'Three settings deserve a sentence each. `expect.requireAssertions` makes a test that asserts nothing a *failing* test — the most common way a test quietly stops testing is an early `return` or a promise nobody awaited, and this catches both. `fileParallelism: false` on the server project is for SQLite: it allows one writer, and two spec files seeding the same file at once produce a dozen `SQLITE_BUSY` failures in whichever file lost the race, none of which are bugs. And the `optimizeDeps.include` list on the client project is a Vite detail worth knowing: the Phosphor plugin rewrites `phosphor-svelte` imports into deep ones *during* transform, after Vite’s dependency scan, so on a cold cache Vite discovers them in the middle of a test run, re-bundles, and reloads the page under the test. Naming them up front is the fix Vitest itself suggests in its warning.'
			},
			{
				type: 'why',
				title: 'Why a real browser and not jsdom',
				text: 'jsdom is a DOM written in JavaScript, and it is a good one, but it has no layout engine, no WebGL and no real events. The map needs WebGL; the drag-and-drop reads `getBoundingClientRect` and listens for pointer events with real coordinates; `animate:flip` measures positions; Bits UI’s date picker positions a popover. In jsdom every one of those would “pass” by doing nothing. Chromium under Vitest starts in about two seconds and runs the eleven component tests in this project — four files, as the run at the end of this chapter shows — in under five, which is a cheap price for tests that mean something.'
			},

			{ type: 'h3', id: 'logic', text: 'The logic: worked examples, not just properties' },
			code('src/lib/domain/split.spec.ts', 1, 42),
			{
				type: 'p',
				text: 'The tests for `shares()` (chapter {{splitting-fairly}}) are examples with the answers worked out by hand — a thousand cents three ways is 333, 333, 334 — and the two properties the function promises: the shares always sum to the whole, and the extra cent goes to the same person whatever order the participants came in. Property-based testing with a library like fast-check would generate thousands of random cases and is exactly right for a CRDT or a parser; for a function with four rules it is more machinery than the rules. The line: if you can enumerate the interesting inputs on one hand, enumerate them; if you cannot, generate them.'
			},
			code('src/lib/domain/split.spec.ts', 44, 87),
			{
				type: 'p',
				text: 'The settle-up tests pin down the two things a person would notice: the balances sum to zero (the money that was paid is the money that was owed), and the transfers are the greedy pairing of the largest debtor with the largest creditor, which produces at most `people − 1` payments. The last test is the one that would catch a refactor: it gives a ledger where the greedy choice matters and asserts the exact list, in order, so “equivalent but different” output is a failure until somebody decides the new order is the right one.'
			},
			code('packages/waypoint/src/lib/geo/geo.spec.ts', 19, 45),
			{
				type: 'p',
				text: 'The geodesy tests (chapter {{geodesy-for-humans}}) use cities whose distances are public knowledge — London to Paris is 343 kilometres, and `toBeCloseTo(343.5, 0)` asks for that to the nearest whole number — together with the properties that do not need a reference: symmetry, zero to itself, a metre is a metre. Notice the third test creates its expected point *with the library’s own `destination()`* and then measures back; that is a round-trip test, and it is what makes the pair of functions trustworthy together even though each alone is checked only loosely.'
			},
			code('packages/waypoint/src/lib/route.svelte.test.ts', 27, 46),
			{
				type: 'p',
				text: 'A `.svelte.test.ts` file for a *class*, not a component: `Route` (chapter {{a-route-as-a-class}}) is built on runes, and runes exist only in files the Svelte compiler processes. The `.svelte.` in the name is what asks for that. `flushSync()` from `svelte` forces the pending derivations to settle synchronously, so the test can assert on `route.total` the line after `route.add(…)` rather than awaiting a tick; without it, a `$derived` is lazy and would still be correct — but the assertion might read it before the effect that recomputes it had run.'
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
				text: '`Leg` is the component the Markdown guides embed (chapter {{guides-prerendered-with-mdsvex}}). Its test does double duty: it proves the arithmetic and the compass point, and — because `Leg` imports the gazetteer and the geodesy package — it proves that the *workspace package* resolves from the app in a browser build. The second test is a rejection: `render()` of a component whose script throws returns a promise that rejects, and `rejects.toThrow(/atlantis/)` pins the message so a future refactor cannot turn a clear error into a blank component.'
			},

			{ type: 'h3', id: 'design-as-data', text: 'The design, tested as data' },
			{
				type: 'p',
				text: 'Three files test the design rather than the domain. Two are in the server project, in Node, not the browser, on purpose: each asks a question that has an answer without a page. The third is in the browser because the second could not answer its question on its own. The first is the contrast table from chapter {{the-design-system}}.'
			},
			code('src/lib/design/contrast.spec.ts', 5, 29),
			{
				type: 'p',
				text: 'Arithmetic first, against figures anyone can check: black is luminance 0 and white is 1, the ratio runs from 1:1 to 21:1 whichever colour comes first, and `#767676` on white is 4.54:1 — the lightest grey that passes AA, a number quoted in every accessibility guide — while `#777777`, one step lighter, is 4.48:1 and fails. A contrast function that got the linearisation wrong would be off by a few hundredths, and those two greys sit on either side of the line by a few hundredths. That is what makes them the right examples: they test the function exactly where it matters.'
			},
			code('src/lib/design/contrast.spec.ts', 31, 73),
			{
				type: 'p',
				text: 'Then the parser, on a stylesheet written in the test — a `light-dark()` pair, a plain hex, an alias of an alias, and a shadow that is not a colour and must be left out — and the two ways a pair fails: under its floor, and naming a token that does not exist, whose ratio is `null` rather than a crash. The last test reads the real `tokens.css` and expects no failures, which duplicates `scripts/contrast.ts` in `pnpm run lint` on purpose: the lint gate prints a table for a person, and the test fails in the same run as everything else when somebody runs only `vitest`.'
			},
			code('src/lib/ui/date-segments.spec.ts', 1, 52),
			{
				type: 'p',
				text: 'The second is the function that localises Bits UI’s date segments (chapter {{dates-and-money-in-a-locale}}). It is a pure function of the props Bits computed, so the test hands it what Bits writes — `aria-label="day, "`, `aria-valuetext="Empty"` — and checks what comes out: a German day is “Tag”, a Portuguese month “mês”, straight from `Intl.DisplayNames`; “Empty” becomes the page’s word and gains `data-empty`; a typed value is left as Bits wrote it; an issue makes the segment `aria-invalid` and points it at the issue line; and the separators are untouched. Node 24 ships full ICU, so `Intl` here knows every locale a browser does, and the test needs no browser to know what a screen reader will hear.'
			},
			code('src/lib/ui/DateField.svelte.test.ts', 1, 29),
			code('src/lib/ui/DateField.svelte.test.ts', 32, 52),
			{
				type: 'p',
				text: 'And then the same promise kept a second way, because the first cannot keep it alone. The spec feeds the function a hand-written copy of what Bits writes; the function finds a blank segment by comparing Bits’ `aria-valuetext` with the literal “Empty”. If a Bits release renamed that word, or translated it, the copy in the spec would still say “Empty” and pass, while on the page `data-empty` silently went and Bits’ new word was announced. So this file, in the browser project, renders the two real fields with Bits doing the computing — on a German page and a Brazilian one, by overwriting Paraglide’s `getLocale()` for each test and putting the page’s own back after — and asks the segments what they say: “Tag, ”, “Leer”, `data-empty`, and after a “3” is typed, no longer empty. The last two tests open the calendar and ask for “Vorheriger Monat”, and read the segments of a range field in Portuguese. A mutation run made the point: with the function’s “Empty” changed to another word, the spec stayed green and two of these went red.'
			},
			{
				type: 'note',
				text: 'The date field’s icons are listed in `optimizeDeps.include` in `vite.config.ts`, beside the ones the other component tests use. Without them Vite discovered three icons in the middle of the first run, bundled them again, and the test failed inside Bits with a `TypeError` from a second copy of Svelte’s runtime — the warning the comment in the config quotes is Vitest asking for exactly this.'
			},
			{
				type: 'why',
				title: 'Why test a design decision at all',
				text: 'Because the decisions that make an interface accessible are the ones nobody sees break. A token darkened for a brand refresh, a library upgrade that renames an attribute: the page still looks right to the person who changed it, and the first to notice is somebody who cannot read the grey or whose screen reader now speaks English on a German page. A test that pins the decision as data turns “somebody will notice eventually” into a red line in the run that made the change.'
			},

			{ type: 'h3', id: 'running', text: 'Running it' },
			code('package.json', 25, 29, { partial: true }),
			{
				type: 'terminal',
				code: `
$ pnpm run test:unit -- --run

 ✓ |server| src/lib/domain/split.spec.ts (9 tests)
 ✓ |server| src/lib/domain/itinerary.spec.ts (8 tests)
 ✓ |server| src/lib/design/contrast.spec.ts (7 tests)
 ✓ |server| src/lib/domain/dates.spec.ts (6 tests)
 ✓ |server| src/lib/domain/money.spec.ts (6 tests)
 ✓ |server| src/lib/domain/schemas.spec.ts (5 tests)
 ✓ |server| src/lib/ui/date-segments.spec.ts (4 tests)
 ✓ |server| src/lib/server/locale-url.spec.ts (4 tests)
 ✓ |server| src/lib/server/geodata.spec.ts (3 tests)
 ✓ |client (chromium)| src/lib/ui/DateField.svelte.test.ts (5 tests)
 ✓ |client (chromium)| src/lib/trip/StopCard.svelte.test.ts (2 tests)
 ✓ |client (chromium)| src/lib/ui/RouteThumb.svelte.test.ts (2 tests)
 ✓ |client (chromium)| src/lib/guides/Leg.svelte.test.ts (2 tests)

 Test Files  13 passed (13)
      Tests  63 passed (63)`
			},
			{
				type: 'p',
				text: 'The library has its own suite — `pnpm --filter @meridian/waypoint test` — with the geodesy properties, the `Route` class and the `Compass` component, and chapter {{packaging-and-proving}} runs it as part of `verify:package`. Both suites are under a minute, which is the number that decides whether people run them before every push or only when the pipeline complains.'
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
					'You can explain what `expect.requireAssertions` protects against, and what `flushSync` is for in a test of a runes class.',
					'You can say why the contrast examples are `#767676` and `#777777`, and why the date-segment test needs no browser.'
				]
			}
		]
	},

	{
		slug: 'end-to-end',
		title: 'End to end: the built server, two viewports, two people',
		summary:
			'Playwright runs against `node build/index.js` — the same process a deployment runs — on a database rebuilt from the seed before every run, in a desktop and a Pixel 7 profile, and the design’s checks in a third at 360px. Six suites cover a stranger, an account, one trip’s every tab, the map’s own behaviour, two browsers on one trip, and invites plus the embed; a seventh asks every screen of the design, in both themes and at three widths, whether anything sticks out, whether a finger can hit it, what axe finds, and how it paints, on a fast connection and a slow one; and a bundle guard after the build holds the chunks to a budget. How the suite is kept honest, what it found, and what each failure taught.',
		goal: 'Run the end-to-end suite locally, read a failure’s call log and trace, and write a new test that signs in, does one thing, and cleans up after itself.',
		blocks: [
			{
				type: 'p',
				text: 'An end-to-end test is the only kind that can fail because of a **seam**: a cookie the hook did not read, a header the adapter did not send, a prerendered page that baked the wrong user in, a form the CSRF check refused. Those are exactly the failures that unit tests cannot see and that real people hit first. So the suite runs against the *built* application — the adapter’s output, its server, its database — and not against the dev server, and the configuration says why at length.'
			},
			code('playwright.config.ts', 41, 114),
			{
				type: 'p',
				text: 'Read the `webServer` block as a recipe: rebuild the database from the migrations and the seed, build the app, start the adapter’s server on port 4173. Playwright waits for the port, runs the suite, and stops the process. `reuseExistingServer` is on outside CI, so a developer who already has the built server running skips the three-minute build — and in CI it is off, so the pipeline always tests what it just built. The environment block matters more than it looks: `PUBLIC_ORIGIN` is **baked into the bundle** at build time (chapter {{the-config}}), and the server compares it with each request’s origin; if the build said 5173 and the test hits 4173, every form submission is a 403. It took an afternoon to learn that the same value has to be present in both places, which is why the comment is there.'
			},
			{
				type: 'p',
				text: '`workers: 1` and `fullyParallel: false` are not timidity. The suite shares one SQLite file and its tests *create* things — a trip, a stop, an expense — and then expect to find them; two workers would race. Serial costs several minutes of wall clock for two hundred and fifty-one tests across the three projects — the design suite’s axe runs are most of it — plus the build, the first time, and buys a suite whose failures are always real. The third project is the Pixel 7 narrowed to 360px, with a screen of the same size, and it runs `visual.e2e.ts` alone: a behaviour does not change between 412px and 360px, and a layout does.'
			},
			{
				type: 'p',
				text: '`serviceWorkers: \'block\'` is the one line in `use` that takes something away, and it is there for the same reason as `workers: 1`. The app registers a service worker on every page load, and a worker that installs copies the whole build in the background (chapter {{the-offline-itinerary}}): in a suite of short tests, each in a fresh browser context, that is one download of the build per test, racing the page under test, with navigations answered by the worker instead of the server. So the suite tests the app without its worker, and `offline.e2e.ts` — the one file about the worker — lets it back in with `test.use({ serviceWorkers: \'allow\' })`.'
			},
			code('scripts/prepare-e2e-db.js', 18, 47),
			{
				type: 'p',
				text: 'The database is deleted and rebuilt before every run — the file and its `-wal` and `-shm` sidecars — through the *migrations*, not `drizzle-kit push`. That is a small act of discipline with a large payoff: a schema change that was made in `schema.ts` and never turned into a migration fails here, on a developer’s machine, instead of in the container in chapter {{deploying}}. The seed (chapter {{the-database}}) then creates three people and two trips, and every test knows their names.'
			},

			{ type: 'h3', id: 'helpers', text: 'The helpers: what every test needs' },
			code('e2e/helpers.ts', 27, 59),
			{
				type: 'p',
				text: '`signIn` goes through the real form, not through an API call and a hand-made cookie: the test then exercises the sign-in remote form, the redirect guard and the session cookie’s attributes for free. `openMenu` is the phone-versus-desktop seam made explicit — the header’s links are behind a menu button under 48em — so a test written once runs unchanged in both projects. It waits for the root layout’s `data-hydrated` attribute first, because the menu button needs JavaScript and a click before hydration is a click nobody is listening to; the language-switch test found that one, about one run in twenty. `openTab` finds the tab strip by its accessible name and asserts the URL afterwards, because the tab *is* a URL (`?tab=expenses`) and a test that clicked a tab and moved on would not notice if the click had been swallowed.'
			},
			code('e2e/helpers.ts', 61, 90),
			{
				type: 'p',
				text: '`typeDate` exists because Bits UI’s date picker is not an `<input type="date">`; it is three editable segments per date, in the locale’s order, and Playwright’s `fill()` has nothing to fill. Clicking a segment and typing is what a person does, so it is what the helper does — and the work is in `typeDateInto`, which takes any date input as a locator, because the expense form’s date is the same picker now: the trip’s two dates find their input by position in the range, the expense finds its by role, `getByRole("group", { name: "Date", exact: true })`. When a control has a custom keyboard model, the helper that drives it belongs in one place with a comment saying what that model is.'
			},

			{ type: 'h3', id: 'suites', text: 'Six suites' },
			code('e2e/public.e2e.ts', 14, 34),
			{
				type: 'p',
				text: 'The stranger’s suite asserts things that are easy to break and hard to notice. That the guides page ships **no script at all** is the whole point of `csr = false` (chapter {{guides-prerendered-with-mdsvex}}), and `script[src]` count zero is the only assertion that proves it. That `/de/guides` has `lang="de"` proves the reroute hook, the prerender entries and the `%paraglide.lang%` replacement all agree for a page that was built at compile time, with no request to consult. That the text inside a guide is `Lisbon → Sintra` with a distance proves a Svelte component inside Markdown ran the geodesy library at build time.'
			},
			code('e2e/public.e2e.ts', 48, 66),
			{
				type: 'p',
				text: 'The same race as the sign-in form’s, on a plain input. Text typed into the explore filter before the page had hydrated was wiped when it did: the filter is a `bind:value` on a `$state` that starts empty, and hydration writes the state into the input. The account suite’s test of an explore-to-new-trip journey filled the filter straight after `goto` and failed on a slow run with “1 place” never appearing — the field was empty in its snapshot. The cure is the one `keepTyped()` applies to the form (chapter {{signing-in-and-up}}): the page’s script runs while the server’s input is still on the page, so the filter’s state starts from what is in it. The test holds the client bundle back, types, lets it go, and expects the text and the filtered list to have survived.'
			},
			code('e2e/public.e2e.ts', 91, 126),
			{
				type: 'p',
				text: 'A test with JavaScript switched off, because the bug it guards was invisible with it on. With SvelteKit’s default `paths.relative`, a server render’s `resolve()` answered `./explore`, and Paraglide’s `localizeHref` made that a whole URL at the build’s origin — in every page the server sent and every prerendered guide (chapter {{the-shell}}). The browser then hydrated and redrew every link as a path, so nothing looked wrong to anybody with a working script. `test.use({ javaScriptEnabled: false })` makes the page exactly the HTML the server sent, and the test asks it three things: the header’s link is the path `/de/explore`, the header marks it `aria-current=\"page\"`, and no link anywhere starts with `http://localhost`. The phone project hides the nav behind a menu, so the locators say `includeHidden` — the links are in the HTML whether or not they are on screen, and the HTML is what is being tested.'
			},
			code('e2e/public.e2e.ts', 128, 159),
			{
				type: 'p',
				text: 'And a test for the browser’s own `handleError` (chapter {{environment-and-hooks}}), which nothing else reaches: a remote function’s refusal goes through the server’s hook, so a page could lose its client hook and every other test would still pass. The globe is the one chunk loaded on demand, so the test drops it — `page.route` fetches each script and aborts the one that contains the globe’s class name, because the file’s own name is a hash — and opens the globe tab on a German page. The boundary must say “Etwas ist schiefgelaufen” with its “Neu verbinden” button, and the console must carry the hook’s `[meridian]` line. Without the hook, SvelteKit’s default fills the boundary with `Internal Error`, in English, and the first assertion fails.'
			},
			code('e2e/public.e2e.ts', 161, 187),
			{
				type: 'p',
				text: 'The machine-facing test uses `request` — Playwright’s API client, with no browser — for the health endpoint and the route API, and the page for the embed frame. The interesting assertions are the negative ones: the private trip’s API is a 404, the private trip’s frame is a 404, and the public frame’s Content-Security-Policy contains `frame-ancestors *` — the one route the hook allows to be framed (chapter {{security-headers-and-csp}}). A security rule with no test is a security rule that will be refactored away. The last two lines guard a different kind of seam: the frame ships no script, so nothing at run time would notice if it shipped no *style* either — and for a while it did, because a compiler option meant for the custom element caught this page too (chapter {{embedding-a-trip}}). They ask for two facts only the page’s own stylesheet makes true: the card’s computed `max-width` is the 22rem the CSS says, and its list has no indent. The first version asked whether *a* stylesheet was linked, and the root layout’s CSS is linked on every page — so the assertion was true with the bug as well. An assertion that cannot fail is a comment with a cost.'
			},
			code('e2e/account.e2e.ts', 13, 43),
			{
				type: 'p',
				text: 'A fresh account with a unique email per run, so the test can run twice against the same database. It walks the whole loop — refused at `/trips`, sent to sign in with `redirectTo` remembered, creates the account, lands on an empty trips page, signs out, signs back in — and the `openMenu` calls are the phone project earning its keep. The two assertions on the header’s “Trips” link are about a page that did not reload: the header was drawn on the sign-in page, signed out, and the person is now signed in. They failed against a header whose link list was a bare `{const}`, worked out once (chapter {{the-shell}}).'
			},
			code('e2e/account.e2e.ts', 79, 90),
			{
				type: 'p',
				text: 'The German test is about which code produced a sentence, not about German. The sign-in *handler*’s message — “that email and password do not match” — was always localised, because it is written with `m.*()` in the handler. The *schema*’s message for a malformed email runs before the handler, and it answered in English on every page until two things changed: the messages became functions called at failure time (chapter {{schemas-with-valibot}}), and the Paraglide middleware read the locale from the page the form is on rather than the `/_app/remote` URL it posts to (chapter {{three-languages-with-paraglide}}). The test asserts both halves — the German sentence is there, the English one is not — because a test that only looked for German would pass on a page that printed both.'
			},
			code('e2e/account.e2e.ts', 127, 149),
			{
				type: 'p',
				text: 'The delete test answers the dialog twice. Playwright accepts nothing by default — a `confirm()` with no handler is dismissed — so `page.once(\'dialog\', …)` decides each answer explicitly. First “Cancel”: the page must still be the settings page and the trip must still be in the list. Then “OK”: the trip must be gone. The first half is new, and it is new because it failed: the `confirm()` lived in an `onsubmit` that called `preventDefault()`, the remote form’s own submit listener does not look at `defaultPrevented`, and Cancel deleted the trip (chapter {{companions-presence-and-settings}}). Testing only the “yes” path of a question is testing half of it.'
			},
			code('e2e/account.e2e.ts', 152, 192),
			{
				type: 'p',
				text: 'Two tests for things that used to go wrong without a sound. The first needs the server to refuse something the page asked for, and nothing on the trips list ever asks for anything wrong — so the test rewrites the request on its way out. `page.route` holds the `tripPreview` batch, swaps every argument for one the schema refuses, and lets it go on; the server’s `handleError` answers with its sentence for a failed validation, and the boundary must print it. *Where* it is printed is half of the assertion. `+error.svelte` shows `page.error.message` too, so a test that looked for the sentence anywhere on the page would still pass with the boundary gone and the whole page swapped for the error page. So the test looks inside the trips page: under its “Your trips” heading, in the snippet’s `.issue` paragraph, beside the Reconnect button that runs `reset`, where only the `failed` snippet can have put it. Against the old `failed` snippet the page said `[object Object]` (chapter {{trips-and-a-new-trip}}). The second presses Refresh on the diagnostics page and expects the newest row to change, which it did not while the report was a bare `{const}` (chapter {{explore-and-diagnostics}}). Neither waits longer than the default: each change happens once a single request comes back.'
			},
			code('e2e/trip.e2e.ts', 14, 30),
			{
				type: 'p',
				text: '`beforeEach` signs Ana in straight to her trip, and the first test presses `ControlOrMeta+k` — Playwright’s name for “Control on Linux and Windows, Command on a Mac” — to open the command palette and jump to a tab by typing part of its name. A keyboard shortcut is a feature people rely on and never think to report when it breaks.'
			},
			code('e2e/trip.e2e.ts', 60, 83),
			{
				type: 'p',
				text: 'The expenses test adds one row and asserts a *consequence*: that the settle-up now says Ben pays Ana. Its date used to be `fill("2026-05-10")` on a native date input; the field became the segmented picker, in the page’s language rather than the browser’s, so the test types the date segment by segment like a person — the same assertion, through the control that ships. It then removes the row, so the next test — and the next run against a reused server — starts from the seed. Tests that clean up after themselves are the alternative to a database reset between every test, which would cost seconds each and would hide any test that depended on the order.'
			},
			code('e2e/map.e2e.ts', 24, 64),
			{
				type: 'p',
				text: 'The map has a suite of its own because its three bugs were behaviours a screenshot cannot show. The first is a click that goes two places: for an editor a click on the map starts a stop, and pressing a bubble opened the “New stop” dialog over the zoom it asked for (chapter {{the-map}} explains the event delegation behind it). The test presses a bubble and then a pin and expects no dialog, and then clicks the map itself and expects one — the second half is what keeps the first from passing by breaking clicks altogether. `markers()` runs in the page and reads every marker’s centre by its label, which is what the other two tests compare.'
			},
			code('e2e/map.e2e.ts', 66, 105),
			{
				type: 'p',
				text: 'The second is a camera that was taken back. Choosing a stop flew the map to it, and the live query’s next snapshot — brought by the heartbeat the choice itself sends — re-fitted the whole route a few frames later. The test chooses Sagrada Família on the desktop’s side map, waits past the flight and the heartbeat, and expects the chosen pin in the middle of the map. Not Madrid, which was the first choice and is the lesson: Madrid is near the middle of the route, so a re-fit put its pin within a few pixels of the centre too, and the test passed against the bug. A test of “it went there” needs a there that nothing else would go to. The third is pins out of place: a resize at rest makes MapLibre place every marker afresh, so after a one-pixel round trip of the window no marker may have moved — against the bug, the Lisbon bubble moved 24px.'
			},
			code('e2e/collab.e2e.ts', 14, 60),
			{
				type: 'p',
				text: 'This is the test the project was built to pass. `browser.newContext()` twice gives two independent browser profiles — two cookie jars, two sessions — in one test. Ana and Ben sign in separately, and everything after that is a statement about the live query (chapter {{live-collaboration}}): Ben adds a stop and *Ana’s page* shows it, without a reload, because both pages hold the same `query.live` open and the server publishes to the room when the trip changes. The presence assertions ride on the same stream — Ana sees Ben arrive, and sees which stop he is looking at. The timeouts are longer than the default, deliberately: the presence heartbeat is fifteen seconds apart, and a test that asserts within five would be asserting on luck.'
			},
			code('e2e/collab.e2e.ts', 62, 103),
			{
				type: 'p',
				text: 'The second test uses the two people for something else: a command the server refuses for a real reason. Ben adds Bilbao, a stop the seed does not have, so no other test loses a row it counts on, and opens it to rename it; Ana removes it — after a reload, so nothing waits on the live query; Ben saves, and `updateStop` answers 404. What the browser’s `await` rejects with is the `HttpError` SvelteKit rebuilt from the answer, with the server’s sentence on `body.message`, and the toast must say it — “That stop is no longer on the trip.”, a Paraglide message (chapter {{three-languages-with-paraglide}}) — and say nothing else. The assertion is on the toast’s whole title, `toHaveText`, and that is the point of the test. Its first version looked for the toast `{ hasText: \'Not found\' }`, and `hasText` matches a part of the text: the toast the old code printed, `String(error)`, was `{"status":404,"message":"Not found"}`, which *contains* the words, so the test passed against the very bug `errorMessage` was written to fix (chapter {{the-itinerary}}). Run against `String(error)` now, it fails, with the JSON in the call log.'
			},
			code('e2e/collab.e2e.ts', 105, 152),
			{
				type: 'p',
				text: 'The third is about a bug only a second person could cause. The note’s editor was built by an attachment that read the live document, so every snapshot of the live query destroyed the editor and built a new one (chapter {{notes-with-tiptap-through-an-attachment}}). A snapshot cannot be waited for directly, but its consequence can: the presence chip is drawn from the same snapshot as the document, so once Ben is on Ana’s screen, Ana’s page has applied a snapshot after her save. Then the test types again *without clicking* — `toBeFocused` first, because an editor that was rebuilt has lost the cursor, and the keystrokes after it go nowhere — and reloads to prove both sentences reached the server. The old notes test typed once and waited for “Saved”, which the bug never touched.'
			},
			code('e2e/invite.e2e.ts', 63, 93),
			{
				type: 'p',
				text: 'The settings test has a shape worth copying: `try … finally`. It flips the trip to visible-by-link, checks that the embed section appears and that the custom element inside it renders the trip *through the route API* — Playwright locators pierce shadow DOM, so `page.locator(\'meridian-route\').getByText(…)` reaches inside — and then, whatever happened, flips it back. Without the `finally`, one failure in the middle would leave the seeded trip public, and the stranger’s suite in the next run would fail on a 200 where it expects a 404, two files away from the cause.'
			},

			{ type: 'h3', id: 'visual', text: 'The suite that looks at the design' },
			{
				type: 'p',
				text: 'The six suites above are about behaviour. The seventh, `visual.e2e.ts`, is about the things a person reviewing a screenshot is bad at: a control that runs two pixels past its card, a button a finger cannot hit, a missing accessible name, a colour pair a theme change broke. It walks the same list of screens `scripts/screens.ts` photographs — one list, so the screens a person reviews are the screens the gate checks.'
			},
			code('e2e/matrix.ts', 3, 33),
			code('e2e/matrix.ts', 161, 163),
			{
				type: 'p',
				text: 'A screen is a URL plus whatever has to happen before it is the screen: a filter that matches nothing, a sign-in with a bad email, the stop dialog open, the palette, a toast, the phone’s open menu. Twenty-seven of them, in both themes, in all three projects. `ALLOWED_SCROLLERS` names the elements that are wider than the screen on purpose — the expenses table’s wrapper, the tab strip, the two canvases, the toaster, the closed nav — so the overflow check can tell a scroller from a leak.'
			},
			code('src/lib/design/page-checks.ts', 19, 72),
			{
				type: 'p',
				text: 'The checks are functions that run *in the page*: `page.evaluate(fn, arg)` sends a function’s source text to the browser and calls it there, so each must be self-contained — no imports, nothing from the module scope, everything it needs as its one argument. The overflow check asks two questions. Does anything end past the right edge of the screen, outside an allowed scroller? And does any form control run past its card’s *content box*? The second exists because the first missed a real bug: at 360px the new-trip date field poked through the card’s padding onto its border, which does not widen the page, so `scrollWidth` was fine and the field was not. And the gate missed it a second way, which is why there is a third project: the overflow walk ran on the desktop and on a 412px phone, the bug was there only at 360px, and a review that put the fix back to the broken CSS found the suite still green. A check that runs at the wrong width is a check of a different page.'
			},
			code('src/lib/design/page-checks.ts', 81, 196),
			{
				type: 'p',
				text: 'The target check is the design’s rule made executable: on a phone, every visible button, link, input, select, option and `role="button"` is drawn at least 36px each way and answers a press anywhere in a 44px box around its centre. The second half is asked of the browser itself — `document.elementFromPoint()` just inside each edge of that box — so a `::after` that extends the hit area counts, and a neighbour drawn over it does not. A checkbox inside a `<label>` is measured as its label, because the label is what a finger presses; a link inside a sentence is exempt, as WCAG 2.5.8 exempts it; with a modal open only the dialog is swept, because everything behind it is under the scrim on purpose; and a toast passing over the page is a moment, not a layout. Each element is scrolled to the middle of the screen first, so the sticky header is never what the probe hits.'
			},
			{
				type: 'p',
				text: '`role="button"` is in the list because of the map. A MapLibre marker is a `div` with that role, and the probe used to sweep only real buttons, links and form controls — so the pins and the bubbles were checked by nothing, and a mutation that shrank every pin to 16px left the check green. With them in, it found the pins’ press area was 40px, from the same padding-edge arithmetic as the icon buttons (chapter {{the-map}}). A marker is the second, and narrowest, exemption: it may be *drawn* down to WCAG’s own 24px, because a pin is 26px so the route under it stays readable — that is the map’s legibility, not its target — and it must still answer the full 44px press. A marker is never scrolled itself, because scrolling inside a map would move the picture under the probe; its map is brought to the middle instead, and a marker outside what its map shows is not on the screen to press.'
			},
			{
				type: 'p',
				text: 'Its first run failed on controls that *looked* right, and both reasons are worth knowing. An absolutely positioned `::after` with `inset: -4px` is measured from the element’s *padding box*, so on a 36px button with a 1px border it reached 42px, not 44 — hence `--reach` in `base.css`, which is half the difference plus the border. And two 36px buttons 8px apart, on a phone whose device pixel ratio is 2.625, met at a seam that rounds to one device pixel or the other; a press exactly between them could land on either, so the gaps between adjacent small targets became 12px, and a segmented control on a touch screen became 44px tall. Neither shows in a screenshot.'
			},
			code('e2e/visual.e2e.ts', 53, 84),
			{
				type: 'p',
				text: 'Signing in afresh for every signed-in screen would be over eighty sign-ins — fourteen screens, two themes, three projects. `test.extend` adds two fixtures: `anaState`, scoped to the *worker*, signs Ana in once through the real form and saves the cookies as a storage-state file; and `signedIn`, an *option* a `describe` block sets with `use()`. The built-in `storageState` fixture is then overridden to read one from the other, so each test gets a fresh context that starts signed in or signed out, as its screen says — and still a real session, made by the real form.'
			},
			code('e2e/visual.e2e.ts', 86, 170),
			{
				type: 'p',
				text: 'axe is the engine behind most accessibility tooling, and `@axe-core/playwright` runs it in a Playwright page. Two choices are deliberate. The engine is the project’s own `axe-core`, read from `node_modules` and handed over as `axeSource`, so the rules are the newest release rather than whichever the adapter bundled. And every rule axe tags `wcag2a` or `wcag2aa` — WCAG 2’s Level A and AA — runs, and *any* violation fails — not “no serious ones”, which is how a suite learns to live with a moderate problem forever. Only the two canvases are excluded, because a WebGL picture is not something axe can read — the canvases and nothing else. The first version excluded MapLibre’s `.maplibregl-canvas-container`, the element the canvas sits in, and every marker sits in it too: a dozen buttons people press, with names a screen reader announces, were out of axe’s sight, and stripping their names changed nothing in the result. Now it is `canvas.maplibregl-canvas`, and axe reads the markers like any other button. One rule has an exception, on one selector, with the reason written beside it: the palette’s list scrolls and focus never enters it, because it is the listbox of a combobox driven from the input with `aria-activedescendant`, and a tab stop there would do nothing. So the main run disables that rule and a second run applies it to the whole page *except* that selector — an exception that cannot quietly widen.'
			},
			{
				type: 'p',
				text: 'The whole matrix runs with `reducedMotion: \'reduce\'`, and the comment says why: the questions are about where a screen settles. The first run found a 1.97:1 primary button on the dark home page — axe had measured it at 97% opacity, half way through the hero’s fade. Motion is checked where it is decided, in the tokens that reduced motion zeroes; the matrix checks the page it settles into.'
			},
			{
				type: 'why',
				title: 'Why both axe and a hand-written target check',
				text: 'Because axe’s target-size rule is WCAG 2.2’s 2.5.8 — 24px, with spacing — and is not among the rules this suite runs, which are the ones axe tags `wcag2a` and `wcag2aa`. The design asks for more — 36px drawn and 44px to press on a phone, the platform guidelines’ number — and no off-the-shelf rule knows the brief. The general tool checks the standard; the probe above checks the promise the design made. When a project’s own rules are stricter than the standard, they need their own test, or they are a wish.'
			},
			code('e2e/visual.e2e.ts', 172, 193),
			{
				type: 'p',
				text: 'One map at any width. The itinerary’s side map exists from 64em and not below, and the reason is a WebGL context: a hidden MapLibre is still one, and a phone would pay for two on the Map tab. The test opens the itinerary at 1440px and counts one canvas, narrows the same page to 700px and counts none, widens it again and counts one — the `MediaQuery` that decides it is live, so resizing mounts and unmounts the map — and then on the Map tab counts one at both widths.'
			},
			code('e2e/visual.e2e.ts', 234, 287),
			{
				type: 'p',
				text: 'And the three pages people land on — home, explore, a public trip — are measured on the phone profile, twice, with `PerformanceObserver`s installed before any of the page’s own script runs. `buffered: true` delivers the entries that happened before the observer existed. The first time the page loads as it is, and Cumulative Layout Shift must be *zero*, not under Lighthouse’s 0.1; when it is not, the test prints what moved, from each shift’s `sources`. The wait before reading is a second and a half, long enough for anything late — a chart, the live chip, a font — to have moved if it was going to.'
			},
			{
				type: 'p',
				text: 'The second time it loads over a slow connection, and the largest paint must still land inside 2.5 seconds. Unthrottled, on the machine running the suite, that budget meant nothing: the home page’s largest paint was 0.36 seconds and would have had to get seven times worse to fail. So a CDP session — Chromium’s DevTools protocol, which Playwright opens for any page — applies `Network.emulateNetworkConditions` with the round trip and bandwidth Lighthouse’s mobile preset assumes: 150ms, 1.6 Mbps down, 750 kbps up. The home page’s hero then paints at 2.27 seconds, within twenty milliseconds on every run, because a throttled network is the same network everywhere. That is a gate with 230ms of headroom: about forty kilobytes more in front of the hero, and it fails.'
			},
			{
				type: 'why',
				title: 'Why throttle the connection and not the processor',
				text: 'Because a CPU multiplier is relative to the machine it runs on: “four times slower” is one speed on a laptop and another on a CI runner, so the same test would mean two different things. A throttled connection is a fixed number of milliseconds and bytes per second wherever it runs — and here it is the network that decides, too: adding the 4× CPU slowdown on top moved the home page’s paint by less than the run-to-run spread. It is not Lighthouse’s own figure, and the comment says so: Lighthouse simulates each request from an unthrottled run, and its preset for applied throttling adds a margin for that, 562.5ms round trips. On that preset this server’s home page paints at 6.1 seconds: the hero is requested in the first 700ms and arrives last, behind forty module preloads sharing HTTP/1.1’s six connections to one host. A reverse proxy that speaks HTTP/2 in front of `node build` would change that number, and chapter {{deploying}}’s compose file leaves room for one. The gate holds the number it can hold steadily, and the other is written down here so that nobody mistakes one for the other.'
			},
			{
				type: 'why',
				title: 'Why zero, when 0.1 is “good”',
				text: 'Because this project can have zero, and a threshold invites spending it. Every image has its width and height, the fonts are preloaded, the live chip’s slot is as wide as its widest label, the charts reserve their boxes. A shift here would be a bug with a cause, and 0.05 of budget would let the first one through unnoticed and the second one argue it was only another 0.05. A field measurement of real visitors is the place for thresholds; a lab test of three known pages is the place for zero.'
			},

			code('scripts/screens.ts', 1, 46),
			{
				type: 'p',
				text: 'The pictures are still taken, and still looked at by a person — this suite does not replace a review, it holds the review’s conclusions. `scripts/screens.ts` walks the same matrix in three viewports — the 1440×900 desktop, the Pixel 7, and a 360px phone, the narrowest width the type scale is tuned for — and two themes, writes a PNG of each screen to `design/screens/`, and prints the overflow and contrast reports beside them from the same two modules the gates use — exiting non-zero on a problem of either kind. The design of this app was reviewed that way, three times, a hundred-odd pictures at a time; every finding that a machine could have made is now one of the checks above — the third review was largely of the checks themselves, and found the two blind spots this chapter describes — and the ones it could not — a heading that wrapped badly, a fade in the wrong place — are in the comments beside the CSS that fixed them. The folder is ignored by git, because the pictures change with every CSS edit and a few megabytes of PNGs in every diff would bury the change itself.'
			},

			{ type: 'h3', id: 'bundle', text: 'The bundle guard' },
			{
				type: 'p',
				text: 'Two rules of the design can break while every test passes: GSAP belongs in the home page’s chunk and nowhere else, and no chunk over 20 KB gzipped may appear without somebody agreeing to it. A build that succeeds says nothing about either. So `pnpm run verify` runs `node scripts/bundle-guard.ts` between the build and the end-to-end suite, and the guard needs to know what is in each chunk — which a hashed file name does not say.'
			},
			code('vite.config.ts', 445, 479),
			{
				type: 'p',
				text: 'The bundler knows. A Vite plugin is an object with hooks, and `generateBundle` is called once per environment with every chunk the build is about to write, including the modules in each and how many bytes of each survived into the output (`renderedLength`). SvelteKit’s build has a client environment and a server one; the plugin writes only the client’s, to `.svelte-kit/bundle-stats.json` — beside the build, never in it, so it is not served.'
			},
			code('scripts/bundle-guard.ts', 68, 91),
			{
				type: 'p',
				text: 'A budget keyed by file name would break on every edit, because the hash changes with the content. So each chunk is *named* by what it is: the route it renders, the module it was split at (the globe’s dynamic import), or the package that is most of it — names that survive an edit. Two chunks of one package get the largest module’s path inside the package after the name, without pnpm’s version-stamped store path, so an upgrade does not rename them either.'
			},
			code('scripts/bundle-guard.ts', 103, 144),
			{
				type: 'terminal',
				code: `
$ node scripts/bundle-guard.ts
BUNDLE (133 chunks, gzipped)
   531.8 KB  route:src/routes/(site)/t/[slug=slug]/+page.svelte  (budget 531.1)
   206.1 KB  module:src/lib/globe/Globe.svelte  (budget 206.1)
      43 KB  package:bits-ui (bits-ui/dist/bits/date-field/date-field.svelte.js)  (budget 42.9)
    30.9 KB  route:src/routes/(site)/+page.svelte  (budget 30.5)
    24.9 KB  package:svelte (svelte/src/internal/client/reactivity/batch.js)  (budget 24.9)
  everything else is under 20 KB`
			},
			{
				type: 'p',
				text: 'Five chunks are over the limit and all five are in `scripts/bundle-budget.json`, with the size they were measured at — three of them a little over it since, which is what the 10% is for. The trip page is big because it is MapLibre, Tiptap and LayerChart; the globe is three.js, and it loads only when somebody opens that tab (chapter {{the-globe}}). A budgeted chunk may grow 10% before the guard fails; a new chunk over 20 KB fails at once, with its name and its size. When a change is meant to grow one, `--write` measures again and rewrites the budget — and the budget is a file in the repository, so the growth is a line in the diff that a reviewer sees.'
			},
			{
				type: 'why',
				title: 'Why a budget in a file, and not a limit in the config',
				text: 'Vite’s `chunkSizeWarningLimit` is one number for every chunk, a warning, and it is either too low for the trip page or too high for everything else. A budget per named chunk says something more useful: *this* chunk is big, on purpose, at *this* size. It makes the decision visible, and it turns a slow drift — a dependency that adds 3 KB a month — into a failure on the day it crosses 10%, rather than a discovery a year later.'
			},

			{ type: 'h3', id: 'found', text: 'What the suite found' },
			{
				type: 'p',
				text: 'A suite is worth what it catches. Before it went green this one caught six bugs that no unit test could have — one of them only in the phone project, one only in about one run in ten, and one that had been hiding behind a `.catch(() => {})`, which is the argument for a phone project and for never dismissing a flaky test in one paragraph.'
			},
			{
				type: 'ol',
				items: [
					'**The trip page was a 500 for signed-in members.** An `$effect` that sent the presence heartbeat read the heartbeat command’s own `pending` state, which the command updates synchronously — an effect that re-triggers itself, and Svelte stopped it with `effect_update_depth_exceeded`. The fix is in chapter {{the-trip-page}}: read the trip id once, and wrap the command call in `untrack`. The desktop test found this in the first run; the pages had looked fine in a browser because the stack trace was in the server log.',
					'**The place search never searched.** Bits UI’s `Combobox.Input` is a controlled input; binding its value is not the same as listening to it, and the `query` the component filtered on was never updated. Nobody noticed by hand because the seeded stops were already there. `pressSequentially` in the test — typing a character at a time, as a person does — found it.',
					'**The settings page did not update after Save.** The command used `.updates(tripBySlug(slug))` so the server sent the refreshed trip in the same response, and the cache was set — but the page read the query through an `await` in the markup that was worked out once and kept its first answer — a bare `{const initial = await query}`, in today’s syntax. `{const initial = $derived(await query)}` follows the query, and chapter {{companions-presence-and-settings}} shows the page reading it once, that way, with nothing beside it to keep in step.',
					'**Text typed before the page had hydrated vanished.** One run in ten, the sign-in helper filled the email, clicked, and nothing happened: the trace showed no request at all, and the screenshot showed an empty email field with the browser’s “Please fill out this field” bubble under it. Playwright had typed faster than the client bundle loaded, and when the remote form hydrated, its field wrote its *own* value — the empty string the server rendered — over the typed one. That is a real bug for a person on a slow connection, not a test artefact. The fix is `keepTyped()` in chapter {{signing-in-and-up}}: read the inputs before the template hydrates and make what is there the field’s value. The test that pins it holds the client bundle back with `page.route`, types, releases it, and waits for a `data-hydrated` attribute the root layout sets in `onMount` before asserting the text is still there.',
					'**The seed’s ids were not ids.** Ben clicked a seeded stop and Ana never saw him move to it, while a stop Ben had just added worked perfectly. The seed built its ids by hand — `00000000-0000-4000-8000-0000000a001` — and the last group was one character short of a UUID, so the presence heartbeat naming that stop failed the `IdSchema` check on the server, and the client’s `.catch(() => {})` on a fire-and-forget command swallowed the error. Every command that names a seeded row — remove this stop, edit that expense — was failing the same way, silently. The fix is in chapter {{the-database}}: `seedId()` builds the fixed ids *through the schema*, so a malformed one throws at seed time instead of vanishing at run time. The lesson is older than the bug: the data you seed must pass the validation you run.',
					'**On a phone, the Add-an-expense button could not be clicked.** Playwright’s call log said `<h3> intercepts pointer events` — the button was where it should be, and the click landed somewhere else. The cause was two layers down: the expenses table is seven columns wide, the page’s grid column was implicitly `auto`, and an `auto` track will not be narrower than its content, so the whole page was 711 pixels wide on a 412-pixel screen. Mobile Chromium reacts to a page wider than the viewport by laying it out at a larger *layout* viewport, and Playwright’s coordinates and the browser’s stopped agreeing. `grid-template-columns: minmax(0, 1fr)` on the page grid, and the table scrolls inside its wrapper as it was meant to. The suite found a real mobile layout bug by failing to press a button.'
				]
			},
			{
				type: 'p',
				text: 'The last one is the reason to be suspicious of “element is not stable” and “intercepts pointer events” in a mobile project. They usually mean the *page* is wrong, not the test, and the useful next step is to measure `document.documentElement.scrollWidth` against `clientWidth` on that page. The same probe ran across every route afterwards, in both languages, and the expenses tab was the only offender. That probe is now `overflowInPage`, and it runs on every screen in the matrix.'
			},
			{
				type: 'p',
				text: 'The design suite’s first run, against screens that had already passed a review by eye, added four more: hit areas of 42px where the CSS said 44, because an `::after` is measured from the padding box; presses that could land on either of two buttons 8px apart at a fractional device pixel ratio; a primary button at 1.97:1, measured by axe half way through a fade; and the palette’s list, a scrollable region with no tab stop, which turned out to be right and became the one written exception. And the behaviour suites, re-run, found the two that started this round: Cancel on “Delete this trip?” deleted the trip, and a German form answered in English. Each is now a test, so each is found once.'
			},
			{
				type: 'p',
				text: 'Then a review of the gates themselves. It changed the code under each check to the broken version and watched for red, and found checks that were looking away: the overflow walk never ran at 360px, where its own bug lived; axe and the target probe never saw the map’s markers; the embed’s stylesheet assertion was true with the bug. Pointed at the map, the new suite found three bugs the pictures could not show — a bubble press that also started a stop, a flight taken back by a heartbeat, and pins 25px from the route on a phone — and the account suite, failing once in a slow run, found the explore filter wiping what was typed before hydration. The method is the lesson: a test is only known to work once it has been seen to fail.'
			},
			{
				type: 'p',
				text: 'The latest review read the code against the documentation and found three more, each of which every existing test had passed: a notes editor that a companion’s arrival destroyed mid-sentence; links in the server’s HTML that were whole URLs at the build’s origin, so the header never marked the page it was on until a script redrew it; and a toast test whose `hasText` was satisfied by the JSON dump it existed to prevent. Each new test above was then run against the old code — the attachment without `untrack`, `paths.relative` back at its default, `String(error)` in the toast, the client hook removed — and seen to fail before it was trusted.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm run test:e2e

Running 243 tests using 1 worker

  ✓  [desktop] › public.e2e.ts › the guides are prerendered, translated and shipped without JavaScript
  ✓  [desktop] › collab.e2e.ts › a change by one person reaches the other through the live query
  …
  ✓  [phone] › visual.e2e.ts › dark theme › trip-expenses › trip-expenses holds together
  -  [desktop] › visual.e2e.ts › dark theme › nav-open › nav-open holds together
  ✓  [phone] › map.e2e.ts › the pins are where the map is once it has settled
  ✓  [phone] › visual.e2e.ts › first impressions on a phone › / paints its largest thing inside 2.5 seconds on a slow 4G connection
  ✓  [narrow] › visual.e2e.ts › light theme › trip-new › trip-new holds together

  17 skipped
  226 passed`
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
					'You can read a Playwright call log that says “intercepts pointer events” and name the first thing to measure.',
					'You can say what the target check asks the browser that a measurement of the box cannot, and how an axe exception is kept to one selector.',
					'You can say why the design’s checks run at 360px as well as 412px, and why the throttled test slows the connection and not the processor.',
					'You can describe how to prove a test can fail, and name an assertion in this chapter that could not.',
					'You can explain how the bundle guard names a chunk, and what has to change in the repository for a budgeted chunk to grow.'
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
				text: 'Security in a web application is mostly a list of things that are true of *every* response, and the place to make them true is the one function every response passes through. In SvelteKit that is `handle` in `hooks.server.ts` (chapter {{environment-and-hooks}}), and the third handler in its sequence is where this chapter lives. The rest is a policy in `vite.config.ts` that SvelteKit applies for us, and a handful of decisions at the edges: what may be framed, what may be fetched from another origin, where a sign-in may redirect.'
			},

			{ type: 'h3', id: 'csp', text: 'The Content Security Policy' },
			code('vite.config.ts', 200, 248),
			{
				type: 'p',
				text: 'A Content Security Policy is a header that tells the browser which sources of script, style, image, font, connection and frame the page is allowed to use; anything else is blocked and reported to the console. Its purpose is to make cross-site scripting *not work*: an attacker who manages to inject `<script>` into a page gains nothing if inline scripts are refused. `default-src \'self\'` is the floor — nothing from anywhere but this origin — and every other directive is a narrow, commented exception.'
			},
			{
				type: 'p',
				text: '`mode: \'auto\'` is the interesting setting. SvelteKit’s own scripts are inline (the tiny module that starts the client), so the policy has to allow *those* while refusing everything else. Two mechanisms exist: a **nonce** — a random value generated per request, put on the header and on each allowed `<script>` — and a **hash** of the script’s content. A prerendered page has no request, so it cannot have a nonce; a dynamically rendered one streams `resolve()` scripts after the header has gone, so it cannot know all the hashes. `auto` uses hashes for prerendered pages and nonces for the rest, and the guides (chapter {{guides-prerendered-with-mdsvex}}) are the reason the project needs both.'
			},
			code('src/app.html', 44, 57),
			code('vite.config.ts', 421, 426),
			{
				type: 'p',
				text: 'The theme boot script — the one that sets `data-theme` before first paint so a dark theme never flashes light, and points the `theme-color` tags and the theme cookie at the same choice (chapter {{the-design-system}}) — is the one inline script the app writes itself, and it appears on *every* page, prerendered or not. So it is allowed by hash, and the hash is computed at build time **from the template**, not kept as a second copy: edit the script and the hash follows. This is the kind of thing that fails silently otherwise — nothing errors at build, the script is simply blocked in production, and the first person to notice is the one with a dark system and a light flash. The regular expression reads the script from `app.html`, which is why the template must not put a `nonce` attribute on it: SvelteKit refuses to prerender a template containing `%sveltekit.nonce%`, and a prerendered page needs this script too.'
			},
			{
				type: 'ul',
				items: [
					'`worker-src \'self\' blob:` — MapLibre parses vector tiles in a Web Worker. Its URL comes from a Vite asset import, so `\'self\'` covers it; `blob:` is for the fallback MapLibre uses when the worker script is on another origin. The directive governs service workers too, and `\'self\'` is what lets `/service-worker.js` register (chapter {{the-offline-itinerary}}). The worker is also a privacy question on a shared device: the pages it keeps were rendered for the person signed in, so sign-out empties them before the session ends, and a test watches the cache at the moment the sign-out request leaves.',
					'`img-src \'self\' data: blob:` — MapLibre’s sprite sheet and the canvas exports are `data:` and `blob:` URLs; the enhanced images are `\'self\'`.',
					'`connect-src \'self\'` — deliberately no tile server. The map style is built from a bundled TopoJSON of the world (chapter {{the-map}}), so the app works offline, in CI, with no keys and no third party learning where people plan to go. Adding a tile provider would mean adding its origin here, and the comment says so, so the change is one line and visible in review.',
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
			code('src/hooks.server.ts', 114, 165),
			{
				type: 'p',
				text: 'Three headers are always right and cost nothing: `x-content-type-options: nosniff` (the browser trusts our content types and does not guess), `referrer-policy: strict-origin-when-cross-origin` (other sites learn our origin, not our paths — a trip’s slug is not their business), and a `permissions-policy` that turns off the microphone and the camera and keeps geolocation for this origin only, because “where am I” on the map is the one capability the app asks for. `Vary: Cookie` on pages is for shared caches: the header shows the person’s name and the locale cookie changes the language, so a cache must never serve one person’s page to another. API responses and the hashed `/_app/` assets are excluded because they do not depend on the cookie, and a `Vary` there would only defeat the cache. One cache cannot be protected by a header, because it is on the device itself: the service worker’s copies of the pages a person opened, kept for reading offline. A shared laptop is a shared cache with one browser profile, so the app deletes those copies before signing anybody out, and again whenever it finds nobody signed in — chapter {{the-offline-itinerary}} has the code and the test that proves the next person reads nothing.'
			},
			{
				type: 'p',
				text: 'The embed route is the exception that proves the policy was applied thoughtfully. `/embed/<slug>` exists to be framed — it is the read-only route summary the custom element loads (chapter {{embedding-a-trip}}) — and for that path, and only that path, the handler rewrites the `frame-ancestors` directive **after SvelteKit has built the header**. A regular expression on the header is cruder than a per-route config would be, but SvelteKit’s policy is global, the route is one, and the rewrite is six lines next to a comment that says exactly what it does. The end-to-end suite asserts the result on the public frame and the 404 on the private one.'
			},
			code('src/hooks.server.ts', 93, 102),
			{
				type: 'p',
				text: 'Identity is read once, here, into `locals` — so no page has to ask, and no page has to *remember* to ask. `svelteKitHandler` answers Better Auth’s own `/api/auth/*` routes and passes everything else on. The ordering in `sequence` matters: the locale handler runs first so an error page speaks the right language, and the security handler runs last so its headers are on every response including the ones Better Auth wrote.'
			},

			{ type: 'h3', id: 'edges', text: 'Three decisions at the edges' },
			code('src/lib/remote/auth.remote.ts', 30, 49),
			{
				type: 'p',
				text: 'An **open redirect** is a sign-in page that will send a person anywhere the `redirectTo` parameter says — including `https://evil.example/signin`, styled to look like ours. The guard is a regular expression that allows one leading slash and *only* one: `//evil.example` is a protocol-relative URL, starts with a slash, and still leaves the site. The choice to **sanitise** rather than reject is deliberate: the value lives in a hidden field the person cannot see, so a crafted link would otherwise leave them staring at “invalid redirect” with no way in. Falling back to `/trips` is safe and kind.'
			},
			code('src/routes/api/route/[slug=slug].json/+server.ts', 29, 61),
			{
				type: 'p',
				text: 'The route API is the one endpoint with `access-control-allow-origin: *`, and the comment explains why that is safe rather than assumes it: the response holds nothing that was not already public by link. The authorisation is *content-based* — a trip that is not visible by link is a 404 whether or not the caller is signed in — because the custom element runs on somebody else’s page, where our cookies are not sent and must not matter. That is the rule for any CORS-open endpoint: it may return only what an anonymous stranger could already see, and it must decide from the data, not the session.'
			},
			code('src/hooks.server.ts', 174, 182),
			{
				type: 'p',
				text: '`handleFetch` wraps every server-side `fetch` the app makes. Same-origin requests go through untouched; anything leaving the server gets a ten-second `AbortSignal.timeout` and a user agent that names the app. The project makes no external requests today — the map is offline — which is exactly when to put the guard in: the first person to add a weather lookup inherits a timeout instead of a server that hangs when the weather service does.'
			},
			code('src/hooks.server.ts', 199, 214),
			{
				type: 'p',
				text: 'Error handling is a security surface too. `handleError` receives a `kind` in SvelteKit 3 — `app`, `framework`, `validation` or `unknown` — and the code returns something only for the last two. A validation failure (a remote function argument that did not match its schema) is logged with the *path* of the field and answered with a fixed sentence — `m.error_bad_request()`, in the request’s language, and the same sentence whatever failed — so a caller probing the API learns that the request was malformed and nothing about the schema. An unknown error gets an id that is logged with the stack and shown to the person, so a bug report can be matched to a log line; the message itself says nothing about what broke.'
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
			code('Dockerfile', 41, 62, { partial: true }),
			{
				type: 'p',
				text: 'The `build` stage is `prepare` spelled out: package the library, compile the messages, sync the types, then build the element and the app. `PUBLIC_ORIGIN` is a **build argument**, and the stage refuses to continue without it, because SvelteKit bakes `paths.origin` into the server bundle (chapter {{the-config}}) and Better Auth derives its base URL from the same value. This is the fact that decides the deployment model: one image per origin. The other two variables are placeholders — `src/env.ts` validates that they exist at import time, and they are never read during a build — and they do not survive into the runtime stage. `pnpm prune --prod` then removes every devDependency: the compilers, the test runners, drizzle-kit, Playwright. That is most of `node_modules`. The `CI=true` in front of it is a scar from the first pipeline run: pnpm asks for confirmation before it purges a modules directory — 11 did, 12 still does — and with no terminal to ask on it aborts the build instead of asking — the variable is how you tell it nobody is there.'
			},
			code('Dockerfile', 65, 103, { partial: true }),
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
			code('src/routes/healthz/+server.ts', 23, 36),
			code('src/hooks.server.ts', 221, 225),
			{
				type: 'p',
				text: '“Healthy” means the database answers. A process that is up and cannot reach its data is a process that should not be receiving traffic, and `select 1` is the cheapest way to ask. The response carries the `version` — the commit the build was made from, through `version.name` in chapter {{the-config}} — so “which version is live?” is one request, and `cache-control: no-store`, because a cached “healthy” is worse than none. It goes out through `Response.json`, where SvelteKit 3 points you now that its own `json()` helper is deprecated. `init` in the hooks reaches the database once before the first request, which turns “the deploy is broken” into a process that never claims to be healthy — and that is precisely what a rolling deployment needs in order to keep the old version serving.'
			},
			code('src/instrumentation.server.ts', 19, 27),
			{
				type: 'p',
				text: 'The tracing provider (chapter {{explore-and-diagnostics}}) is registered in `instrumentation.server.ts`, which adapter-node imports *before* the server — that ordering is the whole reason the file exists, and it is why the diagnostics page shows spans from the very first request in the container rather than from the second.'
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
				text: 'The compose file adds what the image cannot know: the secret, which is *required* — the `:?` syntax makes compose refuse to start without it, with a message that says what is missing — the volume, the port, and a `stop_grace_period` slightly longer than the server’s own shutdown timeout, so compose never kills a server that is still finishing a request. The health check is repeated here because compose’s `depends_on: condition: service_healthy` reads it, so a reverse proxy in a larger file can wait for a healthy app rather than a started one. If that proxy is Nginx or Apache, give it room for headers: `output.linkHeaderPreload` (ch. {{the-config}}) puts about 7.5 KB of `Link` header on the trip page, above Nginx’s default proxy buffer.'
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
				text: 'The project could deploy to a serverless platform with a change of adapter, and for a marketing site it should. It does not, for three reasons that are all in this part. The live query is a long-lived server-sent stream and presence is a heartbeat; both want a process that stays up. The database is a file, and a file wants one writer on one disk. And the tracing exporter keeps spans in the process’s memory for the diagnostics page. A container running one process is the simplest shape that gives all three, and it runs identically on a laptop, a small VPS and a Kubernetes cluster. If the project outgrew one machine, the first move would be a libSQL server for the database and a pub/sub for the rooms — and the code that would change is in chapter {{live-collaboration}} and chapter {{the-database}}, not here.'
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
					'**A real tile server, behind a feature flag.** The bundled world is the right default — offline, no keys, no third party — and it is too coarse for a city. A vector tile source is one origin in `connect-src` (chapter {{security-headers-and-csp}}), one `style` swap in the map (chapter {{the-map}}), and an environment variable in `src/env.ts` so the offline build stays the default. The flag is what keeps CI free of network.',
					'**Invites by email.** The invite *link* works; a mail with the link in it is a queue and a sender. The clean shape is an outbox table written in the same transaction as the invite (chapter {{invites-and-membership}}) and a worker that drains it — the pattern the third project in this series built in full.',
					'**Offline notes.** Tiptap already holds the document (chapter {{notes-with-tiptap-through-an-attachment}}); an IndexedDB copy and a queue of `saveNote` commands to replay on reconnect would make the notes tab survive a train tunnel. The read side is built: chapter {{the-offline-itinerary}} keeps every page a person opens and brings the live stream back when the network does. What is left is the write side, and the conflict policy it needs against a document somebody else may have changed in the meantime.',
					'**Photos on stops.** `@sveltejs/enhanced-img` handles the *static* images (chapter {{the-design-system}}); uploads need object storage, a signed upload URL from a `command`, and a thumbnail pipeline. `BODY_SIZE_LIMIT` (chapter {{deploying}}) is the first number to revisit.',
					'**Rate limiting the public surface.** Sign-in, sign-up, the join page and the route API are reachable by anyone. A token bucket keyed by IP in the security handler (chapter {{security-headers-and-csp}}), backed by the database or memory, is a morning’s work and the first thing a penetration test would flag.',
					'**A libSQL server instead of a file.** The file is right for one machine; the moment there are two, `DATABASE_URL` becomes a `libsql://` URL (chapter {{the-database}}) and the rooms need a pub/sub that both processes share (chapter {{live-collaboration}}). Drizzle and the migration script do not change.',
					'**Exporting the traces.** The in-memory ring buffer (chapter {{explore-and-diagnostics}}) is for one process and a curious developer. Pointing the same provider at an OTLP collector is a different exporter in `instrumentation.server.ts` and nothing else — which was the point of putting OpenTelemetry in rather than a custom logger.',
					'**More of the itinerary on the map.** The map shows stops and the route; it could show days as colours, the selected stop’s neighbours, and a “fly to” on selection using the same `interpolate()` the globe uses (chapter {{the-globe}}).',
					'**A fourth locale, right-to-left.** Paraglide makes a new locale a new JSON file (chapter {{three-languages-with-paraglide}}); an Arabic or Hebrew one would also exercise `%paraglide.dir%` and every `inline-start` in the CSS (chapter {{the-design-system}}), which is why the tokens were written logically from the start.',
					'**Accessibility audit with real assistive technology.** The roles and names are there and the tests assert them; a session with a screen reader on the itinerary’s drag-and-drop and the date picker would find what tests cannot, and svelte-dnd-action’s keyboard mode deserves a chapter of its own.'
				]
			},
			{
				type: 'p',
				text: 'Three things are deliberately *not* on the list. A native app: the web app is installable as it stands, and the map and the globe already work on a phone. A rewrite of the itinerary as a CRDT: the live query with last-write-wins per stop is the right trade for a few people planning a trip, and the fourth project in this series is the one to read if you need the other trade. And “more libraries”: chapter {{choosing-libraries}} spent as long on what was rejected as on what was chosen, and every item above is doable with what is installed.'
			},

			{ type: 'h3', id: 'map', text: 'Where everything lives' },
			{
				type: 'p',
				text: 'This is the index of the course by *capability* rather than by feature — the list to keep open when you start your own project and want to remember where a thing was done properly.'
			},
			{
				type: 'ul',
				items: [
					'**Runes** — `$state`, `$derived`, `$derived.by`, `$effect`, `$props`, `$props.id()`, `$state.raw`, `$state.snapshot`, assignable `$derived`: chapters {{a-route-as-a-class}}, {{the-trip-page}}, {{the-itinerary}}, {{companions-presence-and-settings}}. `untrack` and the effect-loop it prevents: ch. {{the-trip-page}}; `untrack` inside an attachment, so a snapshot does not rebuild an editor: ch. {{notes-with-tiptap-through-an-attachment}}. Classes with runes in `.svelte.ts`: ch. {{a-route-as-a-class}}, {{the-trip-page}}. (No `$bindable`: no component here offers two-way binding as its API, so none declares it.)',
					'**Templates** — snippets and `{@render}`: ch. {{dates-and-money-in-a-locale}}, {{the-shell}}, {{the-itinerary}}, {{trips-and-a-new-trip}}; `await` in markup with `{const … = $derived(await …)}`, and a bare `{const}` where once is right: ch. {{the-design-system}}, {{the-shell}}, {{the-trip-page}}, {{the-globe}}, {{trips-and-a-new-trip}}, {{explore-and-diagnostics}}, {{embedding-a-trip}} (there is no `{#await}` block anywhere; an `await` expression inside a boundary replaced it); `<svelte:boundary>` with `pending` and `failed`, read through `boundaryMessage`: ch. {{the-itinerary}}, {{the-globe}}, {{trips-and-a-new-trip}}, {{explore-and-diagnostics}}, {{embedding-a-trip}}; `{@attach}` attachments: ch. {{the-design-system}}, {{expenses-with-tanstack-and-layerchart}}, {{notes-with-tiptap-through-an-attachment}}, {{the-wrapper-pattern}}, and `fromAction` for a library’s action: ch. {{the-itinerary}}; `class={[…]}` and `class={{…}}` in place of the `class:` directive: ch. {{the-shell}}; keyed `{#each}` with a key that names the thing: ch. {{the-globe}}, {{trips-and-a-new-trip}}, {{embedding-a-trip}}; `animate:flip` with `svelte-dnd-action`: ch. {{the-itinerary}}; `{#key}`: ch. {{the-trip-page}}, {{companions-presence-and-settings}}.',
					'**Reactivity utilities** — `MediaQuery`, `createSubscriber`, `scrollY` from `svelte/reactivity/window`, `SvelteMap` versus a plain `Map`: ch. {{reactivity-utilities}}; `Debounced` from runed: ch. {{explore-and-diagnostics}}, {{reactivity-utilities}}.',
					'**Remote functions** — `query`, `query.batch`, `query.live`, `prerender`, `form`, `command`: ch. {{remote-functions-the-reads}}, {{remote-functions-the-writes}}, {{live-collaboration}}; single-flight `.updates()` and `requested().refreshAll()`: ch. {{remote-functions-the-writes}}, {{live-collaboration}}, {{companions-presence-and-settings}}; `invalid(issue.field())` and `fields.x.as(…)`: ch. {{remote-functions-the-writes}}, {{expenses-with-tanstack-and-layerchart}}; the transport hook: ch. {{environment-and-hooks}}.',
					'**Routing and loading** — route groups: ch. {{the-shell}}; `defineParams` matchers: ch. {{environment-and-hooks}}, and the typed `params` a page takes through `PageProps`, with `LayoutProps` for a layout: ch. {{the-shell}}, {{the-trip-page}}; `resolve()` with typed route ids including groups, and `paths.relative: false` so the server writes paths too: ch. {{the-shell}}, {{explore-and-diagnostics}}; `entries()` with `prerender` and `csr = false`: ch. {{guides-prerendered-with-mdsvex}}, {{embedding-a-trip}}; `reroute` for locales: ch. {{three-languages-with-paraglide}}; `+server.ts` endpoints with CORS and `OPTIONS`: ch. {{embedding-a-trip}}, {{security-headers-and-csp}}; the root layout with no `load` so prerendered pages do not bake a user in: ch. {{the-shell}}.',
					'**Hooks** — `sequence`, `handleFetch`, `handleError` with `kind` on the server and in the browser, `init`, `transport`, `reroute`; hook types from `@sveltejs/kit/hooks`: ch. {{environment-and-hooks}}, {{security-headers-and-csp}}, {{deploying}}.',
					'**Configuration** — everything in `vite.config.ts`: `paths.origin` and `paths.relative`, `dynamicCompileOptions` for a client-only custom element, `tracing`, `csp` in `auto` mode, `csrf`, `version`, `preprocess` for mdsvex, `optimizeDeps` for the browser tests: ch. {{the-config}}, {{unit-and-browser-tests}}, {{security-headers-and-csp}}.',
					'**Build and runtime** — `@sveltejs/package` with publint and arethetypeswrong: ch. {{packaging-and-proving}}; `@sveltejs/enhanced-img`: ch. {{the-design-system}}; `read()` for a bundled asset from an endpoint: ch. {{remote-functions-the-reads}}; a `prerender` function that is `dynamic` so a server render can fall back to it: ch. {{remote-functions-the-reads}}; `customElement: true` and `customElements.define(…, Component.element)`, and a second Vite config for the element’s IIFE: ch. {{embedding-a-trip}}; `$app/env`’s `browser`, `building`, `version`: ch. {{environment-and-hooks}}, {{the-trip-page}}, {{deploying}}; view transitions with `onNavigate` and an update banner from `version.pollInterval`: ch. {{the-shell}}.',
					'**The ecosystem** — headless (Bits UI, TanStack Table): ch. {{the-command-palette}}, {{expenses-with-tanstack-and-layerchart}}, {{the-headless-pattern}}; wrappers (svelte-maplibre, Threlte, LayerChart): ch. {{the-map}}, {{the-globe}}, {{expenses-with-tanstack-and-layerchart}}, {{the-wrapper-pattern}}; imperative through an attachment (Tiptap, GSAP): ch. {{notes-with-tiptap-through-an-attachment}}, {{the-design-system}}; compilers (Paraglide, mdsvex, Phosphor’s plugin): ch. {{three-languages-with-paraglide}}, {{guides-prerendered-with-mdsvex}}, {{the-design-system}}; the survey and the rejections: ch. {{choosing-libraries}}.',
					'**Proof** — Vitest projects and `vitest-browser-svelte`: ch. {{unit-and-browser-tests}}; Playwright on the built server, in three projects — a desktop, a phone, and the phone at 360px — with two browser contexts on one trip and a test with JavaScript switched off: ch. {{end-to-end}}; the container, the health check, the pipeline: ch. {{deploying}}; the course’s own checks: ch. {{deploying}}.'
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
				text: 'The framework this course is built on moves every few weeks, and the versions in chapter {{choosing-libraries}} are dated for that reason. The routine above is the whole upgrade process, and the reason it is short is the reason the tests exist: `verify` is the same command in the pipeline and on a laptop, the suite runs against the built output, and the course reads the code rather than copying it — so a refactor that moves a function changes the course the next time it is built, and `verify.js` says which ranges need a human. When a SvelteKit release renames a thing, the Svelte documentation server and the `svelte-autofixer` used throughout this series are the fastest way to learn the new name; when it adds a thing, the question to ask is the one from chapter {{what-we-are-building}}: is this the right shape, does it earn its bytes, could we remove it later.'
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
