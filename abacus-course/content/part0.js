/**
 * PART 0 — What we are building, and why a spreadsheet
 * (chapters 01–03)
 *
 * Three chapters before any code that computes anything. The first says what
 * the product is and why a spreadsheet is the right thing to build in a course
 * about reactivity; the second walks the one file that configures the whole
 * framework; the third is a map — every feature of Svelte 5 and SvelteKit 3
 * this project uses, and the chapter where it earns its place.
 */

import { code } from './quote.js';

export const part0 = [
	{
		slug: 'what-we-are-building',
		title: 'What we are building',
		summary:
			'Abacus: a spreadsheet in the browser — a formula language, an engine that recalculates only what changed, a grid that scrolls a million rows, passkeys, live collaboration, and a container that deploys it.',
		goal: 'Understand what the finished product does, why a spreadsheet is the honest way to teach reactivity, and the rule every feature had to pass.',
		blocks: [
			{
				type: 'p',
				text: 'We are going to build **Abacus**: a spreadsheet. Type a number into a cell, type `=A1*2` into the next one, and the second cell follows the first. That is the whole idea, and it is older than the web: VisiCalc did it in 1979, and every reactive framework since — including the one this course is about — is a generalisation of it. A spreadsheet is a reactivity graph a person can *see*.'
			},
			{
				type: 'p',
				text: 'The six projects before this one each put a domain at their centre: a booking system, an exchange, a canvas, a query language, a groovebox. This one does too — but the domain *is* the framework’s own subject. When you have written a dependency graph by hand, with a dirty set and a topological sort and cycle detection, `$derived` stops being magic. Chapter 17 puts the two side by side and lets you edit either.'
			},

			{ type: 'h3', id: 'the-tour', text: 'The tour' },
			{
				type: 'ul',
				items: [
					'**A formula language.** A lexer, a Pratt parser, an evaluator, and fifty-odd functions from `SUM` to `VLOOKUP` — with Excel’s precedence (`-2^2` is 4), lazy arguments (`IF` evaluates one branch), and errors that are values.',
					'**An engine that recalculates only what changed.** Cells in a `Map`, edges recorded when a formula is parsed, Kahn’s algorithm over the dirty set, Tarjan for cycles, and reference rewriting when a row is deleted. Property-tested against a from-scratch evaluator.',
					'**A grid that scrolls a million rows.** Two-axis virtualisation on prefix sums, frozen panes, a fill handle, column resizing, and an ARIA grid keyboard model. Ten thousand cells on screen, one `$state` version number between them and the engine.',
					'**No account needed.** The local sheet lives in the browser’s private file system and two tabs on it stay in step over a `BroadcastChannel`.',
					'**Passkeys instead of passwords.** Real WebAuthn ceremonies, tested end to end on a virtual authenticator.',
					'**A second person editing beside you.** Operations over a `query.live`, presence chips, other people’s cursors on the grid.',
					'**CSV in and out.** A streaming parser in a Web Worker for import; a `ReadableStream` response for export.',
					'**Published sheets with no JavaScript**, prerendered templates, an embed that may be framed, and the multi-stage Dockerfile, migrations and CI that ship it.'
				]
			},
			{
				type: 'p',
				text: 'About nine thousand lines when it is finished, plus fifteen hundred of tests. Every line of it is quoted in this course from the real file, with its line numbers, so what you read is what the code says.'
			},

			{ type: 'h3', id: 'why-a-spreadsheet', text: 'Why a spreadsheet, specifically' },
			{
				type: 'p',
				text: 'Because it is the one application where the *reactivity* is the product. Three things are true of a spreadsheet at once, and each asks a different question of the framework.'
			},
			{
				type: 'ol',
				items: [
					'**The dependency graph is explicit and dynamic.** A formula names the cells it reads. Change the formula and the edges change. A framework’s `$derived` does exactly this — it discovers its dependencies by running — and building the same machinery by hand is the fastest way to understand what the framework is doing for you, and what it costs.',
					'**The state is big and mostly invisible.** A million rows exist; forty are on screen. Fine-grained reactivity on ten thousand visible cells is affordable; a signal per cell in a `Map` of a million is not. Chapter 15 is about that line and where to draw it.',
					'**Half of it is outside the framework.** The clipboard, a file input, a worker, the origin-private file system, a `BroadcastChannel`, the WebAuthn API, a streaming HTTP response. Most of what makes an application hard is the boundary between the framework and everything else, and a spreadsheet has more boundary than most.'
				]
			},
			{
				type: 'why',
				title: 'Why this is worth your time even if you never make a budget',
				text: 'Every application has a computation that depends on other computations, a list too long to render, a piece of state that must survive a reload, and a thing two people want to change at once. A spreadsheet is where those problems are concrete enough to see and small enough to solve completely. What you learn from the engine is what `$derived` does; what you learn from the grid is what every virtualised list does; what you learn from the live sheet is what every collaborative editor does.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape of it' },
			{
				type: 'terminal',
				code: `
   the browser                                      the server (adapter-node)
   ┌────────────────────────────────────┐           ┌────────────────────────────────┐
   │ Sheet ($state: version, selection) │  form     │ remote functions               │
   │  └ Engine (plain Map, no proxies)  │ ────────▶ │  ├ query      getSheet, getMine │
   │     └ parser ── evaluator          │  command  │  ├ form       create, setAccess │
   │ Grid (virtualised, ARIA grid)      │ ◀──────── │  ├ command    publish, send     │
   │ FormulaBar · Toolbar · CellEditor  │  live     │  └ query.live watchSheet        │
   │ CSV worker ── OPFS ── Broadcast    │ ◀━━━━━━━━ │ passkeys (WebAuthn) · sessions │
   │ LiveSheet (ops out, ops in)        │           │ SQLite: users, credentials,    │
   └────────────────────────────────────┘           │         sheets, ops, challenges│
                                                    └────────────────────────────────┘`
			},
			{
				type: 'p',
				text: 'The thing to notice is the top-left box. The `Sheet` is a class with a few `$state` fields; the `Engine` inside it is a plain `Map` with no reactivity at all. One number — `version` — is the whole contract between them. That decision, and why it is the right one for ten thousand cells, is the spine of the first half of the course.'
			},

			{ type: 'h3', id: 'what-we-will-not-build', text: 'What we are deliberately not building' },
			{
				type: 'ul',
				items: [
					'**Passwords.** A passkey is the account. Losing every device is losing the account, and the settings page says so and lets you add a second one.',
					'**Charts and conditional formatting.** Both are cell-value consumers, and the course already has a dozen of those. They are listed as directions at the end.',
					'**Operational transforms or CRDTs.** Two people editing one sheet is done with numbered operations and a server that orders them, which is what a spreadsheet needs and is the whole of chapter 28. Project 4 built the CRDT.'
				]
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what Abacus does in three sentences.',
					'You can say why the engine is a plain `Map` and what single `$state` value connects it to the grid.',
					'You know the rule every feature in the project had to pass: it had to be for something.'
				]
			}
		]
	},

	{
		slug: 'the-config',
		title: 'One file to configure everything',
		summary:
			'SvelteKit 3 keeps its whole configuration inside the Vite plugin. This chapter reads `vite.config.ts` top to bottom: what each option does, what it costs, and the one that is new to this project.',
		goal: 'Read a SvelteKit 3 config and know what every line is for — including server-side route resolution, which none of the earlier projects used.',
		blocks: [
			{
				type: 'p',
				text: 'There is no `svelte.config.js`. SvelteKit 3 moved every option into the `sveltekit()` plugin call in `vite.config.ts`, and the config is a *function* because it needs to read the environment before the build starts.'
			},
			code('vite.config.ts', 1, 33, { partial: true }),
			{
				type: 'p',
				text: '`defineConfig` comes from `vitest/config` rather than `vite`, so the `test` block at the bottom type-checks. `paths.origin` is read from the environment at *build* time: adapter-node 6 bakes it into the server, so a process started on plain HTTP behind a proxy does not reconstruct `https://…` from headers and reject every form post as cross-site. The passkey ceremonies use the same value’s hostname as the relying-party id, which is why chapter 03 makes it a `static` environment variable.'
			},

			{ type: 'h3', id: 'compiler', text: 'The compiler options' },
			code('vite.config.ts', 35, 53),
			{
				type: 'p',
				text: '`runes` is a function so that a dependency written in Svelte 4 style keeps compiling. `experimental.async` is the one that changes how you write components: `await` at the top of a `<script>`, inside `$derived`, and directly in markup — and with it `pending` snippets, `$effect.pending()`, `settled()` and `fork()`. A spreadsheet has more of this than it looks: opening a sheet, importing a file, publishing, signing in with a passkey — every one is “wait, then draw”.'
			},

			{ type: 'h3', id: 'adapter', text: 'The adapter, and the experiments' },
			code('vite.config.ts', 55, 89),
			{
				type: 'p',
				text: 'Project 6 wrote an adapter from scratch. This one deploys the way most Node applications do — `node build` behind a reverse proxy, in a container — and spends its deployment chapter on what makes that safe. `precompress` writes `.br` and `.gz` beside every asset so the server never compresses on the fly.'
			},
			{
				type: 'p',
				text: '`forkPreloads` is off, and the comment says why: two projects’ end-to-end suites found navigation failures that bisected to it. The evidence is in those suites, not in an opinion, and the criterion for turning it back on is named — one test, in one file.'
			},

			{ type: 'h3', id: 'csp', text: 'The Content Security Policy' },
			code('vite.config.ts', 91, 139),
			{
				type: 'p',
				text: '`mode: \'auto\'` uses hashes for prerendered pages — where the whole document is known at build time — and nonces for dynamically rendered ones. The directives that are specific to a spreadsheet are each explained in place. The one worth reading twice is `style-src \'unsafe-inline\'`: a virtualised grid positions ten thousand cells with `style:` attributes and column widths are numbers a person drags, and attributes cannot be hashed. The exposure is CSS injection, not script execution, and the comment says so rather than pretending the trade is free.'
			},

			{ type: 'h3', id: 'version', text: 'CSRF, versioning, bundling' },
			code('vite.config.ts', 140, 161),
			{
				type: 'p',
				text: 'Nobody else may POST here, so `trustedOrigins` is empty and stays empty until somebody can name a domain. `version.name` is the commit hash — deterministic, so two builds of the same code do not tell every open tab to reload for nothing — and `pollInterval` lets an open sheet notice a deploy and offer a reload while its edits are still saved.'
			},

			{ type: 'h3', id: 'router', text: 'The new one: server-side route resolution' },
			code('vite.config.ts', 163, 181, { partial: true }),
			{
				type: 'p',
				text: 'The other six projects resolve routes on the client: the route manifest ships to the browser and a click is matched locally. This one asks the server — `router.resolution: \'server\'` — which is the other half of the trade and worth seeing once. The manifest stays off the wire, and an unvisited path costs a round trip to resolve, which `data-sveltekit-preload-data="hover"` on the body hides for anything a pointer reaches first. The end-to-end suite has a test that navigates from the landing page to the templates page and asserts what it finds, which is the test that would fail if this option broke.'
			},

			{ type: 'h3', id: 'vite', text: 'Vite: workers, native modules, tests' },
			code('vite.config.ts', 183, 211, { partial: true }),
			{
				type: 'p',
				text: 'Three things that are Vite’s business rather than SvelteKit’s. The Phosphor plugin must come *after* `sveltekit()` because it parses its input as JavaScript and would die on the first `<h1>`. Workers are built as ES modules so the CSV importer can share the parser with the main thread instead of bundling a second copy. And libSQL is a native addon — a compiled `.node` binary — so it is kept out of the server bundle, where a bundler could inline the JavaScript that goes looking for it but not the binary.'
			},
			code('vite.config.ts', 213, 258, { partial: true }),
			{
				type: 'p',
				text: 'Two Vitest projects. `client` is a real Chromium, because the grid virtualises on measured sizes and jsdom has none. `server` is plain Node with `fileParallelism: false`, because SQLite allows exactly one writer and two spec files seeding the same file meet `SQLITE_BUSY` as a dozen unrelated failures.'
			},
			code('vite.config.ts', 262, 277),
			{
				type: 'checkpoint',
				items: [
					'You can say why `paths.origin` is a build-time value and what breaks if it differs at run time.',
					'You can explain the `style-src` trade in one sentence, including what it does not expose.',
					'You know what `router.resolution: \'server\'` buys and what it costs.'
				]
			}
		]
	},

	{
		slug: 'the-map',
		title: 'The map: every feature, and where it earns its place',
		summary:
			'A list of everything in Svelte 5 and SvelteKit 3 that Abacus uses — runes, snippets, attachments, remote functions, live queries, hooks, the environment layer, the September 2026 additions — and the chapter where each one is for something.',
		goal: 'Have a map of the framework as this project uses it, so you can read the course in any order and know what you are looking at.',
		blocks: [
			{
				type: 'p',
				text: 'This is the chapter to come back to. Each row is a feature, what it is *for* in Abacus, and where it lives. Nothing here is a demo; if you cannot find the row that names a feature, the project does not use it, and that is deliberate too.'
			},

			{ type: 'h3', id: 'svelte', text: 'Svelte 5' },
			{
				type: 'ul',
				items: [
					'**`$state`** — the sheet’s selection, title, version and editing state (ch. 15); toasts; every page’s local state. **`$state.eager`** is not used: nothing here reads a state in the same tick it was written and needs the old value.',
					'**`$derived` and `$derived.by`** — the grid’s geometry from scroll position and sizes (ch. 19); the formula bar’s coloured segments, the syntax error, the completion list (ch. 21); and, as *fields of a class*, the nine cells of the reactivity lesson (ch. 17). A `$derived` that a handler assigns to — the completion highlight, the find index — as a reset without an effect.',
					'**`$effect`** — exactly where a side effect is the point: scrolling the active cell into view, clearing flash highlights after a timer, applying a live message when `stream.current` changes, and tearing the live connection down (ch. 19, 33).',
					'**`$props` and `$bindable`** — every component; `bind:this` on a component to call its exported `insertAtCaret` (ch. 21).',
					'**Snippets with parameters** — the grid renders one `cell` snippet in five layers: the body, frozen rows, frozen columns, the frozen corner (ch. 19). `{@render extra?.()}` lets a page put its own buttons in the toolbar.',
					'**Attachments** — `{@attach cinematic()}` on the landing page (ch. 31); focusing an input on mount in the cell editor and find bar (ch. 21, 22).',
					'**Function bindings** — `bind:textContent={get, set}` on the editable title (ch. 32).',
					'**`bind:files`** with a `DataTransfer` to clear a file input so the same file can be chosen twice (ch. 22).',
					'**`<svelte:boundary>`** with `pending` and `failed` — around every `await` in markup, and around each reactive cell in the lesson so a cycle throws into a boundary instead of the page (ch. 17, 34).',
					'**`await` in markup and `{const x = $derived(await …)}`** — the workspace list, the settings profile, “who am I” in the header (ch. 30, 34).',
					'**`SvelteMap`/`SvelteSet`** — column widths, row heights and flash highlights, where fine-grained reactivity is wanted; a plain `Map` in the engine, where it is not (ch. 15).',
					'**`untrack`** — reading the initial `data` once so a later change cannot throw away edits (ch. 33).',
					'**`hydratable`** — the landing page’s random dots, computed once on the server and reused by the client so hydration does not repaint them (ch. 31).',
					'**`createSubscriber`** is not used; the live connection is a `query.live`, which does that job.'
				]
			},

			{ type: 'h3', id: 'kit', text: 'SvelteKit 3' },
			{
				type: 'ul',
				items: [
					'**The environment layer** — `defineEnvVars` in `src/env.ts`, with valibot schemas, a `public` flag you have to type, and a `static` variable that is inlined at build time (this chapter, below).',
					'**Remote functions** — `query` for reads, `form` for anything a page without JavaScript must still be able to do, `command` for everything else, and `query.live` for the collaboration stream (ch. 26–28). `requested(q, n).refreshAll()`, `withOverride`, `.for(id)`, `.preflight()`, `.enhance()`, `invalid(issue.field(…))`, and `redirect` from inside a form handler all appear where they are needed (ch. 27, 34).',
					'**Hooks from `@sveltejs/kit/hooks`** — `sequence`, a `preload` filter that names font files by source `filename`, a per-route Content Security Policy swap, `handleFetch`, `handleError` told apart by `kind`, `init`, `transport` (ch. 29).',
					'**Universal `load` that calls remote queries** — the sheet page (ch. 33); `csr = false` pages that ship no JavaScript (ch. 35); `prerender` with `entries()` for the templates (ch. 31).',
					'**A layout reset** — `+page@.svelte` for the embed, which must not inherit the app shell (ch. 35).',
					'**`+server.ts` handlers** — a streamed CSV response, a `QUERY` handler, a health check (ch. 35).',
					'**`$app/state`** — `page`, `navigating`, `updated`; the version poll that offers a reload after a deploy (ch. 30).',
					'**adapter-node 6** — `paths.origin` baked in, `SHUTDOWN_TIMEOUT`, `BODY_SIZE_LIMIT`, a Dockerfile that runs as `node` and migrates before it listens (ch. 38).'
				]
			},

			{ type: 'h3', id: 'september', text: 'What the September 2026 releases added, and where' },
			{
				type: 'ul',
				items: [
					'**`router.resolution: \'server\'`** — the config, and the navigation test that proves it (ch. 02, 37).',
					'**Fonts in the `preload` filter with their source `filename`** — `hooks.server.ts` names the two files the first paint needs (ch. 29).',
					'**`handleError` with `kind` and `issues`** — a validation failure logs the field path and answers with a plain message; only an `unknown` error gets a correlation id (ch. 29).',
					'**Hook types from `@sveltejs/kit/hooks`** — every hook file imports them from there, and the comment in `hooks.server.ts` says what silently goes wrong if you import them from `@sveltejs/kit` instead (ch. 29).',
					'**`query.live`** with `.current`, `.connected` and `.reconnect()` — the whole of chapter 28, and the reconnect button on the sheet page (ch. 33).',
					'**`requested(q, n).refreshAll()`** in a form handler — deleting a sheet from the workspace (ch. 27).'
				]
			},

			{ type: 'h3', id: 'env', text: 'The environment layer, since every chapter reads it' },
			code('src/env.ts', 12, 47, { partial: true }),
			{
				type: 'p',
				text: 'A variable not declared here cannot be imported — a type error at build time rather than an `undefined` in production three weeks later. `public: true` is something you have to type, so a secret cannot reach the browser by accident. `PUBLIC_ORIGIN` is `static`, and the comment gives the two reasons: the CSRF check and the passkey relying-party id both need build and run to agree.'
			},
			code('src/env.ts', 49, 68, { partial: true }),
			{
				type: 'p',
				text: 'Environment variables are always strings, and the place to turn one into a number is here — once — rather than in every file that reads it with a `Number()` and a hopeful default. The bounds are opinions with reasons attached, which is what a bound should be.'
			},

			{ type: 'h3', id: 'tooling', text: 'The toolchain' },
			code('package.json', 11, 30),
			{
				type: 'p',
				text: '`check` type-checks the app *and* the worker — the CSV importer runs where `window` does not exist, so it has its own `tsconfig.worker.json` with the WebWorker library instead of the DOM one. `verify` is the gate: type-check, lint, unit and browser tests, build, and the end-to-end suite on a desktop and a phone profile. Everything in this course passed it.'
			},
			code('tsconfig.json', 5, 33),
			{
				type: 'p',
				text: '`noUncheckedIndexedAccess` is the flag this project would choose if it could choose one. A spreadsheet is a grid of maybes — a row that may not exist, a token after the last token — and every one of those is a crash at runtime or a red squiggle now.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name, from memory, three Svelte 5 features and the chapter where each is used for something.',
					'You can say why `PUBLIC_ORIGIN` is `static: true` and `SESSION_SECRET` is not `public`.',
					'You know which file type-checks the worker and why it needs a different library.'
				]
			}
		]
	}
];
