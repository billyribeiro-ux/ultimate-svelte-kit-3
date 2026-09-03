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
				text: 'The five projects before this one each had a *domain* problem at their centre — a booking system that must not double-book, an exchange that must balance, a canvas that must merge edits, a query language. This one is different on purpose. The domain — sound — is genuinely interesting, but the point of the project is **the framework**. Svelte 5.57 and SvelteKit 3 have a lot of surface area, and the September 2026 releases added more. This project uses all of it, and the rule for every feature was the same: it had to be *for* something. There is no `$host` demo page; there is a custom element that needs `$host` to dispatch an event.'
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
				text: 'There is no `svelte.config.js`. SvelteKit 3 moved every option into the `sveltekit()` plugin call in `vite.config.ts`, and the config is a *function* because it needs to read the environment before the build starts.'
			},
			code('vite.config.ts', 1, 32, { partial: true }),
			{
				type: 'p',
				text: 'Two things to notice. `defineConfig` comes from `vitest/config` rather than `vite`, so the `test` block at the bottom type-checks. And `paths.origin` is a build-time value: the adapter bakes it into the server so that CSRF checks compare the origin you declared, not one reconstructed from headers.'
			},

			{ type: 'h3', id: 'compiler', text: 'The compiler options' },
			code('vite.config.ts', 34, 52),
			{
				type: 'p',
				text: '`runes` is a function so that a dependency written in Svelte 4 style keeps compiling. `experimental.async` is the one that changes how you write components: `await` at the top of a `<script>`, inside `$derived`, and directly in markup — and with it `pending` snippets, `$effect.pending()`, `settled()` and `fork()`. An instrument is full of “wait, then draw”, and this is the honest way to write that.'
			},
			code('vite.config.ts', 54, 86),
			{
				type: 'p',
				text: '`dynamicCompileOptions` is called per file and, since vite-plugin-svelte 7.3.0, per *environment*. That second argument is what lets one folder be compiled as a custom element *for the client only* — a server render of a custom element is a thing that cannot exist, and the guard says so instead of relying on the compiler to quietly decline.'
			},

			{ type: 'h3', id: 'experimental', text: 'Experimental, with evidence' },
			code('vite.config.ts', 89, 131),
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
			code('vite.config.ts', 133, 141),
			{
				type: 'note',
				text: 'The removal list lives in SvelteKit’s own `src/core/config/options.js`, where each removed key names its replacement. When an upgrade fails on “has been removed”, that file is the changelog.'
			},

			{ type: 'h3', id: 'security-and-versioning', text: 'Policy, origin, version' },
			code('vite.config.ts', 157, 211),
			{
				type: 'p',
				text: 'The CSP directives are each a decision, and chapter 36 takes them one at a time. `version.pollInterval` is worth a sentence now: it makes SvelteKit poll for a new deployment every minute and set `updated.current`, so the layout can offer a reload *before* a navigation asks for a JavaScript file that no longer exists.'
			},

			{ type: 'h3', id: 'tests', text: 'Two test projects' },
			code('vite.config.ts', 249, 318, { partial: true }),
			{
				type: 'p',
				text: 'The `client` project runs in a real Chromium, because jsdom has no `AudioContext` and no layout: a scheduler test under jsdom would pass while doing nothing. The `server` project is plain Node for the pure logic — the codec, the cookie, the adapter’s route partition — and runs one file at a time because SQLite has one writer.'
			},

			{ type: 'h3', id: 'env', text: 'Every variable, declared once' },
			code('src/env.ts', 12, 66),
			{
				type: 'p',
				text: '`defineEnvVars` replaced the `$env/*` magic modules. A variable not declared here cannot be imported — a build error, not an `undefined` in production — and `public: true` has to be typed, so a secret cannot reach the browser by accident. `TRACE_BUFFER` shows the pattern for a number: a string comes in, valibot turns it into an integer with bounds, and every file that reads it gets a number.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the config is a function.',
					'You know which three options were removed in SvelteKit 3 and what replaced each.',
					'You can say, from the comment, why `forkPreloads` is off — and what would turn it back on.'
				]
			}
		]
	},

	{
		slug: 'the-map',
		title: 'The map: everything the framework has to offer',
		summary:
			'Every Svelte 5 and SvelteKit 3 feature this project uses, and the file it lives in — including every item from the September 2026 releases.',
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
│  │  ├─ handle.ts
│  │  ├─ vanity.spec.ts
│  │  └─ vanity.ts
│  ├─ routes/
│  │  ├─ (app)/
│  │  │  ├─ diagnostics/
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
│  ├─ ambient.d.ts
│  ├─ app.css
│  ├─ app.d.ts
│  ├─ app.html
│  ├─ env.ts
│  ├─ error.html
│  ├─ hooks.server.ts
│  ├─ hooks.ts
│  ├─ instrumentation.server.ts
│  └─ service-worker.ts
├─ test-results/
├─ AGENTS.md
├─ README.md
├─ drizzle.config.ts
├─ eslint.config.js
├─ package.json
├─ playwright.config.ts
├─ pnpm-workspace.yaml
├─ prettier.config.js
├─ tsconfig.json
├─ tsconfig.service-worker.json
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
					'`<svelte:boundary>` with `pending`, `failed`, `onerror` — everywhere something is awaited (ch. 19, 20, 28)',
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
					'Remote functions: `query`, `query.batch`, `query.live`, `prerender`, `command`, `form` with `preflight`, `validate`, `issues`, `allIssues`, `invalid`, `.for(id)`, multiple submits, the `_` prefix; single-flight mutations with `refresh`, `requested().refreshAll()`, `.updates()`, `withOverride`, `reconnect` — `src/lib/remote/*` (ch. 23–25)',
					'Hooks: `transport`, async `reroute` with `fetch`, `handle` with the `preload` filter (`filename`, next.24), `handleFetch`, `handleError` with `kind` (including `validation`), `init` — `src/hooks*.ts` (ch. 26)',
					'`load` with `RouteParams`, `$app/types`, `resolve` from `$app/paths`, snapshots, shallow routing with `pushState`, `preloadData`, `page.state` — the studio, the pattern page, the gallery (ch. 19, 29, 30)',
					'`$app/state`: `page`, `navigating`, `updated` with `check()`; `version.pollInterval` — the layouts, diagnostics (ch. 27, 32)',
					'Layout groups and `+page@.svelte` — `(app)`, the embed demo (ch. 27, 33)',
					'`+server.ts` with `QUERY` (next.24) and a co-located `+server.test.ts` (next.19) — the read API (ch. 32)',
					'`tracing.server`, `src/instrumentation.server.ts`, `event.tracing` — the ring exporter (ch. 32)',
					'`$app/service-worker`, `$app/manifest` — the service worker (ch. 35)',
					'Writing an adapter: `adapt`, `emulate`, `supports`, `vite.plugins.pre` (next.18), `applyReroute` (next.25), `builder.instrument` — `adapters/ostinato` (ch. 34)',
					'`defineEnvVars`, `csp` with `mode: auto`, `csrf.trustedOrigins`, `version`, `output.bundleStrategy`, `router.resolution` — `vite.config.ts` (ch. 2, 36)'
				]
			},

			{ type: 'h3', id: 'september', text: 'The September 2026 releases, item by item' },
			{
				type: 'ul',
				items: [
					'**Svelte 5.57** — `SvelteMap.getOrInsertComputed` (the engine’s channel strips, ch. 11); `createContext` returning `has` (`Player.svelte`, ch. 29); `<select defaultValue>` (the WAV bar count, ch. 20); `Csp`/`Sha256Source` types from `svelte/server` (the share card, ch. 29).',
					'**SvelteKit 3.0.0-next.17** — enhanced form submissions navigate on success/failure: the publish form’s “Publish and open” redirects from inside `enhance` (ch. 24).',
					'**next.18** — adapters contribute Vite plugins, `pre` and `post`: the adapter provides `virtual:adapter` (ch. 34).',
					'**next.19** — `+` files with `.test.` in the name are not routes: `api/patterns/+server.test.ts` (ch. 32).',
					'**next.24** — `QUERY` handlers in `+server.ts`; the `preload` filter gets `filename` for fonts (ch. 32, 26).',
					'**next.25** — `applyReroute` for adapters, and a catch-all that uses it (ch. 34).',
					'**sv 1.0.0-next / 0.17** — `sv create` with `#lib` imports and the `ai-tools` add-on, which wrote `AGENTS.md` and `.claude/settings.json` (ch. 39).',
					'**vite-plugin-svelte 7.3.0** — `dynamicCompileOptions({ filename, environment })` (ch. 2, 33).'
				]
			},
			{
				type: 'checkpoint',
				text: 'Pick any feature from the list and open the file it names. If you can find the feature and read the comment beside it before the chapter explains it, the map has done its job.'
			}
		]
	}
];
