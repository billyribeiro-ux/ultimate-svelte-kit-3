/**
 * PART 7 — The ecosystem
 * (chapters 37–40)
 *
 * The chapters the course was asked for by name: which libraries, why, what
 * was rejected, and the three shapes a library can take when it meets Svelte
 * 5 — headless, wrapper, and imperative-through-an-attachment — plus the
 * argument about reactivity utilities and when a package is worth its line
 * in package.json.
 */

import { code } from './quote.js';

export const part7 = [
	{
		slug: 'choosing-libraries',
		title: 'The survey: what was chosen, what was rejected, and why',
		summary:
			'Every dependency in the project against the four questions from chapter 01, with its version as of September 2026 and the alternatives it beat — and the packages that did not make it, with the reason: not yet on Svelte 5 or SvelteKit 3, folded into the framework, or too heavy for what it did.',
		goal: 'Have a written, reproducible method for picking a library in the Svelte ecosystem, and know the state of the main candidates as of the day this project was built.',
		blocks: [
			{
				type: 'p',
				text: 'Chapter 01 gave the four questions: does it work with Svelte 5 and SvelteKit 3 *today*; is it the right shape; does it earn its bytes; could we remove it later. This chapter is the answers, one library at a time, and — more usefully — the ones that failed. A survey that only lists winners is an advertisement.'
			},
			code('package.json', 67, 98, { partial: true }),

			{ type: 'h3', id: 'how', text: 'How each one was checked' },
			{
				type: 'terminal',
				code: `
$ pnpm add <package>           # against Svelte 5.57 / SvelteKit 3.0.0-next.25 / Vite 8.2
$ pnpm run check               # svelte-check with the project's strict tsconfig
$ pnpm run build               # the production build, including the server bundle
$ pnpm exec vitest --project client   # a real Chromium, for anything that renders
$ pnpm ls <package> --depth 0  # exactly one copy? (maplibre-gl needed \`pnpm dedupe\`)
$ pnpm why <package>           # what pulled it in, and whether it pins svelte@4`
			},
			{
				type: 'p',
				text: 'Every package below passed all six, and the two that needed help — `maplibre-gl` came in twice through `svelte-maplibre` until `pnpm dedupe`, and `sharp` had to be a named devDependency because `@sveltejs/enhanced-img` resolves it from the project — are noted where they sit. `pnpm why` is the underrated one: a package that peer-depends on `svelte@^4` will install, type-check, and fail at runtime on the first rune.'
			},

			{ type: 'h3', id: 'chosen', text: 'Chosen, by shape' },
			{
				type: 'ul',
				items: [
					'**Headless — behaviour and accessibility, no pixels.** Bits UI 2.19 (Dialog, Combobox, Command, DateRangePicker); TanStack Table 9.2. Beat: Melt UI (Bits is built on its builders and adds the component layer), shadcn-svelte (a copy-in kit *on top of* Bits — right for a team that wants the styling done, wrong for a course about the primitives), Skeleton (a full framework with its own tokens; the project already has tokens), Flowbite-Svelte (styled, Tailwind, Svelte 4 lineage).',
					'**Wrappers — components over an imperative library.** svelte-maplibre 2.0 over MapLibre GL 6.7; Threlte 8.6 / extras 9.21 over three.js 0.185; LayerChart 2.3 over d3 scales. Beat: raw MapLibre through an attachment (thirty markers want an `{#each}`), Mapbox GL (a licence, a key and a `connect-src`), Leaflet (raster, no vector styling, no WebGL), raw three.js (a scene graph wants a template), Chart.js and ECharts (canvas charts with their own theming and a `Chart` object to sync).',
					'**Imperative through an attachment — wants one element and owns it.** Tiptap 3.31 through `{@attach}`; GSAP 3.15 through `{@attach}`. Beat: the Svelte wrappers for Tiptap (nothing to add), ProseMirror directly (Tiptap *is* ProseMirror with a schema and commands), Lexical (React-first), Quill (its own data model).',
					'**Actions.** svelte-dnd-action 0.9.79. Beat: Atlassian’s pragmatic-drag-and-drop (excellent, framework-agnostic, and needs a hundred lines of adapter for keyboard support that svelte-dnd-action has built in), `svelte-dnd-list` (Svelte 4), the HTML Drag and Drop API alone (no touch, no keyboard).',
					'**Compilers and preprocessors.** Paraglide 2.25; mdsvex 0.12.8; `@sveltejs/enhanced-img` 1.0.0-next.5; `phosphor-svelte` 3.1 with its Vite plugin. Beat: svelte-i18n (a runtime dictionary), `@inlang/paraglide-sveltekit` (folded into Paraglide 2 — see below), `svelte-markdown` (runtime parsing), `unplugin-icons` (fine; Phosphor’s own package has the weights the design uses), Lucide (also fine; a coin toss the design decided).',
					'**Server libraries with a SvelteKit adapter.** Better Auth 1.7.2; Drizzle 0.45 with libSQL 0.18; OpenTelemetry’s Node SDK. Beat: Lucia (deprecated itself and recommends rolling your own or Better Auth), Auth.js (session-in-JWT by default, and a SvelteKit adapter that lags), Prisma (a query engine binary the image would carry; Drizzle is SQL with types), Kysely (close second; no relational query API).',
					'**Utilities.** runed 0.37 (`Debounced`); valibot 1.4 (every schema); svelte-sonner 1.2 (toasts); `@internationalized/date` 3.12 (dates without time zones). Beat: zod (works; twice the bytes for the same validators, and valibot’s functions tree-shake), `svelte-french-toast` (Svelte 4), `dayjs` and `date-fns` (instants, not calendar dates; and `Intl` formats better than either).',
					'**Packaging and proof.** `@sveltejs/package` 3.0.0-next.7, publint 0.3, `@arethetypeswrong/cli` 0.18, `vitest-browser-svelte` 3.0, Playwright 1.62. Beat: `tsup` (does not understand `.svelte`), Storybook (chapter 07’s components have tests instead; a Storybook is the right call for a design system with fifty components, and a heavy one for a library with two).'
				]
			},

			{ type: 'h3', id: 'rejected', text: 'Tried and not used' },
			{
				type: 'p',
				text: 'These were installed, or read closely enough to know, and left out. The reasons are the reasons on the day; several will change, and the list says how to tell.'
			},
			{
				type: 'ul',
				items: [
					'**`@vite-pwa/sveltekit`** — the service-worker generator. Its SvelteKit integration reads `svelte.config.js` and the `kit` object from it, and SvelteKit 3 has neither; the Vite-plugin path works but the SvelteKit-aware manifest injection does not. Project 6 wrote its service worker by hand; this project’s “where next” has the design. Watch its changelog for “SvelteKit 3” in a release note.',
					'**`sveltekit-flash-message`** — cookie-carried messages across a redirect. Built on form actions and `page.data`; remote `form`s return their own `result` and the toaster handles the rest. Nothing to do here.',
					'**`@inlang/paraglide-sveltekit`** — the SvelteKit wrapper for Paraglide 1. Paraglide 2’s `strategy` list plus one `reroute` hook and one `handle` are the whole of what it did. Not rejected; superseded.',
					'**`sveltekit-superforms`** — the form library the ecosystem standardised on for form actions. It solves validation, typing and progressive enhancement for `+page.server.ts` actions; remote `form`s solve the same problems in the framework (`fields`, `as()`, `issues()`, `invalid()`, `preflight()`). On a SvelteKit 3 project with remote functions, the two overlap almost entirely. Right choice for an app on form actions; the wrong second copy here.',
					'**`svelte-headless-table`** and **`svelte-table`** — Svelte 4 era, store-based. TanStack v9’s adapter is runes-native and maintained with the core.',
					'**`svelte-dnd-list`, `svelte-french-toast`, `svelte-select`, `svelte-i18n`** — each pins or assumes Svelte 4, or wraps a store API. All have runes-native successors above.',
					'**Storybook 9** — works with Svelte 5, and for two components it is a second build system, a second dev server and forty megabytes of devDependencies. Browser tests in Vitest cover the same ground for this library. For a design system, take it.',
					'**A tile provider** (MapTiler, OpenFreeMap, Protomaps) — not a library, but the same decision: each is one `sources` entry and one `connect-src` line, and the project deliberately ships without one so it works offline and in CI. Chapter 27 says which line to change.'
				]
			},

			{ type: 'h3', id: 'versions', text: 'The versions, on the day' },
			{
				type: 'terminal',
				code: `
svelte                 5.57.x     runes, attachments, await in markup, boundaries
@sveltejs/kit          3.0.0-next.25   remote functions, tracing, env.ts, defineParams
vite                   8.2.x      rolldown-based; \`?worker&url\`, optimizeDeps as ever
typescript             6.0.x
bits-ui                2.19.x     headless; DateRangePicker on @internationalized/date
svelte-maplibre        2.0.x      maplibre-gl 6.7 (deduped)
@threlte/core          8.6.x      + @threlte/extras 9.21, three 0.185
@tanstack/svelte-table 9.2.x      runes adapter; \`tableFeatures\`, \`columnMeta\` slot
layerchart             2.3.x
@tiptap/core           3.31.x     + starter-kit, pm
svelte-dnd-action      0.9.79
@inlang/paraglide-js   2.25.x
better-auth            1.7.2      \`issuer\` column; \`better-auth/minimal\`
drizzle-orm            0.45.x     drizzle-kit 0.31
runed                  0.37.x
mdsvex                 0.12.8
@sveltejs/enhanced-img 1.0.0-next.5
@sveltejs/package      3.0.0-next.7   reads config from Vite`
			},
			{
				type: 'why',
				title: 'Why write the rejections down',
				text: 'Because the next person to open this project will search for “SvelteKit i18n” and find the wrapper that was superseded, or “svelte forms” and find the library that overlaps with the framework, and the only thing that stops them spending a day on it is a sentence saying it was considered. A survey ages; a survey with dates and reasons ages gracefully, because the reader can check whether the reason still holds.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can run the six checks on a new package and say what each one catches.',
					'You can name one library per shape and the alternative it beat.',
					'You can say why superforms and paraglide-sveltekit are absent, and what would bring `@vite-pwa/sveltekit` back.'
				]
			}
		]
	},

	{
		slug: 'the-headless-pattern',
		title: 'The headless pattern: Bits UI and TanStack Table',
		summary:
			'What a headless library gives you and what it asks of you: behaviour, ARIA and keyboard from the library; markup, classes and data from you. Bits UI’s `Root`/parts structure, `bind:` on the root, `class` on every part, portals, snippets with library-provided state; TanStack’s table object with a getter and a render helper.',
		goal: 'Recognise a headless library by its API, wire one into Svelte 5 state without an effect, and style it entirely from your own tokens.',
		blocks: [
			{
				type: 'p',
				text: 'A headless library implements the hard parts of a widget — focus management, keyboard navigation, ARIA roles and states, the date arithmetic of a calendar, the sorting of a table — and renders nothing you cannot replace. The trade is explicit: you get correctness, and you own every pixel. Two libraries in this project have that shape, and they share a set of idioms worth naming.'
			},

			{ type: 'h3', id: 'parts', text: 'Idiom one: a root and its parts' },
			code('src/lib/trip/StopDialog.svelte', 99, 111, { partial: true }),
			{
				type: 'p',
				text: 'Bits UI components are trees of *parts*: `Dialog.Root` holds the state, `Dialog.Portal` moves the content to the end of the body, `Dialog.Overlay` and `Dialog.Content` are the elements, `Dialog.Title` and `Dialog.Description` wire the ARIA relationships. Each part accepts `class`, which is how the tokens get in. The state is on the root, controlled two ways: `open={mode !== null}` plus `onOpenChange` for the dialog whose openness is derived from something else, `bind:open` for the palette whose openness is its own.'
			},
			code('src/lib/trip/CommandPalette.svelte', 69, 84, { partial: true }),
			{
				type: 'p',
				text: 'The same idiom nests: the palette is a `Dialog` around a `Command`, and the `Command` has its own root and parts. Nothing about the composition is special — they are components — which is what makes a headless library composable in the first place.'
			},

			{ type: 'h3', id: 'snippets', text: 'Idiom two: snippets that receive library state' },
			code('src/lib/ui/DateRangeField.svelte', 65, 82, { partial: true }),
			code('src/lib/trip/PlaceSearch.svelte', 56, 73),
			{
				type: 'p',
				text: 'When a part has to render something the library computes — the segments of a date input, the months and weekdays of a calendar, whether an item is selected — it exposes it through a `children` snippet with parameters. `{#snippet children({ segments })}` receives the segments and renders one `Segment` part per entry; `{#snippet children({ selected })}` receives the item’s state. This is Svelte 5’s replacement for slot props, and it is typed: the parameter’s shape comes from the library’s declarations.'
			},

			{ type: 'h3', id: 'state', text: 'Idiom three: your state, their behaviour' },
			code('src/lib/trip/PlaceSearch.svelte', 25, 44),
			{
				type: 'p',
				text: 'The combobox filters nothing. It opens a list, moves a highlight, and reports a value; which items are in the list is yours, and here it is a `$derived` over a `$state` string that an `oninput` handler updates. No effect copies library state into Svelte state or back — the root’s `bind:value` and `onValueChange` are the whole contract, and a `$derived` reads whatever it needs. The moment you find yourself writing an effect to “sync” a headless component, look for the prop or the callback you missed.'
			},
			code('src/lib/trip/Expenses.svelte', 118, 131),
			{
				type: 'p',
				text: 'TanStack Table is headless in the same sense with one more idiom: the table is an *object* with methods, created once, and its options are read through getters so the object sees the latest state without being re-created. `get data() { return rows }` is a reactive getter — the adapter reads it inside `$effect.pre` — so the live document’s rows reach the table as they change. The rendering is a plain `<table>` that asks the object what to draw.'
			},
			code('src/lib/trip/Expenses.svelte', 243, 268, { partial: true }),
			{
				type: 'why',
				title: 'Why headless is the right default for an application',
				text: 'A styled component library brings a look, and the look is somebody else’s. A design system that is “Material with the colours changed” is recognisable from across the room. Headless libraries let a small team have the behaviour of a mature library and a design that is their own — every visible thing in this project is in `tokens.css` and a component’s `<style>`, and swapping Bits UI for another headless library would change imports and not a single class. The cost is that you write the styles, and for a dialog, a combobox and a palette that is an afternoon.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the three idioms and find each in one of the components above.',
					'You can say when to use `bind:open` and when `open` plus `onOpenChange`.',
					'You know why `get data()` is a getter and what would go wrong with a plain property.'
				]
			}
		]
	},

	{
		slug: 'the-wrapper-pattern',
		title: 'The wrapper pattern, and when to write an attachment instead',
		summary:
			'svelte-maplibre and Threlte are wrappers: components over an imperative library, mapping a scene or a map onto a template. Tiptap and GSAP are attachments: the library wants one element. The line between them, the costs of each, disposal, per-frame work, and the two things wrappers cannot hide — colours and workers.',
		goal: 'Decide, for an imperative library, whether to reach for a wrapper or write an attachment, and know what each shape asks of you.',
		blocks: [
			{
				type: 'p',
				text: 'An imperative library exposes objects with methods: a `Map` you add layers to, a `Scene` you add meshes to, an `Editor` you send commands to, a `Timeline` you play. Svelte can meet it two ways. A **wrapper** turns the objects into components so the template builds the object tree; an **attachment** hands the library an element and gets out of the way. The project uses both, deliberately, and the line between them is the shape of the state.'
			},

			{ type: 'h3', id: 'the-line', text: 'The line' },
			{
				type: 'ul',
				items: [
					'**The library’s objects form a tree that your template already has** — thirty markers for thirty stops, a mesh per stop, a layer per data set — use a wrapper. `{#each stops}<Marker>` and `{#each markers}<T.Mesh>` are the whole argument: add a stop and a marker exists; remove one and it is disposed; the mapping is the template.',
					'**The library wants one element and owns everything inside it** — an editor, a tween on a container, a video player, a code editor — write an attachment. Eleven lines, a cleanup, no dependency.',
					'**The library exposes a value that changes over time** — a position watch, a media query, a resize observer — neither: use `createSubscriber`, which chapter 40 covers.'
				]
			},
			code('src/lib/map/MapView.svelte', 101, 129, { partial: true }),
			code('src/lib/globe/Scene.svelte', 226, 242),
			{
				type: 'p',
				text: 'Two wrappers, one idea: an `{#each}` over the domain produces library objects, keyed so a change to one stop touches one object. Both wrappers hand back the underlying instance when you need it — `bind:map` on the map, `bind:ref` on the camera — for the one or two imperative calls a page genuinely needs. If you find yourself reaching for the instance on every line, the wrapper is the wrong shape for that part.'
			},
			code('src/lib/trip/Notes.svelte', 48, 69),
			code('src/lib/motion/reveal.ts', 34, 67),
			{
				type: 'p',
				text: 'Two attachments, one contract: receive the element, do the setup, return the teardown. Both libraries own their element completely — Tiptap renders the document into it, GSAP tweens its children — and neither has a tree the template could usefully mirror. The attachment version is shorter than any wrapper’s README.'
			},

			{ type: 'h3', id: 'costs', text: 'What each shape costs' },
			{
				type: 'ul',
				items: [
					'**Wrappers add a version to track.** svelte-maplibre pins a MapLibre range and Threlte pins a three.js range, and a wrapper that lags its library is a real risk. Both here are actively maintained and were on the current majors on the day; `pnpm why` is how you check.',
					'**Wrappers can double-install the library.** `maplibre-gl` arrived twice — once as our dependency and once through svelte-maplibre — until `pnpm dedupe`. Two copies of a WebGL library is two copies of a worker and a class identity check that fails at runtime.',
					'**Attachments make disposal your problem, once.** The cleanup destroys the editor, kills the tweens, disconnects the observer. Forget it and every navigation leaks. Wrappers dispose for you — Threlte disposes geometries that `T` created — but not the ones *you* created, which is why `Scene.svelte` has a `$effect` that disposes its own buffers.',
					'**Per-frame work needs the library’s scheduler, not an effect.** `useTask` in Threlte runs on the render loop and hands you the frame delta; an `$effect` that wrote to the camera on every state change would fight the loop. The flight variables in the scene are plain `let`s for the same reason: sixty writes a second to `$state` that nothing renders is scheduling for nobody.'
				]
			},

			{ type: 'h3', id: 'cannot-hide', text: 'Two things no wrapper can hide' },
			code('src/lib/map/style.ts', 23, 48, { partial: true }),
			code('src/lib/map/MapView.svelte', 1, 13),
			{
				type: 'p',
				text: 'Colours, and workers. A canvas does not read the CSS cascade, so both the map style and the globe’s materials take literal colours and rebuild when the theme flips — the one place the tokens rule is broken, with the reason beside it. And a library that uses a Web Worker needs Vite to emit the worker as a file and the CSP to allow it: `?worker&url`, `setWorkerUrl` in a module script, `worker-src "self" blob:`. A wrapper can document these; it cannot do them for you.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can state the line between wrapper and attachment in one sentence and apply it to a library you have not met.',
					'You can name the four costs and say which one `pnpm dedupe` addressed.',
					'You know which two things live outside any wrapper and where the project handles them.'
				]
			}
		]
	},

	{
		slug: 'reactivity-utilities',
		title: 'Reactivity utilities: `svelte/reactivity`, runed, and the line between them',
		summary:
			'`MediaQuery`, `createSubscriber` and `svelte/reactivity/window` from the framework; `Debounced` from runed; the decision about `SvelteMap` versus a plain `Map` in a derivation; and the rule for when a utility library earns its line.',
		goal: 'Know what the framework ships for “an external value as state”, when a utility library adds something, and when a plain data structure is the right one inside a derivation.',
		blocks: [
			{
				type: 'p',
				text: 'Most of what a reactivity utility does is turn something outside Svelte — a media query, a browser event, a timer, storage — into a value a template can read. Svelte 5 ships the primitives for that in `svelte/reactivity`, and this chapter is about which ones the project uses, the one place it reached for runed instead, and the one place it deliberately used a plain `Map`.'
			},

			{ type: 'h3', id: 'shipped', text: 'What the framework ships' },
			code('src/lib/ui/theme.svelte.ts', 23, 30, { partial: true }),
			code('src/lib/ui/Header.svelte', 17, 23),
			{
				type: 'p',
				text: '`MediaQuery` is a media query as a reactive value: construct it once, read `.current` anywhere, and the listener is managed for you. The theme uses it for the system’s colour scheme and the globe for reduced motion. `svelte/reactivity/window` exports `scrollY`, `innerWidth`, `online` and the rest as reactive values that are `undefined` on the server, which is why `scrollY.current ?? 0`. Both replace an `onMount` with `addEventListener` and a cleanup, which is the code most likely to be forgotten in a component that is written quickly.'
			},
			code('src/lib/map/geolocation.svelte.ts', 28, 73),
			{
				type: 'p',
				text: '`createSubscriber` is the general form. Give it a function that starts listening and returns a stop function; call what it returns inside a getter; and the listening starts when the getter is first read inside an effect or a template, and stops when nothing reads it. The position watch starts when the map shows `geo.fix` and stops when the button is toggled off. That is the pattern for any subscription-shaped API — `BroadcastChannel`, `ResizeObserver`, a WebSocket, `document.visibilityState` — and it is why the `Geolocation` class has getters rather than being a store.'
			},

			{ type: 'h3', id: 'runed', text: 'Where runed comes in' },
			code('src/routes/(site)/explore/+page.svelte', 32, 50),
			{
				type: 'p',
				text: 'runed is a collection of the utilities the framework does not ship, written against runes by the Bits UI maintainers. The project uses one, `Debounced`, and the reason is the one from chapter 35: a debounce is fifteen lines that get a subtle bug, and one import that does not. The others most apps reach for are `useEventListener` (an event with automatic cleanup), `ElementSize` and `useResizeObserver` (an element’s box as state), `PersistedState` (a `$state` mirrored to storage — the theme class in this project is a hand-written one, because it also has to set a data attribute), `IsIdle`, `Previous`, and `FiniteStateMachine`. The line: if the framework ships it, use the framework’s; if runed has it and you would write more than ten lines, use runed’s; otherwise write it.'
			},

			{ type: 'h3', id: 'plain-map', text: 'When a plain `Map` is right' },
			code('src/lib/trip/Itinerary.svelte', 60, 69),
			{
				type: 'p',
				text: '`svelte/reactivity` also exports `SvelteMap`, `SvelteSet`, `SvelteDate` and `SvelteURL` — reactive versions of the built-ins, for state that is *mutated* over time and read by templates. The ESLint plugin and the autofixer suggest them whenever they see a `new Map()`, and three times in this project the suggestion is declined with a comment. The `Map` here is built whole inside a `$derived.by` and never mutated after: a reactive map would signal on every insert, for nobody, while the derivation is still running. The derivation itself is the reactive boundary; what happens inside it is plain JavaScript. The rule: `SvelteMap` for a map that lives across renders and changes; a plain `Map` for one that is computed and returned.'
			},
			{
				type: 'why',
				title: 'Why not a store',
				text: 'Every mechanism in this chapter used to be a store: `readable(() => …)` with a start function is `createSubscriber` with worse ergonomics; a `writable` in a module is a `$state` in a `.svelte.ts` file. Stores still work, and Svelte 5 still ships them, and a library that exports a store can be read with `$store` or `fromStore`. But they are a second reactivity system with a subscription API, and everything they did is now a rune or a class in `svelte/reactivity`. No file in this project imports `svelte/store`, and the waypoint library — which could have shipped stores for its `Route` — ships runes in a `.svelte.ts` file instead, which chapter 06 explains.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name three things `svelte/reactivity` and `svelte/reactivity/window` export and what each replaces.',
					'You can describe `createSubscriber`’s contract and give an API you would wrap with it.',
					'You can say when `SvelteMap` is right and when a plain `Map` inside a derivation is.'
				]
			}
		]
	}
];
