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
			code('src/lib/embed/OstinatoPlayer.svelte', 109, 123),
			{
				type: 'p',
				text: '`$host()` is the custom element itself. Events dispatched on it — `ready`, `play`, `stop`, `error` — are how the element talks to the page around it: `player.addEventListener("play", …)` with nothing but the DOM. `composed: true` lets the event cross the shadow boundary.'
			},
			code('src/lib/embed/OstinatoPlayer.svelte', 125, 168),
			{
				type: 'p',
				text: 'Two effects. The first fetches whenever the id or origin changes — a network request in response to a prop is an interaction with the outside world, which is what `$effect` is for — with a `cancelled` flag so a response for an old id is dropped. The second drives the transport from the `playing` prop and reports back, so setting the attribute, calling the method and pressing the button all do the same thing.'
			},
			{ type: 'h3', id: 'built-twice', text: 'Built twice' },
			code('vite.config.ts', 54, 74),
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
			code('src/routes/(app)/embed/+page.svelte', 7, 36),
			{
				type: 'p',
				text: 'The documentation page defines the element by importing its module on mount — client-only, because a shadow root does not exist until JavaScript runs — and builds the paste-able snippet with a `SvelteURL`, whose `hostname` and `port` are bound to two inputs and whose `origin` follows both. The closing script tag is assembled in two halves because a literal one inside a `<script>` block would end the block.'
			},
			code('src/routes/(app)/embed/demo/+page@.svelte', 4, 23),
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
			'What an adapter is: `writeClient`, `writePrerendered`, `generateManifest` per function, a runtime bundled with rolldown, `builder.instrument`, an `emulate()` for development, and adapter-provided Vite plugins. Then the part that is only this adapter: a catch-all with no routes, and `applyReroute`.',
		goal: 'Read a whole adapter and know which five steps every adapter takes; understand the manifest-per-function split; and see how SvelteKit 3’s `applyReroute` hands a request between functions.',
		blocks: [
			code('adapters/ostinato/index.js', 1, 26),
			{
				type: 'p',
				text: 'An adapter is the thing that takes SvelteKit’s build output and turns it into a program for a particular place. Everything up to step 2 in that list is *every* adapter; everything after it is this one. It targets a plain Node process, like `adapter-node`, and is smaller in every way that does not matter and one that does: it deploys the app as two functions and a catch-all.'
			},
			code('adapters/ostinato/index.js', 47, 74, { partial: true }),
			{ type: 'h3', id: 'the-split', text: 'The split, and a manifest per function' },
			code('adapters/ostinato/partition.js', 1, 21),
			code('adapters/ostinato/partition.js', 23, 48),
			{
				type: 'why',
				title: 'Why split at all',
				text: 'A single function would be simpler and, for this app, faster. But a single function never *needs* `applyReroute`, and the reason SvelteKit 3 added it is precisely that platforms split apps across functions. An adapter that shows how the hand-off works has to split something, and `/api` is the natural seam: the part somebody would scale, cache and rate-limit differently. Fully prerendered routes go to neither — they are files.'
			},
			code('adapters/ostinato/index.js', 76, 121),
			{
				type: 'p',
				text: '`builder.generateManifest({ routes })` produces a manifest that knows *only* those routes. Three are written: pages, api, and one with no routes at all. A `Server` built from the empty manifest can still run the hooks — and when `reroute` changes the path of a request it received, SvelteKit sets an `x-sveltekit-rerouted-url` header on the response. That header is set only when the manifest has zero routes, which is why the catch-all is route-less rather than a copy of pages. `entries.js` carries what the runtime needs that only the build knows: the origin baked in for CSRF, the prerendered paths, the route patterns as regex sources.'
			},
			{ type: 'h3', id: 'bundling', text: 'Bundling the runtime' },
			code('adapters/ostinato/index.js', 123, 189),
			{
				type: 'p',
				text: 'The runtime in `files/` imports `SERVER`, `MANIFEST_PAGES` and friends by name — modules that exist only after the build. A rolldown plugin resolves each to the generated file. Production dependencies stay external and everything else is bundled in, so `build/` runs with `pnpm install --prod`. One thing must not be bundled twice: the OpenTelemetry API, or the SvelteKit runtime and the instrumentation file would report spans to two different worlds.'
			},
			code('adapters/ostinato/index.js', 191, 203),
			{
				type: 'p',
				text: '`builder.instrument` renames `index.js` to `start.js` and writes a new `index.js` that imports the instrumentation file and *then* dynamically imports `start.js`. That order is the whole feature (ch. 32).'
			},
			code('adapters/ostinato/index.js', 206, 253),
			{
				type: 'p',
				text: 'Three more things an adapter can declare. `emulate()` fills in `event.platform` during `vite dev` and `vite preview`, with the same shape the runtime produces, so nothing has to guard against `undefined`. `supports` says what the runtime can do — `read()` from `$app/server`, instrumentation. And since SvelteKit 3.0.0-next.18 an adapter can contribute Vite plugins, `pre` or `post`: this one provides `virtual:adapter`, which the diagnostics page imports.'
			},
			code('src/app.d.ts', 41, 54),
			{ type: 'h3', id: 'the-runtime', text: 'The runtime: four steps per request' },
			code('adapters/ostinato/files/handler.js', 1, 17),
			code('adapters/ostinato/files/handler.js', 19, 61),
			{
				type: 'p',
				text: 'Three `Server`s from three manifests — the whole SvelteKit runtime each, with a different idea of which routes exist; the code behind the routes is shared, because the bundle has one copy. `server.init` runs the app’s `init` hook and hands each server its environment and a `read` implementation that streams files from `client/`.'
			},
			code('adapters/ostinato/partition.js', 62, 81),
			code('adapters/ostinato/files/handler.js', 126, 163),
			{
				type: 'p',
				text: '`originFor` is the origin SvelteKit compares against for CSRF: baked in at build time, else `ORIGIN` from the environment, else guessed from the headers — the guess that goes wrong behind a proxy, and why the first two exist. `respond` passes `platform`, which becomes `event.platform` in the app: the adapter’s name, which function answered, when the process started.'
			},
			code('adapters/ostinato/files/handler.js', 165, 211),
			{
				type: 'why',
				title: 'Why `applyReroute`',
				text: 'The catch-all has no routes. If its `reroute` hook produced a different path, the response carries `x-sveltekit-rerouted-url`, and `applyReroute(response, next)` calls `next` with that URL; otherwise it returns the response untouched — a 404, or `/_app/env.js`, which every server can answer. The rerouted request is a *new* request to the owning function, so `event.url` there is the rerouted URL. That is the same trade every multi-function platform makes, and it is why the `reroute` hook is documented as not changing `event.url`: within one function it does not; across two, the second never saw the original.'
			},
			{
				type: 'warn',
				text: 'Two things bit while building this, both about the catch-all having no routes. SvelteKit’s in-process same-origin `fetch` in a route-less server falls through to a *real* `fetch`, so `PUBLIC_ORIGIN` must match the port the server is actually on — the end-to-end config sets both. And `handleFetch` has to use `globalThis.fetch` when `event.platform.entry` is `router` (ch. 26), or the resolver call answers itself with a 404.'
			},
			code('adapters/ostinato/files/handler.js', 217, 231),
			code('adapters/ostinato/files/index.js', 13, 40),
			{
				type: 'p',
				text: 'The process is one HTTP server and a shutdown that finishes the requests it has. `closeIdleConnections` matters: keep-alive sockets with nothing on them would otherwise hold the process open until the platform’s timeout, which is the slow, ugly kind of shutdown that looks like a hang.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can list the five things every adapter does and the two that only this one does.',
					'You can say why the third manifest has no routes and what would break if it had one.',
					'You can trace `/@ostinato/four-on-the-floor` from the socket to the `pages` function.'
				]
			}
		]
	},

	{
		slug: 'the-service-worker',
		title: 'The service worker',
		summary:
			'The application shell cached on install from `$app/manifest`, versioned by `version` from `$app/env`, typed through `$app/service-worker` and its own tsconfig — and the two paths it must never cache, with the reason.',
		goal: 'Write a service worker against SvelteKit 3’s split modules, type-check it with the WebWorker library, and know what a cached live query would do to you.',
		blocks: [
			code('src/service-worker.ts', 1, 27),
			{
				type: 'p',
				text: 'SvelteKit 3 split the old `$service-worker` module apart. The build’s files are `$app/manifest` — `immutable`, `assets`, `prerendered` — the build id is `version` from `$app/env`, and `$app/service-worker` exports one thing: a correctly typed `self`, so the worker’s global is a `ServiceWorkerGlobalScope` without a cast.'
			},
			code('src/service-worker.ts', 29, 56),
			code('src/service-worker.ts', 58, 89),
			{
				type: 'warn',
				text: 'A `query.live` response is a stream that stays open as long as the page does. A cached clone of it would keep streaming into the cache long after the page closed — the failure the docs warn about by name. Both remote functions and the API live under paths this file refuses to touch, and the `no-store` header those responses carry is checked as well: belt and braces, because the cost of being wrong is a leak.'
			},
			code('tsconfig.service-worker.json', 1, 13),
			{
				type: 'p',
				text: 'The worker is excluded from the main `tsconfig.json` and checked by its own, which extends `$app/tsconfig/service-worker` — generated by SvelteKit, with the WebWorker library instead of the DOM one. The `check` script runs both: `svelte-check` for the app, `tsc --noEmit -p tsconfig.service-worker.json` for this file.'
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
					'You can name the three modules that replaced `$service-worker` and what each exports.',
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
			'One place for the decisions spread across six files: a CSP in `auto` mode with the three directives an instrument needs, CSRF with an empty trusted list, the signed cookie’s flags, the headers `handleSecurity` adds, CORS on exactly one endpoint, and two tests that prove the policy covers every inline script.',
		goal: 'Read the whole posture as one decision, and know which trade each line makes.',
		blocks: [
			code('vite.config.ts', 141, 172),
			{
				type: 'p',
				text: '`mode: "auto"`: hashes for prerendered pages, where the whole document is known at build time and a file cannot carry a header, and nonces for dynamically rendered ones, which stream scripts after the header has gone. Three directives are specific to an instrument. `media-src blob:` because the exported WAV is played from a Blob URL. `img-src data:` for the share card preview. And `style-src "unsafe-inline"` — a deliberate trade: knobs and the playhead set custom properties per frame through `style:` attributes, which cannot be hashed and to which a nonce does not apply. The exposure is CSS injection, not script execution, and `script-src` never gets the same allowance.'
			},
			code('e2e/landing.e2e.ts', 9, 28),
			code('e2e/platform.e2e.ts', 44, 72, { partial: true }),
			{
				type: 'why',
				title: 'Why a test hashes the scripts itself',
				text: 'A policy that is too strict blocks the app’s own bootstrap and the page never hydrates; a policy that is too loose is decoration. The test fetches three pages — dynamic, dynamic with data, prerendered — finds every inline `<script>`, computes its SHA-256, and checks that the policy in force (header or `<meta>`) names that hash or that the script carries the nonce. It is the only way to know the policy covers what SvelteKit emits, and it is what would catch a framework upgrade that added a new inline script.'
			},
			{ type: 'h3', id: 'csrf-and-the-cookie', text: 'CSRF, and the cookie' },
			code('vite.config.ts', 174, 180),
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
			code('src/hooks.server.ts', 79, 82),
			{
				type: 'p',
				text: '`nosniff`, a referrer policy, and a permissions policy that turns off the microphone, the camera and geolocation: an instrument that makes sound has no business hearing any. `frame-ancestors "none"` in the CSP is the modern `X-Frame-Options`.'
			},
			code('src/routes/api/patterns/[id]/+server.ts', 21, 37),
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
					'You can explain what `PUBLIC_ORIGIN` being `static` has to do with CSRF.'
				]
			}
		]
	}
];
