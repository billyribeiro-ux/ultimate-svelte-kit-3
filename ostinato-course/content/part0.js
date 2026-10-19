/**
 * PART 0 — What we are building, and why a groovebox
 * (chapters 01–03)
 *
 * Three chapters before any code that makes sound. The first says what the
 * product is; the second walks the one file that configures the whole
 * framework; the third is a map — every feature of Svelte 5 and SvelteKit 3
 * this project uses, and where. Readers who want the map first can start at
 * chapter 03 and come back.
 */

import { code } from './quote.js';

export const part0 = [
	{
		slug: 'what-we-are-building',
		title: 'What we are building',
		summary:
			'Ostinato: a groovebox in the browser — a step sequencer with synthesised drums and bass, shareable patterns, a gallery, live jam rooms and an embeddable player.',
		goal: 'Understand what the finished product does, and why each of its parts exists to exercise a specific part of the framework rather than to pad a feature list.',
		blocks: [
			{
				type: 'p',
				text: 'We are going to build **Ostinato**: a groovebox. Sixteen steps across, up to eight tracks down, a synthesised drum kit and two synths, and a play button. An *ostinato* is a short musical figure that repeats — which is exactly what a step sequencer produces, and exactly the shape of a good teaching project: small enough to hold in your head, deep enough that every layer of the framework has something real to do.'
			},
			{
				type: 'p',
				text: 'The five projects before this one each had a *domain* problem at their centre — a booking system that must not double-book, an exchange that must balance, a canvas that must merge edits, a query language. This one is different on purpose. The domain — sound — is genuinely interesting, but the point of the project is **the framework**. Svelte 5 and SvelteKit have a lot of surface area, and the releases of September and October 2026 — Svelte 5.57, SvelteKit 3.0 and 3.0.1 — added more. This project uses all of it, and the rule for every feature was the same: it had to be *for* something. There is no `$host` demo page; there is a custom element that needs `$host` to dispatch an event.'
			},

			{ type: 'h3', id: 'the-tour', text: 'The tour' },
			{
				type: 'ul',
				items: [
					'**The studio.** A grid of pads, knobs for tempo, swing, tone and decay, a mixer with meters, undo and redo, and a scheduler that keeps time the only way a browser can keep time.',
					'**Links that are saves.** The whole pattern fits in the address bar in about two hundred characters. Paste it into a chat and the other person opens your groove.',
					'**Publishing.** Choose a handle — no password, a signed cookie — and publish to a gallery. Each pattern gets a vanity address like `/@handle/slug`, which is not a route at all, and a share card drawn on the server.',
					'**Jam rooms.** One pattern, many browsers, over a live query. Toggle a step and everybody in the room hears it.',
					'**An embeddable player.** `<ostinato-player pattern="…">` on any page, built twice: inside the app, and as one standalone file.',
					'**An adapter written from scratch.** The thing that turns SvelteKit’s build into a program, deploying the app as two functions and a catch-all joined by `applyReroute` — new in SvelteKit 3.',
					'**A diagnostics page** that reads the app’s own OpenTelemetry spans back out of memory.'
				]
			},
			{
				type: 'p',
				text: 'About seven thousand lines when it is finished, plus a thousand of tests. A third of it is the interface, a third is the server, and the rest is the engine, the adapter and the element. Every line of it is quoted in this course from the real file, with its line numbers, so what you read is what the code says.'
			},

			{ type: 'h3', id: 'why-audio', text: 'Why an instrument, specifically' },
			{
				type: 'p',
				text: 'Because sound is the honest hard case for a *reactive* interface. Three things are true of an instrument at once, and each one asks a different question of the framework.'
			},
			{
				type: 'ol',
				items: [
					'**Timing is unforgiving.** A drum hit that lands ten milliseconds late is audible. JavaScript timers cannot promise ten milliseconds. So the engine has to be built on a different clock, and the interface has to *follow* that clock without owning it — which is a lesson in what reactivity is for and what it is not for.',
					'**The state is big and changes constantly.** A hundred and twenty-eight pads, each of which may change on any click, and a playhead that moves sixteen times a bar. Fine-grained reactivity — one signal per pad — is not a luxury here; a grid that re-rendered whole on every step would stutter.',
					'**Half of it is outside the framework.** The audio graph, the clipboard, `localStorage`, a `<canvas>`, a custom element on somebody else’s page. Most of what makes an application hard is the boundary between the framework and everything else, and an instrument has more boundary than most.'
				]
			},
			{
				type: 'why',
				title: 'Why this is worth your time even if you never make a beat',
				text: 'Every application has a scheduler somewhere (a poll, a debounce, an animation), a boundary with a browser API (a canvas, a file input, a worker), and a shareable link it would like to be smaller. The groovebox is a place where those problems are concrete enough to see and small enough to solve completely. What you learn about `createSubscriber` from an `AudioContext` is what you would need for a `WebSocket`; what you learn about `fork()` from a WAV render is what you would need for any preload.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape of it' },
			{
				type: 'terminal',
				code: `
   the browser                                   the server (adapter-ostinato)
   ┌──────────────────────────────────┐          ┌──────────────────────────────┐
   │ studio                           │  form    │ pages  ─ every page & layout │
   │  ├ Session ($state, undo)        │ ───────▶ │ api    ─ /api/*, remote fns  │
   │  ├ Scheduler ── AudioEngine      │  query   │ router ─ no routes; runs     │
   │  │   (two clocks, Web Audio)     │ ◀─────── │          reroute, then hands │
   │  └ StepGrid / Knob / Mixer       │  live    │          on with applyReroute│
   │                                  │ ◀━━━━━━━ │                              │
   │ jam room ── query.live           │          │ SQLite ── patterns, rooms    │
   │ <ostinato-player> (custom elem.) │          │ tracing ring ── /diagnostics │
   └──────────────────────────────────┘          └──────────────────────────────┘`
			},
			{
				type: 'p',
				text: 'The thing to notice is the right-hand box. Most SvelteKit apps deploy as one server. This one deploys as three, on purpose, and the reason is that SvelteKit 3 added `applyReroute` *because* platforms split apps into functions — so an adapter that shows how the hand-off works has to split something. Chapter 34 builds it; the end-to-end suite runs against it.'
			},

			{ type: 'h3', id: 'what-we-will-not-build', text: 'What we are deliberately not building' },
			{
				type: 'ul',
				items: [
					'**Accounts with passwords.** A signed cookie says “this browser chose @handle”. That is enough to own a pattern and exactly as much identity as a groovebox needs.',
					'**Sample packs.** Every sound is synthesised from oscillators and noise — a few hundred readable lines rather than two hundred megabytes. You can drop your own file on a track.',
					'**A second server.** The jam rooms broadcast from memory and the spans are kept in a ring. Both say so, in the code, with what the next step would be.'
				]
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what Ostinato does in three sentences.',
					'You can name the three functions the adapter deploys, and why there are three.',
					'You know the rule every feature in the project had to pass: it had to be for something.'
				]
			}
		]
	},

	{
		slug: 'the-config',
		title: 'One file to configure everything',
		summary:
			'SvelteKit 3 keeps its whole configuration inside the Vite plugin. This chapter reads `vite.config.ts` top to bottom: what each option does, what it costs, and what was removed since SvelteKit 2.',
		goal: 'Read a SvelteKit 3 config and know what every line is for — including the ones that are there because a test found a bug.',
		blocks: [
			{
				type: 'p',
				text: 'There is no `svelte.config.js`. In SvelteKit 2 that file held the framework options; SvelteKit 3 moved every one of them into the `sveltekit()` plugin call in `vite.config.ts`, and the config is a *function* because it needs to read the environment before the build starts.'
			},
			code('vite.config.ts', 1, 48, { partial: true }),
			{
				type: 'p',
				text: 'Three things to notice. `defineConfig` comes from `vitest/config` rather than `vite`, so the `test` block at the bottom type-checks. `paths.origin` is a build-time value: the adapter bakes it into the server so that CSRF checks compare the origin you declared, not one reconstructed from headers. And `paths.relative` is `false`, so a link the server writes is `/studio` rather than `./studio` or `../studio`. The relative default is for a build that has to work from any folder; this one is served at the root of one origin, and every internal link goes through `resolve()` (ch. 27), which on the server would otherwise answer relative to the page being rendered.'
			},

			{ type: 'h3', id: 'compiler', text: 'The compiler options' },
			code('vite.config.ts', 50, 68),
			{
				type: 'p',
				text: '`runes` is a function so that a dependency written in Svelte 4 style keeps compiling. `experimental.async` is the one that changes how you write components: `await` at the top of a `<script>`, inside `$derived`, and directly in markup — and with it `pending` snippets, `$effect.pending()`, `settled()` and `fork()`. An instrument is full of “wait, then draw”, and this is the honest way to write that.'
			},
			code('vite.config.ts', 70, 108),
			{
				type: 'p',
				text: '`dynamicCompileOptions` is called per file and, since vite-plugin-svelte 7.3.0, per *environment*. That second argument is what lets one folder be compiled as a custom element *for the client only* — a server render of a custom element is a thing that cannot exist, and the guard says so instead of relying on the compiler to quietly decline. The adapter is handed one option, `headers`: the files it serves itself never pass through a hook, so the security headers have to be given to it directly (ch. 36).'
			},

			{ type: 'h3', id: 'experimental', text: 'Experimental, with evidence' },
			code('vite.config.ts', 110, 138),
			{
				type: 'why',
				title: 'Why the comment is longer than the option',
				text: '`forkPreloads` was turned **on** for this project, deliberately, with the end-to-end suite as the acceptance criterion — the previous project had turned it off after a bug, and “the flag is off because it was off last time” is not engineering. The suite found a different bug: a back navigation that completes, URL and all, while the old page stays on screen. Five failures in eight runs; fifteen passes in fifteen with the flag off. A comment that records the bisect is worth more than one that records the opinion.'
			},

			{ type: 'h3', id: 'removed', text: 'What SvelteKit 3 removed' },
			{
				type: 'p',
				text: 'Three options that this file *tried* to set no longer exist, and SvelteKit says so at startup rather than ignoring them. `experimental.tracing` is now top-level `tracing`; `experimental.instrumentation` is gone because `src/instrumentation.server.ts` is picked up whenever the adapter says it can; and `output.preloadStrategy` is gone because `modulepreload` is the only strategy modern browsers need.'
			},
			code('vite.config.ts', 140, 160),
			{
				type: 'note',
				text: 'The removal list lives in SvelteKit’s own `src/core/config/options.js`, where each removed key names its replacement. When an upgrade fails on “has been removed”, that file is the changelog.'
			},

			{ type: 'h3', id: 'security-and-versioning', text: 'Policy, origin, version' },
			code('vite.config.ts', 162, 255),
			{
				type: 'p',
				text: 'The CSP directives are each a decision, and chapter 36 takes them one at a time. `version.pollInterval` is worth a sentence now: it makes SvelteKit poll for a new deployment every minute and set `updated.current`, so the layout can offer a reload *before* a navigation asks for a JavaScript file that no longer exists.'
			},

			{ type: 'h3', id: 'tests', text: 'Two test projects' },
			code('vite.config.ts', 282, 335),
			{
				type: 'p',
				text: 'The `client` project runs in a real Chromium, because jsdom has no `AudioContext` and no layout: a scheduler test under jsdom would pass while doing nothing. The `server` project is plain Node for the pure logic — the codec, the cookie, the adapter’s route partition — and runs one file at a time because SQLite has one writer.'
			},

			{ type: 'h3', id: 'env', text: 'Every variable, declared once' },
			code('src/env.ts', 12, 66),
			{
				type: 'p',
				text: 'In SvelteKit 2 a variable came from one of the `$env/*` magic modules; SvelteKit 3 deprecates those (they go in SvelteKit 4) in favour of `defineEnvVars` in this one file. A variable not declared here cannot be imported — a build error, not an `undefined` in production — and `public: true` has to be typed, so a secret cannot reach the browser by accident. `TRACE_BUFFER` shows the pattern for a number: a string comes in, valibot turns it into an integer with bounds, and every file that reads it gets a number.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the config is a function.',
					'You know which three options this file used that SvelteKit 3 removed, and what replaced each.',
					'You can say, from the comment, why `forkPreloads` is off — and what would turn it back on.'
				]
			}
		]
	},

	{
		slug: 'the-map',
		title: 'The map: everything the framework has to offer',
		summary:
			'Every Svelte 5 and SvelteKit 3 feature this project uses, and the file it lives in — including every item from the September and October 2026 releases, up to 3.1.0.',
		goal: 'Have a lookup table: when you meet a feature in the code, know which chapter explains it, and when you want a feature, know where to see it used.',
		blocks: [
			{
				type: 'p',
				text: 'First, where everything lives. The chapters name these files by path, and the code blocks quote them by line range — keep the tree open, and open the file whenever a block is not enough.'
			},
			{
				type: 'terminal',
				code: `
ostinato/
├─ adapters/
│  └─ ostinato/
│     ├─ files/
│     │  ├─ ambient.d.ts
│     │  ├─ dir.js
│     │  ├─ handler.js
│     │  └─ index.js
│     ├─ index.js
│     ├─ partition.js
│     └─ partition.spec.js
├─ e2e/
│  ├─ embed.e2e.ts
│  ├─ gallery.e2e.ts
│  ├─ jam.e2e.ts
│  ├─ landing.e2e.ts
│  ├─ pattern.e2e.ts
│  ├─ platform.e2e.ts
│  ├─ service-worker.e2e.ts
│  └─ studio.e2e.ts
├─ scripts/
│  ├─ prepare-e2e-db.js
│  └─ seed.ts
├─ src/
│  ├─ lib/
│  │  ├─ assets/
│  │  │  └─ favicon.svg
│  │  ├─ audio/
│  │  │  ├─ context.ts
│  │  │  ├─ engine.svelte.ts
│  │  │  ├─ render.ts
│  │  │  ├─ samples.svelte.ts
│  │  │  ├─ schedule.ts
│  │  │  ├─ scheduler.svelte.ts
│  │  │  ├─ voices.ts
│  │  │  ├─ wav.spec.ts
│  │  │  └─ wav.ts
│  │  ├─ components/
│  │  │  ├─ Logo.svelte
│  │  │  ├─ MiniGrid.svelte
│  │  │  ├─ PatternCard.svelte
│  │  │  ├─ PatternView.svelte
│  │  │  └─ Section.svelte
│  │  ├─ embed/
│  │  │  ├─ OstinatoPlayer.svelte
│  │  │  └─ element.ts
│  │  ├─ motion/
│  │  │  └─ cinematic.ts
│  │  ├─ music/
│  │  │  ├─ note.spec.ts
│  │  │  ├─ note.ts
│  │  │  └─ time.ts
│  │  ├─ pattern/
│  │  │  ├─ codec.spec.ts
│  │  │  ├─ codec.ts
│  │  │  ├─ dto.ts
│  │  │  ├─ model.ts
│  │  │  └─ presets.ts
│  │  ├─ remote/
│  │  │  ├─ artist.remote.ts
│  │  │  ├─ diagnostics.remote.ts
│  │  │  ├─ patterns.remote.ts
│  │  │  └─ rooms.remote.ts
│  │  ├─ server/
│  │  │  ├─ db/
│  │  │  │  ├─ index.ts
│  │  │  │  └─ schema.ts
│  │  │  ├─ artist.ts
│  │  │  ├─ identity.spec.ts
│  │  │  ├─ identity.ts
│  │  │  ├─ patterns.ts
│  │  │  ├─ rooms.ts
│  │  │  ├─ tracing.spec.ts
│  │  │  └─ tracing.ts
│  │  ├─ share/
│  │  │  └─ Card.svelte
│  │  ├─ studio/
│  │  │  ├─ Knob.svelte
│  │  │  ├─ Meter.svelte
│  │  │  ├─ Mixer.svelte
│  │  │  ├─ Pad.svelte
│  │  │  ├─ Player.svelte
│  │  │  ├─ SharePanel.svelte
│  │  │  ├─ Sheet.svelte
│  │  │  ├─ SoundPanel.svelte
│  │  │  ├─ StepGrid.svelte
│  │  │  ├─ Transport.svelte
│  │  │  ├─ session.svelte.test.ts
│  │  │  ├─ session.svelte.ts
│  │  │  └─ waveform.ts
│  │  ├─ styles/
│  │  │  ├─ base.css
│  │  │  ├─ controls.css
│  │  │  └─ tokens.css
│  │  ├─ toast/
│  │  │  ├─ Toast.svelte
│  │  │  └─ toast.ts
│  │  ├─ errors.spec.ts
│  │  ├─ errors.ts
│  │  ├─ handle.ts
│  │  ├─ security.ts
│  │  ├─ vanity.spec.ts
│  │  └─ vanity.ts
│  ├─ routes/
│  │  ├─ (app)/
│  │  │  ├─ diagnostics/
│  │  │  │  └─ +page.svelte
│  │  │  ├─ embed/
│  │  │  │  ├─ demo/
│  │  │  │  └─ +page.svelte
│  │  │  ├─ gallery/
│  │  │  │  └─ +page.svelte
│  │  │  ├─ jam/
│  │  │  │  └─ [room]/
│  │  │  ├─ p/
│  │  │  │  └─ [id]/
│  │  │  ├─ studio/
│  │  │  │  ├─ +page.svelte
│  │  │  │  └─ +page.ts
│  │  │  ├─ +layout.svelte
│  │  │  ├─ +page.svelte
│  │  │  └─ +page.ts
│  │  ├─ api/
│  │  │  ├─ patterns/
│  │  │  │  ├─ [id]/
│  │  │  │  ├─ +server.test.ts
│  │  │  │  └─ +server.ts
│  │  │  └─ resolve/
│  │  │     └─ +server.ts
│  │  ├─ +error.svelte
│  │  └─ +layout.svelte
│  ├─ service-worker/
│  │  ├─ index.ts
│  │  └─ tsconfig.json
│  ├─ ambient.d.ts
│  ├─ app.css
│  ├─ app.d.ts
│  ├─ app.html
│  ├─ env.ts
│  ├─ error.html
│  ├─ hooks.server.ts
│  ├─ hooks.ts
│  └─ instrumentation.server.ts
├─ static/
│  └─ robots.txt
├─ AGENTS.md
├─ README.md
├─ drizzle.config.ts
├─ eslint.config.js
├─ package.json
├─ playwright.config.ts
├─ pnpm-workspace.yaml
├─ prettier.config.js
├─ tsconfig.json
├─ vite.config.ts
└─ vite.embed.config.ts
`
			},
			{
				type: 'p',
				text: 'This chapter is a table of contents in disguise. Each line is a feature, the file where it does real work, and the chapter that explains it. If a feature you know of is missing, it is either used somewhere not listed or deliberately not used — and chapter 39 says which.'
			},

			{ type: 'h3', id: 'runes', text: 'Runes' },
			{
				type: 'ul',
				items: [
					'`$state`, deep and `.raw` — `session.svelte.ts`, `engine.svelte.ts` (ch. 14, 11)',
					'`$state.snapshot` — the diagnostics filters (ch. 32); and *why not* for the pattern (ch. 14)',
					'`$state.eager` — the navigation’s `aria-current` (ch. 27)',
					'`$derived`, `$derived.by`, overridable deriveds — the jam room’s tempo knobs (ch. 31)',
					'`$effect`, `$effect.root`, `$effect.pending` — autosave (ch. 14), the WAV render (ch. 20)',
					'`$props`, `$bindable`, `$props.id()` — the knob (ch. 15)',
					'`$inspect`, `$inspect(...).with`, `$inspect.trace` — the studio page and the transport (ch. 17, 19)',
					'`$host` — the custom element (ch. 33)'
				]
			},

			{ type: 'h3', id: 'template', text: 'Template syntax' },
			{
				type: 'ul',
					items: [
					'Declaration tags `{const …}` / `{let … = $state()}` / `$derived(await …)` — the grid, the jam room, the share panel (ch. 16, 31, 20)',
					'`class={[…]}` and `class={{…}}` — the pad, the mixer (ch. 16)',
					'`{#key}`, `animate:flip`, `transition:` (fade, fly, scale, slide, draw), `crossfade` — the studio, the grid, the logo, the gallery (ch. 16, 19, 27, 30)',
					'`<svelte:boundary>` with `pending`, `failed`, `onerror` — everywhere something is awaited, each handed the `App.Error` that `handleError` made (ch. 19, 20, 28, 31)',
					'`<svelte:window>`, `<svelte:document>`, `<svelte:body>`, `<svelte:head>`, `<svelte:element>`, `<svelte:options customElement>` — the studio page, `Section.svelte`, the element (ch. 19, 28, 33)',
					'Snippets with parameters, `Snippet<[T]>`, `{@render}` — `Player.svelte` (ch. 29)',
					'`bind:value`, function bindings `bind:checked={get, set}`, `bind:group`, `bind:indeterminate`, `bind:files`, `bind:textContent`, `bind:clientWidth`, media bindings — the grid, the sound panel, the meter, the share panel (ch. 16, 17, 20)',
					'`{@attach}` and attachment factories, `svelte/attachments` — the knob’s wheel, the meter, the waveform, the hero (ch. 15, 17, 20, 28)'
				]
			},

			{ type: 'h3', id: 'runtime', text: 'The runtime modules' },
			{
				type: 'ul',
				items: [
					'`svelte/reactivity`: `SvelteMap` with `getOrInsertComputed` (5.57), `SvelteDate`, `SvelteURL`, `MediaQuery`, `createSubscriber` — the engine, the studio page, the embed page, the sheet (ch. 11, 19, 18, 32)',
					'`svelte/reactivity/window`: `innerWidth`, `online`, `devicePixelRatio` — the gallery, the jam room, the meter (ch. 30, 31, 17)',
					'`svelte/motion`: `Spring.of`, `prefersReducedMotion` — the knob, every transition (ch. 15)',
					'`svelte/events` `on` with options — the knob (ch. 15)',
					'`svelte`: `createContext` with `has` (5.57), `hydratable`, `settled`, `fork`, `untrack`, `flushSync`, `mount`/`unmount` with `outro` — context (ch. 11), the landing page (ch. 28), the studio page (ch. 19), the share panel (ch. 20), toasts (ch. 27), tests (ch. 37)',
					'`svelte/server` `render` with `csp: { hash }` and `transformError`, typed `Sha256Source` (5.57) — the share card (ch. 29)'
				]
			},

			{ type: 'h3', id: 'kit', text: 'SvelteKit 3' },
			{
				type: 'ul',
				items: [
					'Remote functions: `query`, `query.batch`, `query.live`, `prerender`, `command`, `form` with `preflight`, `validate`, `issues`, `allIssues`, `invalid`, `.for(id)`, multiple submits, the `_` prefix; single-flight mutations with `refresh`, `requested().refreshAll()`, `.updates()`, `withOverride`, `reconnect`; a refused call’s `HttpError` read by `isHttpError` and `body.message` — `src/lib/remote/*`, `src/lib/errors.ts` (ch. 23–25)',
					'Hooks: `transport`, async `reroute` with `fetch`, `handle` with the `preload` filter (`filename`), `handleFetch`, `handleError` with `kind` (including `validation`), `init` — `src/hooks*.ts` (ch. 26)',
					'`load`, `params` typed by the generated `PageProps`, `ErrorProps` for the error page, `resolve` from `$app/paths` for every internal link, the `snapshot()` helper, shallow routing with `goto(…, { shallow: true })`, `preloadData`, `page.state` — the studio, the pattern page, the gallery, the jam room (ch. 19, 27, 29, 30, 31)',
					'`$app/state`: `page`, `navigating`, `updated` with `check()`; `version.pollInterval` — the layouts, diagnostics (ch. 27, 32)',
					'Layout groups and `+page@.svelte` — `(app)`, the embed demo (ch. 27, 33)',
					'`+server.ts` with `QUERY`, `Response.json(...)` and a co-located `+server.test.ts` — the read API (ch. 32)',
					'`tracing.server`, `src/instrumentation.server.ts`, `event.tracing` — the ring exporter (ch. 32)',
					'`$app/service-worker`, `$app/manifest`, `$app/paths` in a worker, `$app/tsconfig/service-worker` — the service worker (ch. 35)',
					'Writing an adapter: `adapt`, `emulate`, `supports`, `vite.plugins.pre`, `applyReroute`, `builder.generateServerInstance`, `builder.createInstrumentationInitializer` + `builder.instrument` — `adapters/ostinato` (ch. 34)',
					'`defineEnvVars`, `csp` with `mode: auto`, `csrf.trustedOrigins`, `version`, `output.bundleStrategy`, `router.resolution` — `vite.config.ts` (ch. 2, 36)'
				]
			},

			{ type: 'h3', id: 'september', text: 'The September and October 2026 releases, item by item' },
			{
				type: 'ul',
				items: [
					'**Svelte 5.57** — `SvelteMap.getOrInsertComputed` (the engine’s channel strips, ch. 11); `createContext` returning `has` (`Player.svelte`, ch. 29); `<select defaultValue>` (the WAV bar count, ch. 20); `Csp`/`Sha256Source` types from `svelte/server` (the share card, ch. 29).',
					'**SvelteKit 3.0: what it adds** — a `use:enhance` form whose `action` is on another page now navigates there on success and failure (this project has no form actions — its forms are remote `form()`s, whose `redirect` worked before 3.0 — so nothing here exercises it); a click on a link to the current address refreshes instead of doing nothing: the gallery’s “Open the full page” (ch. 30); adapters contribute Vite plugins, `pre` and `post`: the adapter provides `virtual:adapter` (ch. 34); `+` files with `.test.` in the name are not routes: `api/patterns/+server.test.ts` (ch. 32); `QUERY` handlers in `+server.ts`, and the `preload` filter gets `filename` for fonts (ch. 32, 26); `applyReroute` for adapters, and a catch-all that uses it (ch. 34).',
					'**SvelteKit 3.0 and 3.0.1: what they replace** — `builder.generateServerInstance` replaces `generateManifest`, and the `Server` class gives way to a generated `server` object (ch. 34); `builder.createInstrumentationInitializer` fills in the environment before `instrumentation.server.js` runs (ch. 34); a single-flight refresh the client asked for and the server did not handle now fails that query, so every command behind `.updates(…)` calls `requested(…).refreshAll()` or `ignore()` on purpose (ch. 24); `json()` and `text()` are deprecated for `Response.json()` and `new Response()` (ch. 32); `pushState` and `replaceState` are deprecated for `goto(…, { shallow: true })`, and a shallow navigation now runs the navigation hooks (ch. 18, 27, 30); `export const snapshot` is deprecated for the `snapshot()` helper from `$app/navigation`, which captures shallow navigations too (ch. 19); the service worker lives in `src/service-worker/` with a tsconfig of its own (ch. 35); adapter-node 6 drops the `ORIGIN` variable in favour of `paths.origin`, and so does this adapter (ch. 34).',
					'**SvelteKit 3.1: what it adds** — a `sveltekit.endpoint` span around every `+server` handler, which lands in the ring beside `handle` and `load` (ch. 32); a failed service-worker update no longer stops the reload after a redeploy (ch. 35). The CSP hash-reporting keywords `report-sha256`, `report-sha384` and `report-sha512` go unused, because the policy reports nothing (ch. 36); the rest of 3.1.0 is fixes.',
					'**sv 1.0** — `sv create` with `#lib` imports and the `ai-tools` add-on, which wrote `AGENTS.md` and `.claude/settings.json` (ch. 39); `sv migrate sveltekit-3` for the mechanical half of an upgrade.',
					'**vite-plugin-svelte 7.3** — `dynamicCompileOptions({ filename, environment })` (ch. 2, 33).',
					'**Vitest 5** — inline projects inherit the root config without an `extends` line (ch. 37). Its other two new defaults, `clearMocks` on and locators exact, change nothing here: no test mocks anything, and the browser tests drive a class, not a page.'
				]
			},
			{
				type: 'checkpoint',
				text: 'Pick any feature from the list and open the file it names. If you can find the feature and read the comment beside it before the chapter explains it, the map has done its job.'
			}
		]
	}
];
