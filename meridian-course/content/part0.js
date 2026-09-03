/**
 * PART 0 — What we are building, and the ground it stands on
 * (chapters 01–04)
 *
 * Four chapters before any feature. The first says what the product is and
 * why a trip planner is the right thing to build in a course about a
 * framework *and its ecosystem*; the second walks the pnpm workspace; the
 * third reads the one file that configures everything; the fourth is a map —
 * every feature of Svelte 5 and SvelteKit 3 this project uses, every library
 * it reaches for, and the chapter where each earns its place.
 */

import { code } from './quote.js';

export const part0 = [
	{
		slug: 'what-we-are-building',
		title: 'What we are building',
		summary:
			'Meridian: a trip planner for people who travel together — a map, a globe, an itinerary you can drag, expenses split to the cent, notes, invites, three languages, a library you could publish, and a second person planning beside you.',
		goal: 'Understand what the finished product does, why a trip planner is the honest way to test a framework against its ecosystem, and the rule every library had to pass.',
		blocks: [
			{
				type: 'p',
				text: 'We are going to build **Meridian**: a place where a few friends plan a trip together. Somebody drops a pin on a map and it becomes a stop; somebody else drags it to Thursday; the total distance updates; the globe flies the route; the dinner in Porto gets split three ways to the cent; and all of that happens on everybody’s screen at once, in whichever of three languages they read. That is the product, and it is deliberately ordinary. Ordinary products are where frameworks get found out.'
			},
			{
				type: 'p',
				text: 'The seven projects before this one each put one hard thing at the centre — a matching engine, a CRDT, a query language, a spreadsheet engine — and built almost everything else by hand. This one turns the other way. A trip planner needs a map, a 3D scene, a rich-text editor, a data table, charts, a date picker, drag and drop, a command palette, authentication, and translation. Nobody should write those from scratch, and the interesting question is not “can Svelte do it” but “**how well does Svelte fit the things other people have already built**, and how do you choose among them?” That is the question this course answers, library by library.'
			},

			{ type: 'h3', id: 'the-tour', text: 'The tour' },
			{
				type: 'ul',
				items: [
					'**A pnpm workspace with a library in it.** `@meridian/waypoint` is geodesy — distances, bearings, great circles, a reactive `Route` class and two components — packaged with `svelte-package`, checked with publint and arethetypeswrong, and consumed by the app as `workspace:*`. The app is its first customer.',
					'**A map with no tile server.** svelte-maplibre over MapLibre GL, with a style built at build time from a bundled TopoJSON of the world. It works on a train with no signal, in CI with no keys, and under a Content Security Policy that allows no third-party host.',
					'**A globe that flies the route.** Threlte over three.js: coastlines from the same atlas, every leg as the great circle it is, a camera that follows `interpolate()` from the library, and a `MediaQuery` that holds it still for people who asked for less motion. Loaded on demand — three.js never reaches a person who does not open the tab.',
					'**An itinerary you can drag.** svelte-dnd-action between days, `animate:flip` for the settling, a Bits UI date range picker, a combobox over a hundred-place gazetteer, a command palette on Ctrl+K.',
					'**Expenses split fairly.** Money as integers of minor units, shares by largest remainder, the fewest transfers that settle everybody — in the domain layer, tested. On screen: TanStack Table v9 (headless, sortable) and LayerChart.',
					'**Notes that save themselves.** Tiptap 3 through a Svelte attachment, debounced to a remote `command`, with other people’s edits arriving through the live query.',
					'**Three languages.** Paraglide 2: typed message functions, plural rules, a `reroute` hook that strips the locale prefix, middleware that sets `<html lang>`, and `Intl` for every date, distance, amount and country name.',
					'**Identity with Better Auth.** Email and password, sessions in SQLite, roles per trip, one-time invite links, an owner-only settings page.',
					'**Guides in Markdown.** mdsvex compiles `.svx` files into components; the guide pages are prerendered in all three languages and ship no JavaScript at all.',
					'**A custom element.** `<meridian-route>` renders a trip on any web page from one script tag, built from the same source with `dynamicCompileOptions`.',
					'**Everything around it.** Server hooks, a CSP with hashes and nonces, OpenTelemetry tracing into a diagnostics page, typed route ids, `<enhanced:img>`, a health endpoint, a multi-stage Dockerfile, and a CI workflow that builds the image and boots it.'
				]
			},
			{
				type: 'p',
				text: 'Every line of it is quoted in this course from the real file, with its line numbers, so what you read is what the code says — and the course fails its own build if a range stops making sense.'
			},

			{ type: 'h3', id: 'why-a-trip-planner', text: 'Why a trip planner, specifically' },
			{
				type: 'p',
				text: 'Because it has *breadth* without being shallow. Three things are true of it at once.'
			},
			{
				type: 'ol',
				items: [
					'**It needs a dozen kinds of interface.** A map, a globe, a table, a chart, an editor, a picker, a dialog, a combobox, a palette, a drag zone. Each is a library somebody else maintains, with its own idea of state and events. Fitting ten of them into one reactive model is the daily work of building products, and it is the work most courses skip.',
					'**It has a real domain underneath.** Great circles are not straight lines. Money is not a float. Splitting €100 three ways leaves a cent over, and somebody has to get it. Days have an order, and moving a stop from Tuesday to Thursday renumbers both. All of that is plain TypeScript with tests, and none of it cares which framework draws it.',
					'**It is genuinely shared.** Two people planning one trip is the normal case, not an advanced feature. So the trip is a live query, presence is on the same stream, and every write is a remote function the server checks against the person making it.'
				]
			},
			{
				type: 'why',
				title: 'Why this is worth your time even if you never plan a trip',
				text: 'Every real application reaches for libraries, and every library has to be wired into your framework’s reactivity, your server’s security, your build, and your tests. The trip planner is an excuse to do that wiring ten times, with ten different shapes of library — headless, wrapper, imperative, data-only — and to write down what each shape asks of Svelte. What you learn from the map is what every canvas library needs; what you learn from Tiptap is what every editor needs; what you learn from TanStack is what every headless library needs.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape of it' },
			{
				type: 'terminal',
				code: `
   the browser                                         the server (adapter-node)
   ┌──────────────────────────────────────────┐        ┌────────────────────────────────┐
   │ TripState ($derived over live.current)   │  form  │ remote functions               │
   │  ├ Itinerary (svelte-dnd-action, flip)   │ ─────▶ │  ├ query      tripBySlug, ...  │
   │  ├ MapView (svelte-maplibre)             │command │  ├ query.batch tripPreview     │
   │  ├ Globe (Threlte, on demand)            │ ◀───── │  ├ query.live  watchTrip       │
   │  ├ Expenses (TanStack Table, LayerChart) │  live  │  ├ prerender   places          │
   │  ├ Notes (Tiptap via {@attach})          │ ◀━━━━━ │  ├ form / command  the writes  │
   │  └ Companions, Presence, Palette         │        │ Better Auth · Drizzle · SQLite │
   │ @meridian/waypoint (geo, Route)          │        │ rooms + mailbox · presence     │
   │ Paraglide messages · Intl · theme        │        │ tracing ring · healthz         │
   └──────────────────────────────────────────┘        └────────────────────────────────┘
        ▲ prerendered: /guides (mdsvex, csr=false), /api/world.json, places()`
			},
			{
				type: 'p',
				text: 'The thing to notice is the top-left box. `TripState` is a class whose every field is `$derived` from one value: the latest snapshot the live query delivered, falling back to the snapshot the page was rendered with. Every library on the left reads from it, and every write on the right goes through a remote function that publishes to the room the live query listens on. There is no client-side cache to invalidate, because there is no client-side copy of the truth — only the last thing the server said.'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule every library had to pass' },
			{
				type: 'p',
				text: 'Before a package went into `package.json` it had to answer four questions, and chapter 37 records the answers for every one of them, including the ones that failed.'
			},
			{
				type: 'ol',
				items: [
					'**Does it work with Svelte 5 and SvelteKit 3 as of September 2026 — really, not “there is an open PR”?** Installed, type-checked, built, run in a browser test. Several well-known packages did not pass this, and the chapter names them.',
					'**Is it the right shape?** A headless library (Bits UI, TanStack Table) gives you behaviour and lets you own the markup; a wrapper (svelte-maplibre, Threlte) gives you components over an imperative library; a plain imperative library (Tiptap, MapLibre itself) wants a DOM node and a cleanup — which is exactly what a Svelte attachment is. Choosing the shape is most of choosing the library.',
					'**Does it earn its bytes?** three.js is three hundred kilobytes; it is loaded when somebody opens the globe and never otherwise. A sparkline is twelve hundred bytes of SVG in our own library, because a chart library for a line with no axes would be absurd.',
					'**Could we remove it later?** Every library sits behind one component or one module. Swapping the map library is a change to `src/lib/map`; nothing else knows MapLibre exists.'
				]
			},

			{ type: 'h3', id: 'what-we-will-not-build', text: 'What we are deliberately not building' },
			{
				type: 'ul',
				items: [
					'**A CRDT for the notes.** Two people typing in the same paragraph at the same time get last-writer-wins, and the editor says so by refusing to overwrite a person mid-sentence. Project 4 built the CRDT; this project has the room it would go in.',
					'**A tile server, or a geocoder.** The map is a bundled atlas of coastlines and a hundred-place gazetteer in a JSON file. It is enough to plan a trip and it is honest about what it is; adding a tile provider is one `sources` entry and a CSP line, and chapter 27 says which.',
					'**A service worker.** Project 4 and project 6 built one. The guides here are static files and the app is a live one; an offline itinerary is on the “where next” list with a design, not in the code.'
				]
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what Meridian does in three sentences.',
					'You can name the four questions a library had to answer, and say which shape — headless, wrapper, imperative — each of the main ones is.',
					'You know why `TripState` is derived from one value and what that means for caching.'
				]
			}
		]
	},

	{
		slug: 'the-workspace',
		title: 'A workspace of two',
		summary:
			'The app at the root, the library it publishes in `packages/waypoint`, and the pnpm settings that make a workspace safe: `workspace:*`, `allowBuilds`, a minimum release age, and a `prepare` script that builds the library before the app can import it.',
		goal: 'Read the workspace configuration and know why the app depends on its own library the way a stranger would, and what pnpm 11 refuses to do until you say so.',
		blocks: [
			{
				type: 'p',
				text: 'The first seven projects were single packages. This one is a **workspace**: the SvelteKit app at the root, and a library in `packages/waypoint` that the app depends on as if it had downloaded it from the registry. That is not an affectation. A library that is only ever imported by relative path is never really tested as a library; the first outside consumer finds the missing `exports` entry, the `.ts` import that should have been `.js`, the type that was never emitted. Making the app the first consumer finds all of that on every build.'
			},
			code('pnpm-workspace.yaml', 1, 18),
			{
				type: 'p',
				text: 'Three settings, each a decision. `packages` names the folders. `allowBuilds` is pnpm 11’s answer to supply-chain attacks through install scripts: a dependency’s `postinstall` does not run unless you name the package, so a compromised transitive package cannot run code on your machine by being installed. esbuild needs its script to unpack a platform binary, and Vite needs esbuild; nothing else in this tree is allowed to run anything. `minimumReleaseAgeExclude` is the other half of the same policy — pnpm can refuse versions published less than some number of days ago, so a malicious release has time to be noticed and pulled before it reaches you, and this list is the three packages we deliberately took on the day they shipped.'
			},
			{
				type: 'note',
				text: 'If you have never seen `allowBuilds` fail: run `pnpm install` on a fresh clone with it removed and watch pnpm list the packages that *wanted* to run scripts and were not allowed to. That list is worth reading once. Most of it is telemetry.'
			},

			{ type: 'h3', id: 'the-scripts', text: 'The scripts' },
			code('package.json', 11, 34, { partial: true }),
			{
				type: 'p',
				text: 'The order of operations is the whole story of this file. `prepare` runs after `pnpm install`, and it does three things the app cannot start without: it builds the library (`package`), so `@meridian/waypoint` resolves to real files in `packages/waypoint/dist`; it compiles the messages (`i18n`), so `#lib/paraglide/messages.js` exists to be imported; and it runs `svelte-kit sync`, so the generated types exist. The `|| echo ""` on the end is for the one situation where any of those fails on purpose — a Docker build that installs dependencies before it copies the source — and chapter 44 shows the Dockerfile running the three steps itself, explicitly, once the source is there.'
			},
			{
				type: 'p',
				text: '`build` and `dev` both start with `build:element`: the standalone custom element is a second Vite build into `static/embed`, and it has to exist before SvelteKit copies `static/` into the output. `check` compiles the messages first for the same reason `prepare` does, then passes one compiler-warnings flag whose reason is chapter 36. `verify` is the whole gate — type-check, lint, unit and browser tests, the production build, the end-to-end suite — and CI runs exactly that command, so what is green locally is green there.'
			},

			{ type: 'h3', id: 'dependencies', text: 'What is in the box' },
			code('package.json', 67, 102, { partial: true }),
			{
				type: 'p',
				text: 'Forty-odd dependencies is more than any earlier project, and every one is here because a chapter needed it. The one to look at now is `"@meridian/waypoint": "workspace:*"` — the protocol tells pnpm to link the folder rather than fetch a tarball, and to replace the specifier with the real version if this package were ever published. The `imports` map at the bottom is Node’s subpath-imports feature: `#lib/...` resolves to `src/lib/...` in Node, in Vite and in TypeScript alike, which is why this project has no `$lib` alias and no `paths` in its tsconfig. (SvelteKit 3 still supplies `$lib`; the project prefers the standard.)'
			},
			code('.npmrc', 1, 1),
			{
				type: 'p',
				text: 'One line, and an honest one. `engines` pins Node 24 — the current LTS at the time of writing, and what `.nvmrc` and the Dockerfile use — but `engine-strict=false` lets a machine on the previous LTS install and run with a warning rather than a wall. The features the project needs from Node 24 are conveniences, not requirements, and a course that refuses to start on last year’s Node is a course fewer people finish.'
			},
			{
				type: 'terminal',
				code: `
$ corepack enable            # pnpm 11, pinned by "packageManager"
$ pnpm install               # installs both packages, then runs prepare:
                             #   svelte-package → packages/waypoint/dist
                             #   paraglide-js compile → src/lib/paraglide
                             #   svelte-kit sync → .svelte-kit/types
$ cp .env.example .env       # DATABASE_URL, PUBLIC_ORIGIN, BETTER_AUTH_SECRET
$ node scripts/migrate.ts && node scripts/seed.ts
$ pnpm run dev               # builds the element, then vite dev on :5173`
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `workspace:*` does and why the app depends on the library that way.',
					'You can say which packages are allowed to run install scripts, and why the default is none.',
					'You know the three things `prepare` builds and why the app cannot start without them.'
				]
			}
		]
	},

	{
		slug: 'the-config',
		title: 'One file to configure everything',
		summary:
			'SvelteKit 3 keeps its whole configuration inside the Vite plugin. This chapter reads `vite.config.ts` top to bottom: plugin order, mdsvex as a preprocessor, per-file compiler options for the custom element, the adapter, remote functions, tracing, prerendering, the Content Security Policy, versioning, Paraglide, and the two test projects.',
		goal: 'Read a SvelteKit 3 config with three preprocessors and plugins in it and know what every line is for, including why order matters twice.',
		blocks: [
			{
				type: 'p',
				text: 'There is no `svelte.config.js`. SvelteKit 3 moved every option into the `sveltekit()` plugin call, and this project feels that change more than the earlier ones did, because three of the tools it uses *used* to be configured through that file: mdsvex was a preprocessor listed there, `@sveltejs/package` read it for aliases, and every guide on the internet still says so. Here is where they go now.'
			},
			code('vite.config.ts', 33, 57, { partial: true }),
			{
				type: 'p',
				text: '`defineConfig` comes from `vitest/config` rather than `vite`, so the `test` block at the bottom type-checks; `loadEnv` still comes from Vite because Vitest does not re-export it. The config is a **function** because it reads the environment before the build starts: `paths.origin` is the value adapter-node bakes into the server, and it is read from `PUBLIC_ORIGIN` here and validated by `src/env.ts` (chapter 14) as `static: true` so the same value reaches Better Auth.'
			},
			{
				type: 'warn',
				text: '`enhancedImages()` must come before `sveltekit()`. It is a preprocessor that rewrites `<enhanced:img>` into a `<picture>` element, and the Svelte compiler has to see the rewritten markup, not the original. Put it second and the build fails with an unhelpful message about an unknown element. The other ordering rule is at the bottom of the plugin list, and it is the opposite way round.'
			},

			{ type: 'h3', id: 'markdown-and-elements', text: 'Markdown components and a folder of custom elements' },
			code('vite.config.ts', 59, 93, { partial: true }),
			{
				type: 'p',
				text: 'Two per-file behaviours. `preprocess` and `extensions` are what make a `.svx` file a component: mdsvex runs first, turns Markdown into markup and frontmatter into a `metadata` export, and the compiler takes it from there; `extensions` tells SvelteKit that `.svx` files under `src/routes` and in imports are components too. Chapter 34 writes the guides that use it.'
			},
			{
				type: 'p',
				text: '`dynamicCompileOptions` is newer and subtler: a function called once per file, returning compiler options for that file only. The custom element in `src/lib/embed` has to be compiled with `customElement: true` — a different output altogether, with `customElements.define` and a shadow root — and nothing else in the project may be. The `environment.name === "client"` guard is the part people miss: the server build compiles the same file, and a custom element has no server-rendered form, so the server gets a plain component it never renders. Chapter 36 builds the element.'
			},

			{ type: 'h3', id: 'compiler', text: 'The compiler options' },
			code('vite.config.ts', 95, 111, { partial: true }),
			{
				type: 'p',
				text: '`runes` is a function so that a dependency written in Svelte 4 style keeps compiling — several libraries in this project ship `.svelte` files, and the compiler decides per file. `experimental.async` is the one that changes how you write components: `await` at the top level of a `<script>`, inside `$derived`, and directly in markup, with `<svelte:boundary>` and its `pending` snippet to catch the wait. This project has more of it than any before: the globe is an `await import()` in markup, the place search is an `await` per keystroke inside a `$derived`, and opening a trip is `{const initial = await tripBySlug(slug)}` on the page.'
			},

			{ type: 'h3', id: 'adapter-and-experiments', text: 'The adapter, remote functions, and one experiment left off' },
			code('vite.config.ts', 113, 140),
			{
				type: 'p',
				text: '`precompress` matters more here than in any earlier project: MapLibre and three.js are the two largest chunks any of the eight has shipped, and writing `.br` and `.gz` beside them at build time means the server never compresses them per request. `remoteFunctions` is the switch for everything in chapters 16–19. `forkPreloads` stays off on the evidence of three projects; the comment says what would turn it on, which is how a decision that might change should be recorded.'
			},
			code('vite.config.ts', 142, 161),
			{
				type: 'p',
				text: '`tracing.server` was experimental in SvelteKit 2 and is not in 3; it makes every `handle`, `load`, form action and remote function an OpenTelemetry span, and `src/instrumentation.server.ts` — loaded before any application code, with nothing to switch on — is where the exporter lives. Chapter 35 reads the spans back on the diagnostics page. The two `prerender` options turn a broken link on a prerendered page into a failed build, which is the only time you want to find out.'
			},

			{ type: 'h3', id: 'csp', text: 'The Content Security Policy' },
			code('vite.config.ts', 163, 209),
			{
				type: 'p',
				text: 'The comment above the directives is the chapter. Two things to add. `mode: "auto"` means hashes on prerendered pages and nonces on dynamic ones — and a nonce is filled in per request, which is why the theme boot script in `app.html` is allowed by its **hash** and carries no nonce attribute: SvelteKit refuses to prerender a template that still contains `%sveltekit.nonce%`, and the guides are prerendered. `themeBootHash()` at the bottom of the file reads the script out of `app.html` and hashes it, so the two cannot drift.'
			},
			{
				type: 'p',
				text: '`connect-src "self"` with no tile server is a real constraint accepted on purpose: the map cannot fetch tiles from anybody, so it is built from a bundled atlas (chapter 27). If you add a tile provider, this is the line that changes, and the CSP will tell you so in the console before anything else does.'
			},

			{ type: 'h3', id: 'versioning', text: 'Versioning, so a deploy does not strand open tabs' },
			code('vite.config.ts', 211, 227),
			{
				type: 'p',
				text: '`version.name` is the commit hash, computed by `commitHash()` below with a fallback to the package version, because a Docker build context has no `.git`. `pollInterval` makes the client check for a new version once a minute; `updated.current` in the root layout flips, a banner offers a reload, and the next navigation becomes a full page load so no chunk from the old build is ever requested. `bundleStrategy: "split"` is the default and is named here because chapter 36 builds the one thing that must *not* be split.'
			},

			{ type: 'h3', id: 'paraglide-and-icons', text: 'Two plugins that are not SvelteKit' },
			code('vite.config.ts', 230, 264),
			{
				type: 'p',
				text: 'Paraglide is a Vite plugin in its own right: it watches `messages/*.json`, compiles them into `src/lib/paraglide`, and does so with a `strategy` list that is the order the locale is decided in. Chapter 20 is entirely about it. The phosphor plugin is the second ordering rule: it rewrites `import { PlusIcon } from "phosphor-svelte"` into a deep import so the dev server does not crawl a barrel of thousands of icons, and it must run *after* the Svelte compiler because it parses JavaScript. Put it first and it dies on the first `<h1>`.'
			},

			{ type: 'h3', id: 'the-rest', text: 'The native addon, and the two test projects' },
			code('vite.config.ts', 267, 274),
			code('vite.config.ts', 276, 342, { partial: true }),
			{
				type: 'p',
				text: 'Two Vitest projects in one config, extending it: `client` runs `*.svelte.test.ts` in a real Chromium through Playwright, because the components under test need WebGL, pointer events and layout; `server` runs everything else in Node, one file at a time because SQLite has one writer. The `optimizeDeps.include` list is the fix for a real failure: the phosphor plugin rewrites imports during transform, after Vite’s dependency scan, so on a cold cache Vite discovered the icons mid-test, re-bundled, and reloaded the test inside itself. Naming them is what Vitest’s own warning asks for. Chapter 41 runs both projects.'
			},
			code('vite.config.ts', 346, 381),
			{
				type: 'checkpoint',
				items: [
					'You can say which two plugins have ordering rules, which way round each goes, and why.',
					'You can explain why the boot script is allowed by a hash and not a nonce, and what would break if it were the other way.',
					'You know what `dynamicCompileOptions` is for and why it checks `environment.name`.'
				]
			}
		]
	},

	{
		slug: 'the-map-of-features',
		title: 'The map: every feature, every library, and where it lives',
		summary:
			'A reference chapter. Every Svelte 5 and SvelteKit 3 feature the project uses, every ecosystem library it reaches for, and the chapter where each one is built and explained — so you can read the course in order or jump to the thing you came for.',
		goal: 'Know where to find everything, and see at a glance how much of a real product is the framework and how much is the ecosystem around it.',
		blocks: [
			{
				type: 'p',
				text: 'This is the table of contents by *feature* rather than by chapter. Come back to it whenever a term in a later chapter is unfamiliar: everything is listed with the chapter that builds it.'
			},

			{ type: 'h3', id: 'svelte', text: 'Svelte 5' },
			{
				type: 'ul',
				items: [
					'**`$state`, `$derived`, `$derived.by`, `$effect`, `$props`** — everywhere; the pattern that matters is `TripState` (ch. 24), a class whose fields are all derived from one getter.',
					'**Assignable `$derived`** — the stop dialog’s fields start from the stop being edited and belong to the form after that (ch. 25).',
					'**`untrack`** — reading a prop once, on purpose, in a component the page keys on its slug (ch. 24, 31).',
					'**`$state.raw`, `$state.snapshot`** — the Tiptap editor instance (ch. 30); the library’s `toJSON` (ch. 06).',
					'**`await` in markup, in `$derived` and at the top of `<script>`; `<svelte:boundary>` with `pending` and `failed`** — the trip page, the place search, the globe, the explore page (ch. 24, 25, 28, 35).',
					'**`{const}` declaration tags** — the header’s link list, the trip page’s initial data (ch. 23, 24).',
					'**Attachments — `{@attach}`** — Tiptap (ch. 30), the GSAP reveal (ch. 22), and the argument for when a wrapper library is *not* worth it (ch. 39).',
					'**`animate:flip`** with svelte-dnd-action (ch. 25).',
					'**`svelte/reactivity`: `MediaQuery`, `createSubscriber`; `svelte/reactivity/window`: `scrollY`** — the theme, the globe’s motion preference, geolocation, the header (ch. 22, 27, 28, 40).',
					'**Custom elements — `<svelte:options customElement>`** with a shadow root and attribute-mapped props (ch. 36).',
					'**Runes in a `.svelte.ts` file inside a published library** — the `Route` class (ch. 06).'
				]
			},

			{ type: 'h3', id: 'kit', text: 'SvelteKit 3' },
			{
				type: 'ul',
				items: [
					'**All configuration in `vite.config.ts`**; `preprocess`, `extensions`, `dynamicCompileOptions` (ch. 03).',
					'**`src/env.ts` with `defineEnvVars`, `public`, `static`** (ch. 14).',
					'**Remote functions: `query`, `query.batch`, `query.live`, `prerender`, `form`, `command`; `requested().refreshAll()`; `invalid()` with `issue.field()`; `getRequestEvent`** (ch. 16–19).',
					'**Hooks: `handle` with `sequence`, `handleFetch`, `handleError` with `kind`, `init`; universal `reroute` and `transport`; hook types from `@sveltejs/kit/hooks`** (ch. 14, 20, 21).',
					'**`defineParams` in `src/params.ts`** (ch. 24).',
					'**Route groups and the layout split** — `(site)` with identity, guides without (ch. 23, 34).',
					'**Prerendering with `entries`, `csr = false`, per-locale output through `reroute`** (ch. 34).',
					'**`resolve()` from `$app/paths` with typed route ids** (ch. 35).',
					'**`tracing: { server: true }` and `src/instrumentation.server.ts`** (ch. 35).',
					'**CSP `mode: "auto"`, `csrf`, `version.pollInterval` and `updated.current`, `preload` by source `filename`** (ch. 03, 23, 43).',
					'**`$app/env`: `browser`, `building`, `version`** (ch. 23, 28, 36).',
					'**`onNavigate` view transitions, `beforeNavigate`** (ch. 23).',
					'**`<enhanced:img>`** (ch. 22).',
					'**adapter-node with `precompress`, `paths.origin`, a health endpoint, graceful shutdown** (ch. 44).'
				]
			},

			{ type: 'h3', id: 'ecosystem', text: 'The ecosystem' },
			{
				type: 'p',
				text: 'Each library, what it is for here, its shape, and the chapter. The survey in chapter 37 is where the alternatives are weighed; this is just the roll-call.'
			},
			{
				type: 'ul',
				items: [
					'**Bits UI 2** — Dialog, Combobox, Command, DateRangePicker. Headless. (ch. 25, 26, 33, 38)',
					'**svelte-maplibre 2 + MapLibre GL 6** — the map. Wrapper. (ch. 27, 39)',
					'**Threlte 8 (`@threlte/core`, `@threlte/extras`) + three.js** — the globe. Wrapper. (ch. 28, 39)',
					'**svelte-dnd-action** — dragging stops between days. Action. (ch. 25)',
					'**TanStack Table v9 (`@tanstack/svelte-table`)** — the expenses table. Headless. (ch. 29, 38)',
					'**LayerChart 2** — two charts. Components over d3 scales. (ch. 29)',
					'**Tiptap 3 (`@tiptap/core`, `@tiptap/starter-kit`)** — the notes editor. Imperative, through an attachment. (ch. 30, 38)',
					'**Paraglide 2 (`@inlang/paraglide-js`)** — three languages. Compiler + Vite plugin. (ch. 20)',
					'**Better Auth 1.7 (`better-auth/minimal`)** — accounts and sessions. Server library with a SvelteKit handler. (ch. 15, 32)',
					'**Drizzle ORM + libSQL** — the database. (ch. 13)',
					'**valibot** — every schema, from forms to environment variables to frontmatter. (ch. 12)',
					'**svelte-sonner** — toasts. (ch. 22)',
					'**phosphor-svelte** — icons, with the Vite plugin that keeps the dev server fast. (ch. 03, 22)',
					'**runed** — `Debounced` on the explore page, and the argument about when a utility library is worth it. (ch. 35, 40)',
					'**mdsvex** — the guides. Preprocessor. (ch. 34)',
					'**@sveltejs/enhanced-img** — the hero. Preprocessor. (ch. 22)',
					'**@sveltejs/package, publint, @arethetypeswrong/cli** — packaging the library. (ch. 08)',
					'**@internationalized/date** — calendar dates without time zones, and the transport hook that carries them (ch. 21).',
					'**world-atlas + topojson-client** — the coastlines, at build time. (ch. 16, 27)',
					'**@opentelemetry/sdk-trace-node** — the tracing exporter. (ch. 35)',
					'**GSAP** — one reveal, respecting reduced motion. (ch. 22)',
					'**fontsource** — two variable fonts, preloaded by source filename. (ch. 22)'
				]
			},
			code('package.json', 67, 98, { partial: true }),

			{ type: 'h3', id: 'domain', text: 'The domain, with no framework in it' },
			{
				type: 'ul',
				items: [
					'**Geodesy** — haversine distance, bearings, great-circle interpolation, unwrapped arcs, bounds, compass points, `Intl` distance formatting. (ch. 05)',
					'**Ids, dates, money** — unguessable slugs; ISO dates with cached `Intl` formatters; integer minor units with `fractionDigits` asked of `Intl`. (ch. 09)',
					'**Fair splits** — shares by largest remainder, balances, greedy settlement. (ch. 10)',
					'**The itinerary** — grouping by day, placing a stop, renumbering only what moved. (ch. 11)',
					'**Schemas and roles** — one valibot schema per input; who may do what. (ch. 12)'
				]
			},

			{ type: 'h3', id: 'proving', text: 'Proving and shipping' },
			{
				type: 'ul',
				items: [
					'**Vitest, two projects** — pure logic in Node; components in Chromium with `vitest-browser-svelte`. (ch. 41)',
					'**Playwright** — six suites on a desktop and a Pixel 7, including two browser contexts on one trip. (ch. 42)',
					'**Security** — hooks, headers, CSP, CSRF, the one frameable route. (ch. 43)',
					'**Docker, compose, CI** — three stages, a health check, SIGTERM, a workflow with verify, package, image and course jobs. (ch. 44)'
				]
			},
			{
				type: 'checkpoint',
				text: 'You do not need to remember this chapter. You need to know it exists, and to come back to it when a later chapter names something you have not met yet.'
			}
		]
	}
];
