/**
 * PART 6 — Pages of every kind
 * (chapters 32–36)
 *
 * Five chapters, five kinds of page: forms that sign people in, a list built
 * from two queries, guides prerendered from Markdown with no JavaScript, a
 * dynamic page reading prerendered data next to a diagnostics page reading
 * the server's own traces, and the two ways a trip leaves the app — a frame
 * and a custom element.
 */

import { code } from './quote.js';

const ROUTES = 'src/routes';

export const part6 = [
	{
		slug: 'signing-in-and-up',
		title: 'Signing in and up',
		summary:
			'Two remote forms, a hidden redirect field the server sanitises, `issues()` under each input, a group layout that redirects strangers before rendering, and a sign-out that is a form with no fields.',
		goal: 'Build the identity pages so they work with JavaScript off, come back to where the person was going, and never help an attacker enumerate accounts.',
		blocks: [
			{
				type: 'p',
				text: 'The identity pages are the plainest pages in the app and the ones with the most to get right. Every one is a remote `form` spread onto a real `<form>`: it submits with JavaScript off and enhances with it on.'
			},
			code(`${ROUTES}/(site)/(auth)/signin/+page.svelte`, 1, 18),
			code(`${ROUTES}/(site)/(auth)/signin/+page.svelte`, 20, 66),
			{
				type: 'p',
				text: '`fields.email.as("email")` writes the name, the type and the current value; `issues()` are the validation messages for that field — from the schema, or from `invalid()` on the server, which chapter 17 showed putting “That email and password do not match” on the password field. Where to go afterwards rides in a hidden field; the server sanitises it, so a crafted link cannot send somebody who has just typed a password to another site. `pending` disables the button while a submission is in flight.'
			},
			code(`${ROUTES}/(site)/(auth)/signup/+page.svelte`, 17, 63),
			{
				type: 'p',
				text: 'Sign-up is the same shape with a name and a `minlength` on the password that matches the schema’s twelve — the browser refuses first, the schema refuses second, Better Auth refuses third, and the message under the field is the same in all three languages. `autocomplete="new-password"` lets a password manager offer to generate one.'
			},
			{ type: 'h3', id: 'typed-early', text: 'What was typed before the page woke up' },
			code('src/lib/forms/keep-typed.ts', 29, 42),
			{
				type: 'p',
				text: 'Both pages call `keepTyped()` at the top of their script, and it earns its place with a bug the end-to-end suite found. A server-rendered form is usable before the JavaScript arrives — that is the point of rendering it on the server — and on a slow connection a person can have typed their email by the time the bundle runs. Then hydration happens: the field spreads its *current* value onto the input, the current value is the empty string the server knew about, and what was typed is gone. The person presses the button and the browser says “Please fill out this field” about a field they filled. Playwright types faster than a bundle loads, so about one run in ten signed in with an email that had vanished.'
			},
			{
				type: 'p',
				text: 'The fix uses an ordering guarantee worth knowing: a component’s `<script>` runs *before* its template is hydrated, while the server’s HTML is still on the page. So the helper reads what is in each input now, and makes it the field’s value with `set()`, and hydration writes the typed text back instead of nothing. It finds the input by the exact generated name the field’s own `as()` reports — `email/<hash>/signIn` — so a field on some other form can never be mistaken for this one, and on a client-side navigation there is no server HTML, the query finds nothing, and nothing happens.'
			},
			code('e2e/account.e2e.ts', 38, 61),
			{
				type: 'p',
				text: 'The test that pins it holds the client bundle back with `page.route`, types into the server-rendered page, checks that the root element has no `data-hydrated` attribute yet, lets the bundle through, waits for the attribute the root layout sets in `onMount` (chapter 23), and only then asserts that the text is still there and that the sign-in goes through. Without the attribute the test would have nothing honest to wait for, and a `waitForTimeout` would be a guess.'
			},
			code(`${ROUTES}/(site)/(auth)/+layout.svelte`, 1, 21),
			code(`${ROUTES}/(site)/(app)/+layout.server.ts`, 1, 27),
			{
				type: 'p',
				text: 'The `(auth)` group is a centred card; the `(app)` group is a guard. Every route under `(app)` needs a person, and checking once in a layout `load` means no page inside can forget — and it happens before rendering starts, so the answer is a real 303 with `redirectTo` carrying the page they wanted. The remote functions check too, with `requireUser()`, because a remote function can be called from anywhere. The trip page is deliberately not in the group: a trip visible by link is readable without an account.'
			},
			code('src/lib/ui/Header.svelte', 68, 83, { partial: true }),
			{
				type: 'p',
				text: 'Signing out is a `<form>` spread from `signOut`, a remote form with no fields, so the button in the header works before any JavaScript has loaded and after it has failed to. It redirects home; the layout’s `load` runs again and the header renders the signed-out state.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `fields.x.as()` writes onto an input and where `issues()` come from.',
					'You can explain why the guard is a layout `load` and why the trip page is outside it.',
					'You know why sign-out is a form.'
				]
			}
		]
	},

	{
		slug: 'trips-and-a-new-trip',
		title: 'The trips list and a new trip',
		summary:
			'A list awaited in markup with a `failed` snippet and no `pending` one; a preview per card through `query.batch` — two requests for twenty trips; a thumbnail component; and a creation form whose date picker writes hidden inputs named by the form itself, prefilled from the explore page.',
		goal: 'Compose a page from two remote reads and one remote form, and let a headless picker participate in a form it knows nothing about.',
		blocks: [
			code(`${ROUTES}/(site)/(app)/trips/+page.svelte`, 1, 20),
			code(`${ROUTES}/(site)/(app)/trips/+page.svelte`, 35, 85, { partial: true }),
			{
				type: 'p',
				text: 'The boundary has a `failed` snippet and no `pending` one, for the reason the comment gives: on the server every promise inside is awaited before the HTML is sent, so the first paint is the list, and a `pending` snippet is what the server would render instead. Inside the loop, every card awaits `tripPreview(trip.id)`; those calls are made in the same tick, and `query.batch` sends them as one request. Twenty trips is two round trips, not twenty-one. The card link uses `resolve()` with the route id, so a renamed folder is a type error and not a 404.'
			},
			code('src/lib/ui/RouteThumb.svelte', 1, 43),
			code('src/lib/ui/RouteThumb.svelte', 45, 53),
			{
				type: 'p',
				text: 'The thumbnail is the library’s sparkline idea applied to a route: longitude across, latitude up, scaled to fit — wrong for the world and right for a trip. `role="img"` with the trip’s name is what a screen reader gets. Chapter 41 tests it in a browser: three points, three circles, one path.'
			},

			{ type: 'h3', id: 'new-trip', text: 'A new trip' },
			code(`${ROUTES}/(site)/(app)/trips/new/+page.svelte`, 1, 18),
			code(`${ROUTES}/(site)/(app)/trips/new/+page.svelte`, 24, 84),
			{
				type: 'p',
				text: 'Three things in one form. The name is prefilled from `?place=`, which the explore page sets: the gazetteer comes from the prerendered `places()`, already in the browser’s cache from the page that linked here, and `as("text", suggested)` sets the initial value. The description and currency are ordinary fields. The dates are the picker from chapter 21 — and the picker renders its own hidden inputs, so they must carry the names SvelteKit expects, which encode the field’s type. So the names come from `fields.startDate.as("hidden", …).name`, the same call the form’s own inputs use, and the picker never learns what a remote form is. The issues for both dates are gathered into one prop and shown under the field.'
			},
			{
				type: 'note',
				text: 'This is the general pattern for any third-party input inside a remote form: let the library render what it renders, and give it the `name` that `fields.x.as(...)` would have produced. The form then receives the value the same way it would from a plain `<input>`, with JavaScript on or off.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the trips boundary has no `pending` snippet and how many requests twenty cards cost.',
					'You can say how the picker’s hidden inputs get their names and why that matters.',
					'You know how the explore page prefills the name without a store or a context.'
				]
			}
		]
	},

	{
		slug: 'guides-prerendered-with-mdsvex',
		title: 'Guides: Markdown, prerendered, no JavaScript',
		summary:
			'Four `.svx` files with validated frontmatter and a Svelte component inside the prose; `import.meta.glob` to find them; `prerender = true` and `csr = false` on the routes; `entries` for the dynamic one; a chrome that does not know who you are; and the two prerendering errors that shaped the root layout.',
		goal: 'Ship a static content section inside a dynamic app — compiled at build time, served as files in three languages, with zero client JavaScript — and know what prerendering forbids.',
		blocks: [
			{
				type: 'p',
				text: 'The guides are the static site inside the app: four short travel reads, written in Markdown, rendered once at build time in each language, and shipped without a byte of JavaScript. Every constraint in this chapter comes from that last clause.'
			},
			code('src/content/guides/lisbon-in-three-days.svx', 1, 15, { partial: true }),
			{
				type: 'p',
				text: 'A `.svx` file is Markdown with frontmatter and — because mdsvex compiles it to a Svelte component — any Svelte in the middle of it. The `<script>` imports a component and the prose uses it: `<Leg from="lisbon" to="sintra" />` renders the distance and compass direction between two gazetteer places, computed by the geodesy library at build time, so the reader receives a sentence.'
			},
			code('src/lib/guides/Leg.svelte', 1, 32),
			code('src/lib/guides/index.ts', 1, 47),
			code('src/lib/guides/index.ts', 49, 78),
			{
				type: 'p',
				text: '`import.meta.glob` is Vite’s: it imports every file matching the pattern, eagerly here because the list page needs every title and the folder is a handful of files. The frontmatter mdsvex exports as `metadata` is **validated** with valibot — a typo in `published:` is a build error, not an `Invalid Date` on a page that shipped — and a guide about a place the gazetteer does not know fails the build too.'
			},

			{ type: 'h3', id: 'the-routes', text: 'The routes' },
			code(`${ROUTES}/guides/+page.ts`, 1, 16),
			code(`${ROUTES}/guides/[guide]/+page.ts`, 1, 23),
			{
				type: 'p',
				text: 'Two page options do the work. `prerender = true` renders the page once at build time to a file. `csr = false` ships no client JavaScript for it — not deferred, none. A dynamic route can only be prerendered if SvelteKit knows its parameter values; the crawler finds most by following links, and `entries` says them out loud so a guide nothing links to is still built. The `load` is universal and runs at build time; the 404 for an unknown slug is what a request for a page that was not built gets from the server, because prerendered routes are not in the runtime manifest at all.'
			},
			code(`${ROUTES}/guides/+page.svelte`, 1, 47),
			code(`${ROUTES}/guides/[guide]/+page.svelte`, 1, 40),
			{
				type: 'p',
				text: 'The guide is a component — mdsvex compiled the Markdown into one — and `load` handed it over; rendering a component held in a variable is `<Guide />`, the same as any other. The dates are formatted in the page’s locale, which is decided per prerendered file: the crawler follows the language links, `reroute` maps `/de/guides` to the same route, the middleware sets German, and the output has a `de/guides.html` beside `guides.html`.'
			},
			code(`${ROUTES}/guides/+layout.svelte`, 1, 43),
			{
				type: 'p',
				text: 'A chrome that does not know you. These pages cannot depend on who is looking, so there is no “signed in as”, no theme button — the boot script still applies the stored theme — and the language links are plain links with `keepSearch={false}`. It is a small, honest header for a small, static site.'
			},

			{ type: 'h3', id: 'what-prerendering-forbids', text: 'Two errors that shaped the app' },
			{
				type: 'terminal',
				code: `
$ pnpm run build
…
Error: Cannot use prerendering if page template contains %sveltekit.nonce%
   → app.html: the boot script is allowed by its HASH instead (vite.config.ts)

$ pnpm run build
…
Error: Cannot access url.search on a page with prerendering enabled
   → LocaleSwitcher: keepSearch={false} on prerendered pages`
			},
			{
				type: 'p',
				text: 'Both errors are SvelteKit refusing to bake something request-specific into a file. A nonce is per request; a query string is per request; a signed-in person is per request — which is the third one, and the one SvelteKit cannot detect, because a layout `load` that reads `locals.user` returns `null` at build time without complaint. That is why chapter 23’s root layout has no `load`: the guides sit under it, and a `load` there would have shipped every guide page with “nobody is signed in” in its data.'
			},
			{
				type: 'why',
				title: 'Why mdsvex and not a Markdown library at runtime',
				text: 'Because the Markdown never changes between deploys, so parsing it per request is work for nothing, and because a runtime parser cannot put a Svelte component in the middle of a paragraph. mdsvex compiles once, the component in the prose is a real component, and `csr = false` means the reader’s browser downloads HTML and CSS and that is all. The alternative for content that *does* change between deploys is a CMS and a `query`; this project has no such content, and the survey in chapter 37 says which library it would reach for if it did.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `prerender` and `csr` each do and why both are on these routes.',
					'You can explain how the German guides get built and what `entries` adds to the crawler.',
					'You can name the three per-request things a prerendered page cannot have, and which one SvelteKit cannot detect.'
				]
			}
		]
	},

	{
		slug: 'explore-and-diagnostics',
		title: 'Explore, and diagnostics',
		summary:
			'A dynamic page reading prerendered data, debounced with runed, grouped with `Intl.DisplayNames`, linking with typed `resolve()`; and a page that reads the server’s own OpenTelemetry spans out of a ring buffer through `src/instrumentation.server.ts`.',
		goal: 'Mix prerendered data into a per-request page, use a utility library where it earns its place, and turn SvelteKit 3’s built-in tracing into a page you can read.',
		blocks: [
			code(`${ROUTES}/(site)/explore/+page.svelte`, 10, 50, { partial: true }),
			{
				type: 'p',
				text: 'Three things in forty lines. `await places()` at the top of the script — allowed in async mode — is the prerendered gazetteer: the page is dynamic because its header knows who you are, and its data is static, and that split is what `prerender` remote functions are for. `Intl.DisplayNames` turns country codes into names in the page’s language, a hundred strings per locale nobody translated. And runed’s `Debounced` follows `query` with a delay: `settled.current` changes 150 ms after the last keystroke, so the list is not rebuilt on every one. It takes a getter, so `query` stays a plain `$state`.'
			},
			code(`${ROUTES}/(site)/explore/+page.svelte`, 52, 69),
			code(`${ROUTES}/(site)/explore/+page.svelte`, 100, 136),
			{
				type: 'p',
				text: 'Two `resolve()` calls, one with a parameter and one without. The route id for the new-trip page is `/(site)/(app)/trips/new` — route ids include their groups, which surprises people the first time — and `resolve` gives back the pathname `/trips/new`, type-checked against the routes that exist. `localizeHref` then adds the language prefix. The place links to its guide when one exists, through `guideForPlace` from chapter 34.'
			},
			{
				type: 'why',
				title: 'Why runed, for one debounce',
				text: 'A debounce is fifteen lines to write and one to import, and the fifteen lines are the kind that get a subtle bug — a timer that survives unmount, a value that updates once too often. runed is a collection of such utilities written against runes by people who maintain Bits UI, and `Debounced`, `useEventListener`, `ElementSize` and `PersistedState` are the ones most apps reach for. The rule from chapter 01 holds: it sits behind one line, and removing it is writing the fifteen lines. Chapter 40 has the longer argument about utility libraries.'
			},

			{ type: 'h3', id: 'diagnostics', text: 'Diagnostics: the server’s own traces' },
			code('src/instrumentation.server.ts', 1, 27),
			code('src/lib/server/tracing.ts', 1, 31),
			{
				type: 'p',
				text: 'With `tracing.server` on, SvelteKit emits an OpenTelemetry span for every `handle`, `load`, form action and remote function. `src/instrumentation.server.ts` is loaded before any application code — in development through Vite, in production because adapter-node wires it in front of the entry point — and registers a tracer provider with one processor that hands every finished span to an exporter. The usual exporter sends spans to a collector over the network; this one keeps the last three hundred in memory, which is all a single-process app needs to answer “what did that request do?” on its own page.'
			},
			code('src/lib/server/tracing.ts', 33, 77),
			code('src/lib/server/tracing.ts', 79, 93),
			{
				type: 'p',
				text: 'The ring is module-level state shared by every request, which is usually the bug and here is the point: it holds nothing private, and only the diagnostics page reads it. `record` flattens a span to the fields the page shows; `recentSpans` returns a copy, newest first, so a reader cannot reach into the ring. The exporter is the OpenTelemetry interface — an `export` with a callback, and a `shutdown` — implemented in twelve lines.'
			},
			code('src/lib/remote/diagnostics.remote.ts', 1, 30),
			code(`${ROUTES}/(site)/(app)/diagnostics/+page.svelte`, 52, 120, { partial: true }),
			{
				type: 'p',
				text: 'The page is one query and a table: version, Node version, uptime formatted by `Intl` units; the live rooms with their watcher counts, from chapter 18; and the spans, indented when they have a parent. Open the trip page in another tab, come back, refresh — and the `watchTrip` span is there, with the `heartbeat` commands under it, which is how the presence loop in chapter 24 was first seen as a column of identical rows.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the explore page is dynamic and its data is prerendered, and what each half costs.',
					'You can give the route id for the new-trip page and say why it looks like that.',
					'You can trace a span from `tracing: { server: true }` through the instrumentation file to the table.'
				]
			}
		]
	},

	{
		slug: 'embedding-a-trip',
		title: 'Embedding a trip: a frame and a custom element',
		summary:
			'A JSON endpoint with CORS for link-visible trips only; the one route that may be framed and the CSP override that allows it; `<meridian-route>` compiled as a custom element by `dynamicCompileOptions`, built standalone by a second Vite config, previewed on the settings page; and a health endpoint for the machines.',
		goal: 'Let a trip leave the app safely — as an iframe and as a custom element on a stranger’s page — and know which compiler and CSP settings each needs.',
		blocks: [
			{
				type: 'p',
				text: 'A trip leaves the app in two shapes: an `<iframe>` pointing at `/embed/<slug>`, and a `<meridian-route>` element a host page includes with one script tag. Both exist only for trips the owner made visible by link, and both are the reason for two exceptions in the security configuration.'
			},
			code(`${ROUTES}/api/route/[slug=slug].json/+server.ts`, 1, 51),
			{
				type: 'p',
				text: 'The data both shapes read: name, dates, scheduled stops, nothing else. A private trip is a 404 whether or not the caller is signed in, because the element runs on somebody else’s page where our cookies are not sent and should not matter. `access-control-allow-origin: *` is what makes it usable from another origin, and is safe precisely because the response holds nothing that was not already public by link. `[slug=slug].json` in a folder name is SvelteKit’s way of giving an endpoint an extension.'
			},

			{ type: 'h3', id: 'the-frame', text: 'The frame' },
			code(`${ROUTES}/embed/[slug=slug]/+page.ts`, 1, 7),
			code(`${ROUTES}/embed/[slug=slug]/+page.svelte`, 1, 56),
			code('src/hooks.server.ts', 119, 136),
			{
				type: 'p',
				text: 'The frame page is outside the `(site)` group — no header — and has `csr = false`, so it is a few kilobytes of HTML and CSS. It refuses a private trip even to a member, because the frame is on somebody else’s page and their visitors are strangers. And it is the one route for which `hooks.server.ts` replaces `frame-ancestors "none"` with `*` after SvelteKit has built the policy — every other page in the app refuses to be framed, which is what stops clickjacking.'
			},

			{ type: 'h3', id: 'the-element', text: 'The custom element' },
			code('src/lib/embed/MeridianRoute.svelte', 1, 10),
			code('src/lib/embed/MeridianRoute.svelte', 12, 83, { partial: true }),
			{
				type: 'p',
				text: '`<svelte:options customElement>` names the tag, asks for an open shadow root, and maps two attributes onto props — so `<meridian-route slug="…">` on a host page becomes `slug` in the component. The element fetches the JSON and draws the stops as a projected line the way `RouteThumb` does. It is deliberately not the app’s component: an element that imported the design tokens would bring the tokens with it, and a shadow root means the host page’s CSS cannot reach in and ours cannot leak out.'
			},
			code('src/lib/embed/MeridianRoute.svelte', 85, 121),
			{
				type: 'p',
				text: 'Inside, a boundary with `pending` and `failed` around an `await` in markup — the same async pattern as every page, in a component that will run on a page that has never heard of SvelteKit. The style block is the whole of its styling, with literal colours, because there are no tokens where it is going.'
			},
			code('vite.config.ts', 75, 93),
			code('vite.element.config.ts', 1, 42),
			{
				type: 'p',
				text: 'Two compilers see this file. Inside the app, `dynamicCompileOptions` compiles anything under `embed` with `customElement: true` for the client build only — the server build compiles it as a plain component it never renders. Outside the app, a second Vite config with no SvelteKit builds `src/lib/embed/element.ts` into one IIFE file in `static/embed`, which SvelteKit then serves like any static asset at `/embed/meridian-route.js`. One file, no chunks, the Svelte runtime bundled in: the opposite of the app’s split bundle, because a host page cannot resolve our chunk names. The `build` and `dev` scripts run it first.'
			},
			code('src/lib/embed/element.ts', 1, 13),
			code(`${ROUTES}/(site)/t/[slug=slug]/settings/EmbedSection.svelte`, 1, 42),
			code(`${ROUTES}/(site)/t/[slug=slug]/settings/EmbedSection.svelte`, 44, 59),
			{
				type: 'p',
				text: 'The settings page shows both snippets and a live preview: it imports the element module on mount — importing is what defines the element — and writes `<meridian-route>` into its own markup. The snippet strings are assembled in two halves because a literal closing script tag inside a script block would end the block as far as the Svelte parser is concerned; that sentence is in the source too, because the next person to touch it would otherwise “fix” it.'
			},

			{ type: 'h3', id: 'health', text: 'And one endpoint for the machines' },
			code(`${ROUTES}/healthz/+server.ts`, 1, 32),
			{
				type: 'p',
				text: 'The question a load balancer, a container runtime and a person with `curl` all ask: is this process able to serve? “Able” means the database answers. `version` from `$app/env` is the commit the build was made from, so “which version is live?” is one request. `no-store`, because a cached “healthy” is worse than none. Chapter 44 shows the Dockerfile and the CI job asking it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which two security exceptions the embed needs and where each is made.',
					'You can explain `dynamicCompileOptions` and why the element also has its own Vite config.',
					'You know why the element has its own styles and its own colours.'
				]
			}
		]
	}
];
