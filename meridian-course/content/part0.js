/**
 * PART 0 — What we are building, and the ground it stands on
 * (chapters {{what-we-are-building}}–{{the-map-of-features}})
 *
 * Five chapters before any feature. The first says what the product is and
 * why a trip planner is the right thing to build in a course about a
 * framework *and its ecosystem*; the second walks the pnpm workspace; the
 * third, the tools around the code — the `sv` CLI, the checks, and the agent
 * beside you; the fourth reads the one file that configures everything; the
 * fifth is a map — every feature of Svelte 5 and SvelteKit 3 this project
 * uses, every library it reaches for, and the chapter where each earns its
 * place.
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
					'**An itinerary that survives a tunnel.** A service worker keeps the build and a copy of every page it serves, so a trip opened once reads again with no network — and the trip header says “Offline” instead of offering a Reconnect that cannot work. The copies were rendered for the person signed in, so they go when nobody is: on a shared device, the next person reads nothing.',
					'**Motion with rules.** A design brief lists what moves and what never does, and the code holds to it: one custom transition, a `Tween` for the tab indicator, `animate:flip` for a dropped card, CSS keyframes for dialogs — every one of them still when the system asks for reduced motion, and nothing animated that the brief says should simply appear.',
					'**A stream that keeps asking.** The live trip is authorised on every update, not once per connection: remove a companion, or make a trip private, and the next change stops at the server. The stop dialog is a history entry, so a phone’s back gesture closes it; a half-typed new trip survives a reload.',
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
        ▲ prerendered: /guides (mdsvex, csr=false), /api/world.json, places()
        ▲ service worker: the build and each page opened, kept for reading offline`
			},
			{
				type: 'p',
				text: 'The thing to notice is the top-left box. `TripState` is a class whose every field is `$derived` from one value: the latest snapshot the live query delivered, falling back to the snapshot the page was rendered with. Every library on the left reads from it, and every write on the right goes through a remote function that publishes to the room the live query listens on. There is no client-side cache to invalidate, because there is no client-side copy of the truth — only the last thing the server said.'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule every library had to pass' },
			{
				type: 'p',
				text: 'Before a package went into `package.json` it had to answer four questions, and chapter {{choosing-libraries}} records the answers for every one of them, including the ones that failed.'
			},
			{
				type: 'ol',
				items: [
					'**Does it work with Svelte 5 and SvelteKit 3 as of October 2026 — really, not “there is an open PR”?** Installed, type-checked, built, run in a browser test. Several well-known packages did not pass this, and the chapter names them.',
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
					'**A tile server, or a geocoder.** The map is a bundled atlas of coastlines and a hundred-place gazetteer in a JSON file. It is enough to plan a trip and it is honest about what it is; adding a tile provider is one `sources` entry and a CSP line, and chapter {{the-map}} says which.',
					'**An app you install, or one that writes offline.** The service worker in ch. {{the-offline-itinerary}} does one thing, for the one scenario the product names: reading a trip in a train tunnel. There is no web manifest, so there is nothing to install, and a change made with no network fails as it would without a worker — queuing writes against a document two people edit live needs a conflict policy first, and ch. {{what-i-would-do-next}} keeps it on the list.'
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
		goal: 'Read the workspace configuration and know why the app depends on its own library the way a stranger would, and what pnpm 12 refuses to do until you say so.',
		blocks: [
			{
				type: 'p',
				text: 'The first seven projects were single packages. This one is a **workspace**: the SvelteKit app at the root, and a library in `packages/waypoint` that the app depends on as if it had downloaded it from the registry. That is not an affectation. A library that is only ever imported by relative path is never really tested as a library; the first outside consumer finds the missing `exports` entry, the `.ts` import that should have been `.js`, the type that was never emitted. Making the app the first consumer finds all of that on every build.'
			},
			code('pnpm-workspace.yaml', 1, 51),
			{
				type: 'p',
				text: 'Five settings, each a decision. `packages` names the folders. `allowBuilds` is pnpm’s answer to supply-chain attacks through install scripts (and pnpm 12 fails the install on a key in this file it does not recognise, so every setting here is one it checks): a dependency’s `postinstall` does not run unless you name the package, so a compromised transitive package cannot run code on your machine by being installed. esbuild needs its script to unpack a platform binary, and Vite needs esbuild; nothing else in this tree is allowed to run anything. `minimumReleaseAgeExclude` is the other half of the same policy — pnpm can refuse versions published less than some number of days ago, so a malicious release has time to be noticed and pulled before it reaches you, and this list is the five versions we deliberately took inside that window — each the release that made the toolchain line up — named so the policy lets exactly them through. `peerDependencyRules` is the one setting that exists because of the move to SvelteKit 3. runed 0.37.1 declares `@sveltejs/kit` as an *optional* peer at `^2.21.0` and has not widened the range past 2 yet; it reads only `$app/state`, which did not change in Kit 3, and the end-to-end suite proves it against 3.1.0, so `allowedVersions` tells pnpm that a 3 satisfies that peer and `pnpm peers check` stays clean. The line is deleted the day the library’s release notes say “SvelteKit 3”, and the check is what says when — as it did for Better Auth, whose rule went with 1.7.10, which declares `^2.0.0 || ^3.0.0`. A rule like this is never written to make a warning go away; it is written when the warning has been investigated and found to be noise, and the comment above it has to say so. `permissions` is the newest of the five. pnpm 12.11 added agent skills — instructions for a coding agent that a package ships — as a second thing a dependency may ask to do, beside running a script: pnpm links them into the project’s skill directories only once a person approves the package by name, and `pnpm permissions list` shows what is waiting. `@tanstack/svelte-table` 9.3 is the first dependency here to ship some, and the answer recorded is `skills: false`: an agent working in this repository should be steered by `AGENTS.md` and the code, not by whatever a dependency bundles, and a recorded denial stops pnpm offering the same package on every install.'
			},
			{
				type: 'p',
				text: '`allowBuilds` in this shape — a map of package names to `true` — is also what `sv add` writes when an add-on brings a dependency that needs its install script. The add-ons use a helper from `@sveltejs/sv-utils`, `pnpm.allowBuilds`, which asks the project’s own `pnpm --version` and writes this map on version 11 and later — moving any older `onlyBuiltDependencies` list into it — and the list on versions before that.'
			},
			{
				type: 'note',
				text: 'If you have never seen `allowBuilds` fail: run `pnpm install` on a fresh clone with it removed and watch pnpm list the packages that *wanted* to run scripts and were not allowed to. That list is worth reading once. Most of it is telemetry.'
			},
			{
				type: 'note',
				text: 'The Svelte compiler has a supply-chain check of its own. Unicode has invisible characters that reverse the direction text is displayed in, and a line containing them can read one way in an editor or a review and run another way — the attack is called Trojan Source. The compiler warns when one appears in a component’s markup text or inside a string or template literal, as `bidirectional_control_characters`: “A bidirectional control character was detected in your code. These characters can be used to alter the visual direction of your code and could have unintended consequences”. Because `check` fails on warnings, a contribution carrying one there fails `verify` before anybody has to spot it. It does not look inside comments — where Trojan Source often hides — so the check narrows the attack rather than closing it, and review still matters.'
			},

			{ type: 'h3', id: 'the-scripts', text: 'The scripts' },
			code('package.json', 11, 35, { partial: true }),
			{
				type: 'p',
				text: 'The order of operations is the whole story of this file. `prepare` runs after `pnpm install`, and it does three things the app cannot start without: it builds the library (`package`), so `@meridian/waypoint` resolves to real files in `packages/waypoint/dist`; it compiles the messages (`i18n`), so `#lib/paraglide/messages.js` exists to be imported; and it runs `svelte-kit sync`, so the generated types exist — the only command the `svelte-kit` binary has, and the one that writes `.svelte-kit/types` and the base tsconfig the project extends (ch. {{the-config}}). `.svelte-kit` is SvelteKit’s `outDir`, everything in it is regenerated, and `.gitignore`, `.prettierignore` and the tsconfig’s `exclude` all leave it out. The `|| echo ""` on the end is for the one situation where any of those fails on purpose — a Docker build that installs dependencies before it copies the source — and chapter {{deploying}} shows the Dockerfile running the three steps itself, explicitly, once the source is there.'
			},
			{
				type: 'p',
				text: '`build` and `dev` both start with `build:element`: the standalone custom element is a second Vite build into `static/embed`, and it has to exist before SvelteKit copies `static/` into the output. `check` compiles the messages first for the same reason `prepare` does, then type-checks the whole project with no warning silenced and `--fail-on-warnings`, so a warning stops it as surely as an error (ch. {{the-toolchain}} goes through every flag `svelte-check` takes). (It used to pass one flag to quieten the custom element; chapter {{embedding-a-trip}} says why the element stopped needing it.) `verify` is the whole gate — type-check; lint, which ends by checking every colour pair in the tokens for contrast (chapter {{the-design-system}}); the Svelte autofixer over every component, `lint:svelte` (chapter {{the-toolchain}}); unit and browser tests; the production build; the bundle guard, which reads what that build produced (chapter {{end-to-end}}); the end-to-end suite — and CI runs exactly that command, so what is green locally is green there. The three `node scripts/…` steps run TypeScript directly: Node 24 strips the types, so a script needs no build step and no runner of its own — and `erasableSyntaxOnly` in the tsconfig (ch. {{the-config}}) keeps every script written in the TypeScript that stripping can run.'
			},

			{ type: 'h3', id: 'dependencies', text: 'What is in the box' },
			code('package.json', 72, 108, { partial: true }),
			{
				type: 'p',
				text: 'Forty-odd dependencies is more than any earlier project, and every one is here because a chapter needed it. The one to look at now is `"@meridian/waypoint": "workspace:*"` — the protocol tells pnpm to link the folder rather than fetch a tarball, and to replace the specifier with the real version if this package were ever published. The `imports` map at the bottom is Node’s subpath-imports feature: `#lib/...` resolves to `src/lib/...` in Node, in Vite and in TypeScript alike, which is why this project has no `$lib` alias and no `paths` in its tsconfig. (SvelteKit 3 no longer generates `$lib` at all; `#lib` is the standard it points you to, extensions and all.)'
			},
			code('.npmrc', 1, 1),
			{
				type: 'p',
				text: 'One line, and an honest one. `engines` pins Node 24 — the current LTS at the time of writing, and what `.nvmrc` and the Dockerfile use — but `engine-strict=false` lets a machine on the previous LTS install and run with a warning rather than a wall. The features the project needs from Node 24 are conveniences, not requirements, and a course that refuses to start on last year’s Node is a course fewer people finish.'
			},
			{
				type: 'terminal',
				code: `
$ corepack enable            # pnpm 12.14.0, pinned by "packageManager"
$ pnpm install               # installs both packages, then runs prepare:
                             #   svelte-package → packages/waypoint/dist
                             #   paraglide-js compile → src/lib/paraglide
                             #   svelte-kit sync → .svelte-kit/types
$ cp .env.example .env       # DATABASE_URL, PUBLIC_ORIGIN, BETTER_AUTH_SECRET
$ node scripts/migrate.ts && node scripts/seed.ts
$ pnpm run dev               # builds the element, then vite dev on :5173`
			},

			{ type: 'h3', id: 'the-editor', text: 'The editor, and the line that rebuilds the tooling' },
			code('.vscode/extensions.json', 1, 3),
			{
				type: 'p',
				text: 'Three recommendations, and VS Code offers to install them when the folder is opened: the Svelte extension, which runs the same language server `svelte-check` does; ESLint; and Prettier. They come from three places — `sv create` writes the first, the `prettier` and `eslint` add-ons each add theirs — and they are the editor half of the commands in `package.json`, so a red squiggle and a failed `pnpm run verify` mean the same thing. This workspace was written by hand, file by file, but its tooling is one command away: ch. {{the-toolchain}} gives the `sv create` line that reproduces it, and reads every file that line writes.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `workspace:*` does and why the app depends on the library that way.',
					'You can say which packages are allowed to run install scripts, and why the default is none.',
					'You know the three things `prepare` builds and why the app cannot start without them.',
					'You can say which folders are generated and what writes each of them.'
				]
			}
		]
	},

	{
		slug: 'the-toolchain',
		title: 'The toolchain: sv, the checks, and the agent beside you',
		summary:
			'The tools around the code. The `sv` CLI that scaffolds a project and adds integrations to it, and the one line that reproduces this project’s tooling; `svelte-check` and every flag worth knowing; ESLint and Prettier; and the Svelte AI tools — instructions, an MCP server, skills and a subagent — with a script that runs the autofixer over every component on every build.',
		goal: 'Know what `sv create`, `sv add` and `sv check` do and which of their flags matter, read the lint, format and check configuration and say why each piece is there, and set up an editor or an agent so that what it writes is checked the way this project checks its own code.',
		blocks: [
			{
				type: 'p',
				text: 'The previous chapter walked the workspace; this one walks the tools that work *on* it. None of them is in the app a traveller downloads. All of them decide what reaches it: the CLI that would have written the first version of half these files, the checker that refuses a warning, the linter and formatter that keep every file in one style, and the AI tools that let an agent write Svelte 5 the way this course does rather than the way the internet did in 2022.'
			},

			{ type: 'h3', id: 'sv', text: '`sv`, the command line' },
			{
				type: 'p',
				text: '`sv` is Svelte’s CLI: it creates projects, adds integrations to them, runs migrations and checks the code. The documentation’s advice is to run it through your package manager’s runner — `npx sv <command>`, or `pnpm dlx sv <command>` for pnpm — and it says what that does: “If you’re inside a project where `sv` is already installed, this will use the local installation, otherwise it will download the latest version and run it without installing it.” The download is what you want for `sv create`, before there is a project to install into. Inside a project, the local installation is what you want, which is why `sv` is one of this project’s devDependencies, beside `@sveltejs/mcp` (the AI tools, later in this chapter). Everybody who clones it runs the same version, `pnpm exec sv` runs it without downloading anything, and an upgrade is a line in `package.json` that a reviewer can see.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm add -D sv @sveltejs/mcp    # exact versions recorded in pnpm-lock.yaml
$ pnpm exec sv --version
1.1.1
$ pnpm exec sv --help             # create · add · migrate · check · help`
			},
			{
				type: 'note',
				text: 'When `npx sv` seems to do nothing, the CLI’s FAQ names the usual causes: some package managers prefer a locally installed tool to the registry, the name `sv` collides with runit’s `sv` on some Linux systems, and Windows PowerShell has a built-in alias `sv` for `Set-Variable`. `pnpm exec sv` in a project that has it installed sidesteps all three.'
			},

			{ type: 'h3', id: 'sv-create', text: '`sv create`' },
			{
				type: 'p',
				text: '`sv create [options] [path]` scaffolds a SvelteKit project. Run it bare and it asks its questions one at a time; every question also has a flag, so the same project can come from one line in a script or a README. The flags, as `sv create --help` lists them in 1.1.1:'
			},
			{
				type: 'ul',
				items: [
					'**`--template <type>`** — `minimal` (barebones), `demo` (a word game that works without JavaScript), `library` (a package built with `svelte-package`, the shape `packages/waypoint` has), or `addon` (a community add-on for `sv` itself, ready to test and publish).',
					'**`--types ts`**, **`--types jsdoc`** or **`--no-types`** — TypeScript files and `lang="ts"`, JSDoc comments checked by the same compiler, or no type checking at all, which the documentation marks “Not recommended!”.',
					'**`--add <addon...>`** and **`--no-add-ons`** — add-ons to apply as part of the create, in the same syntax as `sv add` below, or no add-on prompt at all. The help is explicit that the two “cannot be used together”.',
					'**`--install <package-manager>`** and **`--no-install`** — install with npm, yarn, pnpm, bun or deno (1.1.1 also lists `pnpm-rush`, `nub` and `aube`), or do not install.',
					'**`--no-dir-check`** — scaffold into a folder that is not empty without asking first.',
					'**`--no-download-check`** — do not warn before downloading a community add-on. Leave it off; the next section says why.',
					'**`--addon-name <name>`** — the package name for `--template addon`, as `@<org>/<pkg>` or `<pkg>`.',
					'**`--from-playground <url>`** — create a project from a Svelte playground URL: the CLI downloads its files, detects the dependencies they import, and lays them out as a SvelteKit project.'
				]
			},

			{ type: 'h3', id: 'the-one-line', text: 'The line that reproduces this project’s tooling' },
			{
				type: 'p',
				text: 'Meridian was written by hand, file by file, the way the chapters describe. Its *tooling*, though, is exactly what `sv` would have written, and the two commands below reproduce it — every add-on, with the options this project would have chosen. They were run against `sv` 1.1.1 while this chapter was written, and the add-on line of the `AGENTS.md` they produce is the same, character for character, as the one this project carries.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm dlx sv@1.1.1 create meridian --template minimal --types ts \\
    --add experimental="features:async,remoteFunctions" prettier eslint \\
          vitest="usages:unit,component" playwright="demo:no" \\
          sveltekit-adapter="adapter:node" drizzle="database:sqlite+client:libsql" \\
          better-auth="demo:none" mdsvex paraglide="languageTags:en,de,pt-br+demo:no" \\
          ai-tools="ide:claude-code+delivery:tools+tools:mcp+mcpSetup:remote" \\
          enhanced-img \\
    --install pnpm
$ cd meridian
$ pnpm exec sv add ai-tools="ide:claude-code+delivery:plugin" --no-git-check`
			},
			{
				type: 'p',
				text: 'The options use one small syntax, which `sv add --help` spells out: `<addon>=<opt>:<val>` sets one option, `+` joins several (`database:sqlite+client:libsql`), a comma separates the values of a multi-select (`languageTags:en,de,pt-br`), and `<opt>:none` is an explicit empty choice — `better-auth="demo:none"`, because this project writes its own sign-in pages (ch. {{signing-in-and-up}}). The help adds the rule that makes a line like this one useful in a script: “To skip prompts, explicitly set ALL options”. And when you do answer the prompts by hand, `sv` prints the equivalent line at the end, under “To skip prompts next time, run:”, so the interactive run can be written down afterwards.'
			},
			{
				type: 'p',
				text: '`ai-tools` appears twice because it takes one `delivery` per run. The first run writes the individual tools this project keeps as files — the instructions in `AGENTS.md` and the MCP configuration — and the second adds the Claude Code plugin, which is what `.claude/settings.json` enables. The first run deliberately leaves out the `svelte-file-editor` subagent: the plugin brings its own, and `sv` itself refuses to let both stand quietly — run the plugin delivery over a project that already has `.claude/agents/` and it prints “Claude Code: the Svelte plugin is enabled and .claude/agents also exists - remove it (or disable the plugin) to avoid duplicate skills/sub-agents.” `--no-git-check` on the second run, because the first has just written every file and nothing is committed yet: the prompt it skips is there to stop you running an add-on over work you have not saved. The record of what was added is the top of `AGENTS.md`:'
			},
			code('AGENTS.md', 1, 6),
			{
				type: 'p',
				text: 'Line 6 is the roll-call `sv` writes, in its order. Lines 3 to 5 were rewritten by hand, because the scaffold can only know “TypeScript” and the package manager, and an agent reading this file should know the versions this project pins and why a peer warning is allowed.'
			},

			{ type: 'h3', id: 'sv-add', text: '`sv add`, and what each add-on wrote' },
			{
				type: 'p',
				text: '`sv add` applies add-ons to a project that already exists: `pnpm exec sv add` asks which, `pnpm exec sv add prettier eslint` does not. Three of its options matter. **`-C, --cwd <path>`** points it at another project root — in this workspace, `pnpm exec sv add -C packages/waypoint …` would apply an add-on to the library rather than the app. **`--no-git-check`** skips the prompt about uncommitted changes. **`--install <package-manager>`** / **`--no-install`** behave as in `sv create`.'
			},
			{
				type: 'p',
				text: 'Every add-on is a set of file edits, and the useful way to know one is to know which files it touches and where in this course those files are read. This is what each of the fourteen add-ons in `sv add --help` writes into a fresh `--template minimal` project, recorded by running each one alone:'
			},
			{
				type: 'ul',
				items: [
					'**`experimental`** (`features:async,remoteFunctions`) — two flags in `vite.config.ts`: `compilerOptions.experimental.async` and `experimental.remoteFunctions`. Ch. {{the-config}}, and the remote functions from ch. {{remote-functions-the-reads}}.',
					'**`prettier`** — `prettier.config.js`, `.prettierignore`, a recommendation in `.vscode/extensions.json`, and scripts in `package.json`. Below.',
					'**`eslint`** — `eslint.config.js`, its own editor recommendation, and scripts in `package.json`. Below.',
					'**`vitest`** (`usages:unit,component`) — the `test` block with a browser project and a Node project in `vite.config.ts`, and example specs. Ch. {{unit-and-browser-tests}}.',
					'**`playwright`** (`demo:no`) — `playwright.config.ts` and one spec. Ch. {{end-to-end}}.',
					'**`sveltekit-adapter`** (`adapter:node`) — `adapter: adapter()` inside `sveltekit()`. Ch. {{deploying}}.',
					'**`drizzle`** (`database:sqlite+client:libsql`) — `drizzle.config.ts`, `src/lib/server/db/index.ts` and `schema.ts`, `src/env.ts`, `.env` and `.env.example`. Ch. {{the-database}} and ch. {{environment-and-hooks}}.',
					'**`better-auth`** (`demo:none`, and it needs `drizzle`) — `src/lib/server/auth.ts`, `src/lib/server/db/auth.schema.ts`, a `handle` in `src/hooks.server.ts`, and its variables in `src/env.ts`. Ch. {{identity-with-better-auth}}.',
					'**`mdsvex`** — `preprocess` and `extensions` inside `sveltekit()`. Ch. {{guides-prerendered-with-mdsvex}}.',
					'**`paraglide`** (`languageTags:en,de,pt-br+demo:no`) — `project.inlang/settings.json`, `messages/*.json`, the Vite plugin, `reroute` in `src/hooks.ts`, a `handle` in `src/hooks.server.ts`, and `lang` in `app.html`. Ch. {{three-languages-with-paraglide}}.',
					'**`enhanced-img`** — `enhancedImages()` in the plugin list, before `sveltekit()`. Ch. {{the-design-system}}.',
					'**`ai-tools`** — with `delivery:tools`, `AGENTS.md`, `.claude/CLAUDE.md`, `.mcp.json` and `.claude/agents/svelte-file-editor.md`; with `delivery:plugin`, `.claude/settings.json`. The last section of this chapter.',
					'**`storybook`** — not added: `.storybook/`, a `src/stories` folder of examples and its own scripts. Ch. {{choosing-libraries}} says why two components do not need a second build system.',
					'**`tailwindcss`** — not added: a Vite plugin, `src/routes/layout.css` and editor settings. Every colour, space and radius here is a token in `tokens.css` (ch. {{the-design-system}}), and the styled component kits built on Tailwind were declined in ch. {{choosing-libraries}} for the same reason.'
				]
			},
			{
				type: 'p',
				text: 'One thing the list does not show: an add-on writes the version ranges it was released with. On the day this was checked, the `vitest` add-on wrote `"vitest": "^4.1.8"` into `package.json`, and this project runs Vitest 5. The add-on gets you a working setup; keeping it current is still your job, and ch. {{choosing-libraries}} dates every version for that reason.'
			},
			{
				type: 'p',
				text: '**Community add-ons** are npm packages that follow the same contract. `sv add @supacool` installs the package `@supacool/sv` (a package named `sv` under a scope can be shortened to the scope), `sv add file:../my-addon` runs one from a folder, and authors tag them with the keyword `sv-add` so they can be found. Each comes with a warning the documentation prints in a box: “Svelte maintainers have not reviewed community add-ons for malicious code!” An add-on is code that rewrites your files and adds dependencies, run with your permissions, so the question to ask is the one `allowBuilds` asks of an install script (ch. {{the-workspace}}): have you read it? `--no-download-check` exists to silence the warning in a script whose add-ons you have already reviewed, and for nothing else. Writing your own — `sv create --template addon`, `defineAddon` from `sv`, the `sv/testing` helpers, publishing with `sv` as a peer dependency — is how you would give the eight projects in this series one shared setup; it is a project of its own, and this course leaves it there.'
			},
			{
				type: 'why',
				title: 'How an add-on can write into `sveltekit()` at all',
				text: 'SvelteKit 3 keeps its whole configuration in the `sveltekit()` call in `vite.config.ts` (ch. {{the-config}}), and an add-on has to edit that call without breaking whatever is already there. It does not use string replacement. The add-ons are built on `@sveltejs/sv-utils`, whose `svelteConfig.edit` parses the config, finds the options wherever they live, and lets the add-on “address options by name” while “the helper writes each one to the right place”: Svelte-level options (`compilerOptions`, `preprocess`, `extensions`) sit on the object, and everything else (`adapter`, `files`, `typescript`, …) is a kit option, flattened onto the same `sveltekit()` argument. The same package owns the pnpm detail from ch. {{the-workspace}}: `pnpm.allowBuilds` asks the project’s own `pnpm --version` and writes the unified `allowBuilds` map on version 11 and later, the old `onlyBuiltDependencies` list before that.'
			},

			{ type: 'h3', id: 'integrations', text: 'Preprocessors and plugins' },
			{
				type: 'p',
				text: 'The integrations page of the SvelteKit documentation names three kinds of thing that plug in, and this project has an opinion on each. **`vitePreprocess`** handles `<style lang="scss">` and friends (`style`, on by default) and TypeScript that emits code (`script`, off by default); this project has neither — vanilla CSS needs no preprocessor, and “TypeScript is supported natively in Svelte 5”, as long as you do not use the features that emit code, which ch. {{the-config}} makes a compiler error with `erasableSyntaxOnly`. **`svelte-preprocess`** adds Pug, Babel and global styles; nothing here needs them. **Vite plugins** are the third kind, and this project has five, read in order in ch. {{the-config}}: `enhancedImages()`, `sveltekit()` itself, Paraglide, the Phosphor optimiser and the project’s own `bundleStats()`. mdsvex is not among them: it is a preprocessor, passed to `sveltekit()` as `preprocess`.'
			},

			{ type: 'h3', id: 'sv-check', text: '`sv check`, which is `svelte-check`' },
			{
				type: 'p',
				text: '`sv check` runs `svelte-check`, and its help says so in one line: “All svelte-check [options] are available in sv check [options]”. It type-checks the TypeScript in `.svelte` files, `.svelte.ts` modules and plain `.ts` alike, and it reports the Svelte compiler’s warnings — unused CSS, accessibility hints, deprecated syntax — which `tsc` cannot see. The project calls it directly, as `svelte-check`, because it is a devDependency and the scripts are the documentation:'
			},
			code('package.json', 20, 23),
			{
				type: 'p',
				text: 'The flags `svelte-check` 4.7.7 accepts, apart from `--color`, `--no-color`, `--version` and `--help`, and what this project does with each:'
			},
			{
				type: 'ul',
				items: [
					'**`--tsconfig <path>`** — check exactly the files the tsconfig’s `include` and `exclude` select, TypeScript and JavaScript errors included. Used: `./tsconfig.json`, whose explicit lists keep the checker out of `build/` and `packages/` (ch. {{the-config}}) — and out of `src/service-worker`, which has a tsconfig of its own. That one is checked by the line’s last command, `tsc -p src/service-worker`, rather than by a second `svelte-check --tsconfig`: a folder with no `.svelte` file in it makes `svelte-check` warn that it was given nothing to do, and here a warning fails the check. Plain TypeScript is `tsc`’s job (ch. {{the-offline-itinerary}}).',
					'**`--fail-on-warnings`** — “Will also exit with error code when there are warnings.” Used on both scripts; the why block below says why.',
					'**`--compiler-warnings "code:behaviour,…"`** — per compiler warning code, `ignore` or `error`: `"css_unused_selector:ignore,a11y_missing_attribute:error"` in the documentation’s example. Not used. A warning that is wrong for one line is answered on that line or fixed; silencing a code project-wide hides the same mistake everywhere else. The project once carried one of these for its custom element, and ch. {{embedding-a-trip}} says why it no longer needs it.',
					'**`--diagnostic-sources "js,svelte,css"`** — which of the three checkers run; all three by default. Not used.',
					'**`--threshold warning|error`** — `error` prints only errors. Not used: every warning fails the check here, so every warning should be on the screen.',
					'**`--output human|human-verbose|machine|machine-verbose`** — how to print. `machine` is one record per line, a timestamp and a type — `START` with the workspace, an `ERROR` or `WARNING` with the file, `line:column` and the message, `COMPLETED` with the totals, `FAILURE` if the checker itself crashed — and `machine-verbose` makes each diagnostic a line of JSON with its start, end, code and source. That is the format a CI step would turn into annotations on a pull request.',
					'**`--watch`** and **`--preserveWatchOutput`** — keep running and re-check on every change; do not clear the screen between runs. `check:watch` uses the first.',
					'**`--incremental`** and **`--tsgo`** — the two newest: cache the Svelte-to-TypeScript translation on disk between runs (in `.svelte-kit`), or hand the TypeScript diagnostics to `tsgo`, the Go port of the compiler that is to become TypeScript 7 (`--tsgo-experimental-api` is the same through an API the help calls experimental). Not used: a full check of this project takes about thirteen seconds, and `AGENTS.md` says why this toolchain stays on TypeScript 6 for now.',
					'**`--config <path>`** — the Vite config to read, for a project whose config file has another name or place. Not needed: `vite.config.ts` at the root is where it looks.',
					'**`--workspace`**, **`--ignore`** and **`--no-tsconfig`** — declined. `--no-tsconfig` checks only `.svelte` files and skips every `.ts` file, and `--ignore` only works together with it; the tsconfig is the better list of what to check, and it is the same list the editor uses.'
				]
			},
			{
				type: 'terminal',
				code: `
$ pnpm exec svelte-check --tsconfig ./tsconfig.json --fail-on-warnings --output machine-verbose
1792279050921 START "/home/user/ultimate-svelte-kit-3/meridian"
1792279050946 COMPLETED 7706 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`
			},
			{
				type: 'why',
				title: 'Why a warning fails the check',
				text: 'Because a warning that does not fail anything is a warning nobody reads. The project has no `svelte-ignore` comments at all, so every warning the compiler gives is either a mistake or a sign the compiler knows something the author did not, and both are worth stopping for. On `check:watch` the flag changes nothing you can see — a watching process never exits — and it is there so the two `svelte-check` runs differ by `--watch` and nothing else. The one warning a person is most likely to meet by surprise is `bidirectional_control_characters`, and ch. {{the-workspace}} says why that one in particular should stop a build.'
			},

			{ type: 'h3', id: 'lint-and-format', text: 'Lint and format' },
			code('eslint.config.js', 1, 41),
			{
				type: 'p',
				text: 'Lines 1 to 35 are what `sv add eslint prettier` writes, unchanged; the last block is this project’s. Read top to bottom. `includeIgnoreFile` makes `.gitignore` the list of what not to lint, so a generated folder is ignored the day it is ignored by git. Then three recommended sets — JavaScript, TypeScript, Svelte — and two that switch rules *off*: `eslint-config-prettier` turns off every stylistic rule that would fight the formatter, and `svelte.configs.prettier` does the same for the Svelte plugin’s. `no-undef` is off on typescript-eslint’s own advice, because the TypeScript compiler already knows which globals exist and the lint rule does not. The block for `**/*.svelte` and `**/*.svelte.ts` is the important one: `projectService: true` gives the parser the project’s real type information, through the same TypeScript language service an editor uses, so type-aware rules work inside `<script lang="ts">` and in rune modules. `extraFileExtensions` tells it `.svelte` is a source file, and `parser: ts.parser` is the parser for the script inside it.'
			},
			{
				type: 'p',
				text: 'The last block is a decision. `svelte/prefer-svelte-reactivity` asks for `SvelteMap` and `SvelteSet` wherever it sees `new Map()` and `new Set()`, which is right in a component and noise in a test that builds a fixture. Ch. {{reactivity-utilities}} draws the line for application code.'
			},
			code('prettier.config.js', 1, 11),
			{
				type: 'p',
				text: 'This one is exactly what the `prettier` add-on writes: tabs, single quotes, no trailing commas, a hundred columns, and the Svelte plugin. The values matter less than having them in a file: nobody argues about formatting in a review when a command decides it.'
			},
			code('.prettierignore', 1, 18),
			{
				type: 'p',
				text: 'The add-on writes a short list of lockfiles and static folders; this one is longer because it doubles as the map of everything in the project that a tool writes — the build, SvelteKit’s generated types, the end-to-end reports, the compiled messages, the library’s output, and the files the inlang SDK drops beside its settings. If a folder is in this list, do not edit it by hand: whatever writes it will write it again. `pnpm run lint` runs `prettier --check`, then ESLint, then the contrast check from ch. {{the-design-system}}; `pnpm run format` rewrites everything Prettier would complain about.'
			},

			{ type: 'h3', id: 'the-agent', text: 'The agent beside you' },
			{
				type: 'p',
				text: 'A language model trained on the public web has read far more Svelte 4 than Svelte 5, and far more SvelteKit 1 than 3. Asked for a component, it reaches for Svelte 4’s `export let` and `on:click`, a store where a rune belongs, an effect where a derived belongs. The Svelte team’s answer is four tools, “designed to work together, but each can be used individually”: **instructions** that are always in the agent’s context, an **MCP server** with the documentation and a static analyser, **skills** that load on demand, and a **subagent** that does Svelte work in a context window of its own. This project has all four: the instructions and the MCP configuration as committed files, the skills and the subagent through the plugin.'
			},
			code('AGENTS.md', 10, 32),
			{
				type: 'p',
				text: 'The instructions are the documentation’s recommended prompt, word for word: which tools exist and when to call them. They live in `AGENTS.md`, the file most agents read, and Claude Code reads them through a one-line import:'
			},
			code('.claude/CLAUDE.md', 1, 1),
			code('.mcp.json', 1, 8),
			{
				type: 'p',
				text: 'The **MCP server** comes in two forms. This file names the remote one, `https://mcp.svelte.dev/mcp`, which needs nothing installed and of which the documentation says “The Svelte team does not log, store, or inspect code sent to the remote server.” The local one is the `@sveltejs/mcp` package, started as `npx -y @sveltejs/mcp`, which runs the version your lockfile records — its autofixer works offline, while `list-sections` and `get-documentation` still fetch the documentation index from svelte.dev when they run; each client’s setup is a page of the AI documentation. Its four **tools** are the four in `AGENTS.md`: `list-sections` and `get-documentation` for the documentation, `svelte-autofixer` for static analysis, and `playground-link` for an ephemeral playground URL. It also offers a **resource**, `doc-section` — any documentation page attached to a conversation by the person, as `svelte://<slug>.md` — and a **prompt**, `svelte-task`, which a person picks to tell the model how to use the rest.'
			},
			code('.claude/settings.json', 1, 13),
			{
				type: 'p',
				text: 'This file is the **Claude Code plugin**, committed. The `ai-tools` documentation describes what it does: “the first time you open the project you’ll be asked to trust the workspace, then it installs automatically (no `/plugin install` needed)”. The plugin brings the local MCP server, the skills and the subagent, and keeps them up to date. Without the committed file, the same plugin is two commands inside Claude Code: `/plugin marketplace add sveltejs/ai-tools`, then `/plugin install svelte`. The documentation lists the plugin for Claude Code and OpenCode (`@sveltejs/opencode`); every other client gets the individual tools. The `ai-tools` add-on takes four options: `ide` (`claude-code`, `cursor`, `gemini`, `opencode`, `vscode` or `other`), `delivery` (`plugin` or `tools`), `tools` (which individual tools, when not using the plugin) and `mcpSetup` (`local` or `remote`).'
			},
			{
				type: 'p',
				text: 'The **subagent**, `svelte-file-editor`, comes with the plugin rather than as a file in the project — the duplicate `sv` warns about above. One thing remains doubled, and it is worth knowing: in Claude Code the plugin’s local MCP server and the remote one named in `.mcp.json` both appear. They answer the same questions; the remote entry is kept for the clients the plugin does not cover. Its body tells it to fetch documentation, edit, run the autofixer and repeat until nothing is left. The point of a subagent is the separate context window: the documentation it reads and the autofixer rounds it goes through stay in its own conversation, and the main agent gets back the finished file and a summary.'
			},
			{
				type: 'p',
				text: 'The **skills** load when a task needs them. `svelte-code-writer` teaches the agent the `@sveltejs/mcp` command line; `svelte-core-bestpractices` is a page of Svelte 5 guidance. Most of what it says, this course builds:'
			},
			{
				type: 'ul',
				items: [
					'“To compute something from state, use `$derived` rather than `$effect`” — `TripState`, a class whose every field is derived from one value (ch. {{the-trip-page}}).',
					'“If you need to sync state to an external library such as D3, it is often neater to use `{@attach ...}`” — Tiptap mounted by an attachment (ch. {{notes-with-tiptap-through-an-attachment}}).',
					'“If you need to observe something external to Svelte, use `createSubscriber`” — the geolocation watch on the map (ch. {{the-map}}, and ch. {{reactivity-utilities}} for when a utility library is worth it).',
					'“use `$state.raw` instead” for values that are replaced rather than mutated — the Tiptap editor instance in the notes tab, set when the editor mounts and cleared when it goes, never changed through Svelte (ch. {{notes-with-tiptap-through-an-attachment}}).',
					'“Prefer to use keyed each blocks … Do not use the index as a key” — keys that name the thing, on the globe and the trips list (ch. {{the-globe}}, {{trips-and-a-new-trip}}).',
					'“use clsx-style arrays and objects in `class` attributes, instead of the `class:` directive” — every conditional class (ch. {{the-shell}}).',
					'`svelte-code-writer`: “Always validate - Run `svelte-autofixer` before finalizing any Svelte component” — the next section, which does it for every component on every build.'
				]
			},

			{ type: 'h3', id: 'lint-svelte', text: 'The autofixer, over every component' },
			{
				type: 'p',
				text: 'The same package has a command line. Run with a subcommand, `svelte-mcp` (the binary `@sveltejs/mcp` installs) prints its answer instead of starting a server: `list-sections`, `get-documentation <sections>`, and `svelte-autofixer <code_or_path>` with `--svelte-version 4|5` and `--async`, “Wether the project is using async svelte or not”, in the help’s own spelling. This project compiles with `experimental.async`, so the flag belongs on every run.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm exec svelte-mcp svelte-autofixer src/lib/trip/StopCard.svelte --async
Detected file path, reading file...
{
  issues: [],
  suggestions: [],
  require_another_tool_call_after_fixing: false
}`
			},
			{
				type: 'p',
				text: 'An agent runs that on what it writes. The project runs it on everything it has, as a step of `verify`, with one rule: every **issue** is fixed, and every **suggestion** is either followed or answered in writing.'
			},
			code('package.json', 23, 23),
			code('scripts/autofix-report.ts', 46, 73),
			{
				type: 'p',
				text: 'Two sources, because the app compiles with `experimental.async` and the library does not. The list of answered suggestions is data, so it is parsed with a valibot schema like every other input in this project: `strictObject` rejects a misspelt key, so an entry cannot quietly stop matching because somebody typed `reasons`.'
			},
			code('scripts/autofix-report.ts', 75, 92),
			{
				type: 'p',
				text: 'The script imports `svelteAutofixer` — the function the `svelte-autofixer` command calls — instead of spawning the command fifty-five times. The command prints its result with `console.log`, which is Node’s inspect format and not JSON, so parsing it would mean parsing a debugging format; the package exports the function itself, with its types. All the files are analysed at once and the whole run takes a few seconds. One import comes before it, `./offline-docs.ts`, for a reason that is easy to miss: importing the package also starts its MCP server, which fetches the docs index from svelte.dev and never handles a refusal. From a network svelte.dev turns away, that unhandled rejection exits the process with code 1 after a clean report. The small module answers that one request locally, because a lint step must not depend on a website.'
			},
			code('scripts/autofix-report.ts', 94, 119),
			code('.autofixer-accepted.json', 58, 63),
			{
				type: 'p',
				text: 'An entry names a file, a piece of the suggestion’s text, how many times that file earns it, and the reason — which points at the comment in the code that already made the argument where one exists, so the list and the code cannot tell two stories, and otherwise states the reason itself. The count is exact in both directions. One more than accepted is a new effect nobody has looked at, and the script asks for it to be read; one fewer means the code improved and the entry outlived it, and the script asks for the entry to shrink. A list of exceptions that only ever grows stops meaning anything.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm run lint:svelte
autofixer: 55 files, 0 issues, 80 suggestions, 15 accepted entries
every suggestion is either followed or answered in .autofixer-accepted.json

# a copy of StopCard.svelte with one effect added: doubled = stop.day * 2
$ pnpm run lint:svelte
autofixer: 56 files, 0 issues, 82 suggestions, 15 accepted entries
src/lib/trip/StopCardScratch.svelte
  suggestion nobody has answered: The stateful variable "doubled" is assigned inside an $effect …
src/lib/trip/StopCardScratch.svelte
  suggestion nobody has answered: Prefer using writable $derived instead of $state and $effect at line 42, column 6`
			},
			{
				type: 'why',
				title: 'Why most of the eighty suggestions are declined, and why that is fine',
				text: 'Sixty-nine of them are one sentence: “You are calling a function inside an $effect. Please check if the function is reassigning a stateful variable … Ignore this suggestion if you are sure this function is not assigning any stateful variable.” It is a question, not a verdict, because the analyser cannot see inside the function. In this project the functions are MapLibre’s, three.js’s, Tiptap’s, timers and layout measurements — exactly what effects are for — and the entries say so file by file. The other eleven are three effects that assign state on purpose (a timer, a measurement, a colour only a styled page can answer) and eight `bind:this` that an attachment cannot replace because the element is used from more than one place. What the gate guarantees is not zero suggestions; it is that the next one gets read.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can write the `sv create` line for a new project with the add-ons you need, without answering a prompt.',
					'You can say which files each of the add-ons this project uses wrote, and where in the course each file is read.',
					'You know what `--fail-on-warnings`, `--compiler-warnings` and `--output machine-verbose` do, and why this project uses only the first.',
					'You can say what the four Svelte AI tools are, which files configure them here, and what `pnpm run lint:svelte` adds to `verify`.'
				]
			}
		]
	},

	{
		slug: 'the-config',
		title: 'One file to configure everything',
		summary:
			'SvelteKit 3 keeps its whole configuration inside the Vite plugin. This chapter reads `vite.config.ts` top to bottom: plugin order, mdsvex as a preprocessor, per-file compiler options for the custom element, the inspector, the adapter, remote functions and the three namespaces called `experimental`, tracing, prerendering, the Content Security Policy, versioning and preloads in a header, Paraglide, and the two test projects — then `tsconfig.json`, and the options this project leaves at their defaults.',
		goal: 'Read a SvelteKit 3 config with three preprocessors and plugins in it and know what every line is for, including why order matters twice, and say which TypeScript options belong to SvelteKit and which to you.',
		blocks: [
			{
				type: 'p',
				text: 'There is no `svelte.config.js`. SvelteKit 3 moved every option into the `sveltekit()` plugin call, and this project feels that change more than the earlier ones did, because three of the tools it uses *used* to be configured through that file: mdsvex was a preprocessor listed there, `@sveltejs/package` read it for aliases, and every guide on the internet still says so. Here is where they go now.'
			},
			code('vite.config.ts', 38, 74, { partial: true }),
			{
				type: 'p',
				text: '`defineConfig` comes from `vitest/config` rather than `vite`, so the `test` block at the bottom type-checks; `loadEnv` still comes from Vite because Vitest does not re-export it. The config is a **function** because it reads the environment before the build starts: `paths.origin` is the value adapter-node bakes into the server, and it is read from `PUBLIC_ORIGIN` here and validated by `src/env.ts` (chapter {{environment-and-hooks}}) as `static: true` so the same value reaches Better Auth. `relative: false` beside it is a link decision, not a deployment one: every internal link goes through `href()`, and with SvelteKit’s default a server render’s links came out as whole URLs at the build’s origin. Chapter {{the-shell}} tells that story where the links are written.'
			},
			{
				type: 'warn',
				text: '`enhancedImages()` must come before `sveltekit()`. It is a preprocessor that rewrites `<enhanced:img>` into a `<picture>` element, and the Svelte compiler has to see the rewritten markup, not the original. Put it second and the build fails with an unhelpful message about an unknown element. The other ordering rule is at the bottom of the plugin list, and it is the opposite way round.'
			},

			{ type: 'h3', id: 'markdown-and-elements', text: 'Markdown components and a folder of custom elements' },
			code('vite.config.ts', 76, 116, { partial: true }),
			{
				type: 'p',
				text: 'Two per-file behaviours. `preprocess` and `extensions` are what make a `.svx` file a component: mdsvex runs first, turns Markdown into markup and frontmatter into a `metadata` export, and the compiler takes it from there; `extensions` tells SvelteKit that `.svx` files under `src/routes` and in imports are components too. Chapter {{guides-prerendered-with-mdsvex}} writes the guides that use it.'
			},
			{
				type: 'p',
				text: '`dynamicCompileOptions` is newer and subtler: a function called once per file, returning compiler options for that file only. The custom element in `src/lib/embed` has to be compiled with `customElement: true` — a different output altogether, a class the browser can register as an element, with a shadow root — and nothing else in the project may be, which is why the test is the path `src/lib/embed` and not any folder called `embed`: the frame page lives in `src/routes/embed`, and the looser test once compiled it as a custom element too, so its styles went into a shadow root that never existed. The `environment.name === "client"` guard is the part people miss: the server build compiles the same file, and a custom element has no server-rendered form, so the server gets a plain component it never renders. Chapter {{embedding-a-trip}} builds the element.'
			},

			{ type: 'h3', id: 'compiler', text: 'The compiler options' },
			code('vite.config.ts', 118, 135, { partial: true }),
			{
				type: 'p',
				text: '`runes` is a function so that a dependency written in Svelte 4 style keeps compiling — several libraries in this project ship `.svelte` files, and the compiler decides per file. `experimental.async` is the one that changes how you write components: `await` at the top level of a `<script>`, inside `$derived`, and directly in markup, with `<svelte:boundary>` and its `pending` snippet to catch the wait. This project has more of it than any before: the globe is an `await import()` in markup, the explore page and the new-trip form `await places()` at the top of their scripts — one prerendered list, waited for once, before the first render — and opening a trip is `{const initial = $derived(await tripBySlug(slug))}` on the page.'
			},
			{
				type: 'note',
				text: 'What the compiled output asks of a browser: Svelte’s own documentation gives Chrome and Edge 87, Firefox 83 and Safari 14 — a Baseline target of 2020 — for Svelte itself, with a few exceptions it lists by feature, two of which this project uses: `$state.snapshot` needs Chrome 98, Firefox 94 or Safari 15.4 (the library’s `toJSON`, ch. {{a-route-as-a-class}}), and `flip` from `svelte/animate` needs Firefox 126 (the itinerary’s reordering, ch. {{the-itinerary}}). The table covers Svelte, not SvelteKit, the libraries or your own code; MapLibre’s WebGL and the CSS this project writes — `light-dark()` among it — ask for newer browsers than that, and together they set the real floor — in Firefox it is `flip`, at 126, higher than `light-dark()`’s 120.'
			},
			code('vite.config.ts', 137, 148),
			{
				type: 'p',
				text: 'The comment says it: `inspector` is not SvelteKit’s. The plugin passes any option it does not own to vite-plugin-svelte — the JSDoc on `sveltekit()` puts it as “Any options that don’t belong to SvelteKit are passed through to `vite-plugin-svelte`, so you can set options like `inspector` here too” — and vite-plugin-svelte documents the inspector as “unset for dev, always false for build”. Setting it switches it on in the dev server and costs a production build nothing. Of its options, `toggleKeyCombo` defaults to `alt-x`, and the plugin advises combinations of modifiers alone, so that turning it on can never type into an input. The default is kept anyway: every pair of modifiers is already somebody’s shortcut — Ctrl+Shift and Alt+Shift switch keyboard layouts on Windows — and the inspector only exists in the dev server. `showToggleButton` is `always`, `active` (the default) or `never`.'
			},

			{ type: 'h3', id: 'adapter-and-experiments', text: 'The adapter, remote functions, and one experiment left off' },
			code('vite.config.ts', 150, 177),
			{
				type: 'p',
				text: '`precompress` matters more here than in any earlier project: MapLibre and three.js are the two largest chunks any of the eight has shipped, and writing `.br` and `.gz` beside them at build time means the server never compresses them per request. `remoteFunctions` is the switch for everything in chapters {{remote-functions-the-reads}}–{{invites-and-membership}}. `forkPreloads` stays off on the evidence of three projects; the comment says what would turn it on, which is how a decision that might change should be recorded.'
			},
			{
				type: 'p',
				text: 'The word `experimental` appears twice in this file, and it belongs to three projects. `compilerOptions.experimental.async` is Svelte’s: `await` in components, a flag the documentation says “will be removed in Svelte 6”. The top-level `experimental` is SvelteKit’s — `remoteFunctions` and `forkPreloads` — and it is shared: SvelteKit’s types define it as vite-plugin-svelte’s experimental options plus its own, and the JSDoc says “SvelteKit reads its own flags and forwards the rest”. The `experimental` add-on from ch. {{the-toolchain}} writes both kinds in one line, `sv add experimental="features:async,remoteFunctions"`, which is also its default.'
			},
			{
				type: 'p',
				text: '`forkPreloads` is the one that ties them together. Svelte 5.42 added `fork()`, which “makes it possible to run `await` expressions that you *expect* to happen in the near future” — start the work a state change would cause, then `commit()` it if the change happens or `discard()` it if it does not. The documentation says it is “mainly intended for frameworks like SvelteKit to implement preloading when (for example) users signal an intent to navigate”, and `forkPreloads` is SvelteKit doing exactly that on a hovered link. Two caveats come with async mode, both in its documentation: the details “are subject to breaking changes outside of a semver major release”, and effects run in a slightly different order — block effects such as `{#if}` and `{#each}` now run before an `$effect.pre` in the same component. Nothing in this project depends on that order; the end-to-end suite is what would notice if something did.'
			},
			code('vite.config.ts', 179, 198),
			{
				type: 'p',
				text: '`tracing.server` was experimental in SvelteKit 2 and is not in 3; it makes every `handle`, `load`, form action and remote function an OpenTelemetry span, and `src/instrumentation.server.ts` — loaded before any application code, with nothing to switch on — is where the exporter lives. Chapter {{explore-and-diagnostics}} reads the spans back on the diagnostics page. The two explicit `\'fail\'` values restate the default, so that the intent is in the file: a broken link or a missing `#id` on a prerendered page fails the build, which is the only time you want to find out. The other three handlers — `handleEntryGeneratorMismatch`, `handleUnseenRoutes` and `handleInvalidUrl` — also default to `\'fail\'`. The options left out keep their defaults too: `entries` is `["*"]`, every route without a required parameter; `crawl` is `true`, so the build follows links from there, which is how `/de/guides` and `/pt-br/guides` are found — through the language switcher’s links, with no entry of their own; and `concurrency` is `1`, which is right for pages whose content is in the repository rather than behind a network.'
			},

			{ type: 'h3', id: 'csp', text: 'The Content Security Policy' },
			code('vite.config.ts', 200, 248),
			{
				type: 'p',
				text: 'The comment above the directives is the chapter. Two things to add. `mode: "auto"` means hashes on prerendered pages and nonces on dynamic ones — and a nonce is filled in per request, which is why the theme boot script in `app.html` is allowed by its **hash** and carries no nonce attribute: SvelteKit refuses to prerender a template that still contains `%sveltekit.nonce%`, and the guides are prerendered. `themeBootHash()` at the bottom of the file reads the script out of `app.html` and hashes it, so the two cannot drift.'
			},
			{
				type: 'p',
				text: '`connect-src "self"` with no tile server is a real constraint accepted on purpose: the map cannot fetch tiles from anybody, so it is built from a bundled atlas (chapter {{the-map}}). If you add a tile provider, this is the line that changes, and the CSP will tell you so in the console before anything else does.'
			},

			{ type: 'h3', id: 'versioning', text: 'Versioning, so a deploy does not strand open tabs, and preloads in a header' },
			code('vite.config.ts', 250, 278),
			{
				type: 'p',
				text: '`version.name` is the commit hash, computed by `commitHash()` below with a fallback to the package version, because a Docker build context has no `.git`. SvelteKit 3 notices a new version without asking: the current version rides on every data, remote and form response as an `x-sveltekit-version` header, and the client checks again whenever the tab regains focus or becomes visible. `pollInterval` is the fallback for a tab parked on one page, which is exactly what the trip page is — a live query delivers its changes over one long response, so no new headers arrive — and so it is a minute here rather than the default hour. When a new version is seen, `updated.current` in the root layout flips, a banner offers a reload, and the next navigation becomes a full page load so no chunk from the old build is ever requested. `bundleStrategy: "split"` is the default and is named here because chapter {{embedding-a-trip}} builds the one thing that must *not* be split.'
			},
			{
				type: 'p',
				text: '`linkHeaderPreload` moves a dynamically rendered page’s preloads out of the HTML and into a `Link` response header — the modules, the stylesheet, and the two fonts the `preload` hook in `hooks.server.ts` picks by source filename (ch. {{security-headers-and-csp}}). The browser reads headers before the body, so it starts on them a little sooner; prerendered pages keep their `<link>` tags, because a file on disk has no headers to carry them. The option has existed since 3.0 and is off by default for the reason its documentation gives and the comment repeats: Nginx and Apache limit header sizes by default, and this header is not small — about 7.5 KB on the trip page, the page with the most to preload. A test in `e2e/public.e2e.ts` holds the header to its promise: `/explore` must answer with `rel="modulepreload"` and the Fraunces font in its `Link` header, and with no `modulepreload` left in its HTML.'
			},

			{ type: 'h3', id: 'paraglide-and-icons', text: 'Three plugins that are not SvelteKit' },
			code('vite.config.ts', 281, 318),
			{
				type: 'p',
				text: 'Paraglide is a Vite plugin in its own right: it watches `messages/*.json`, compiles them into `src/lib/paraglide`, and does so with a `strategy` list that is the order the locale is decided in. Chapter {{three-languages-with-paraglide}} is entirely about it. The phosphor plugin is the second ordering rule: it rewrites `import { PlusIcon } from "phosphor-svelte"` into a deep import so the dev server does not crawl a barrel of thousands of icons, and it must run *after* the Svelte compiler because it parses JavaScript. Put it first and it dies on the first `<h1>`. The third, `bundleStats()`, is this project’s own and runs only in a build: at the end of the browser build it writes down which modules went into which chunk, so that a script can hold the bundle to a budget afterwards. A chunk’s file name is a hash and changes with every edit; the bundler is the one place that knows what a chunk *is*. Chapter {{end-to-end}} is where that script runs, and why it exists.'
			},

			{ type: 'h3', id: 'the-rest', text: 'The native addon, and the two test projects' },
			code('vite.config.ts', 321, 328),
			code('vite.config.ts', 330, 404, { partial: true }),
			{
				type: 'p',
				text: 'Two Vitest projects in one config — and no `extends` line on either, because since Vitest 5 an inline project inherits the config that declares it, plugins and `#lib` included, unless it says `extends: false`: `client` runs `*.svelte.test.ts` in a real Chromium through Playwright, because the components under test need WebGL, pointer events and layout; `server` runs everything else in Node, one file at a time because SQLite has one writer. The `optimizeDeps.include` list is the fix for a real failure: the phosphor plugin rewrites imports during transform, after Vite’s dependency scan, so on a cold cache Vite discovered the icons mid-test, re-bundled, and reloaded the test inside itself. Naming them is what Vitest’s own warning asks for. Chapter {{unit-and-browser-tests}} runs both projects.'
			},
			code('vite.config.ts', 408, 443),

			{ type: 'h3', id: 'typescript', text: 'The other file: `tsconfig.json`' },
			code('tsconfig.json', 1, 64),
			{
				type: 'p',
				text: '`"extends": "$app/tsconfig"` is the line SvelteKit owns. `svelte-kit sync` writes that config into `node_modules/$app/tsconfig.json` every time it runs, with what a SvelteKit project needs: `moduleResolution: "bundler"`, the DOM libraries, and `rootDirs` set to the project and `.svelte-kit/types` side by side — which is how `import type { PageProps } from \'./$types\'` beside a route finds a file that lives in a generated folder. Four of its options are SvelteKit’s to set, and its documentation says overriding them “may cause things to break”: `paths` (derived from subpath imports; here it is empty, because bundler resolution reads `imports` from `package.json` itself), `types` (it must include `$app/types`, the generated module declarations), `isolatedModules` (“Vite compiles modules one at a time”) and `verbatimModuleSyntax` (“so that you can safely use type imports in `.svelte` files”). Everything in `compilerOptions` above is this project’s own strictness, each with the reason beside it.'
			},
			{
				type: 'p',
				text: 'The explicit `include` and `exclude` are required in SvelteKit 3, and the comment says what happens without them. One folder is excluded for a different reason: `src/service-worker` runs in a worker’s global scope, with `caches` and `FetchEvent` and no `document`, so it has a tsconfig of its own that extends `$app/tsconfig/service-worker` — the WebWorker library instead of the DOM — and `pnpm run check` checks it with a second program (ch. {{the-offline-itinerary}}). `erasableSyntaxOnly` is the newest line: TypeScript refuses any syntax that cannot simply be deleted to leave JavaScript — `enum`, a `namespace` with values in it, a constructor parameter marked `private` — because the two places this project runs TypeScript without a compiler cannot run it either. Node 24 runs `scripts/*.ts` by stripping the types; Svelte 5 compiles a `lang="ts"` block the same way. (`namespace App` in `src/app.d.ts` is a declaration, types only, and stays.)'
			},
			{
				type: 'why',
				title: 'Why not `vitePreprocess({ script: true })` instead',
				text: 'It is the other answer to the same question: run TypeScript through a real transpiler before Svelte sees it, and enums and parameter properties work in components. The integrations documentation names the cases for it — a project before Svelte 5, or “advanced TypeScript features that emit code” — and adds that otherwise “you probably don’t need to use `vitePreprocess`”. This project has neither case, and the flag is cheaper than the preprocessor in both directions: nothing extra runs on every component in the build, and the code stays runnable by every tool that strips types, Node’s included. One rule instead of a second compiler.'
			},

			{ type: 'h3', id: 'left-alone', text: 'What this file leaves at its defaults' },
			{
				type: 'p',
				text: 'A config is also defined by what it does not say. These are the options a reader of other projects will meet, and why this one does not set them:'
			},
			{
				type: 'ul',
				items: [
					'**`files.*`** — where SvelteKit looks for things, and the defaults are the names: `src/routes`, `src/params`, `src/hooks.server`, `src/hooks.client`, `src/hooks` (the universal hooks), `src/service-worker`, `src/app.html` and `src/error.html`. This project uses the defaults for every one it has — `src/hooks.client.ts` and `src/params.ts` among them — and a file with one of the other names, a `src/service-worker` folder or a `src/error.html`, would be picked up the same way. The option is deprecated in 3.0, with a workspace recommended instead, which is what `packages/waypoint` is.',
					'**`moduleExtensions`** — `[".js", ".ts"]`, the extensions treated as modules; nothing here needs another.',
					'**`outDir`** — `.svelte-kit`, where SvelteKit writes generated types and build output (ch. {{the-workspace}}).',
					'**`env.dir`** — `"."`, the folder searched for `.env` files.',
					'**`embedded`** — `false`. `true` attaches SvelteKit’s navigation listeners to the element that holds the app instead of `window`, for an app embedded in a larger page; Meridian’s embed is a frame and a custom element instead (ch. {{embedding-a-trip}}).',
					'**`paths.base`** and **`paths.assets`** — empty: the app is served from the root of its origin, and its assets from the same origin. (`paths.origin` and `paths.relative` are set, at the top of the file.)',
					'**`emitCss`** — vite-plugin-svelte’s, default `true`: component styles become virtual CSS files that Vite bundles, rather than being injected by JavaScript. Nothing here needs it changed.',
					'**`prebundleSvelteLibraries`** — vite-plugin-svelte’s, “true for dev, false for build”: in the dev server, Svelte libraries are prebundled like any other dependency. The `optimizeDeps.include` list for the browser tests is the one place this project steps in.',
					'**`hot`** — older guides set it; vite-plugin-svelte 7 has no such option. Hot reloading is Svelte 5’s own `hmr` compiler option, which the plugin turns on in the dev server unless Vite’s `server.hmr` is off.'
				]
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which two plugins have ordering rules, which way round each goes, and why.',
					'You can explain why the boot script is allowed by a hash and not a nonce, and what would break if it were the other way.',
					'You know what `dynamicCompileOptions` is for and why it checks `environment.name`.',
					'You can say which project owns each `experimental` flag in the file — Svelte, SvelteKit or vite-plugin-svelte.',
					'You can say which four TypeScript options SvelteKit sets for you, and what `erasableSyntaxOnly` forbids and why.'
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
			{
				type: 'note',
				text: '**Glossary.** Nine words the rest of the course uses without stopping, as SvelteKit’s glossary defines them. **SSR**, server-side rendering: the server produces the page’s HTML. **CSR**, client-side rendering: JavaScript in the browser produces or updates it. **Hydration**: the browser takes over server-rendered HTML, checks the DOM is what it expects and attaches the event listeners, using the data the server sent along rather than fetching it again. **Hybrid**: SvelteKit’s default — the first page by SSR, every later navigation by CSR. **Prerendering**: rendering a page once, at build time, and serving the saved HTML to everybody; possible when any two people asking get the same page. **SSG**, static site generation: a site where every page is prerendered. **Edge**: rendering in a content delivery network, near the person asking. **ISR**, incremental static regeneration: generating static pages on request, without a redeploy (an `adapter-vercel` feature). **PWA**, progressive web app: a web app that can be installed and behave like a native one, usually with a service worker for offline use. Meridian is hybrid, prerenders its guides, and is none of the last three.'
			},

			{ type: 'h3', id: 'svelte', text: 'Svelte 5' },
			{
				type: 'ul',
				items: [
					'**`$state`, `$derived`, `$derived.by`, `$effect`, `$props`** — everywhere; the pattern that matters is `TripState` (ch. {{the-trip-page}}), a class whose fields are all derived from one getter.',
					'**Assignable `$derived`** — the stop dialog’s fields start from the stop being edited and belong to the form after that (ch. {{the-itinerary}}).',
					'**`untrack`** — reading a prop once, on purpose, in a component the page keys on its slug (ch. {{the-trip-page}}, {{companions-presence-and-settings}}).',
					'**`$state.raw`, `$state.snapshot`** — the Tiptap editor instance (ch. {{notes-with-tiptap-through-an-attachment}}); the library’s `toJSON` (ch. {{a-route-as-a-class}}).',
					'**`await` in markup, in `$derived` and at the top of `<script>`; `<svelte:boundary>` with `pending` and `failed`** — the trip page, the globe, the trips list, the explore page (ch. {{the-trip-page}}, {{the-globe}}, {{trips-and-a-new-trip}}, {{explore-and-diagnostics}}).',
					'**`{const}` declaration tags, which replaced `{@const}`, bare and with `$derived`** — `{@const x = y}` becomes `{const x = $derived(y)}`, and a bare `{const}` is the different, once-only thing; the header’s link list, the trip page’s initial data, the globe’s import (ch. {{the-design-system}}, {{the-shell}}, {{the-trip-page}}, {{the-globe}}).',
					'**`class={[…]}` and `class={{…}}`** — every conditional class, in place of the `class:` directive they replaced in Svelte 5.16 (ch. {{the-shell}}).',
					'**Attachments — `{@attach}`, and `fromAction` for a library that ships an action** — Tiptap (ch. {{notes-with-tiptap-through-an-attachment}}), the GSAP hero timeline, attached only when motion is wanted (ch. {{the-design-system}}), svelte-dnd-action (ch. {{the-itinerary}}), the expenses table’s overflow (ch. {{expenses-with-tanstack-and-layerchart}}), and the argument for when a wrapper library is *not* worth it (ch. {{the-wrapper-pattern}}).',
					'**`animate:flip`** with svelte-dnd-action (ch. {{the-itinerary}}, {{motion-with-intent}}).',
					'**Motion: `transition:`, `in:`, a custom `TransitionConfig` with `css(t, u)`, `svelte/easing`, `Tween` from `svelte/motion`, `prefersReducedMotion`** — the copy button’s check mark, the invite link, the map’s status pill, the tab indicator, and every built-in the design brief keeps out, each with its rule (ch. {{motion-with-intent}}, {{the-trip-page}}).',
					'**`svelte/reactivity`: `MediaQuery`, `createSubscriber`; `svelte/reactivity/window`: `scrollY`, `online`** — the theme, geolocation, the header, the trip header’s “Offline” (ch. {{the-design-system}}, {{the-map}}, {{the-globe}}, {{reactivity-utilities}}, {{the-offline-itinerary}}).',
					'**Custom elements — `customElement: true` and the generated `.element` class**, registered with `customElements.define`, with a shadow root and attribute-mapped props (ch. {{embedding-a-trip}}).',
					'**Runes in a `.svelte.ts` file inside a published library** — the `Route` class (ch. {{a-route-as-a-class}}).'
				]
			},

			{ type: 'h3', id: 'kit', text: 'SvelteKit 3' },
			{
				type: 'ul',
				items: [
					'**All configuration in `vite.config.ts`**; `preprocess`, `extensions`, `dynamicCompileOptions`, the `inspector` passed through to vite-plugin-svelte, `output.linkHeaderPreload`; `tsconfig.json` extending `$app/tsconfig` (ch. {{the-config}}).',
					'**`src/env.ts` with `defineEnvVars`, `public`, `static`** (ch. {{environment-and-hooks}}).',
					'**Remote functions: `query`, `query.batch`, `query.live`, `prerender`, `form`, `command`; `requested().refreshAll()`; `invalid()` with `issue.field()`; `getRequestEvent`** (ch. {{remote-functions-the-reads}}–{{invites-and-membership}}).',
					'**Hooks: `handle` with `sequence`, `handleFetch`, `handleError` with `kind`, `init`; the browser’s `handleError`; universal `reroute` and `transport`; hook types from `@sveltejs/kit/hooks`** (ch. {{environment-and-hooks}}, {{three-languages-with-paraglide}}, {{dates-and-money-in-a-locale}}).',
					'**`defineParams` in `src/params.ts`** (ch. {{environment-and-hooks}}), and the typed `params` a page receives through `PageProps` from `./$types` (ch. {{the-trip-page}}).',
					'**Route groups and the layout split** — `(site)` with identity, guides without (ch. {{the-shell}}, {{guides-prerendered-with-mdsvex}}).',
					'**Prerendering with `entries`, `csr = false`, per-locale output through `reroute`** (ch. {{guides-prerendered-with-mdsvex}}).',
					'**`resolve()` from `$app/paths` with typed route ids, and `paths.relative: false`** (ch. {{the-shell}}, {{explore-and-diagnostics}}).',
					'**`tracing: { server: true }` and `src/instrumentation.server.ts`** (ch. {{explore-and-diagnostics}}).',
					'**CSP `mode: "auto"`, `csrf`, `version.pollInterval` and `updated.current`, `preload` by source `filename`** (ch. {{the-config}}, {{the-shell}}, {{security-headers-and-csp}}).',
					'**`$app/env`: `browser`, `building`, `dev`, `version`** (ch. {{the-shell}}, {{the-globe}}, {{the-trip-page}}, {{embedding-a-trip}}).',
					'**`onNavigate` view transitions, `beforeNavigate`, `afterNavigate`** (ch. {{the-shell}}, {{the-offline-itinerary}}).',
					'**Shallow routing: `goto(\'\', { shallow: true, state })`, `page.state`, `App.PageState`, `history.back()`** — the stop dialog as a history entry (ch. {{the-itinerary}}).',
					'**`snapshot()` from `$app/navigation`** — a half-typed new trip that survives a reload (ch. {{trips-and-a-new-trip}}).',
					'**`query.live` authorised on every wake, with `getRequestEvent()` after a `yield`** (ch. {{live-collaboration}}).',
					'**A service worker: `src/service-worker/index.ts`, `self` from `$app/service-worker`, `immutable`/`assets`/`prerendered` from `$app/manifest`, `version` as the cache name, `$app/tsconfig/service-worker`, automatic registration** — the offline itinerary, and the copies a shared device forgets (ch. {{the-offline-itinerary}}).',
					'**`<enhanced:img>`** (ch. {{the-design-system}}).',
					'**adapter-node with `precompress`, `paths.origin`, a health endpoint, graceful shutdown** (ch. {{deploying}}).'
				]
			},

			{ type: 'h3', id: 'tooling', text: 'The toolchain' },
			{
				type: 'ul',
				items: [
					'**`sv create`, `sv add`, `sv check`** — the scaffold line that reproduces this project’s tooling, what each add-on writes, and community add-ons (ch. {{the-toolchain}}).',
					'**`svelte-check`** with `--fail-on-warnings`, and every other flag it takes (ch. {{the-toolchain}}).',
					'**ESLint and Prettier** — `projectService` for `.svelte` and `.svelte.ts`, `eslint-config-prettier`, `.prettierignore` as the map of generated folders (ch. {{the-toolchain}}).',
					'**The Svelte AI tools** — `AGENTS.md`, the MCP server, the skills, the `svelte-file-editor` subagent, the Claude Code plugin, and `lint:svelte`, the autofixer over every component in `verify` (ch. {{the-toolchain}}).',
					'**The workspace** — pnpm 12, `allowBuilds`, a minimum release age, `.vscode/extensions.json` (ch. {{the-workspace}}).',
					'**Diagnostics by code** — compiler warnings and errors, runtime errors and warnings, zero `svelte-ignore`, and the autofixer as a gate (ch. {{what-the-compiler-says}}).',
					'**`sv migrate`** — the one-task-per-commit routine for a SvelteKit 2 project, the `MIGRATION_TASKS.md` record this project kept in `docs/migration-sveltekit-3.md`, and the Svelte 4 legacy table (ch. {{migrating-a-major}}).',
					'**The exit criteria** — every planned surface, taught, declined, deferred or dropped, generated and checked (ch. {{the-exit-criteria}}).'
				]
			},

			{ type: 'h3', id: 'ecosystem', text: 'The ecosystem' },
			{
				type: 'p',
				text: 'Each library, what it is for here, its shape, and the chapter. The survey in chapter {{choosing-libraries}} is where the alternatives are weighed; this is just the roll-call.'
			},
			{
				type: 'ul',
				items: [
					'**Bits UI 2** — Dialog, Combobox, Command, DateRangePicker, DatePicker. Headless. (ch. {{dates-and-money-in-a-locale}}, {{the-itinerary}}, {{the-command-palette}}, {{expenses-with-tanstack-and-layerchart}}, {{trips-and-a-new-trip}}, {{the-headless-pattern}})',
					'**svelte-maplibre 2 + MapLibre GL 6** — the map. Wrapper. (ch. {{the-map}}, {{the-wrapper-pattern}})',
					'**Threlte 8 (`@threlte/core`, `@threlte/extras`) + three.js** — the globe. Wrapper. (ch. {{the-globe}}, {{the-wrapper-pattern}})',
					'**svelte-dnd-action** — dragging stops between days. An action, applied through `fromAction`. (ch. {{the-itinerary}})',
					'**TanStack Table v9 (`@tanstack/svelte-table`)** — the expenses table. Headless. (ch. {{expenses-with-tanstack-and-layerchart}}, {{the-headless-pattern}})',
					'**LayerChart 2** — two charts. Components over d3 scales. (ch. {{expenses-with-tanstack-and-layerchart}})',
					'**Tiptap 3 (`@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`)** — the notes editor, and the sentence it shows while empty. Imperative, through an attachment. (ch. {{notes-with-tiptap-through-an-attachment}}, {{the-headless-pattern}})',
					'**Paraglide 2 (`@inlang/paraglide-js`)** — three languages. Compiler + Vite plugin. (ch. {{three-languages-with-paraglide}})',
					'**Better Auth 1.7 (`better-auth/minimal`)** — accounts and sessions. Server library with a SvelteKit handler. (ch. {{identity-with-better-auth}}, {{signing-in-and-up}})',
					'**Drizzle ORM + libSQL** — the database. (ch. {{the-database}})',
					'**valibot** — every schema, from forms to environment variables to frontmatter. (ch. {{schemas-with-valibot}})',
					'**svelte-sonner** — toasts. (ch. {{the-design-system}})',
					'**phosphor-svelte** — icons, with the Vite plugin that keeps the dev server fast. (ch. {{the-config}}, {{the-design-system}})',
					'**runed** — `Debounced` on the explore page, and the argument about when a utility library is worth it. (ch. {{explore-and-diagnostics}}, {{reactivity-utilities}})',
					'**mdsvex** — the guides. Preprocessor. (ch. {{guides-prerendered-with-mdsvex}})',
					'**@sveltejs/enhanced-img** — the hero. Preprocessor. (ch. {{the-design-system}})',
					'**@sveltejs/package, publint, @arethetypeswrong/cli** — packaging the library. (ch. {{packaging-and-proving}})',
					'**@internationalized/date** — calendar dates without time zones, and the transport hook that carries them (ch. {{dates-and-money-in-a-locale}}).',
					'**world-atlas + topojson-client** — the coastlines, at build time. (ch. {{remote-functions-the-reads}}, {{the-map}})',
					'**@opentelemetry/sdk-trace-node** — the tracing exporter. (ch. {{explore-and-diagnostics}})',
					'**GSAP** — one hero timeline, respecting reduced motion. (ch. {{the-design-system}})',
					'**fontsource** — two variable fonts, preloaded by source filename. (ch. {{the-design-system}})',
					'**axe-core + `@axe-core/playwright`** — every WCAG 2 A and AA rule over every screen, in both themes, as part of the end-to-end suite. Dev only. (ch. {{end-to-end}})',
					'**sv + @sveltejs/mcp** — the Svelte CLI and the Svelte AI tools, locked by `pnpm-lock.yaml` so everybody runs the same versions. Dev only. (ch. {{the-toolchain}})'
				]
			},
			code('package.json', 72, 104, { partial: true }),

			{ type: 'h3', id: 'domain', text: 'The domain, with no framework in it' },
			{
				type: 'ul',
				items: [
					'**Geodesy** — haversine distance, bearings, great-circle interpolation, unwrapped arcs, bounds, compass points, `Intl` distance formatting. (ch. {{geodesy-for-humans}})',
					'**Ids, dates, money** — unguessable slugs; ISO dates with cached `Intl` formatters; integer minor units with `fractionDigits` asked of `Intl`. (ch. {{ids-dates-and-money}})',
					'**Fair splits** — shares by largest remainder, balances, greedy settlement. (ch. {{splitting-fairly}})',
					'**The itinerary** — grouping by day, placing a stop, renumbering only what moved. (ch. {{the-itinerary-as-data}})',
					'**Schemas and roles** — one valibot schema per input; who may do what. (ch. {{schemas-with-valibot}})'
				]
			},

			{ type: 'h3', id: 'proving', text: 'Proving and shipping' },
			{
				type: 'ul',
				items: [
					'**Vitest, two projects** — pure logic in Node; components in Chromium with `vitest-browser-svelte`. (ch. {{unit-and-browser-tests}})',
					'**Playwright** — seven suites on a desktop and a Pixel 7, including two browser contexts on one trip, and the design’s checks at 360px as well. (ch. {{end-to-end}})',
					'**Security** — hooks, headers, CSP, CSRF, the one frameable route. (ch. {{security-headers-and-csp}})',
					'**Docker, compose, CI** — three stages, a health check, SIGTERM, a workflow with verify, package, image and course jobs. (ch. {{deploying}})'
				]
			},
			{
				type: 'checkpoint',
				text: 'You do not need to remember this chapter. You need to know it exists, and to come back to it when a later chapter names something you have not met yet.'
			}
		]
	}
];
