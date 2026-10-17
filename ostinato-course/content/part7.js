/**
 * PART 7 — Proving it
 * (chapters 37–39)
 *
 * The tests, and what they found. Unit tests in Node for the pure parts,
 * browser tests in a real Chromium for the parts that need `AudioContext`,
 * and an end-to-end suite against the adapter's own output on a desktop and
 * a phone. The last chapter is about the tools that helped write this — the
 * Svelte MCP server and the `ai-tools` add-on — and where to take the
 * project next.
 */

import { code } from './quote.js';

export const part7 = [
	{
		slug: 'unit-and-browser-tests',
		title: 'Unit tests, and tests in a real browser',
		summary:
			'Two Vitest projects: pure logic in Node, `$state` and audio in Chromium. Round-trips for the codec, headers read back with a `DataView`, a forged cookie, a route partition, and a `Session` tested with `flushSync` and no component.',
		goal: 'Know which tests belong in Node and which need a browser, and test a `$state` class directly.',
		blocks: [
			code('vite.config.ts', 282, 335),
			{
				type: 'why',
				title: 'Why a real browser and not jsdom',
				text: 'jsdom has no `AudioContext`, no `OfflineAudioContext` and no layout. The scheduler, the knobs and the waveform would pass every test you thought to write while doing nothing at all. The `client` project runs in a real headless Chromium through Playwright, with the autoplay flag set because a test is not a person and cannot click first. The `server` project is plain Node, fast, and runs one file at a time because SQLite allows one writer.'
			},
			{ type: 'h3', id: 'pure-parts', text: 'The pure parts' },
			code('src/lib/music/note.spec.ts', 26, 37),
			{
				type: 'p',
				text: 'The last assertion is the one that matters to Svelte: `transpose` returns `this` when nothing changes, so `$state` sees no change and the session pushes no empty undo entry (ch. 14). A test that reads like a rule about the model is a test that stays.'
			},
			code('src/lib/pattern/codec.spec.ts', 8, 35, { partial: true }),
			code('src/lib/pattern/codec.spec.ts', 102, 125),
			{
				type: 'p',
				text: 'A codec has one job — `decode(encode(x))` is `x` — and one way to fail that nobody notices until a link from last month opens as silence. Every preset goes through, and so does a pattern built to hit every edge at once. The damaged-link tests cut a real encoding on a four-character boundary so that the base64 is intact and the failure is the one under test: valid bytes, not enough of them.'
			},
			code('src/lib/audio/wav.spec.ts', 10, 23),
			{
				type: 'p',
				text: 'A WAV header is forty-four bytes of numbers that every player checks and nobody can read by eye. The test reads them back with the same `DataView` a decoder would, which is the only assertion about a binary format worth making.'
			},
			code('src/lib/server/identity.spec.ts', 19, 33),
			code('src/lib/vanity.spec.ts', 20, 33),
			code('adapters/ostinato/partition.spec.js', 41, 71),
			code('src/lib/errors.spec.ts', 1, 32),
			{
				type: 'p',
				text: 'No double for an `HttpError` here: the test makes a real one the way the server does, by calling `error()` and catching what it throws, so the three cases are the three things `messageOf` can actually be handed (ch. 24). `lib/server/tracing.spec.ts` is the same idea for the span ring: a real `BasicTracerProvider` with the ring exporter behind it, one span with a query string in its `http.url`, and an assertion about what the public diagnostics page would be shown (ch. 32).'
			},
			{
				type: 'p',
				text: 'The adapter’s partition is tested with the same shapes SvelteKit hands an adapter in `builder.routes` — an `id` and a `pattern` — so the doubles are honest. `pick` is what the runtime calls per request, and the cases are the ones that were wrong at some point: a data request, a remote call, a vanity address.'
			},
			{ type: 'h3', id: 'state-without-a-component', text: '`$state` without a component' },
			code('src/lib/studio/session.svelte.test.ts', 7, 18),
			code('src/lib/studio/session.svelte.test.ts', 35, 52),
			{
				type: 'note',
				text: 'The comment inside the second test is a lesson about deep state: `undo` replaces the whole pattern, so a `track` variable captured before it points at an object that is no longer the pattern. Read through `session.pattern` after an undo, always.'
			},
			code('src/lib/studio/session.svelte.test.ts', 137, 162),
			{
				type: 'p',
				text: 'The autosave test is the one that needs the browser project: it creates a root effect and drives it with `flushSync`, which forces the effects that would otherwise wait for the next microtask. It also pins the `first`-run skip from chapter 14 — the initial state is not saved — with a fake `localStorage` that records what was written.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which project a new test file lands in from its name alone.',
					'You can write a test for a `$state` class and say when `flushSync` is needed.',
					'You can explain what the codec round-trip test would miss that the edge-case test catches.'
				]
			}
		]
	},

	{
		slug: 'end-to-end-and-what-it-found',
		title: 'End to end, and what it found',
		summary:
			'Forty-two scenarios on a desktop and a Pixel 7, against `node build/index.js` on a fresh database — the five real bugs the suite found: a back navigation that never rendered, an `await` that ran once, an autosave that overwrote the save, a crash in headless Chromium, and a 500 on every vanity address; two a probe found that the suite now pins: a refused edit that said nothing, and delete forms that were never enhanced; and the ones a review found, each with the test that now fails without its fix.',
		goal: 'Run a suite against the adapter’s output rather than a dev server, and treat every flake as a bug until proven otherwise.',
		blocks: [
			code('playwright.config.ts', 3, 24),
			code('playwright.config.ts', 68, 88),
			{
				type: 'p',
				text: '`vite preview` serves the build through SvelteKit’s preview server, which is useless for this project: the adapter is part of what is being tested. The web server is `node build/index.js` — what a deployment would run — on its own database, prepared from nothing before every run. `PUBLIC_ORIGIN` is identical in the build and the server because it is baked into the bundle and compared at run time; a mismatch is a 403 on every form and a confusing hour.'
			},
			code('scripts/prepare-e2e-db.js', 28, 37),
			{
				type: 'p',
				text: 'Serial, deliberately: one SQLite file, one writer, and tests that publish and then expect to find what they published. No retries, because a flake that is retried is a flake nobody fixes — and every one of the bugs below started as a flake.'
			},
			{ type: 'h3', id: 'the-suite', text: 'The suite' },
			code('e2e/jam.e2e.ts', 11, 44),
			{
				type: 'p',
				text: 'Two browsers, one room. Playwright gives each test a context; a second is opened by hand, and after each click from alternating browsers both must agree on the pad’s label. Whatever state the lobby was left in, three clicks bring the cycle round once.'
			},
			code('e2e/pattern.e2e.ts', 33, 47),
			code('e2e/platform.e2e.ts', 9, 27),
			{
				type: 'p',
				text: 'The adapter is tested by the header it sets: `x-ostinato-entry` says which function answered, and a vanity address must say `router` — the catch-all handled it and handed it on. A prerendered page has no header at all, because no function answered.'
			},
			code('e2e/gallery.e2e.ts', 102, 134),
			{ type: 'h3', id: 'what-it-found', text: 'What it found' },
			code('vite.config.ts', 116, 137),
			code('e2e/studio.e2e.ts', 155, 178),
			{
				type: 'warn',
				text: '**`forkPreloads`.** With the flag on, navigate from the studio to the gallery and press back: five times in eight the navigation *completed* — the URL changed, `navigation.complete` resolved, the view transition ran — while the gallery stayed on screen. Fifteen runs with the flag off, fifteen passes, on both profiles. The view transition’s timeout was the first suspect and was innocent. Off, with the test left in as the criterion for turning it back on.'
			},
			{
				type: 'p',
				text: '**`await` that ran once.** The jam room showed the first snapshot forever: `{const snapshot = await room}` is a blocking promise, not a subscription. `$derived(await room)` was the fix, and then the same pattern was found in the header, the gallery, the pattern view and the diagnostics page (ch. 31). The two-browser test is what noticed.'
			},
			{
				type: 'p',
				text: '**The autosave that overwrote the save.** A fresh visit renders a preset on the server and restores the saved session in `onMount`. The autosave effect fired once on creation with the preset and persisted it — a few milliseconds before `restore()` read the storage. The reload test above caught it; the `first` flag in `autosave()` is the fix (ch. 14).'
			},
			code('e2e/embed.e2e.ts', 31, 52),
			{
				type: 'p',
				text: '**Headless Chromium crashed.** A context torn down with a registered service worker and audio still running took the browser down with `SEGV_MAPERR`, in a container with no sound device. Two changes: the suite blocks service workers and checks the worker as a document (ch. 35), and the embed test stops playback before it ends.'
			},
			{
				type: 'p',
				text: '**A 500 on every vanity address.** `handleFetch` annotated the current span — and during `reroute` there is no route yet and no span. Two optional chains (ch. 26). The vanity-address test is why it was found before a person did.'
			},
			{
				type: 'note',
				text: 'None of the five would have been found by unit tests, and four of them were framework-level rather than application-level. That is the case for an end-to-end suite against the real build: it is the only test that runs the same code a person does.'
			},
			{ type: 'h3', id: 'what-a-failure-says', text: 'What a failure says' },
			{
				type: 'p',
				text: 'The suite above tests what happens when things work. Three of its scenarios test what a person reads when the server says no — and they exist because a probe, not the suite, found that nobody had looked. The probe was a scratch copy of the app in which every remote function could be made to throw a real `error(…)` on demand, and every `catch`, `failed` snippet and `onerror` handler recorded what it was handed. Two shapes came back: a boundary is handed the `App.Error` itself, `{ status, message }`, and every boundary in the app read it correctly; an awaited command or form submission is handed an `HttpError`, `{ status, body }`, and every `catch` around one read it wrongly (ch. 24).'
			},
			code('e2e/jam.e2e.ts', 134, 163),
			{
				type: 'p',
				text: 'A refused command, made to happen for real rather than faked. The test cuts this browser off from the room’s live stream — every attempt to reopen it is aborted, and SvelteKit keeps the last snapshot on screen while it retries — then loads a preset, which gives every track a new id. The browser still shows the old tracks, so a click on one sends a mute for a track the room no longer has, and the server answers `error(404, "No such track in this room")`. Before the fix the toast was there and empty: `(e as Error).message` on an `HttpError` is `undefined`. The scenario before it in the same file is the other half — `/jam/nowhere`, served and navigated to — and since the room’s `load` (ch. 31) it is also a status check: the server must answer `404`, and the error page, handed the `App.Error` as its `error` prop, must show “No such room”. It fails if somebody “fixes” that page to read `body.message`, and it failed against the old page, which answered a missing room with `200`.'
			},
			code('e2e/gallery.e2e.ts', 136, 182),
			{
				type: 'warn',
				text: '**The delete forms were never enhanced.** The probe found a second fault behind the first: in a tab loaded from the server, Delete did not run its `enhance` callback at all. It fell back to the plain POST that works with JavaScript off — which still deletes, so the older gallery test passed — and a refusal became an error page. Against the old code this test fails on that, before the shape of the error matters: there is no toast to read. The cause was a boundary inside a boundary around the “Yours” list (ch. 30); the fix was to remove the inner one. And the test itself needed `bringToFront()`: on the phone profile, a click aimed at the tab in the background landed on the card’s title instead of its Delete button, four times in five. That was the explanation for a long time, and it was wrong. The real cause turned up when the failure came back in full runs only: the handle. `twice_phone_` and five random characters is seventeen characters, and in the header that chip pushed the page wider than the phone’s screen. With the layout viewport wider than the visual one, the browser’s idea of where the button was drifted from the page’s, and the click landed one row up. How often depended on which five characters the clock produced. The header was fixed (ch. 27), the test brings each tab forward as a person would, and before the last click it waits for hydration — the header’s handle chip, which the server sends as `…` and only a hydrated page replaces — rather than for the network to go quiet.'
			},
			{ type: 'h3', id: 'what-a-review-found', text: 'What a review found' },
			{
				type: 'p',
				text: 'The suite passed, and a careful read of the code against the documentation still found things it could not see — each because no test asked. Every one now has a test, and every test was proved the same way: put the old code back, watch the test fail, restore the fix byte for byte.'
			},
			code('e2e/studio.e2e.ts', 69, 95),
			{
				type: 'p',
				text: '**A checkbox that never moved.** The grid’s “all steps” box was bound to `{const all = count === STEPS}` — a plain declaration tag, worked out once when the row was created (ch. 16). The older brush test passed because it *clicked* the box, and a click clears `indeterminate` by itself. This one paints and erases a whole row from the pads, never touching the box, and asks it what it says.'
			},
			code('e2e/studio.e2e.ts', 132, 147),
			{
				type: 'p',
				text: '**A panel that closed over its own changes — and Escape that left the studio.** Moving to the `snapshot()` helper meant shallow panel entries were captured too, so closing the sound panel restored the pattern from before it opened; the `lineage` in the studio page is the fix (ch. 19). Writing the test found an older bug underneath: the sheet and the studio page both listened for Escape on the window, both called `history.back()`, and one key press went back two entries — out of the studio. The earlier sheet test passed because the dialog had indeed gone. Now only the sheet listens.'
			},
			code('e2e/embed.e2e.ts', 54, 94),
			{
				type: 'p',
				text: '**A player that threw forty times a second.** Swapping `pattern` on a playing `<ostinato-player>` left the scheduler ticking against `null` until the new pattern arrived (ch. 33). The test holds the next pattern back with `page.route`, waits ten animation frames — several of the scheduler’s 25 ms ticks — and lets it go, and any `pageerror` fails it.'
			},
			code('e2e/gallery.e2e.ts', 67, 100),
			{
				type: 'p',
				text: '**A dialog that was not one.** The gallery preview was a `<div role="dialog">` over a backdrop: open it with Enter and focus stayed on the card behind it, Tab walked on into the gallery, Escape did nothing. Now it is a `<dialog>` opened with `showModal()` (ch. 30), and the test opens it from the keyboard, tabs inside it, and closes it with Escape — back to the gallery’s address, with focus back on the card. The preview test above it also clicks “Open the full page” now, and checks that the navigation was client-side and replaced the preview’s entry.'
			},
			code('e2e/jam.e2e.ts', 108, 132),
			{
				type: 'p',
				text: '**A 404 that answered 200, and a comment that said otherwise.** The old version of this test claimed its first half proved the live query failing during server rendering. It could not have: the room is awaited inside a boundary with a `pending` snippet, which is all the server renders. Both halves tested the browser. Now the room’s `load` decides on the server (ch. 31), and the test asserts the status.'
			},
			code('e2e/jam.e2e.ts', 63, 80),
			{
				type: 'p',
				text: '**A header that was wider than a phone.** Found while chasing the two-tab test above, and the reason it failed: a long handle in the header’s chip — seventeen characters were enough — made the whole page scroll sideways on a 412-pixel screen. This test chooses the longest handle the schema allows, in wide letters, and asserts that the page is no wider than the screen. It fails on the old header on the phone profile.'
			},
			{
				type: 'p',
				text: 'And one more in the landing suite, quoted in chapter 36: the prerendered page must carry the security headers, because the adapter serves it as a file and no hook ever sees it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what the suite runs against and why not `vite preview`.',
					'You can name the flake that turned out to be `forkPreloads` and say how it was bisected.',
					'You can add a two-browser test for a new jam-room command.',
					'You can make a real server refusal happen in a test without faking the response.'
				]
			}
		]
	},

	{
		slug: 'where-next',
		title: 'Where next, and the tools that helped',
		summary:
			'The `sv` add-on that wrote `AGENTS.md` and the Claude settings, the Svelte MCP server that caught a compile error before the compiler did, `#lib` imports, the `verify` script that gates a commit — and five directions the project could go.',
		goal: 'Know how the project was scaffolded and checked, and leave with a list of things worth building next.',
		blocks: [
			code('AGENTS.md', 1, 23),
			code('.claude/settings.json', 1, 13),
			{
				type: 'p',
				text: '`sv create` with the `ai-tools` add-on wrote both files. `AGENTS.md` tells an AI assistant how to use the Svelte MCP server — the official documentation and an autofixer — and the settings file enables the Svelte plugin for Claude Code. The autofixer earned its place while writing this project: it flagged the `{const}` declarations placed before an `animate:` element in the grid (ch. 16), which the compiler would also have refused, a step later and with a worse message.'
			},
			code('package.json', 11, 31),
			code('package.json', 70, 73),
			{
				type: 'p',
				text: '`#lib/*` is a Node subpath import, declared in `package.json` and understood by Vite, TypeScript and Node alike — which is why `scripts/seed.ts` can import the presets the same way a component does. `verify` is the gate: type-check the app and the worker, lint, unit and browser tests, build with the adapter, and the end-to-end suite on both profiles. Everything in this course passed it. The scripts chain with `pnpm run`, the package manager `packageManager` names, so `pnpm run verify` runs pnpm all the way down; extra arguments follow the script name, `pnpm run test:unit --run`, because pnpm hands a `--` on to the command rather than swallowing it the way npm does.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm run verify
  check     svelte-check: 0 errors, 0 warnings · tsc (service worker): clean
  lint      prettier + eslint: clean
  test:unit 62 passed  (server: node · client: chromium)
  build     adapter-ostinato · pages: 8 routes · api: 3 routes · 1 prerendered
  test:e2e  84 passed  (42 scenarios × desktop, phone)
`
			},
			{ type: 'h3', id: 'five-directions', text: 'Five directions' },
			{
				type: 'ol',
				items: [
					'**A shared channel for jam rooms.** The broadcaster is in-process (ch. 25). Postgres `NOTIFY` or a Redis stream makes it work across instances, and the `Latest` mailbox stays exactly as it is.',
					'**Real accounts.** The signed cookie is enough for a groovebox and would not be for money. The `Artist` shape and `requireArtist()` are the seam; a Better Auth session would slot in behind them (project 2 shows how).',
					'**Samples that survive.** Uploaded samples live in memory. A `command` that stores the file and a `sample` track that references it by id would make a sample pattern publishable.',
					'**MIDI in.** The Web MIDI API delivers note messages; `Note` already speaks MIDI numbers. A `$effect` that subscribes to an input port and calls `session.paint` is most of a feature.',
					'**A second adapter target.** `adapters/ostinato` is a Node process. The same `partition` and `applyReroute` hand-off would deploy to a platform with real functions, and the server-per-function split is already there.'
				]
			},
			{
				type: 'checkpoint',
				items: [
					'You can run `pnpm run verify` from a fresh clone and get green.',
					'You can point at the file where each of the five directions would start.',
					'You have opened every file this course quoted, and one it did not.'
				]
			}
		]
	}
];
