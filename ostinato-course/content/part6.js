/**
 * PART 6 — Beyond the app
 * (chapters 33–36)
 *
 * The parts that are not pages: a custom element built twice, an adapter
 * written from scratch, a service worker for the tunnel, and the security
 * posture — CSP, CSRF, the cookie, CORS — gathered in one place so that it
 * can be read as one decision rather than found in six files.
 */

import { code } from './quote.js';

export const part6 = [
	{
		slug: 'a-custom-element-built-twice',
		title: 'A custom element, built twice',
		summary:
			'`<ostinato-player>`: compiled as a custom element for one folder only through `dynamicCompileOptions`, and again as one standalone file by a second Vite config. `$host()` for events, `extend` for methods that exist before the component mounts, `document.currentScript` for where it came from.',
		goal: 'Ship a Svelte component as an element other people can paste into their pages, and understand what is different about a component with no app around it.',
		blocks: [
			code('src/lib/embed/OstinatoPlayer.svelte', 1, 21),
			{
				type: 'p',
				text: 'The player shares the engine, the scheduler and the pattern model with the studio, and nothing else: no `$app/*`, no remote functions, no context from above. A custom element is its own root, mounted by a page we do not control, so everything it needs has to arrive as an attribute or be fetched.'
			},
			code('src/lib/embed/OstinatoPlayer.svelte', 22, 54),
			{
				type: 'p',
				text: '`<svelte:options customElement>` is where the element is described. `props` maps attributes to props — `playing` is a `Boolean` attribute, present or absent, and `reflect: true` writes the prop back to the attribute so the host page can read it. `extend` receives the element class Svelte generated and returns a subclass: `play()` and `stop()` exist from the moment the element is created, *before* the inner component mounts on the next tick, so a host page can call `player.play()` immediately after inserting it. They set a prop; the component reacts.'
			},
			{
				type: 'why',
				title: 'Why the shadow root is open',
				text: 'Styles are encapsulated either way. `open` lets the host page inspect and, if it must, reach in — and lets Playwright locators pierce it, which is how the end-to-end suite reads the title. For something people put on pages we do not control, refusing them that is the wrong trade.'
			},
			code('src/lib/embed/OstinatoPlayer.svelte', 56, 76),
			{
				type: 'p',
				text: 'A `<script module>` runs once, when the module loads. In the standalone bundle — an IIFE in a `<script src>` — `document.currentScript` is the host page’s tag for exactly as long as the script body runs, and this module body is part of it. So the element learns where it was served from and fetches patterns from there, with no configuration. `import.meta.url` would be the obvious tool and does not exist in an IIFE.'
			},
			code('src/lib/embed/OstinatoPlayer.svelte', 123, 137),
			{
				type: 'p',
				text: '`$host()` is the custom element itself. Events dispatched on it — `ready`, `play`, `stop`, `error` — are how the element talks to the page around it: `player.addEventListener("play", …)` with nothing but the DOM. `composed: true` lets the event cross the shadow boundary.'
			},
			code('src/lib/embed/OstinatoPlayer.svelte', 98, 121),
			code('src/lib/embed/OstinatoPlayer.svelte', 139, 190),
			{
				type: 'p',
				text: 'Two effects. The first fetches whenever the id or origin changes — a network request in response to a prop is an interaction with the outside world, which is what `$effect` is for — with a `cancelled` flag so a response for an old id is dropped. The body is parsed with a valibot schema, not read as `any`: this element runs on other people’s pages against whatever `src` they gave it, so the response is as untrusted as a request body, and the pattern inside it gets the same `PatternDtoSchema` the server stores patterns with. The `catch` takes an `unknown` — a rejected promise can carry anything — and reads `message` only after `instanceof Error`. The second effect drives the transport from the `playing` prop and reports back, so setting the attribute, calling the method and pressing the button all do the same thing.'
			},
			{
				type: 'why',
				title: 'Why the transport stops when the pattern goes',
				text: 'When the host page changes the `pattern` attribute, the fetch effect sets `loaded = null` until the new one arrives. The scheduler was built with `() => loaded!` — a getter promising, with a `!`, that there would always be a pattern. There was not: a player swapped mid-play kept ticking every 25 ms against `null`, and threw `Cannot read properties of null (reading "bpm")` forty times a second until the fetch came back. A non-null assertion that can be false is a crash with the type checker’s blessing. Now the getter returns `Pattern | null`, the scheduler’s tick stops the transport when it finds nothing (ch. 12), and the transport effect stops it the moment `loaded` empties, leaving `playing` as the host set it — so the new pattern starts by itself when it lands. The embed suite swaps the attribute while playing, holds the new pattern back, and fails on any uncaught error.'
			},
			{ type: 'h3', id: 'built-twice', text: 'Built twice' },
			code('vite.config.ts', 70, 90),
			{
				type: 'p',
				text: 'Inside the app, `dynamicCompileOptions` — called per file and, since vite-plugin-svelte 7.3.0, per *environment* — says “for the client build of the `embed` folder, `customElement: true`”. The environment guard matters: a custom element registers itself with `customElements.define` and has no server-rendered form, so the SSR pass must not try.'
			},
			code('src/lib/embed/element.ts', 1, 11),
			code('vite.embed.config.ts', 4, 42),
			{
				type: 'p',
				text: 'Outside the app, a second Vite build with no SvelteKit turns the same entry into one IIFE: `static/embed/ostinato-player.js`, with the Svelte runtime bundled in. SvelteKit copies `static/` into the build, so the app serves the result at `/embed/ostinato-player.js`. The `build` and `dev` scripts run `build:embed` first, so the file exists before anything asks for it.'
			},
			code('src/routes/(app)/embed/+page.svelte', 8, 37),
			{
				type: 'p',
				text: 'The documentation page defines the element by importing its module on mount — client-only, because a shadow root does not exist until JavaScript runs — and builds the paste-able snippet with a `SvelteURL`, whose `hostname` and `port` are bound to two inputs and whose `origin` follows both. The closing script tag is assembled in two halves because a literal one inside a `<script>` block would end the block.'
			},
			code('src/routes/(app)/embed/demo/+page@.svelte', 5, 24),
			{
				type: 'p',
				text: 'The bare demo is somebody else’s page: no header, the root layout only (`+page@.svelte`), and the element loaded from the *standalone* bundle. The end-to-end suite opens this page, which is the only honest test of the standalone build — the app never loads that file itself.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `extend` gives you that a method on the component would not.',
					'You can explain why `document.currentScript` works here and `import.meta.url` does not.',
					'You can name the two builds and say which file each one produces.'
				]
			}
		]
	},

	{
		slug: 'an-adapter-from-scratch',
		title: 'An adapter, from scratch',
		summary:
			'What an adapter is: `writeClient`, `writePrerendered`, `generateServerInstance` per function, a runtime bundled with rolldown, an instrumentation initialiser and `builder.instrument`, an `emulate()` for development, and adapter-provided Vite plugins. Then the part that is only this adapter: a catch-all with no routes, and `applyReroute`.',
		goal: 'Read a whole adapter and know which of its five steps every adapter takes and which are this one’s own; understand the server-per-function split; and see how SvelteKit 3’s `applyReroute` hands a request between functions.',
		blocks: [
			code('adapters/ostinato/index.js', 1, 32),
			{
				type: 'p',
				text: 'An adapter is the thing that takes SvelteKit’s build output and turns it into a program for a particular place. Steps 1 to 4 in that list are what *every* adapter does — SvelteKit’s guide to writing one lists them in the same order: clear the output, write the client, server and prerendered files, generate a server instance and the code that starts it, bundle. What is this adapter’s own is the plural in steps 3 and 4 — a server and a bundle for *each* function — and step 5, which only an adapter that runs `instrumentation.server.js` needs. It targets a plain Node process, like `adapter-node`, and is smaller in every way that does not matter and one that does: it deploys the app as two functions and a catch-all.'
			},
			code('adapters/ostinato/index.js', 50, 85, { partial: true }),
			{ type: 'h3', id: 'the-split', text: 'The split, and a server per function' },
			code('adapters/ostinato/partition.js', 1, 21),
			code('adapters/ostinato/partition.js', 23, 49),
			{
				type: 'why',
				title: 'Why split at all',
				text: 'A single function would be simpler and, for this app, faster. But a single function never *needs* `applyReroute`, and the reason SvelteKit 3 added it is precisely that platforms split apps across functions. An adapter that shows how the hand-off works has to split something, and `/api` is the natural seam: the part somebody would scale, cache and rate-limit differently. Fully prerendered routes go to neither — they are files.'
			},
			code('adapters/ostinato/index.js', 87, 142),
			{
				type: 'p',
				text: '`builder.generateServerInstance(dest, { routes })` writes a module whose `server` knows *only* those routes. Three are written: pages, api, and one with no routes at all. It replaced `generateManifest` in 3.0, and the difference is what the adapter gets to see: a manifest string to pair with a `Server` class before, no server manifest at all now — its shape is SvelteKit’s business, `SSRManifest` is no longer a public type, and an adapter that read it would break on the next change. (`builder.manifest` is still there, and the migration guide points adapters at it: it is `$app/manifest`, the list of the app’s files, not the server’s route table.) A server with no routes can still run the hooks — and when `reroute` changes the path of a request it received, SvelteKit sets an `x-sveltekit-rerouted-url` header on the response. That header is set only when the route table is empty, which is why the catch-all is route-less rather than a copy of pages. `entries.js` carries what the runtime needs that only the build knows: the origin baked in for CSRF, the prerendered paths, the route patterns as regex sources, and the headers the files must carry (ch. 36).'
			},
			{ type: 'h3', id: 'bundling', text: 'Bundling the runtime' },
			code('adapters/ostinato/index.js', 144, 213),
			{
				type: 'p',
				text: 'Four bundles, not one. SvelteKit 3 configures a server as *module-level* state — `server.init` writes the manifest into the runtime that `server.respond` reads — so one module graph holds exactly one server, and three in one bundle means the last `init` wins and every route answers 404. Each function is therefore bundled on its own under `functions/`, with its own copy of the app, and the runtime in `files/` is bundled once more beside them. The runtime does not import the functions at all: `handler.js` loads `functions/<name>/index.js` by path when the process starts, and the names travel through `entries.js`. Production dependencies stay external and everything else is bundled in, so `build/` runs with `pnpm install --prod`. One thing must not be bundled twice: the OpenTelemetry API, or the SvelteKit runtime and the instrumentation file would report spans to two different worlds. And one thing must be bundled *with* the server rather than beside it: the instrumentation initialiser from `createInstrumentationInitializer`, which fills in the environment before `instrumentation.server.js` runs and has to share the server’s copy of `env.js` to do it — hence the extra entry.'
			},
			code('adapters/ostinato/index.js', 215, 234),
			{
				type: 'p',
				text: '`builder.instrument` renames `index.js` to `start.js` and writes a new `index.js` that imports the initialiser, then the instrumentation file, and *then* dynamically imports `start.js`. That order is the whole feature (ch. 32): the environment exists before the SDK asks for it, and the SDK is registered before the modules it patches are loaded.'
			},
			code('adapters/ostinato/index.js', 236, 291),
			{
				type: 'p',
				text: 'Three more things an adapter can declare. `emulate()` fills in `event.platform` during `vite dev`, `vite build` and `vite preview`, with the same shape the runtime produces, so nothing has to guard against `undefined`. `supports` says what the runtime can do — `read()` from `$app/server`, instrumentation. And in SvelteKit 3 an adapter can contribute Vite plugins, `pre` or `post`: this one provides `virtual:adapter`, which the diagnostics page imports.'
			},
			code('adapters/ostinato/index.js', 294, 343, { partial: true }),
			code('src/app.d.ts', 41, 55),
			{
				type: 'p',
				text: '`App.Platform` is the shape both of them promise. `entry` is the function that answered, and the runtime reports the truth — `router` for the catch-all. It once reported the catch-all as `pages`, which made the type’s third member a value nothing ever saw, and hid a branch in `handleFetch` that could never run (ch. 26).'
			},
			{ type: 'h3', id: 'the-runtime', text: 'The runtime: four steps per request' },
			code('adapters/ostinato/files/handler.js', 1, 17),
			code('adapters/ostinato/files/handler.js', 19, 88),
			{
				type: 'p',
				text: 'Three `server`s, each written by `generateServerInstance` — the whole SvelteKit runtime each, `init` and `respond` and nothing else, with a different idea of which routes exist, each in a bundle of its own. 3.0 deprecated the `Server` class for these ready-made objects: an adapter no longer builds a server from a manifest, it imports one. It imports them *by path*, with a dynamic `import()` computed from `dir.js`, and the comment says why the obvious alternative failed: three static imports rewritten by rolldown into `./functions/…` land in whatever chunk the bundler put this code in — `index.js` and `handler.js` are both entries, so their shared body became `chunks/handler-….js` — and from there the relative path points at nothing. The end-to-end suite found that one on its first run against the new adapter. `server.init` runs the app’s `init` hook and hands each server its environment and a `read` implementation that streams files from `client/`.'
			},
			code('adapters/ostinato/partition.js', 63, 82),
			code('adapters/ostinato/files/handler.js', 157, 198),
			{
				type: 'p',
				text: '`originFor` is the origin SvelteKit compares against for CSRF: baked in at build time from `paths.origin`, else guessed from the headers — the guess that goes wrong behind a proxy, and why the first exists. There used to be an `ORIGIN` environment variable between the two; adapter-node 6 removed it and this adapter follows, because an origin that could differ between the build and the process is exactly what `static: true` on `PUBLIC_ORIGIN` rules out (ch. 36). `getRequest` is synchronous in 3.0 — the body becomes a stream, nothing is read yet — so there is no `await` on it. `respond` passes `platform`, which becomes `event.platform` in the app: the adapter’s name, which function answered — catch-all included — and when the process started.'
			},
			code('adapters/ostinato/files/handler.js', 200, 248),
			{
				type: 'why',
				title: 'Why `applyReroute`',
				text: 'The catch-all has no routes. If its `reroute` hook produced a different path, the response carries `x-sveltekit-rerouted-url`, and `applyReroute(response, next)` calls `next` with that URL; otherwise it returns the response untouched — a 404, or `/_app/env.js`, which every server can answer. The rerouted request is a *new* request to the owning function, so `event.url` there is the rerouted URL. That is the same trade every multi-function platform makes, and it is why the `reroute` hook is documented as not changing `event.url`: within one function it does not; across two, the second never saw the original.'
			},
			{
				type: 'warn',
				text: 'The catch-all having no routes has one consequence worth knowing before it bites. When its `reroute` hook fetches `/api/resolve`, SvelteKit tries to answer in-process, finds no route, and — because it is a sub-request — makes a real HTTP request to the request’s own origin instead (`respond.js`, ch. 26). That request goes to `PUBLIC_ORIGIN`, so `PUBLIC_ORIGIN` must name the port the server is actually on; the end-to-end config sets both. Nothing in `handleFetch` has to help: an earlier version switched to `globalThis.fetch` itself for the catch-all, and that branch never ran, because SvelteKit had already done it.'
			},
			code('adapters/ostinato/files/handler.js', 254, 268),
			code('adapters/ostinato/files/index.js', 13, 40),
			{
				type: 'p',
				text: 'The process is one HTTP server and a shutdown that finishes the requests it has. `closeIdleConnections` matters: keep-alive sockets with nothing on them would otherwise hold the process open until the platform’s timeout, which is the slow, ugly kind of shutdown that looks like a hang.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which of the five steps every adapter takes, and what this adapter adds to steps 3 and 4.',
					'You can say why the third server has no routes and what would break if it had one, and why the three cannot share a bundle.',
					'You can trace `/@ostinato/four-on-the-floor` from the socket to the `pages` function.'
				]
			}
		]
	},

	{
		slug: 'the-service-worker',
		title: 'The service worker',
		summary:
			'The application shell cached on install from `$app/manifest`, resolved with `$app/paths`, versioned by `version` from `$app/env`, typed through `$app/service-worker` and its own tsconfig in `src/service-worker/` — and the two paths it must never cache, with the reason.',
		goal: 'Write a service worker against SvelteKit 3’s split modules, type-check it with the WebWorker library, and know what a cached live query would do to you.',
		blocks: [
			code('src/service-worker/index.ts', 1, 36),
			{
				type: 'p',
				text: 'SvelteKit 3 removed the old `$service-worker` module, and three modules replace it. The build’s files are `$app/manifest` — `immutable`, `assets`, `prerendered` — the build id is `version` from `$app/env`, and the path helpers are `resolve` and `asset` from `$app/paths`. A fourth module, `$app/service-worker`, is new rather than a replacement — `$service-worker` never had anything like it — and exports one thing: a correctly typed `self`, so the worker’s global is a `ServiceWorkerGlobalScope` without a cast. The manifest lists every file *relative to the base path* — `_app/…`, `robots.txt`, an empty string for the landing page — and the `fetch` handler compares against `url.pathname`, which is absolute; `resolve` is what turns the one into the other, and a worker that skipped it would cache the shell on install and then never match a request.'
			},
			code('src/service-worker/index.ts', 38, 82),
			code('src/service-worker/index.ts', 84, 115),
			{
				type: 'warn',
				text: 'A `query.live` response is a stream that stays open as long as the page does. A cached clone of it would keep streaming into the cache long after the page closed — the failure the docs warn about by name. Both remote functions and the API live under paths this file refuses to touch, and the `no-store` header those responses carry is checked as well: belt and braces, because the cost of being wrong is a leak.'
			},
			code('src/service-worker/tsconfig.json', 1, 18),
			{
				type: 'p',
				text: 'The worker lives in a folder of its own, `src/service-worker/`, because it is a TypeScript project of its own: the `tsconfig.json` beside it extends `$app/tsconfig/service-worker` — generated by SvelteKit, with the WebWorker library instead of the DOM one — and the root `tsconfig.json` excludes the folder, so a `fetch` event is a `FetchEvent` in one project and the DOM’s in the other and never both. The `check` script runs both: `svelte-check` for the app, `tsc --noEmit -p src/service-worker/tsconfig.json` for the worker.'
			},
			code('playwright.config.ts', 45, 55),
			code('e2e/service-worker.e2e.ts', 10, 24),
			{
				type: 'note',
				text: 'The end-to-end suite blocks service workers. Headless Chromium in a container with no sound device crashes with a segmentation fault when a context that has a registered worker is torn down while audio is running — found the hard way, three times. So the suite checks the worker as a document instead: that the build produced it, that it is versioned, and that the two refusals survive minification as string literals. It is a weaker test and an honest one.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the three modules that replaced `$service-worker`, what each exports, and what the new fourth one adds.',
					'You can say what happens if the `/_app/remote/` guard is removed.',
					'You can explain why the worker has its own tsconfig.'
				]
			}
		]
	},

	{
		slug: 'the-security-posture',
		title: 'The security posture',
		summary:
			'One place for the decisions spread across seven files: a CSP in `auto` mode with the three directives this app needs, CSRF with an empty trusted list, the signed cookie’s flags, one set of security headers for what SvelteKit renders and what the adapter serves as files, CORS on exactly one endpoint, a test that proves the policy covers every inline script, one that proves it blocks nothing else, and one that proves the prerendered page is not left out.',
		goal: 'Read the whole posture as one decision, and know which trade each line makes.',
		blocks: [
			code('vite.config.ts', 162, 205),
			{
				type: 'p',
				text: '`mode: "auto"`: hashes for prerendered pages, where the whole document is known at build time and a file cannot carry a header, and nonces for dynamically rendered ones, which stream scripts after the header has gone. Three directives go past `self`, and each has a reason that can be checked. `media-src blob:` because the exported WAV is played from a Blob URL. `font-src data:` because Vite inlines any asset under four kilobytes as a data URL (`build.assetsInlineLimit`), and one of fontsource’s subset files is that small, so the built stylesheet carries a `url(data:font/woff2;…)`. And `style-src "unsafe-inline"` — a deliberate trade: knobs and the playhead set custom properties per frame through `style:` attributes, which cannot be hashed and to which a nonce does not apply. The exposure is CSS injection, not script execution, and `script-src` never gets the same allowance.'
			},
			{
				type: 'note',
				text: '`img-src` is `self` alone, and it used to allow `data:` too, “for the share card preview”. The reason was never true: the card in the studio and on the pattern page has always been a URL on this origin, `/p/<id>/card.svg`, and nothing in the app draws a data-URL image. An allowance with a false reason is worse than none — it teaches the next person that the list is folklore — so it went, and the test below that visits both pages and fails on any violation is what keeps it gone.'
			},
			code('e2e/landing.e2e.ts', 9, 28),
			code('e2e/platform.e2e.ts', 44, 90, { partial: true }),
			{
				type: 'why',
				title: 'Why a test hashes the scripts itself',
				text: 'A policy that is too strict blocks the app’s own bootstrap and the page never hydrates; a policy that is too loose is decoration. The test fetches three pages — dynamic, dynamic with data, prerendered — finds every inline `<script>`, computes its SHA-256, and checks that the policy in force (header or `<meta>`) names that hash or that the script carries the nonce. It is the only way to know the policy covers what SvelteKit emits, and it is what would catch a framework upgrade that added a new inline script. The test after it checks the other direction: with a console listener attached, it plays and stops a pattern in the studio and opens a pattern page with its share card, and fails on any policy violation that is not about `script-src` — those come from Playwright’s own injected scripts. A directive too tight for either page is a failing test rather than a blank where the card should be.'
			},
			{ type: 'h3', id: 'csrf-and-the-cookie', text: 'CSRF, and the cookie' },
			code('vite.config.ts', 207, 213),
			code('src/env.ts', 23, 40),
			{
				type: 'p',
				text: 'SvelteKit refuses a form submission or a remote function call whose origin does not match. `trustedOrigins` exists for a form on a partner’s domain; that case does not exist, so the list is empty and stays empty until somebody can name the domain. The origin it compares against is `PUBLIC_ORIGIN`, `static: true` — inlined at build time, because `paths.origin` in the config reads the same variable during the build, and a value that could differ between build and run would make the check compare two different origins.'
			},
			code('src/lib/server/artist.ts', 57, 69),
			{
				type: 'p',
				text: 'The cookie (ch. 22): signed so it cannot be forged; `httpOnly` so a script on the page cannot read it; `sameSite: "lax"` so a link from elsewhere arrives signed in but a cross-site POST does not; `secure` whenever the app is served over HTTPS. A year, because losing the cookie is losing the account and nobody wants that on a schedule.'
			},
			{ type: 'h3', id: 'headers-and-cors', text: 'Headers, and CORS on one endpoint' },
			code('src/hooks.server.ts', 75, 76),
			{
				type: 'p',
				text: '`nosniff`, a referrer policy, and a permissions policy that turns off the microphone, the camera and geolocation: an instrument that makes sound has no business hearing any. They come from one object in one module, and `handleSecurity` sets them on everything SvelteKit renders. `frame-ancestors "none"` in the CSP is the modern `X-Frame-Options`, and on a rendered page it is enough.'
			},
			code('src/lib/security.ts', 1, 26),
			{
				type: 'p',
				text: 'The landing page is not a rendered page. It is prerendered, and the adapter serves it — like every built asset — straight from disk with `sirv`, without calling SvelteKit, so no hook runs and nothing `handleSecurity` sets ever reaches it. Its CSP survives, because SvelteKit writes that into the file as a `<meta http-equiv>` tag. But browsers ignore `frame-ancestors` in a meta tag — the SvelteKit docs say so in as many words: “`frame-ancestors`, `report-uri` and `sandbox` directives will be ignored” — which left the first page most people see free to be framed by any site, and missing the other three headers as well. The fix is in the place that serves files: the adapter takes a `headers` option, `vite.config.ts` hands it `FILE_HEADERS` — the same three, plus `X-Frame-Options: DENY`, which does `frame-ancestors`’ job from a header and needs no second policy — and `serve()` sets them on every file.'
			},
			code('adapters/ostinato/files/handler.js', 94, 116),
			code('e2e/landing.e2e.ts', 30, 39),
			code('src/routes/api/patterns/[id]/+server.ts', 21, 38),
			{
				type: 'p',
				text: 'Exactly one endpoint says `Access-Control-Allow-Origin: *`: the one the embeddable player fetches from other origins. It is read-only and public — the same data is on the pattern’s page for anyone — so there is nothing to protect by withholding it. Everything else is same-origin by default, which is the default worth keeping.'
			},
			code('src/routes/(app)/p/[id]/card.svg/+server.ts', 43, 52),
			{
				type: 'p',
				text: 'The share card sets its own policy from what the render actually produced: `hashes.script` is read rather than assumed empty. Today that is `script-src "none"`, and the end-to-end suite checks that string — so if a future change put a script in the card, the test would notice the policy had changed rather than the card breaking silently.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why prerendered and dynamic pages carry the policy differently.',
					'You can defend `style-src "unsafe-inline"` in one sentence and say what you would need to remove it.',
					'You can explain what `PUBLIC_ORIGIN` being `static` has to do with CSRF.',
					'You can say which responses `handleSecurity` never sees, and where their headers come from instead.'
				]
			}
		]
	}
];
