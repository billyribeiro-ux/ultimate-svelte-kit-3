/**
 * PART 8 — Proof and production
 * (chapters {{unit-and-browser-tests}}–{{the-exit-criteria}})
 *
 * The tests at three scales, what the compiler says and how to answer it,
 * the security the server applies to every response, the container and the
 * pipeline that build and prove it, how to take a major version, an honest
 * list of what a ninth week would do, and the exit criteria — measured.
 */

import { readFileSync } from 'node:fs';
import { code } from './quote.js';
import { GROUPS, readSurfaces } from './surfaces.js';

/*
 * The exit criteria and the backlog are data: `surfaces.json` and
 * `backlog.json`, written once by `tools/exit-criteria.js` from the coverage
 * plan and the gap list, and held to the course by `verify.js`.
 */
const { rows: SURFACES } = readSurfaces();
/** @type {{ id: string, what: string, why: string }[]} */
const BACKLOG = JSON.parse(readFileSync(new URL('./backlog.json', import.meta.url), 'utf8'));

/** The deferred surfaces an item of the backlog carries, in backticks. */
const surfacesOf = (/** @type {string} */ id) =>
	SURFACES.filter((row) => row.status === 'deferred' && row.gap === id).map((row) => `\`${row.surface}\``);

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
		slug: 'what-the-compiler-says',
		title: 'What the compiler says: warnings, errors and the codes that name them',
		summary:
			'Every message Svelte prints has a code, and the code is the handle for everything you can do about it. Zero `svelte-ignore` comments, a `check` that fails on a warning, and the autofixer in `verify`; the warnings the code answers by its shape, the errors that explain why it is written the way it is, the runtime errors and warnings worth recognising on sight — and the one warning the build still prints, and why it stays.',
		goal: 'Read any Svelte diagnostic by its code, know the three places that code can be named, and fix the cause rather than the message.',
		blocks: [
			{
				type: 'p',
				text: 'Svelte talks to you in four voices. **Compiler warnings** — markup that will probably hurt somebody, like a clickable `<div>` — and **compiler errors**, code it refuses to compile. Then, once the code runs, **runtime errors**, which stop it, and **runtime warnings**, which the development build prints to the console. Each message carries a short `snake_case` code: `state_referenced_locally`, `each_key_duplicate`, `await_waterfall`. Svelte’s documentation lists every one under four pages with those names, and the codes are the handle for everything else in this chapter.'
			},
			code('package.json', 20, 20),
			{
				type: 'p',
				text: 'The bar this project keeps is simple to say. `pnpm run check` runs `svelte-check` with `--fail-on-warnings` (chapter {{the-toolchain}}), so a compiler warning fails `verify` and CI as surely as a type error does; and there is not one `<!-- svelte-ignore -->` comment anywhere in `src` — `grep -rn svelte-ignore src` finds nothing. Every warning the compiler could give was answered by changing the code, and the sections below show the answers. That is not because suppressing is wrong. It is because a suppression is a decision that outlives the reason for it, and a project with none has nothing to re-check when the reason goes away.'
			},

			{ type: 'h3', id: 'one-code', text: 'One code, three places to name it' },
			{
				type: 'p',
				text: 'A warning’s `code` is the same string in every tool that can act on it. In a component, `<!-- svelte-ignore a11y_autofocus (because of reasons) -->` above the line silences that one occurrence — the parenthesised reason is part of the syntax, and Svelte’s documentation shows it. For the whole project, `svelte-check --compiler-warnings "css_unused_selector:error"` turns a warning into an error or `:ignore` drops it; the flag’s own help text still spells codes the Svelte 4 way, with dashes, and Svelte 5’s have underscores — an old spelling in an ignore comment earns you `legacy_code`, and an unknown one `unknown_code`. And for the compiler itself, `compilerOptions.warningFilter` is a function that receives each `Warning` and returns `true` to keep it — vite-plugin-svelte’s `onwarn` is the bundler’s older hook for the same job. Three places, one string. This project uses none of them.'
			},

			{ type: 'h3', id: 'warnings-answered', text: 'Warnings the code answers' },
			code('src/lib/embed/element.ts', 1, 36),
			{
				type: 'p',
				text: '`options_missing_custom_element` — “The `customElement` option is used when generating a custom element. Did you forget the `customElement: true` compile option?” — is what the embed component used to earn in every compile that was not the custom-element one: the server build, `svelte-check`, the autofixer. The component named its tag in `<svelte:options customElement={{ tag }}>`, which is what Svelte’s docs show, and the `check` script once silenced the warning for the whole project. The answer was to move the one thing the option did — define the tag — into this module, which only the two builds that compile the folder as a custom element ever load. The component became an ordinary component everywhere, the warning had nothing left to say, and the project-wide silence went (chapter {{embedding-a-trip}}).'
			},
			code(`src/lib/trip/TripView.svelte`, 58, 68),
			code('src/lib/ui/DateRangeField.svelte', 66, 68),
			{
				type: 'p',
				text: '`state_referenced_locally` — “This reference only captures the initial value of `%name%`. Did you mean to reference it inside a %type% instead?” — fires when a component reads a prop at the top of its script, because a prop can change and that read will not see it. Usually that is a bug, and the docs’ example is one: state passed into `setContext` by value, which the child then reads forever as its first value. Twice in this project it is the intent. The trip page is keyed on its slug, so a different trip is a different `TripView`, and its props are read once; the date picker takes its start and end as the *initial* value and owns the range after that. `untrack(() => …)` says “read this without subscribing”, which is exactly the claim, and the compiler takes it as an answer. A comment beside each says the same thing to a person.'
			},
			code('src/routes/(site)/+page.svelte', 323, 339),
			{
				type: 'p',
				text: '`css_unused_selector` — “Unused CSS selector” — is the compiler noticing that a scoped rule matches nothing in the template, and removing it from the output. Here the rule matches attributes an attachment writes at run time, which the compiler cannot see. The docs give the answer in the warning’s own entry: “use `:global` to preserve the selector as-is” — and wrapping it in the parent element’s class keeps it from leaking beyond this page. This is the warning to treat with the most suspicion, because it is usually right: a selector the compiler cannot see matching is, nine times out of ten, a selector nothing matches.'
			},
			{
				type: 'table',
				caption: 'Other compiler warnings, and why this code does not earn them',
				head: ['Warning', 'What it catches', 'Why it stays quiet here'],
				rows: [
					['`non_reactive_update`', 'a plain `let` that is reassigned and read in the markup', 'everything that changes and is rendered is `$state` or `$derived`'],
					['`store_rune_conflict`', 'a local variable named like a rune, so `$state` would read a store', 'no variable shares a rune’s name, and app code has no stores'],
					['`custom_element_props_identifier`', '`$props()` not destructured in a custom element, so its attributes cannot be inferred', 'the embed destructures `let { slug = \'\', origin = \'\' }: Props = $props()`'],
					['`perf_avoid_inline_class`, `perf_avoid_nested_class`', 'a class declared inside a function or created with `new class`', '`TripState` and `ThemeState` are declared at the top of their modules'],
					['`node_invalid_placement_ssr`', 'markup the browser will repair, which then fails to hydrate', 'the markup nests as HTML allows; in runes mode the worst cases are the error `node_invalid_placement`'],
					['`element_invalid_self_closing_tag`', '`<div />` — HTML has no self-closing tags for non-void elements', 'none in the code; `npx sv migrate self-closing-tags` exists for code that has them'],
					['`block_empty`', 'an empty `{#if}` or `{#each}`', 'none'],
					['`bidirectional_control_characters`', 'invisible characters that reorder how code reads', 'the compiler’s own supply-chain guard (chapter {{the-workspace}})']
				]
			},
			{
				type: 'p',
				text: 'The accessibility warnings are about half of the compiler’s list — forty-two of its eighty-one in Svelte 5.57 — and each is a question about an element. The table is the project’s answers, element by element — the point being that every one is answered by markup a screen reader understands, never by an `aria-*` attribute that papers over the wrong element.'
			},
			{
				type: 'table',
				caption: 'Accessibility warnings and the elements that answer them in Meridian',
				head: ['Warning', 'What it asks', 'Meridian’s answer'],
				rows: [
					['`a11y_click_events_have_key_events`, `a11y_no_static_element_interactions`', 'a clickable `<div>` needs a role and a keyboard handler', 'nothing clickable is a `<div>`: a stop’s name is a `<button aria-pressed>` (`StopCard.svelte`), a tab is a link, the palette’s rows are Bits UI options'],
					['`a11y_consider_explicit_label`', 'an icon-only button or link needs a name', '`aria-label` on every icon button — “Edit stop”, “Remove”, “Remove Ben Okafor” (`Companions.svelte`) — and a visually hidden word on the settings link'],
					['`a11y_label_has_associated_control`', 'a `<label>` needs a control', 'every field is a `<label class="field">` wrapping its input (`trips/new/+page.svelte`); the kind picker is a `<fieldset>` with a `<legend>` (`StopDialog.svelte`)'],
					['`a11y_missing_attribute`', '`<img>` needs `alt`, `<a>` an `href`', 'the hero’s `<enhanced:img>` carries `alt=""`, the empty alt that tells a screen reader a decorative picture is decorative; every link has a resolved `href`'],
					['`a11y_no_redundant_roles`', '`role="list"` on a `<ul>` repeats its role', 'allowed, deliberately: Svelte’s own source says “`<ul role="list">` is ok because CSS list-style:none removes the semantics and this is a way to bring them back” — Safari does exactly that, so the members, presence and balances lists say it'],
					['`a11y_role_has_required_aria_props`, `a11y_interactive_supports_focus`', 'a custom role needs its states and a tab stop', 'none written by hand: the combobox, the dialogs and the date picker are Bits UI’s, and the map’s pins are MapLibre’s, outside the compiler’s view'],
					['`a11y_media_has_caption`, `a11y_autofocus`, `a11y_positive_tabindex`', 'captions; no autofocus; no tab order of your own', 'no video, no `autofocus`, no `tabindex` above zero — the dialog moves focus through Bits UI’s focus trap instead']
				]
			},

			{ type: 'h3', id: 'errors-answered', text: 'Errors the shape of the code answers' },
			code('src/lib/ui/theme.svelte.ts', 37, 44, { partial: true }),
			code('src/lib/ui/theme.svelte.ts', 89, 89),
			{
				type: 'p',
				text: 'A module that wanted to share a theme would naturally write `export let choice = $state(\'system\')`, and the compiler refuses: `state_invalid_export` — “Cannot export state from a module if it is reassigned. Either export a function returning the state value or only mutate the state value’s properties”. Its sibling `derived_invalid_export` says the same of `$derived`. The reason is mechanical: an importer receives the binding’s value at import time, and a rune’s reactivity lives in the variable, not the value, so a reassigned export would be a snapshot. The shape that answers it is a class with `$state` fields and one exported instance — `theme.choice` is a property read, which stays reactive. The module’s header says why one module-level instance is safe on a server here, against Svelte’s general advice to prefer context (chapter {{the-design-system}}).'
			},
			code('src/lib/trip/StopDialog.svelte', 266, 284),
			{
				type: 'p',
				text: '`{const Icon = $derived(KIND_ICONS[k])}` is a *declaration tag*, and it replaced `{@const}` in this project. The old tag had a placement rule — `const_tag_invalid_placement`: “`{@const}` must be the immediate child of `{#snippet}`, `{#if}`, `{:else if}`, `{:else}`, `{#each}` …” — and a value that was worked out once. A declaration tag is an ordinary `const` or `let`, its value is a rune like anywhere else (`$derived` here, so it follows `k`), and the only things it refuses are legacy mode (`declaration_tag_no_legacy_mode`) and anything that is not a `let` or `const` (`declaration_tag_invalid_type`). Chapter {{migrating-a-major}} counts the migration.'
			},
			code('tsconfig.json', 31, 35),
			{
				type: 'p',
				text: '`erasableSyntaxOnly` is a TypeScript option answering a Svelte error before it can happen. Svelte strips the types from a `lang="ts"` block rather than compiling TypeScript, so a feature that *emits* JavaScript — an `enum`, a value `namespace`, a constructor parameter property — is `typescript_invalid_feature`: “TypeScript language features like %feature% are not natively supported … you will need to use a preprocessor”, with a pointer to `vitePreprocess({ script: true })`. That preprocessor would work, at the cost of running TypeScript over every component. Forbidding the features costs nothing — this codebase never wanted an `enum` — and Node’s type stripping for `scripts/*.ts` needs the same rule, so one option serves both.'
			},
			{
				type: 'table',
				caption: 'More compiler errors, and the habit in this codebase that never meets them',
				head: ['Error', 'What triggers it', 'Why Meridian does not'],
				rows: [
					['`rune_renamed`, `rune_removed`', 'a rune from a prerelease spelling — “`%name%` is now `%replacement%`”', 'the code was written against 5.57; the autofixer catches old spellings in review'],
					['`props_duplicate`', '`$props()` called twice', 'one destructured `$props()` per component, typed by an `interface Props`'],
					['`illegal_await_expression`', '`await` inside `use:`, `transition:`, `animate:`, an attachment or a binding', 'awaits live in `{const x = $derived(await …)}` and markup, never in a directive'],
					['`attribute_invalid_sequence_expression`', '`class={a, b}` — a comma is not an array', '`class={[\'chip\', { active }]}` arrays everywhere (chapter {{the-design-system}})'],
					['`mixed_event_handler_syntaxes`', '`on:click` and `onclick` in one component', 'no `on:` anywhere; handlers are attributes'],
					['`store_invalid_subscription_module`', '`$store` read outside a `.svelte` file', 'no stores in app code: `$app/state`, reactive classes and remote functions instead'],
					['`snippet_invalid_export`', 'an exported snippet that reaches into instance state', 'no module snippets yet; the kinds map icons to components'],
					['`experimental_async`', '`await` in markup or a derived without the option', '`compilerOptions.experimental.async` is on (chapter {{the-config}})'],
					['`each_item_invalid_assignment`', 'writing to an `{#each}` item in runes mode', 'edits go through the array or, here, a command and the next snapshot'],
					['`import_svelte_internal_forbidden`', 'importing `svelte/internal/*`', 'never; the public modules cover everything this app does'],
					['`state_field_duplicate`', 'a class field declared twice, once as `$state`', 'each `$state` field of `TripState` is declared once, at the top of the class'],
					['`node_invalid_placement`', 'HTML the browser would repair — a `<div>` in a `<p>` — which runes mode refuses', 'the markup is valid HTML; the compiler is the first reviewer of that'],
					['`host_invalid_placement`', '`$host()` outside a custom element', 'not used: the embed dispatches no events yet (the backlog has it)'],
					['`slot_snippet_conflict`', '`<slot>` and `{@render}` in one component', 'no `<slot>` anywhere: content is passed as snippets']
				]
			},

			{ type: 'h3', id: 'runtime-errors', text: 'Runtime errors worth recognising on sight' },
			{
				type: 'table',
				caption: 'Runtime errors, what they mean, and where this project met or avoids them',
				head: ['Error', 'Meaning', 'In Meridian'],
				rows: [
					['`effect_update_depth_exceeded`', '“an effect reads and writes the same piece of state”, in a loop', 'met once: the presence heartbeat read its own command’s `pending` — the trip page was a 500 until `untrack` (chapter {{the-trip-page}})'],
					['`state_unsafe_mutation`', 'state written inside `$derived`, `$inspect` or a template expression', 'everything that could be derived is `$derived`; writes happen in handlers and commands'],
					['`lifecycle_outside_component`', '“`%name%(...)` can only be used during component initialisation”', '`snapshot()` registers with `onMount`, so the new-trip page calls it above its `await` (chapter {{trips-and-a-new-trip}})'],
					['`set_context_after_init`, `effect_orphan`', 'context set, or an effect created, after an `await` or in a handler', 'contexts and effects are created at the top of the script, before anything waits'],
					['`each_key_duplicate`, `each_key_volatile`', 'two items with one key; a key that is a new value each time', 'keys are ids — `(stop.id)`, `(member.userId)` — never indexes or arrays'],
					['`hydration_failed`', 'the server’s HTML and the client’s first render disagree beyond repair', 'one source of truth for the first paint: the server’s document, handed to the live query as its fallback'],
					['`svelte_boundary_reset_onerror`', '`reset()` called while the boundary is still handling the error', 'the failed snippets reset from a button, never synchronously in `onerror`'],
					['`fork_discarded`, `fork_timing`', 'committing a discarded `fork()`; forking inside an effect', '`forkPreloads` is off on evidence (chapter {{the-config}})'],
					['`await_invalid` (server)', '“asynchronous work while rendering synchronously” — a synchronous `render()` of a component that awaits', 'SvelteKit awaits its own renders; the project never calls `render()` itself'],
					['the rest', '`async_derived_orphan`, `bind_not_bindable`, `component_api_changed`, `component_api_invalid_new`, `derived_references_self`, `effect_in_teardown`, `effect_in_unowned_derived`, `effect_pending_outside_reaction`, `flush_sync_in_effect`, `get_abort_signal_outside_reaction`, `invalid_snippet`, `props_rest_readonly`, `rune_outside_svelte`, `state_descriptors_fixed`, `state_prototype_fixed`, `invariant_violation` (that one is Svelte’s bug, and says so)', 'read the code, then the documentation’s entry for it: each names its own fix']
				]
			},

			{ type: 'h3', id: 'runtime-warnings', text: 'Runtime warnings, in the console' },
			{
				type: 'p',
				text: 'The development build prints these; production does not. One of them is the one an async-first codebase meets first. `await_waterfall` — “An async derived, `%name%` was not read immediately after it resolved. This often indicates an unnecessary waterfall” — is two independent `$derived(await …)` in a row: the second is not even created until the first resolves. The documentation’s fix is to start both promises first, each in its own `$derived`, and await them after. The trip page has one `await` and the new-trip page one, which is the cheapest way to stay out of this warning’s way.'
			},
			{
				type: 'table',
				caption: 'Every runtime warning in Svelte 5.57, in one line each',
				head: ['Warning', 'What it is telling you'],
				rows: [
					['`assignment_value_stale`', '`(obj.array ??= []).push(…)` pushed to the plain array, not the proxy that was stored'],
					['`await_reactivity_loss`', 'state read after an `await` inside a function is not tracked; pass it in as an argument'],
					['`await_waterfall`', 'two async deriveds that could have started together ran one after the other'],
					['`binding_property_non_reactive`', '`bind:` to a property that is not reactive state'],
					['`console_log_state`', 'a `$state` proxy was logged; use `$inspect` or `$state.snapshot`'],
					['`derived_inert`', 'a derived created inside an effect that has been destroyed'],
					['`event_handler_invalid`', 'a handler that is not a function — usually a call where a reference was meant'],
					['`hydratable_missing_but_expected`', 'a `hydratable` rendered on the client that the server never sent'],
					['`hydration_attribute_changed`, `hydration_html_changed`', 'an attribute or `{@html}` differed between server and client; the server’s value is kept'],
					['`hydration_mismatch`', 'the DOM was not what the server sent — often HTML the browser repaired'],
					['`invalid_raw_snippet_render`', '`createRawSnippet` returned more than one element'],
					['`legacy_recursive_reactive_block`', 'a migrated `$:` block reads and writes the same value'],
					['`lifecycle_double_unmount`', '`unmount` on a component that was not mounted'],
					['`ownership_invalid_binding`, `ownership_invalid_mutation`', 'a child mutating or binding state its parent never handed it with `bind:`'],
					['`select_multiple_invalid_value`', '`<select multiple>` given a value that is not an array'],
					['`state_proxy_equality_mismatch`', 'a proxy compared with `===` to the object it proxies'],
					['`svelte_boundary_reset_noop`', 'a boundary’s `reset` called a second time'],
					['`transition_slide_display`', '`slide` on an inline or table element, which has no height to animate'],
					['`dynamic_void_element_content`', '`<svelte:element this="input">` given children'],
					['`state_snapshot_uncloneable`', '`$state.snapshot` met a value it cannot clone, and returned the original'],
					['`unresolved_hydratable` (server)', 'a `hydratable` value was created but at least part of it was not used during the render, so the response waited for content nothing read — printed by the server, not the browser']
				]
			},

			{ type: 'h3', id: 'autofixer', text: 'The autofixer as a gate' },
			code('scripts/autofix-report.ts', 82, 132),
			{
				type: 'p',
				text: 'The compiler’s warnings are about what the code *does*; the Svelte autofixer’s suggestions are about how it is *written* — an `$effect` that assigns state another rune could derive, a `bind:this` an attachment would replace. `pnpm run lint:svelte` runs it over every component (chapter {{the-toolchain}} builds the script) and fails on any suggestion that is neither followed nor answered in `.autofixer-accepted.json`, where each declined suggestion is recorded with the file, a piece of its text, how many times the file earns it, and a reason. The count is the teeth: a new occurrence of an accepted suggestion still fails, because it has not been read yet.'
			},

			{ type: 'h3', id: 'the-one-left', text: 'The one warning the build still prints' },
			{
				type: 'terminal',
				code: `
$ pnpm run build
[vite-plugin-svelte] src/content/guides/porto-and-the-douro.svx:1:8 \`context="module"\` is deprecated, use the \`module\` attribute instead
https://svelte.dev/e/script_context_deprecated
1: <script context="module">
            ^
…the same for the other three guides`
			},
			{
				type: 'p',
				text: '`script_context_deprecated` is real, and it is not this project’s code. mdsvex turns a guide’s front matter into a module script, and the latest stable release, 0.12.8, writes it as `<script context="module">` — there is no option to change that, and its regular expression for “reuse an existing module script” only matches the old spelling, so a guide cannot pre-empt it with a `<script module>` of its own. The 1.0 line writes `<script module>`, and it is a prerelease. A `warningFilter` would make the build quiet, and it would also make it lie: the deprecation is true, and the day it becomes an error, the line will be the first thing to read. So it stays printed, and the upgrade is on the backlog in chapter {{what-i-would-do-next}}. `svelte-check` never sees it, because it does not check `.svx` files — which is the one place `--fail-on-warnings` has a gap, and now you know where it is.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the four kinds of diagnostic and where Svelte documents each.',
					'You know the three places a warning’s code can be named, and why this project uses none of them.',
					'You can say how `untrack`, `:global` and a module-level `customElements.define` each answer a warning without silencing it.',
					'You can explain `state_invalid_export` and the class-and-instance shape that answers it, and what `erasableSyntaxOnly` has to do with `typescript_invalid_feature`.',
					'You can read `effect_update_depth_exceeded` and `await_waterfall` and say what to change.'
				]
			}
		]
	},

	{
		slug: 'end-to-end',
		title: 'End to end: the built server, two viewports, two people',
		summary:
			'Playwright runs against `node build/index.js` — the same process a deployment runs — on a database rebuilt from the seed before every run, in a desktop and a Pixel 7 profile, and the design’s checks in a third at 360px. Seven suites cover a stranger, an account, one trip’s every tab, the map’s own behaviour, two browsers on one trip, invites plus the embed, and the trip with no network; an eighth asks every screen of the design, in both themes and at three widths, whether anything sticks out, whether a finger can hit it, what axe finds, and how it paints, on a fast connection and a slow one; and a bundle guard after the build holds the chunks to a budget. How the suite is kept honest, what it found, and what each failure taught.',
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
				text: '`workers: 1` and `fullyParallel: false` are not timidity. The suite shares one SQLite file and its tests *create* things — a trip, a stop, an expense — and then expect to find them; two workers would race. Serial costs several minutes of wall clock for two hundred and fifty-nine tests across the three projects — the design suite’s axe runs are most of it — plus the build, the first time, and buys a suite whose failures are always real. The third project is the Pixel 7 narrowed to 360px, with a screen of the same size, and it runs `visual.e2e.ts` alone: a behaviour does not change between 412px and 360px, and a layout does.'
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

			{ type: 'h3', id: 'suites', text: 'The suites' },
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
			code('e2e/public.e2e.ts', 161, 208),
			{
				type: 'p',
				text: 'The machine-facing test uses `request` — Playwright’s API client, with no browser — for the health endpoint and the route API, and the page for the embed frame. The interesting assertions are the negative ones: the private trip’s API is a 404, the private trip’s frame is a 404, and the public frame’s Content-Security-Policy contains `frame-ancestors *` — the one route the hook allows to be framed (chapter {{security-headers-and-csp}}). A security rule with no test is a security rule that will be refactored away, and a rule has two halves: the exception, and everything the exception must not reach. The last assertions are the second half — `/` still carries `frame-ancestors \'none\'` and `Vary: Cookie`, and the route API under a locale prefix carries no `Vary: Cookie` — so a change that framed every route would not pass. The two lines before them guard a different kind of seam: the frame ships no script, so nothing at run time would notice if it shipped no *style* either — and for a while it did, because a compiler option meant for the custom element caught this page too (chapter {{embedding-a-trip}}). They ask for two facts only the page’s own stylesheet makes true: the card’s computed `max-width` is the 22rem the CSS says, and its list has no indent. The first version asked whether *a* stylesheet was linked, and the root layout’s CSS is linked on every page — so the assertion was true with the bug as well. An assertion that cannot fail is a comment with a cost.'
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
			code('e2e/account.e2e.ts', 141, 163),
			{
				type: 'p',
				text: 'The delete test answers the dialog twice. Playwright accepts nothing by default — a `confirm()` with no handler is dismissed — so `page.once(\'dialog\', …)` decides each answer explicitly. First “Cancel”: the page must still be the settings page and the trip must still be in the list. Then “OK”: the trip must be gone. The first half is new, and it is new because it failed: the `confirm()` lived in an `onsubmit` that called `preventDefault()`, the remote form’s own submit listener does not look at `defaultPrevented`, and Cancel deleted the trip (chapter {{companions-presence-and-settings}}). Testing only the “yes” path of a question is testing half of it.'
			},
			code('e2e/account.e2e.ts', 166, 206),
			{
				type: 'p',
				text: 'Two tests for things that used to go wrong without a sound. The first needs the server to refuse something the page asked for, and nothing on the trips list ever asks for anything wrong — so the test rewrites the request on its way out. `page.route` holds the `tripPreview` batch, swaps every argument for one the schema refuses, and lets it go on; the server’s `handleError` answers with its sentence for a failed validation, and the boundary must print it. *Where* it is printed is half of the assertion. `+error.svelte` shows `page.error.message` too, so a test that looked for the sentence anywhere on the page would still pass with the boundary gone and the whole page swapped for the error page. So the test looks inside the trips page: under its “Your trips” heading, in the snippet’s `.issue` paragraph, beside the Reconnect button that runs `reset`, where only the `failed` snippet can have put it. Against the old `failed` snippet the page said `[object Object]` (chapter {{trips-and-a-new-trip}}). The second presses Refresh on the diagnostics page and expects the newest row to change, which it did not while the report was a bare `{const}` (chapter {{explore-and-diagnostics}}). Neither waits longer than the default: each change happens once a single request comes back.'
			},
			code('e2e/trip.e2e.ts', 14, 30),
			{
				type: 'p',
				text: '`beforeEach` signs Ana in straight to her trip, and the first test presses `ControlOrMeta+k` — Playwright’s name for “Control on Linux and Windows, Command on a Mac” — to open the command palette and jump to a tab by typing part of its name. A keyboard shortcut is a feature people rely on and never think to report when it breaks.'
			},
			code('e2e/trip.e2e.ts', 74, 97),
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

			{ type: 'h3', id: 'proofs', text: 'The proofs the later passes added' },
			{
				type: 'p',
				text: 'Every feature and every fix since the first version came with a test, and every test was first run against the code *before* the change, where it had to fail — for the right reason, read from its error, not merely fail. A test that passes on the old code proves nothing about the new. These are the ones those passes added, each named by its title, the way the runner prints it.'
			},
			code('e2e/public.e2e.ts', 217, 226),
			{
				type: 'p',
				text: '“a dynamically rendered page carries its preloads as a Link header” proves `output.linkHeaderPreload` (chapter {{the-config}}): the preloads leave the HTML for a `Link` response header, including the font the `preload` hook picks by its source filename — and the last line proves they *left*, rather than appearing twice.'
			},
			code('e2e/public.e2e.ts', 228, 251),
			{
				type: 'p',
				text: '“on a phone the closed menu is not in the accessibility tree, and Escape closes the open one” is about motion that ends somewhere honest (chapter {{motion-with-intent}}): a sheet clipped to nothing is still in the DOM, and only `visibility: hidden` at the end of its transition takes its links out of reach of a role query — and of a screen reader. It skips itself on the desktop, where there is no menu.'
			},
			code('e2e/offline.e2e.ts', 60, 100),
			{
				type: 'p',
				text: '“a trip opened once is readable offline” and “after signing out, a trip is not readable offline” are the two halves of the service worker’s contract (chapter {{the-offline-itinerary}}): the copy is there for the person who opened it, in a tunnel, and gone for the next person on a shared device. The third test in the file, “a session that ends without the button takes the copies with it”, covers the sign-out nobody pressed.'
			},
			code('e2e/collab.e2e.ts', 154, 223),
			code('e2e/collab.e2e.ts', 225, 269),
			{
				type: 'p',
				text: '“a companion who is removed stops receiving the trip” and “a trip made private stops the stream of somebody reading it by link” prove the live query asks for access on every wake (chapter {{live-collaboration}}). The assertion that decides is the removed person’s chip leaving “Live” for “Reconnect”: it says the server ended the stream, so the stop added afterwards *cannot* arrive, and the `toHaveCount(0)` after it is the consequence rather than a wait. Both were also run against the generator with only the re-check deleted, and both failed at that line. The removed companion is a new person per run, joined through an invite link, because the desktop and phone projects share one database and removing a seeded person would leave the other suites a different trip; the privacy test puts the trip back in `finally`.'
			},
			code('e2e/public.e2e.ts', 188, 193),
			{
				type: 'p',
				text: 'Three lines added to “health, the route API and the embed frame answer for machines”: the German frame, `/de/embed/<slug>`, must carry `frame-ancestors *` like the English one. Against the old hook — a pathname test — it came back `\'none\'` (chapter {{security-headers-and-csp}}).'
			},
			{
				type: 'p',
				text: 'And the half that a test for the exception cannot see. Every assertion above passes if the hook frames *every* route, which is the worst way for it to be wrong, so the same test asks the home page what it sends: `frame-ancestors \'none\'` in the policy, and `Vary: Cookie` on the response. Then it asks the route API under `/de/` for the opposite — no `Vary: Cookie` on an endpoint that names nobody — which is the case the pathname rule got wrong in the other direction. The test was run once against a hook that sets `frame-ancestors *` on every route, and it failed on the home page’s policy; the hook is as it was.'
			},
			code('e2e/public.e2e.ts', 195, 207),
			code('e2e/trip.e2e.ts', 32, 44),
			{
				type: 'p',
				text: '“the back button closes the stop dialog and stays on the trip” is shallow routing’s whole promise in four lines (chapter {{the-itinerary}}): open the dialog, `page.goBack()`, and the dialog is gone while the URL is still the trip’s. Against the dialog held in component state, Back left for the sign-in page that came before.'
			},
			code('e2e/account.e2e.ts', 92, 104),
			{
				type: 'p',
				text: '“a half-typed new trip survives a reload” proves `snapshot` (chapter {{trips-and-a-new-trip}}). The worry with a reload test is that the browser restores form fields by itself and the test passes for the wrong reason; it did not — against the old page both fields came back empty.'
			},

			{ type: 'h3', id: 'visual', text: 'The suite that looks at the design' },
			{
				type: 'p',
				text: 'The seven suites above are about behaviour. The eighth, `visual.e2e.ts`, is about the things a person reviewing a screenshot is bad at: a control that runs two pixels past its card, a button a finger cannot hit, a missing accessible name, a colour pair a theme change broke. It walks the same list of screens `scripts/screens.ts` photographs — one list, so the screens a person reviews are the screens the gate checks.'
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

Running 259 tests using 1 worker

  ✓  [desktop] › public.e2e.ts › the guides are prerendered, translated and shipped without JavaScript
  ✓  [desktop] › collab.e2e.ts › a change by one person reaches the other through the live query
  …
  ✓  [phone] › visual.e2e.ts › dark theme › trip-expenses › trip-expenses holds together
  -  [desktop] › visual.e2e.ts › dark theme › nav-open › nav-open holds together
  ✓  [phone] › map.e2e.ts › the pins are where the map is once it has settled
  ✓  [phone] › visual.e2e.ts › first impressions on a phone › / paints its largest thing inside 2.5 seconds on a slow 4G connection
  ✓  [narrow] › visual.e2e.ts › light theme › trip-new › trip-new holds together

  18 skipped
  241 passed`
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
				text: 'Security in a web application is mostly a list of things that are true of *every* response, and the place to make them true is the one function every response passes through. In SvelteKit that is `handle` in `hooks.server.ts` (chapter {{environment-and-hooks}}), and the third handler in its sequence is where this chapter lives. The rest is a policy — the `csp` option in `vite.config.ts` — that SvelteKit applies for us, and a handful of decisions at the edges: what may be framed, what may be fetched from another origin, where a sign-in may redirect.'
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
			code('src/hooks.server.ts', 114, 172),
			{
				type: 'p',
				text: 'Three headers are always right and cost nothing: `x-content-type-options: nosniff` (the browser trusts our content types and does not guess), `referrer-policy: strict-origin-when-cross-origin` (other sites learn our origin, not our paths — a trip’s slug is not their business), and a `permissions-policy` that turns off the microphone and the camera and keeps geolocation for this origin only, because “where am I” on the map is the one capability the app asks for. `Vary: Cookie` on pages is for shared caches: the header shows the person’s name and the locale cookie changes the language, so a cache must never serve one person’s page to another. API responses and the hashed `/_app/` assets are excluded because they do not depend on the cookie, and a `Vary` there would only defeat the cache. One cache cannot be protected by a header, because it is on the device itself: the service worker’s copies of the pages a person opened, kept for reading offline. A shared laptop is a shared cache with one browser profile, so the app deletes those copies before signing anybody out, and again whenever it finds nobody signed in — chapter {{the-offline-itinerary}} has the code and the test that proves the next person reads nothing.'
			},
			{
				type: 'p',
				text: 'The embed route is the exception that proves the policy was applied thoughtfully. `/embed/<slug>` exists to be framed — it is the read-only route summary the custom element loads (chapter {{embedding-a-trip}}) — and for that route, and only that route, the handler rewrites the `frame-ancestors` directive **after SvelteKit has built the header**. A regular expression on the header is cruder than a per-route config would be, but SvelteKit’s policy is global, the route is one, and the rewrite is six lines next to a comment that says exactly what it does. The end-to-end suite asserts the result on the public frame, on the German one, and the 404 on the private one.'
			},
			{
				type: 'p',
				text: '“That route” is the part that was wrong. The first version tested `event.url.pathname.startsWith(\'/embed/\')`, and `/de/embed/<slug>` is the same route: `reroute` in `src/hooks.ts` hands it to `src/routes/embed/[slug=slug]` with the locale prefix taken off, but `event.url` is still what the browser asked for. So the German frame went out with `frame-ancestors \'none\'`, and every page that framed it got a refusal instead of a trip. `event.route.id` is what the router *matched* — `\'/embed/[slug=slug]\'` for both URLs, after `reroute` — and it is checked against the generated route types, so a typo in it is a type error rather than a rule that quietly never fires. The `Vary: Cookie` rule below it moved for the same reason: by route and by request kind — `event.isRemoteRequest` for remote function calls, a route id under `/api/` for the machine endpoints — rather than by path prefixes that a locale prefix slips past.'
			},
			{
				type: 'why',
				title: 'Why a route id and not a pathname, for every rule about “this page”',
				text: 'A pathname is input: it is what was typed, with a locale prefix, a trailing slash, a base path, an encoding — every one of which `reroute` and the router are there to see through. A route id is the answer the router gave, the same for every spelling of the address. A security rule keyed on input has to anticipate each spelling, and the one it forgets is a hole; a rule keyed on the route has nothing to anticipate. The test that would have caught it costs one `page.goto`.'
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
			code('src/hooks.server.ts', 181, 189),
			{
				type: 'p',
				text: '`handleFetch` wraps every server-side `fetch` the app makes. Same-origin requests go through untouched; anything leaving the server gets a ten-second `AbortSignal.timeout` and a user agent that names the app. The project makes no external requests today — the map is offline — which is exactly when to put the guard in: the first person to add a weather lookup inherits a timeout instead of a server that hangs when the weather service does.'
			},
			code('src/hooks.server.ts', 206, 221),
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
			code('Dockerfile', 41, 61, { partial: true }),
			{
				type: 'p',
				text: 'The `build` stage is `prepare` spelled out: package the library, compile the messages, sync the types, then build the element and the app. `PUBLIC_ORIGIN` is a **build argument**, and the stage refuses to continue without it, because SvelteKit bakes `paths.origin` into the server bundle (chapter {{the-config}}) and Better Auth derives its base URL from the same value. This is the fact that decides the deployment model: one image per origin. It is the only variable the stage sets. The database URL and the auth secret used to be set here too, to invented values — `src/env.ts` validated them during the build — and now they are not: `src/env.ts` makes both optional while `building` (chapter {{environment-and-hooks}}), the database client opens an in-memory database for the build’s analysis, and Better Auth gets a throwaway secret that dies with it. A build stage that holds no secret, not even a fake one, is one nobody has to argue about; CI proves it by building and starting the image with the secret given only to `docker run`. `pnpm prune --prod` then removes every devDependency: the compilers, the test runners, drizzle-kit, Playwright. That is most of `node_modules`. The `CI=true` in front of it is a scar from the first pipeline run: pnpm asks for confirmation before it purges a modules directory — 11 did, 12 still does — and with no terminal to ask on it aborts the build instead of asking — the variable is how you tell it nobody is there.'
			},
			code('Dockerfile', 64, 102, { partial: true }),
			{
				type: 'p',
				text: 'The `runtime` stage starts from a clean `node:slim` and copies five things from the build: the manifest, the pruned `node_modules`, the `build/` directory, the `drizzle/` migrations and the migration script. Nothing else — no source, no tests, no `.git`. It runs as the `node` user the base image ships with, because nothing here needs root and a process that does not need root should not have it. `/data` is a volume owned by that user, and `DATABASE_URL` points into it, so the database outlives the container.'
			},
			{
				type: 'ul',
				items: [
					'`HOST=0.0.0.0` — `@sveltejs/adapter-node` binds to localhost by default, which inside a container means “reachable by nobody”.',
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
			code('src/hooks.server.ts', 228, 232),
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
		slug: 'migrating-a-major',
		title: 'Migrating a major: the routine, the record, and a dependency still on Svelte 4',
		summary:
			'`sv migrate` and its task-based migrations — one task per commit, `@migration-task` comments, and a `MIGRATION_TASKS.md` for what no tool can decide — with the record this project kept, every box resolved. What SvelteKit 3 removed and renamed, module by module and option by option; and how to read a component written for Svelte 4, each legacy construct with its runes replacement and the code that flags it.',
		goal: 'Run a major upgrade as a reviewable series of commits, resolve every finding with evidence, and read legacy Svelte without writing any.',
		blocks: [
			{
				type: 'p',
				text: 'A major version is a list of breaking changes and, these days, a tool that makes most of them for you. The skill is in the rest: knowing which changes the tool made, which it could not, and how to leave a record that the next person — or the next major — can trust. This chapter is the routine for a project that is on SvelteKit 2, and it is not Meridian’s history: Meridian was started on the 3.0 prereleases and moved to 3.0.1 in a single commit, by hand, so there is no run of nine commits in its log to point at. What it does have is the record the routine ends in — the tool run against a copy of the finished project, every finding resolved with evidence — and that is what the rest of the chapter reads. A course that claimed a history the repository does not have would be teaching you to trust a record you cannot check.'
			},
			{
				type: 'terminal',
				code: `
# the routine, for a SvelteKit 2 project; Meridian began on 3, so none of these commits are in its log
$ git status --short                                     # clean first; or --no-git-check
$ npx sv migrate sveltekit-3 --tasks                     # list the tasks, run nothing
$ npx sv migrate sveltekit-3 --tasks prerequisite --install pnpm
$ git commit -am "sveltekit-3: package-json, tsconfig"
$ npx sv migrate sveltekit-3 --tasks svelte-config --no-install
$ git commit -am "sveltekit-3: svelte-config"
  … one task, one review, one commit, for each of the nine …
$ grep -rn "@migration-task" src                         # must find nothing at the end`
			},
			{
				type: 'p',
				text: '`sv migrate` has two kinds of migration. The newer ones are *task-based*: `sveltekit-3` and `app-state`. The older ones — `svelte-5`, `self-closing-tags`, `svelte-4`, `sveltekit-2`, `package`, `routes` — are delegated to `svelte-migrate@1`, kept so old projects can move forward, and, in the documentation’s words, “no longer receive updates”. A task-based migration shows its tasks before it runs any; the *prerequisite* tasks always run, and the rest are chosen interactively or with `--tasks`. Run without IDs, `--tasks` lists them; `--tasks all` runs everything at once, which the documentation reserves for automation. The other options are plumbing: `--cwd` to run against another directory, `--confirm` to skip the last prompt in a script, `--install <manager>` or `--no-install`, and `--files <glob>` — an escape hatch that saves only matching files, which the documentation warns “can leave imports, configuration, or types inconsistent”.'
			},
			{
				type: 'why',
				title: 'Why one task per commit',
				text: 'Because a migration commit is reviewed by reading its diff, and nine tasks in one diff is a diff nobody reads. The documentation says it outright: run “one selectable task at a time and commit the result before starting the next one”, and — just as important — “do not expect a project to work after running only a few tasks”. The commits are for review, not for stopping half-way. When something breaks after the fourth, `git bisect` has nine small commits to choose from instead of one large one.'
			},
			{
				type: 'table',
				caption: 'The nine `sveltekit-3` tasks, and where their result lives in Meridian',
				head: ['Task', 'What it does', 'Where it shows'],
				rows: [
					['`package-json` (prerequisite)', 'bumps the packages to SvelteKit 3’s minimums', 'the versions and pnpm’s release-age rules (chapter {{the-workspace}})'],
					['`tsconfig` (prerequisite)', 'extends `$app/tsconfig` instead of `.svelte-kit/tsconfig.json`', '`tsconfig.json` and its explicit `include` (chapter {{the-config}})'],
					['`svelte-config`', 'moves the config into `sveltekit({…})` in `vite.config.ts`', 'there is no `svelte.config.js` (chapter {{the-config}})'],
					['`environment`', 'replaces the `$env/*` modules with `$app/env` and a `src/env.ts`', '`src/env.ts` (chapter {{environment-and-hooks}})'],
					['`paths`', 'replaces `base`, `assets` and `resolveRoute` with `resolve` and `asset`', 'the `href()` helper over `resolve()` (chapter {{the-shell}})'],
					['`external-redirects`', 'opts external redirects into `{ external }`', 'nothing to do: no redirect leaves the site, and the sign-in target is sanitised to stay on it (chapter {{security-headers-and-csp}})'],
					['`shallow-routing`', 'turns `pushState` / `replaceState` into `goto(…, { shallow })`', 'the stop dialog as a history entry (chapter {{the-itinerary}})'],
					['`params`', 'gathers matchers into one `src/params.ts`', '`defineParams` with a valibot slug (chapter {{environment-and-hooks}})'],
					['`app-state`', 'moves `$app/stores` to `$app/state`', 'every `page.` read (chapter {{the-shell}})']
				]
			},

			{ type: 'h3', id: 'the-record', text: 'The record: every finding resolved' },
			{
				type: 'p',
				text: 'What a task cannot decide safely it leaves in two places: `@migration-task` comments at the spot, and a `MIGRATION_TASKS.md` at the root listing the migrations that are “uncommon, context-dependent, or disproportionately difficult to automate safely”, each with the files worth a look. The file’s own instruction is to delete it when the work is done. Meridian has one because the tool can be run on a finished project too: it was run against a copy, the findings were resolved by hand, and the result is kept as `docs/migration-sveltekit-3.md`, with every box ticked and the evidence beside it.'
			},
			code('docs/migration-sveltekit-3.md', 1, 33),
			{
				type: 'p',
				text: 'The findings are deliberately broad, and the file says so — “may include files that do not require changes”. Eight of the twenty boxes here were false positives, and *not affected, because* is a resolution as long as the because is checkable. The header’s `page.url` finding was a read, never a write. The `error(...)` finding in the trip page was svelte-sonner’s `toast.error`. The one below is the most instructive: three forms flagged for hand-written `name` attributes, none of them remote forms.'
			},
			code('docs/migration-sveltekit-3.md', 97, 111),
			{
				type: 'p',
				text: 'The rule behind that task is strict — the migration guide says a hand-written name on a remote form “will cause the submission to be rejected” — so the check had to be real: each flagged `<form>` is plain HTML with an `onsubmit` that calls a `command`, and its `name` only groups radio buttons for the browser. Every actual remote form takes its attributes from `fields.x.as(…)` (chapter {{remote-functions-the-writes}}).'
			},
			code('docs/migration-sveltekit-3.md', 121, 129),

			{ type: 'h3', id: 'what-went-away', text: 'What went away, and what replaced it' },
			{
				type: 'table',
				caption: 'Modules SvelteKit 3 removed or renamed',
				head: ['SvelteKit 2', 'SvelteKit 3', 'In Meridian'],
				rows: [
					['`$app/environment`', '`$app/env` — renamed, and now importable in a service worker', '`browser`, `building`, `dev`, `version` (chapters {{environment-and-hooks}}, {{the-map-of-features}}, {{the-offline-itinerary}})'],
					['`$app/stores` (`$page`, `$navigating`, `$updated`)', 'removed — `$app/state`: `page`, `navigating`, `updated`, read without the `$`', 'every page read (chapter {{the-shell}})'],
					['`$service-worker`', 'removed — `version` from `$app/env`; `assets`, `immutable`, `prerendered` from `$app/manifest`; `resolve()` from `$app/paths`', '`src/service-worker/index.ts` (chapter {{the-offline-itinerary}})'],
					['`$env/static/*`, `$env/dynamic/*`', 'deprecated — declared in `src/env.ts`, imported from `$app/env/private` and `$app/env/public`', 'chapter {{environment-and-hooks}}'],
					['`$lib`', '`#lib`, declared in `package.json` `imports`, with file extensions', 'every import (chapter {{the-workspace}})'],
					['`base`, `assets`, `resolveRoute` from `$app/paths`', '`resolve()` and `asset()`; the `Pathname` and `Asset` types are `Path` and `AssetPath`', '`#lib/href.ts` (chapter {{the-shell}})'],
					['hook, env and remote types from `@sveltejs/kit`', '`@sveltejs/kit/hooks`, `@sveltejs/kit/env`, `@sveltejs/kit/params`, `$app/server`', 'the first lines of `hooks.server.ts` (chapter {{environment-and-hooks}})']
				]
			},
			{
				type: 'table',
				caption: 'Configuration SvelteKit 3 removed',
				head: ['Removed', 'Instead', 'Note'],
				rows: [
					['`svelte.config.js`', 'options passed to `sveltekit({…})` in `vite.config.ts`', 'the `kit.*` options are top-level there'],
					['`files.lib`', '`#lib` in `package.json`', ''],
					['`vitePlugin`', 'vite-plugin-svelte options such as `inspector` passed straight to the plugin', 'chapter {{the-config}}'],
					['`output.preloadStrategy`', 'nothing — `modulepreload` is always used', 'still in the types, marked “@deprecated removed in 3.0”'],
					['`prerender.origin`', '`paths.origin`', 'also replaces adapter-node’s `ORIGIN`'],
					['`csrf.checkOrigin`', '`csrf.trustedOrigins`', 'still in the types: “Use `trustedOrigins: [\'*\']` instead”'],
					['`experimental.tracing`, `.instrumentation`, `.handleRenderingErrors`', 'top-level `tracing`; instrumentation and rendering errors are always on', ''],
					['`serviceWorker.files`', 'gone: `serviceWorker` has only `register` and `options`', 'the worker filters what it caches itself'],
					['`env.publicPrefix`, `env.privatePrefix`', 'gone: `env` has only `dir`; `public: true` is per variable in `src/env.ts`', ''],
					['`export const snapshot` (the `Snapshot` type)', '`snapshot()` from `$app/navigation`, callable from any component', 'chapter {{trips-and-a-new-trip}}']
				]
			},
			{
				type: 'p',
				text: 'And the behaviour that changed under code that still compiles, which is where an upgrade actually bites. In this project each was met and answered: `error()` takes a message string, with extra properties as a third argument; `handleError` now receives *every* error, told apart by `kind`, and can set the status; `json()` and `text()` are deprecated for `Response.json()` and `new Response()`; `goto` rejects a URL that is not a route; `page.url` is readonly; `delta` exists only for `popstate`; `preloadData` can return an `error` result; a 204 has no body; a cookie with no `path` gets `/`; `data-sveltekit-*` attributes take `false`, not `\'off\'`; a redirect off the site needs `{ external }`; a link to the current page refreshes; a universal `config` wins over a server one; and the service worker is registered as a module.'
			},

			{ type: 'h3', id: 'svelte-4', text: 'Reading a dependency that is still on Svelte 4' },
			{
				type: 'p',
				text: 'Svelte 5 still compiles Svelte 4 syntax — a component without runes is in *legacy mode* — so a library written for 4 usually runs. You will read its source when it misbehaves, and every construct in it has a runes equivalent and a code that names it. No code in this project is written in legacy mode; this is a reading table.'
			},
			{
				type: 'table',
				caption: 'Svelte 4 constructs, their runes replacements, and the code that flags each in runes mode',
				head: ['Svelte 4', 'Svelte 5', 'Flagged by'],
				rows: [
					['`let count = 0` (implicitly reactive)', '`let count = $state(0)`', '`non_reactive_update` when a plain `let` is reassigned and read reactively'],
					['`$: double = count * 2`; `$: { … }`', '`$derived(count * 2)`; `$effect(() => { … })`', '`legacy_reactive_statement_invalid`; `run()` from `svelte/legacy` is the migration’s stopgap'],
					['`export let name`', '`let { name } = $props()`', '`legacy_export_invalid`'],
					['`$$props`, `$$restProps`', '`let props = $props()`; `let { a, ...rest } = $props()`', '`legacy_props_invalid`, `legacy_rest_props_invalid`'],
					['`on:click={…}`, `on:click|preventDefault`', '`onclick={…}`, and `event.preventDefault()` inside it', '`event_directive_deprecated`; `mixed_event_handler_syntaxes` if both appear'],
					['`createEventDispatcher`', 'callback props', 'deprecated in the types; the migration script leaves it to you'],
					['`<slot />`, `$$slots`, `<svelte:fragment>`', '`{@render children()}`, snippet props', '`slot_element_deprecated`; `slot_snippet_conflict` if mixed'],
					['`<svelte:component this={X}>`', '`<X />` — components are dynamic', '`svelte_component_deprecated`'],
					['`<svelte:self>`', 'the component imports itself', '`svelte_self_deprecated`'],
					['`new App({ target })`, `$set`, `$on`, `$destroy`', '`mount(App, { target })`, `$state` props, `unmount`', '`legacy_component_creation`; at run time `component_api_changed`, `component_api_invalid_new`'],
					['`beforeUpdate`, `afterUpdate`', '`$effect.pre`, `$effect` (and `tick`)', '`lifecycle_legacy_only`'],
					['`SvelteComponent`, `ComponentType`, `ComponentEvents`', 'the `Component` type; callback props instead of events', 'deprecated in the types: “`SvelteComponent`, the base class from Svelte 4, is deprecated in favour of the new `Component` type”'],
					['`<script context="module">`', '`<script module>`', '`script_context_deprecated`'],
					['`<div />`', '`<div></div>`', '`element_invalid_self_closing_tag`; `npx sv migrate self-closing-tags`']
				]
			},
			{
				type: 'p',
				text: '`svelte/legacy` is the bridge the `svelte-5` migration reaches for when it cannot be sure: `run` for a `$:` it could not classify, `createBubbler` and `handlers` for forwarded events, the eight modifier helpers — `once`, `preventDefault`, `self`, `stopPropagation`, `stopImmediatePropagation`, `trusted`, `passive`, `nonpassive` — and `asClassComponent` / `createClassComponent` with the `LegacyComponentType` type for code that still says `new Component(…)`. For a dependency you cannot change, `compilerOptions.compatibility.componentApi: 4` makes `new Component(...)` keep working, at “a bit of overhead to each component”. Each is a way to finish migrating later; none is a way to write new code.'
			},
			{
				type: 'p',
				text: 'Turning a component into runes mode changes more than syntax, and these are the ones that surprise people. Props are not bindable unless declared with `$bindable()`. `accessors` and `immutable` are ignored. A class instance is not “auto-reactive” — only its `$state` fields are, and wrapping `new Foo()` in `$state` does nothing. `ontouchstart` and `ontouchmove` handlers are passive. An attribute that concatenates must be quoted. HTML the browser would repair is a compile error. Selectors inside `:is()`, `:has()` and `:where()` are scoped now. Whitespace between nodes collapses to one space and is trimmed at the edges of a tag. And `children` is a reserved prop name, because content between a component’s tags *is* the `children` snippet.'
			},

			{ type: 'h3', id: 'performed', text: 'The two migrations this course made by hand' },
			{
				type: 'p',
				text: 'Two pieces of syntax changed under this project after it was written, and neither has a migration task, because both old forms still compile. `{@const x = …}` became the declaration tag `{const x = $derived(…)}` — twenty-seven of them across twenty components, and no `{@const}` left — for the placement rule and the computed-once value chapter {{what-the-compiler-says}} describes. And `class:active={…}` directives became `class={[\'chip\', { active }]}` arrays — fifteen class arrays across ten components, no `class:` directive left — because one attribute that says everything about an element’s classes reads better than a list of directives, and merges with a `class` prop without string-building. The autofixer’s legacy checks and `pnpm run lint:svelte` keep both from coming back.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can run a task-based migration one task per commit, and say what `--tasks`, `--files`, `--cwd`, `--confirm` and `--no-install` do.',
					'You can resolve a `MIGRATION_TASKS.md` finding with evidence, including the findings that are false positives.',
					'You can name what replaced `$app/environment`, `$app/stores`, `$service-worker`, `$env/*`, `$lib` and `resolveRoute`.',
					'You can read a Svelte 4 component and name, for each construct, its runes form and the code that flags it.'
				]
			}
		]
	},

	{
		slug: 'what-i-would-do-next',
		title: 'What I would do next, and what you now know',
		summary:
			'The project is complete and the suite is green, and it is still version one. An honest list of the next ten pieces of work, each with the chapter it would touch, then every deferred item with the reason it waits — generated, and checked against the exit criteria; a map from every Svelte and SvelteKit capability the course used to the chapter that used it; and how to keep the project current as the framework moves.',
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
					'**Notice a sign-out in another tab.** Sign out in one tab and the others still look signed in until they next ask the server for something — mutations already answer 401 and the toast says so, but the page should know first. The shape is `depends(\'meridian:session\')` on the layout’s load and an `invalidate` when the tab becomes visible again (chapter {{the-shell}}). The live stream has the same gap at a smaller scale: it re-checks *membership* on every wake (chapter {{live-collaboration}}), but the person on `locals` is the one the connection opened with. (B4-D30)',
					'**Prove the redirect sanitiser.** `redirectTo` is cleaned rather than rejected (chapter {{security-headers-and-csp}}), and nothing yet proves `//evil.example` lands on `/trips`. One end-to-end test, and `LoadEvent.untrack` so the guard does not re-run on every navigation. (B4-D55)',
					'**A sitemap.** A prerendered `sitemap.xml/+server.ts` with an `hreflang` alternate per language, for four guides in three languages (chapter {{guides-prerendered-with-mdsvex}}). Fifteen minutes. (B4-D57)',
					'**Rate-limit the public surface.** Sign-in, sign-up, the join page and the route API are reachable by anyone. A token bucket on `getClientAddress()` in the security handler, answering 429 with `retry-after`, and `ADDRESS_HEADER` / `XFF_DEPTH` read correctly behind the proxy (chapters {{security-headers-and-csp}}, {{deploying}}). The end-to-end suite signs in from one address many times, so it needs a limit per environment. (B4-D62)',
					'**A cover image for a trip.** An upload is `fields.cover.as(\'file\')` with `v.file()` and a size cap, sharp for the resizing, an endpoint to serve it, and `BODY_SIZE_LIMIT` raised to match (chapter {{deploying}}). Not `as(\'image\')`, which sounds right and is `<input type="image">` — click coordinates, `ImageInputValue`, no file at all. (B4-D54)',
					'**A share image.** `render()` from `svelte/server` drawing the route as an SVG in an endpoint, and `og:image` on the trip page (chapter {{embedding-a-trip}}). (B4-D50)',
					'**Stops mentioned in the notes.** A Tiptap node view that renders a Svelte component with `mount` and `unmount` — the one honest place for them in this project (chapter {{notes-with-tiptap-through-an-attachment}}). Two new dependencies and the biggest item here. (B4-D51)',
					'**Installable.** A web manifest and an icon set; the worker that installing needs is already there (chapter {{the-offline-itinerary}}). (B3-D1)',
					'**Writing offline.** Note saves queued while the network is gone and replayed on `online`, with a conflict policy against the live query’s last-writer-wins (chapters {{the-offline-itinerary}}, {{live-collaboration}}). (B3-D5)',
					'**An inventory from the compiler.** A `scripts/inventory.ts` that walks every component with `parse` from `svelte/compiler` and writes the map of features from what the code actually uses, so chapter {{the-map-of-features}} is generated rather than kept (chapter {{what-the-compiler-says}}). (B1-D2)'
				]
			},
			{
				type: 'p',
				text: 'Further out, the work a growing product would ask for rather than the work this course left: invites sent by email from an outbox written in the same transaction (chapter {{invites-and-membership}}); a libSQL server instead of a file, and rooms on a pub/sub two processes share (chapters {{the-database}}, {{live-collaboration}}); the traces exported to an OTLP collector (chapter {{explore-and-diagnostics}}); a fourth, right-to-left locale (chapter {{three-languages-with-paraglide}}); a session with a real screen reader on the drag-and-drop; a tile server behind a flag. And one upgrade with a date on it: mdsvex 1.0, the first release to write `<script module>`, when it leaves prerelease (chapter {{what-the-compiler-says}}).'
			},
			{
				type: 'p',
				text: 'Three things are deliberately *not* on the list. A native app: the map and the globe already work on a phone, and a web manifest is item eight. A rewrite of the itinerary as a CRDT: the live query with last-write-wins per stop is the right trade for a few people planning a trip. And a second framework for the marketing pages: the home page is a SvelteKit route like the others, prerendered where it can be.'
			},

			{ type: 'h3', id: 'the-whole-list', text: 'The whole list' },
			{
				type: 'p',
				text: 'The ten above are the top of a longer list: every piece of work the course planned and decided not to do yet, each with the reason it waits. It is generated from the gap list that decided what this course would build, and checked on every build — the exit criteria in chapter {{the-exit-criteria}} mark a surface *deferred* only if its item is here, and where the row says the item names the surface, the item’s own text has to. The ids are the gap list’s own: B1 is the toolchain, B2 design and motion, B3 offline, B4 the server and the pages, B5 the proofs; so “goes with B4-D8” points at a row of this table.'
			},
			{
				type: 'table',
				caption: 'Every deferred item: what it is, the surfaces it carries, and why it waits',
				head: ['Item', 'What', 'Why it waits'],
				rows: BACKLOG.map((item) => {
					const carried = surfacesOf(item.id);
					return [
						item.id,
						carried.length > 0 ? `${item.what} Surfaces: ${carried.join(', ')}.` : item.what,
						item.why || 'A few sentences of prose, not yet written.'
					];
				})
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
					'**The six chapters added since the first edition** — the toolchain and the agent beside you: ch. {{the-toolchain}}; motion and the rules it keeps: ch. {{motion-with-intent}}; the trip with no network: ch. {{the-offline-itinerary}}; diagnostics by code: ch. {{what-the-compiler-says}}; upgrading a major: ch. {{migrating-a-major}}; and the checklist that measures all of it: ch. {{the-exit-criteria}}.',
					'**Proof** — Vitest projects and `vitest-browser-svelte`: ch. {{unit-and-browser-tests}}; Playwright on the built server, in three projects — a desktop, a phone, and the phone at 360px — with two browser contexts on one trip and a test with JavaScript switched off: ch. {{end-to-end}}; the container, the health check, the pipeline: ch. {{deploying}}; the course’s own checks: ch. {{deploying}}.'
				]
			},

			{ type: 'h3', id: 'upgrading', text: 'Keeping it current' },
			{
				type: 'terminal',
				code: `
$ pnpm outdated                       # what moved since the lockfile
$ pnpm exec svelte-mcp get-documentation kit/migrating-to-sveltekit-3   # on a major: read the guide first
$ npx sv migrate sveltekit-3 --tasks  # then the tasks, one per commit (chapter {{migrating-a-major}})
$ pnpm update --latest --interactive  # pick, do not take everything blindly
$ pnpm run verify                     # check · lint · unit · build · e2e
$ pnpm run verify:package             # the library, as a consumer meets it
$ node ../meridian-course/verify.js   # every quoted range is still whole
$ node ../meridian-course/build.js && node ../meridian-course/tools/check-dist.js`
			},
			{
				type: 'p',
				text: 'The framework this course is built on moves every few weeks, and the versions in chapter {{choosing-libraries}} are dated for that reason. The routine above is the whole upgrade process. On a major version it starts with two more lines: read the migration guide — `get-documentation` with `["kit/migrating-to-sveltekit-3"]`, from an agent through the MCP server or from the terminal through the same package’s CLI — and then `npx sv migrate`, one task per commit, before `pnpm update` touches anything else (chapter {{migrating-a-major}}). The reason the routine is short is the reason the tests exist: `verify` is the same command in the pipeline and on a laptop, the suite runs against the built output, and the course reads the code rather than copying it — so a refactor that moves a function changes the course the next time it is built, and `verify.js` says which ranges need a human. When a SvelteKit release renames a thing, the Svelte documentation server and the `svelte-autofixer` used throughout this series are the fastest way to learn the new name; when it adds a thing, the question to ask is the one from chapter {{what-we-are-building}}: is this the right shape, does it earn its bytes, could we remove it later.'
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
					'You can run the upgrade routine end to end, including the two lines a major version adds, and say what each command protects.'
				]
			}
		]
	},
	(() => {
		const count = (/** @type {string} */ status) => SURFACES.filter((row) => row.status === status).length;
		const where = (/** @type {import('./surfaces.js').Surface} */ row) =>
			row.status === 'taught' || row.status === 'declined'
				? `chapter {{${row.chapter}}}`
				: row.status === 'deferred'
					? `the backlog, chapter {{what-i-would-do-next}} (${row.gap})`
					: 'not built';
		const claim = (/** @type {import('./surfaces.js').Surface} */ row) =>
			row.status === 'dropped' ? `${row.statement}: ${row.reason}` : row.statement;
		return {
			slug: 'the-exit-criteria',
			title: 'The exit criteria: what a DPE 8++ in Svelte can do',
			summary:
				'What “8++” means for this course, measured: every surface the coverage plan assigned to a chapter, with what you should be able to do with it and where it was taught — or declined, deferred or dropped, and why. Twelve production exercises that start where the course stops, a rubric, and the routine that keeps you current.',
			goal: 'Measure yourself against every Svelte and SvelteKit surface the course planned, honestly — and pick the exercises that close the gaps you find.',
			blocks: [
				{
					type: 'p',
					text: `“8++” is a promise about coverage and about reasons. Every surface the coverage plan named for Svelte 5.57 and SvelteKit 3.0.1 — ${SURFACES.length} of them — is in one of four states in this course: used for something in Meridian, with the reason written down; declined, with the reason written down; on the backlog, with the reason it waits; or dropped, with the reason it was not built. The plan is this course’s own list and not the whole API, so a built-in nobody planned has no row here. Nothing is demonstrated for its own sake, and nothing is claimed that the code does not do. This chapter is the list, and it is the hardest chapter in the course to fake, because it is not written by hand.`
				},
				{
					type: 'why',
					title: 'Why this list can be trusted',
					text: `It was generated from the two documents that decided the course — the coverage plan, which assigned each surface to a chapter, and the gap list, which recorded what was then built, deferred or dropped — by \`tools/exit-criteria.js\`, and committed as \`content/surfaces.json\`. Then \`verify.js\` holds it to the course on every build: a surface marked taught must be in backticks in the prose of the chapter it names, a deferred one must sit under an item of the backlog in chapter {{what-i-would-do-next}} — and, when the row says that item names it, the item’s own text must carry it in backticks — and every planned chapter must have a row. Mark one deferred surface taught and the build fails. Today the list has ${SURFACES.length} surfaces: ${count('taught')} taught, ${count('declined')} declined, ${count('deferred')} deferred and ${count('dropped')} dropped.`
				},
				{
					type: 'terminal',
					code: `
$ node meridian-course/tools/exit-criteria.js plan.json GAPS.md     # once, from the working documents
content/surfaces.json: ${SURFACES.length} surfaces; content/backlog.json: ${BACKLOG.length} items
$ node meridian-course/verify.js                                     # on every build, in CI
… · ${SURFACES.length} surfaces in the exit criteria (${count('taught')} taught, ${count('declined')} declined, ${count('deferred')} deferred, ${count('dropped')} dropped)`
				},
				{
					type: 'p',
					text: 'Read each table with one question per row: can I do what the middle column says, without this course open? “Use it, and say why Meridian does” means both halves — the code and the reason. “Read it in older code, and say what replaced it” is the migration chapter’s history. “Say what it would take” is the backlog: knowing what you have not built, and why it waits, is part of the skill. Where a row says the *planned use* is on the backlog, the plan imagined a use of the surface that nobody has built, and the surface may or may not be in the code; where it says what is installed and what waits, as for `tracing.current`, it is in the code in part. The groups follow the order of Svelte’s own documentation index.'
				},
				...GROUPS.filter((group) => SURFACES.some((row) => row.group === group)).map((group) => ({
					type: 'table',
					caption: `${group} — ${SURFACES.filter((row) => row.group === group).length} surfaces`,
					head: ['Surface', 'I can…', 'Where'],
					rows: SURFACES.filter((row) => row.group === group).map((row) => [`\`${row.surface}\``, claim(row), where(row)])
				})),

				{ type: 'h3', id: 'exercises', text: 'Twelve production exercises' },
				{
					type: 'p',
					text: 'The checklist measures what you know. These measure what you can ship. Each starts where the course stops, names the chapters it draws on, and says what “done” looks like; several build an item from the backlog, which is the point — the backlog is real work with the reasoning already done.'
				},
				{
					type: 'ol',
					items: [
						'**Add a fourth, right-to-left locale** (chapters {{three-languages-with-paraglide}}, {{the-design-system}}, {{guides-prerendered-with-mdsvex}}). A Paraglide messages file, `%paraglide.dir%`, an audit of every physical CSS property, the guides prerendered in the new language, and the sitemap from the backlog with an alternate per locale. Done: the guides ship in four languages, and a right-to-left page has no physical margin anywhere.',
						'**Give a trip a cover image, then move it to object storage** (chapters {{companions-presence-and-settings}}, {{deploying}}, {{security-headers-and-csp}}). First the upload: `fields.cover.as(\'file\')`, `v.file()`, sharp, `BODY_SIZE_LIMIT`. Then a signed upload from a `command`, the bucket in `connect-src`, `handleFetch` for the server’s side. Done: an image that never passes through the app server.',
						'**Rate-limit sign-in, then share the limit across two containers** (chapters {{security-headers-and-csp}}, {{deploying}}, {{live-collaboration}}). A token bucket on `getClientAddress()`, then a shared store — and the live rooms need the same pub/sub. Done: the eleventh sign-in from one address is a 429 on either container.',
						'**Export the traces to an OTLP collector, and keep /diagnostics working** (chapters {{explore-and-diagnostics}}, {{deploying}}). A second exporter and the bundling caveats. Done: the same span in the collector and on the page.',
						'**Write an `sv` add-on for this series** (chapters {{the-toolchain}}, {{migrating-a-major}}) that writes `src/env.ts`, the `href()` helper and the three-handler `hooks.server.ts`: `defineAddon`, `sv/testing`, published with the `sv-add` keyword. Done: `npx sv add` on a fresh scaffold writes files this course could quote.',
						'**Run a dependency that ships Svelte 4 components inside Meridian** (chapters {{migrating-a-major}}, {{what-the-compiler-says}}). Legacy mode, `compatibility.componentApi`, the codes it raises, and the migration script on a fork. Done: it renders, and you can name every warning it printed.',
						'**Ship the waypoint docs site to GitHub Pages and to one platform adapter** (chapters {{packaging-and-proving}}, {{deploying}}). `@sveltejs/adapter-static`, `paths.base`, a fallback page; then `platform` and `emulate`. Done: both serve the same pages, and you can say what broke on the second.',
						'**Make the itinerary writable offline** (chapters {{the-offline-itinerary}}, {{notes-with-tiptap-through-an-attachment}}, {{live-collaboration}}). A command queue in IndexedDB, replayed on `online`, with a conflict policy against the live query’s last-writer-wins. Done: a stop added in a tunnel reaches a companion when the train comes out, and a conflict is reported, not lost.',
						'**Tighten the CSP to `style-src \'self\'`** (chapters {{security-headers-and-csp}}, {{explore-and-diagnostics}}). Turn on `csp.reportOnly` with the stricter policy and an endpoint for the reports, count the violations, move the inline styles, then enforce. Done: no `\'unsafe-inline\'`, and a quiet report endpoint.',
						'**Require Trusted Types** (chapters {{security-headers-and-csp}}, {{what-the-compiler-says}}). `require-trusted-types-for \'script\'`, policies for MapLibre, three.js and Tiptap, and Svelte’s `fragments: \'tree\'`. Done: the browser enforces it and every screen still works.',
						'**Run the whole `sv migrate` routine on a SvelteKit 2 project of your own, and ship it** (chapters {{migrating-a-major}}, {{the-toolchain}}). One commit per task, `MIGRATION_TASKS.md` resolved with evidence, the `@migration-task` grep clean. Done: your record reads like `docs/migration-sveltekit-3.md`.',
						'**Build the invite-email outbox** (chapters {{invites-and-membership}}, {{three-languages-with-paraglide}}, {{the-headless-pattern}}). `render()` for the body, a table written in the same transaction as the invite, a worker that drains it, the mail in the inviter’s language. Done: an invite sent while the mail server is down arrives when it comes back.'
					]
				},

				{ type: 'h3', id: 'scoring', text: 'Scoring' },
				{
					type: 'ul',
					items: [
						'**Knowledge** — for every declined and dropped row, you can explain the trade without looking it up: what the surface would have bought, and why Meridian does without it.',
						'**Practice** — you have shipped the “done” of at least three exercises, in a branch with tests that failed before and pass after.',
						'**Depth** — you can read the adapter you deploy (chapter {{deploying}}) and the compiler’s messages (chapter {{what-the-compiler-says}}) without the documentation open.',
						'**Currency** — you can say what the next minor of Svelte or SvelteKit would change in Meridian, because you ran the routine: `get-documentation` for the release notes, `sv migrate` on a branch, `verify` (chapter {{what-i-would-do-next}}).'
					]
				},
				{
					type: 'checkpoint',
					items: [
						'You can map any surface in the Svelte or SvelteKit documentation to a file in Meridian, or to the sentence that declines it.',
						'You have done at least three of the twelve exercises.',
						'You can run the upgrade routine and the migration routine without this course open.'
					]
				}
			]
		};
	})()
];
