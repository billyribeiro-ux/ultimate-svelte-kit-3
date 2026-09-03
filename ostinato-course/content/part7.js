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
			code('vite.config.ts', 249, 299),
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
			'Thirty-three scenarios on a desktop and a Pixel 7, against `node build/index.js` on a fresh database — and the five real bugs the suite found: a back navigation that never rendered, an `await` that ran once, an autosave that overwrote the save, a crash in headless Chromium, and a 500 on every vanity address.',
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
			code('e2e/jam.e2e.ts', 8, 41),
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
			code('e2e/gallery.e2e.ts', 41, 73),
			{ type: 'h3', id: 'what-it-found', text: 'What it found' },
			code('vite.config.ts', 95, 116),
			code('e2e/studio.e2e.ts', 110, 133),
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
			{
				type: 'checkpoint',
				items: [
					'You can say what the suite runs against and why not `vite preview`.',
					'You can name the flake that turned out to be `forkPreloads` and say how it was bisected.',
					'You can add a two-browser test for a new jam-room command.'
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
				text: '`#lib/*` is a Node subpath import, declared in `package.json` and understood by Vite, TypeScript and Node alike — which is why `scripts/seed.ts` can import the presets the same way a component does. `verify` is the gate: type-check the app and the worker, lint, unit and browser tests, build with the adapter, and the end-to-end suite on both profiles. Everything in this course passed it.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm run verify
  check     svelte-check: 0 errors, 0 warnings · tsc (service worker): clean
  lint      prettier + eslint: clean
  test:unit 58 passed  (server: node · client: chromium)
  build     adapter-ostinato · pages: 7 routes · api: 4 routes · 3 prerendered
  test:e2e  66 passed  (33 scenarios × desktop, phone)
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
					'**A second adapter target.** `adapters/ostinato` is a Node process. The same `partition` and `applyReroute` hand-off would deploy to a platform with real functions, and the manifest-per-function split is already there.'
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
