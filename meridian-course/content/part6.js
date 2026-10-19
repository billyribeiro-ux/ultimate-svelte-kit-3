/**
 * PART 6 — Pages of every kind
 * (chapters {{signing-in-and-up}}–{{the-offline-itinerary}})
 *
 * Six chapters, six kinds of page: forms that sign people in, a list built
 * from two queries, guides prerendered from Markdown with no JavaScript, a
 * dynamic page reading prerendered data next to a diagnostics page reading
 * the server's own traces, the two ways a trip leaves the app — a frame
 * and a custom element — and a page that is still there with no network.
 */

import { code } from './quote.js';

const ROUTES = 'src/routes';
const TRIP = 'src/lib/trip';
const UI = 'src/lib/ui';

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
			code(`${ROUTES}/(site)/(auth)/signin/+page.svelte`, 1, 19),
			code(`${ROUTES}/(site)/(auth)/signin/+page.svelte`, 21, 73),
			{
				type: 'p',
				text: '`fields.email.as("email")` writes the name, the type and the current value; `issues()` are the validation messages for that field — from the schema, or from `invalid()` on the server, which chapter {{remote-functions-the-writes}} showed putting “That email and password do not match” on the password field. Where to go afterwards is read from `page.url.searchParams` — the `redirectTo` that the guard put on the address — and rides in a hidden field; the server sanitises it, so a crafted link cannot send somebody who has just typed a password to another site. `pending` disables the button while a submission is in flight. The form is `novalidate`: the schema on the server is the one validator, so a bad email comes back as the coral line under the field, with its warning icon on the first line of the message, the same with JavaScript on or off — not as the browser’s own bubble, which looks like nothing else in the product.'
			},
			code(`${ROUTES}/(site)/(auth)/signup/+page.svelte`, 18, 71),
			{
				type: 'p',
				text: '`signUp` is the same shape as `signIn`, with a name and a `minlength` on the password that matches the schema’s twelve — a hint to a password manager now that the form does not let the browser refuse: the schema refuses first, Better Auth second, and both answers arrive as the line under the field. `autocomplete="new-password"` lets a password manager offer to generate one.'
			},
			{ type: 'h3', id: 'typed-early', text: 'What was typed before the page woke up' },
			code('src/lib/forms/keep-typed.ts', 29, 42),
			{
				type: 'p',
				text: 'Both pages call `keepTyped()` at the top of their script, and it earns its place with a bug the end-to-end suite found. A server-rendered form is usable before the JavaScript arrives — that is the point of rendering it on the server — and on a slow connection a person can have typed their email by the time the bundle runs. Without it, hydration happened next: the field spread its *current* value onto the input, the current value was the empty string the server had known about, and what was typed was gone. The person pressed the button and the browser said “Please fill out this field” about a field they had filled. Playwright types faster than a bundle loads, so about one run in ten signed in with an email that had vanished.'
			},
			{
				type: 'p',
				text: 'The fix uses an ordering guarantee worth knowing: a component’s `<script>` runs *before* its template is hydrated, while the server’s HTML is still on the page. So the helper reads what is in each input now, and makes it the field’s value with `set()`, and hydration writes the typed text back instead of nothing. It finds the input by the exact generated name the field’s own `as()` reports — `email/<hash>/signIn` — so a field on some other form can never be mistaken for this one, and on a client-side navigation there is no server HTML, the query finds nothing, and nothing happens.'
			},
			code('e2e/account.e2e.ts', 45, 68),
			{
				type: 'p',
				text: 'The test that pins it holds the client bundle back with `page.route`, types into the server-rendered page, checks that the root element has no `data-hydrated` attribute yet, lets the bundle through, waits for the attribute the root layout sets in `onMount` (chapter {{the-shell}}), and only then asserts that the text is still there and that the sign-in goes through. Without the attribute the test would have nothing honest to wait for, and a `waitForTimeout` would be a guess.'
			},
			code(`${ROUTES}/(site)/(auth)/+layout.svelte`, 1, 76),
			code(`${ROUTES}/(site)/(app)/+layout.server.ts`, 1, 27),
			{
				type: 'p',
				text: 'The `(auth)` group is the brand mark over the form — straight on the paper on a phone, where a card inside a page inside a screen was a box in a box, and one card from 40em; the `(app)` group is a guard. Every route under `(app)` needs a person, and checking once in a layout `load` means no page inside can forget — and it happens before rendering starts, so the answer is a real 303 with `redirectTo` carrying the page they wanted. The remote functions check too, with `requireUser()`, because a remote function can be called from anywhere. The trip page is deliberately not in the group: a trip visible by link is readable without an account.'
			},
			code('src/lib/ui/Header.svelte', 153, 187),
			{
				type: 'p',
				text: 'Signing out is a `<form>` spread from `signOut`, a remote form with no fields, so the button in the header works before any JavaScript has loaded and after it has failed to. With JavaScript, the spread is `signOut.enhance(…)`: the callback receives a copy of the form, deletes the pages the service worker kept for offline reading, and only then calls `form.submit()` — the order matters, because those pages were rendered for the person leaving, and the next person on the device could otherwise open them in a tunnel (chapter {{the-offline-itinerary}}). It redirects home; the layout’s `load` runs again and the header renders the signed-out state. The header’s account corner is the same on every page — “New trip” for a person, “Sign in” for a stranger — so nothing in the header moves when the page changes under it. On its own page the action says so with `aria-current="page"`: `onNewTrip` and `onSignIn` read `page.route.id`, which is the same in every language, so `/de/signin` is recognised without a German string in the check.'
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
			'A list awaited in markup with a `failed` snippet and no `pending` one; a preview per card through `query.batch` — two requests for twenty trips; a thumbnail component; and a creation form whose date picker writes hidden inputs named by the form itself, prefilled from the explore page, whose draft survives a reload through `snapshot`.',
		goal: 'Compose a page from two remote reads and one remote form, and let a headless picker participate in a form it knows nothing about.',
		blocks: [
			code(`${ROUTES}/(site)/(app)/trips/+page.svelte`, 1, 33),
			code(`${ROUTES}/(site)/(app)/trips/+page.svelte`, 48, 127, { partial: true }),
			{
				type: 'p',
				text: 'The boundary has a `failed` snippet and no `pending` one, for the reason the comment gives: on the server every promise inside is awaited before the HTML is sent, so the first paint is the list, and a `pending` snippet is what the server would render instead. Inside the loop, every card awaits `tripPreview(trip.id)`; those calls are made in the same tick, and `query.batch` sends them as one request. Twenty trips is two round trips, not twenty-one. Both declarations are `$derived`, so a refreshed query redraws the list rather than leaving the first answer on screen. When the server refuses, the `failed` snippet prints the `message` of what it is handed, through `boundaryMessage` (chapter {{the-itinerary}}): an `App.Error`, `{ status, message }`, the failure after `handleError` (chapter {{environment-and-hooks}}). The first version wrote `error instanceof Error ? error.message : String(error)`, and since an `App.Error` is a plain object the list read `[object Object]`. Now an end-to-end test makes the preview request invalid on its way out and expects the server’s own sentence (chapter {{end-to-end}}). The card link uses `href()` from chapter {{the-shell}} — `resolve()` with the route id, then the language prefix — so a renamed folder is a type error and not a 404. There is one link per card, named by the trip, and an `::after` on it covers the whole card, so the card is the click target while the accessible name stays the name. On pointer down, or Enter, the card’s title takes `view-transition-name: trip-title` — the name must be unique on the page, so it goes on the one card being opened — and the trip page’s `<h1>` carries the same name, so the title morphs into the header during the navigation.'
			},
			code('src/lib/ui/Empty.svelte', 1, 57),
			{
				type: 'p',
				text: 'A new account’s trips list is empty — the `{:else}` of the list’s `{#each}`, which renders when the array has nothing in it — and so is a search that matches nothing and a trip with no expenses; all three are `Empty`, so “nothing here yet” looks and reads the same everywhere. Its one action is a `Snippet` prop — `action?: Snippet`, rendered with `{@render action()}` — because the caller knows what the action is: a link to the new-trip form here, a button that clears the search on the explore page. A snippet passed as a child, `{#snippet action()}…{/snippet}` inside `<Empty>`, *is* that prop, by name, so the call site reads like markup and the component stays ignorant of what it is rendering. The title is a paragraph in the display face, not a heading — “No expenses yet” must not be a second heading in a section already called Expenses — and the card sits at the left edge, like the heading above it, and centres its contents inside: a card floating in the middle of a left-aligned page had read as a dialog that had lost its way.'
			},
			{
				type: 'why',
				title: 'Why a snippet, and not an `href` and a label',
				text: 'An `href` and a label would cover the first use and not the second — a button that runs a function — and the third prop added for it (`onaction`?) would be the start of a component that grows an option per caller. A snippet hands the caller the whole slot: link, button, two buttons if a page ever needs them, with the caller’s own types and event handlers. The component owns the frame, the caller owns the content, and neither needs to know the other’s details.'
			},
			code('src/lib/ui/RouteThumb.svelte', 1, 61),
			code('src/lib/ui/RouteThumb.svelte', 63, 87),
			{
				type: 'p',
				text: 'The thumbnail is the library’s sparkline idea applied to a route: longitude across, latitude up, scaled to fit — wrong for the world and right for a trip, once a degree of longitude is shrunk by the cosine of the trip’s middle latitude, as it is on the ground. Without that, Iberia at 40°N was a flat smear across the top half of the box, drawn a third wider than it is. The route goes through every stop and the dots do not: five stops in one city are five rings drawn over each other at this size, a smudge, so a stop closer than 6 units to one already drawn shares its dot. That rule is also what keys the dots’ `{#each}`: no two are within 6 units of each other, so a dot’s position is unique, and it is all a dot is — the stops behind it are not in the loop, only their projection. A key that names the thing is the rule; an index is a position in a list, and says nothing about what is there. `role="img"` with the trip’s name is what a screen reader gets. Chapter {{unit-and-browser-tests}} tests it in a browser: three points, three circles, one path. The box is drawn at `width` × `height` — 160×90 on the trips list, 320×160 in the embed frame — and its shape comes from those two numbers, `style:aspect-ratio`, not from a fixed 16:9 in the CSS that letterboxed the embed’s 2:1 drawing between two empty bands. It is shown at whatever width the card or the frame is, so the route and the stops carry `vector-effect: non-scaling-stroke` — without it the 2px line would be 4px on a wide card and 1px in a narrow embed. And it holds still: twenty thumbnails tracing themselves at once would be the opposite of one thing moving at a time.'
			},

			{ type: 'h3', id: 'new-trip', text: 'A new trip' },
			code(`${ROUTES}/(site)/(app)/trips/new/+page.svelte`, 1, 43),
			code(`${ROUTES}/(site)/(app)/trips/new/+page.svelte`, 49, 109),
			{
				type: 'p',
				text: 'Three things in one form. The name is prefilled from `?place=`, which the explore page sets: the gazetteer comes from the prerendered `places()`, already in the browser’s cache from the page that linked here, and `as("text", suggested)` sets the initial value. The description and currency are ordinary fields. The dates are the picker from chapter {{dates-and-money-in-a-locale}} — and the picker renders its own hidden inputs, so they must carry the names SvelteKit expects, which encode the field’s type. So the names come from `fields.startDate.as("hidden", …).name`, the same call the form’s own inputs use, and the picker never learns what a remote form is. The issues for both dates are gathered into one prop and shown under the field.'
			},
			{
				type: 'note',
				text: 'This is the general pattern for any third-party input inside a remote form: let the library render what it renders, and give it the `name` that `fields.x.as(...)` would have produced. The form then receives the value the same way it would from a plain `<input>`, with JavaScript on or off.'
			},
			{
				type: 'p',
				text: 'And a draft that survives. `snapshot` from `$app/navigation` captures a value just before the page changes — a link, Back, a reload, a phone that discarded the tab — keeps it with that history entry, and hands it back when the entry is shown again. The documentation’s two sentences that matter here: captured values “are serialized with devalue”, through the app’s `transport` hook, and “persisted to `sessionStorage`, which allows the state to be restored when the page is reloaded”. The call sits above the page’s `await`, because `snapshot` registers itself with `onMount` and a lifecycle function belongs to initialisation; the explicit `id` keeps the draft across a deploy that moves the line, where the default id, worked out from the stack, would not.'
			},
			{
				type: 'why',
				title: 'Why the name, the description and the currency — and not the dates',
				text: 'Because a snapshot should put back exactly what the page can show. `createTrip.fields.value()` and `.set()` read and write the form’s values, and three of them are rendered from those values. The dates are not: `DateRangeField` reads its props once and owns its value after it mounts, so a restored date would sit in the form’s values while the picker showed an empty field — and a form that says one thing and shows another is worse than one that forgets. The older way to do this, `export const snapshot = { capture, restore }` from a `+page.svelte`, still works and is deprecated: it could only live in a route component, it serialised to JSON rather than through `transport`, and shallow navigations did not capture it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the trips boundary has no `pending` snippet and how many requests twenty cards cost.',
					'You can say how the picker’s hidden inputs get their names and why that matters.',
					'You know how the explore page prefills the name without a store or a context.',
					'You can keep a half-typed form across a reload with `snapshot`, and say why it restores three fields and not five.'
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
			code(`${ROUTES}/guides/[guide]/+page.ts`, 1, 24),
			{
				type: 'p',
				text: 'Two page options do the work. `prerender = true` renders the page once at build time to a file. `csr = false` ships no client JavaScript for it — not deferred, none. A dynamic route can only be prerendered if SvelteKit knows its parameter values; the crawler finds most by following links, and `entries` says them out loud so a guide nothing links to is still built. The `load` is universal and runs at build time; the 404 for an unknown slug is what a request for a page that was not built gets from the server, because prerendered routes are not in the runtime manifest at all.'
			},
			code(`${ROUTES}/guides/+page.svelte`, 1, 46),
			code(`${ROUTES}/guides/[guide]/+page.svelte`, 1, 49),
			{
				type: 'p',
				text: 'The guide is a component — mdsvex compiled the Markdown into one — and `load` handed it over; rendering a component held in a variable is `<Guide />`, the same as any other. The dates are formatted in the page’s locale, which is decided per prerendered file: the crawler follows the language links, `reroute` maps `/de/guides` to the same route, the middleware sets German, and the output has a `de/guides.html` beside `guides.html`.'
			},
			code(`${ROUTES}/guides/+layout.svelte`, 1, 51),
			{
				type: 'p',
				text: 'A chrome that does not know you. These pages cannot depend on who is looking, so there is no “signed in as”, no theme button — the boot script still applies the stored theme — and the language links are plain links with `keepSearch={false}`. On a phone it is two rows by design — the brand and EN · DE · PT on the first, the three links under them — and one row from 48em. It is a small, honest header for a small, static site.'
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
				text: 'Both errors are SvelteKit refusing to bake something request-specific into a file. A nonce is per request; a query string is per request; a signed-in person is per request — which is the third one, and the one SvelteKit cannot detect, because a layout `load` that reads `locals.user` returns `null` at build time without complaint. That is why chapter {{the-shell}}’s root layout has no `load`: the guides sit under it, and a `load` there would have shipped every guide page with “nobody is signed in” in its data.'
			},
			{
				type: 'why',
				title: 'Why mdsvex and not a Markdown library at runtime',
				text: 'Because the Markdown never changes between deploys, so parsing it per request is work for nothing, and because a runtime parser cannot put a Svelte component in the middle of a paragraph. mdsvex compiles once, the component in the prose is a real component, and `csr = false` means the reader’s browser downloads HTML and CSS and that is all. The alternative for content that *does* change between deploys is a CMS and a `query`; this project has no such content, and the survey in chapter {{choosing-libraries}} says which library it would reach for if it did.'
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
			code(`${ROUTES}/(site)/explore/+page.svelte`, 12, 95, { partial: true }),
			{
				type: 'p',
				text: 'Three things worth stopping on, and one small one. `await places()` at the top of the script — allowed in async mode — is the prerendered gazetteer: the page is dynamic because its header knows who you are, and its data is static, and that split is what `prerender` remote functions are for. (On the server, rendering this page, the same call fetches that file from the app’s public address, and falls back to running the function when it cannot — chapter {{remote-functions-the-reads}} says why the function is `dynamic` for that day.) `Intl.DisplayNames` turns country codes into names in the page’s language, a hundred strings per locale nobody translated. And runed’s `Debounced` follows `query` with a delay: `settled.current` changes 150 ms after the last keystroke, so the list is not rebuilt on every one. It takes a getter, so `query` stays a plain `$state`. The coordinates under each place read as a place — `38.72° N, 9.14° W` — and the compass letters are messages, because they are words: east is O in German and L in Portuguese, and west is O in Portuguese. The small one is `clear()`. Both “clear” buttons remove themselves — the one in the field shows only while there is a query, the one in the empty state only while nothing matches — and a button that disappears under the keyboard’s focus drops focus to the top of the document, so a keyboard user who cleared the search had to tab back through the header to type again. `clear()` empties the query and puts focus in the field, through a `bind:this`, which is where the next thing typed belongs. And `query` does not quite start empty. On a page the server rendered, the field is there and usable before the JavaScript is, and what a person types into it in that second was wiped when the page hydrated — `bind:value` writes the state into the input, and the state was the empty string the server knew. The script runs while the server’s input is still on the page, so the state starts from whatever is in it: the same cure as `keepTyped()` for the sign-in form in chapter {{signing-in-and-up}}, for a plain input. On a client-side navigation there is no server input to read, and it starts empty after all.'
			},
			code(`${ROUTES}/(site)/explore/+page.svelte`, 97, 135),
			code(`${ROUTES}/(site)/explore/+page.svelte`, 188, 244),
			{
				type: 'p',
				text: 'Two `href()` calls, one with a parameter and one without, and `resolve()` with the route id underneath each. The route id for the new-trip page is `/(site)/(app)/trips/new?place=…` — route ids include their groups, which surprises people the first time, and since SvelteKit 2.54, so in every 3.x, they may carry their search string — and `resolve` gives back `/trips/new?place=lisbon`, type-checked against the routes that exist, before the language prefix goes on. It gives that back on the server as well as in the browser because `paths.relative` is `false`; with the default, the server’s answer was `./trips/new?place=lisbon`, and chapter {{the-shell}} tells what became of it. The place links to its guide when one exists, through `guideForPlace` from chapter {{guides-prerendered-with-mdsvex}}. The countries are a grid in reading order — one column on a phone, two from 48em, three from 64em, `align-items: start` so a short country does not stretch to its neighbour’s height — and each country is unbroken, its places one under another. They were CSS columns once, `columns: 3 18rem`, and columns fill *down* first: the alphabet ran down a 4,000px page and started again at the top of the next column, so “Hong Kong” sat beside “Argentina” and a person scanning across for “Japan” never found it. A grid of *places* had been wrong the other way, leaving each country a row of one or two cards and the rest of the width empty; a grid of countries is the shape the content has. A place is a card and not a link — its two buttons are the links — so it does not lift on hover, because a lift says “this is a link”. The search row sticks under the header and draws its hairline once it is stuck, which a zero-height sentinel and an `IntersectionObserver` attached to it decide; the browser’s blue clear button is replaced by a ghost one of ours, and on a phone the count is the places alone, so the row stays one row.'
			},
			{
				type: 'why',
				title: 'Why runed, for one debounce',
				text: 'A debounce is fifteen lines to write and one to import, and the fifteen lines are the kind that get a subtle bug — a timer that survives unmount, a value that updates once too often. runed is a collection of such utilities written against runes by people who maintain Bits UI, and `Debounced`, `useEventListener`, `ElementSize` and `PersistedState` are the ones most apps reach for. The rule from chapter {{what-we-are-building}} holds: it sits behind one line, and removing it is writing the fifteen lines. Chapter {{reactivity-utilities}} has the longer argument about utility libraries.'
			},

			{ type: 'h3', id: 'diagnostics', text: 'Diagnostics: the server’s own traces' },
			code('src/instrumentation.server.ts', 1, 27),
			code('src/lib/server/tracing.ts', 1, 31),
			{
				type: 'p',
				text: 'With `tracing.server` on, SvelteKit emits an OpenTelemetry span for every `handle`, `load`, form action and remote function — and, since 3.1, for every `+server` handler, a `sveltekit.endpoint` span carrying the route and the method, so `/healthz` and the route API show in the table beside the pages. `src/instrumentation.server.ts` is loaded before any application code — in development through Vite, in production because adapter-node wires it in front of the entry point — and registers a tracer provider with one processor that hands every finished span to an exporter. The usual exporter sends spans to a collector over the network; this one keeps the last three hundred in memory, which is all a single-process app needs to answer “what did that request do?” on its own page.'
			},
			code('src/lib/server/tracing.ts', 33, 77),
			code('src/lib/server/tracing.ts', 79, 93),
			{
				type: 'p',
				text: 'The ring is module-level state shared by every request, which is usually the bug and here is the point: it holds nothing private, and only the diagnostics page reads it. `record` flattens a span to the fields the page shows; `recentSpans` returns a copy, newest first, so a reader cannot reach into the ring. The exporter is the OpenTelemetry interface — an `export` with a callback, and a `shutdown` — implemented in twelve lines.'
			},
			code('src/lib/remote/diagnostics.remote.ts', 1, 30),
			code(`${ROUTES}/(site)/(app)/diagnostics/+page.svelte`, 53, 130, { partial: true }),
			{
				type: 'p',
				text: 'The page is one query and a table: version, Node version, uptime formatted by `Intl` units; the live rooms with their watcher counts, from chapter {{live-collaboration}}; and the spans, indented when they have a parent. Refresh calls `diagnostics().refresh()`, and the table redraws because the report is `{const report = $derived(await diagnostics())}`. A failed report is printed by the `failed` snippet through `boundaryMessage`, like every boundary in the app (chapter {{the-itinerary}}), and a child span’s indent and a failed span’s coral chip are `class={…}` objects (chapter {{the-shell}}). It was a bare `{const}` at first, which awaits the first report and keeps it: the button fetched a new one and the page went on showing the old, until an end-to-end test pressed it (chapter {{end-to-end}}). Open the trip page in another tab, come back, refresh — and the `watchTrip` span is there, with the `heartbeat` commands under it, which is how the presence loop in chapter {{the-trip-page}} was first seen as a column of identical rows.'
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
			code(`${ROUTES}/api/route/[slug=slug].json/+server.ts`, 1, 61),
			{
				type: 'p',
				text: 'The data both shapes read: name, dates, scheduled stops — each with its id, the one thing that tells two stops at the same place apart, which the element keys its lists by — and nothing else. A private trip is a 404 whether or not the caller is signed in, because the element runs on somebody else’s page where our cookies are not sent and should not matter. `access-control-allow-origin: *` is what makes it usable from another origin, and is safe precisely because the response holds nothing that was not already public by link. `[slug=slug].json` in a folder name is SvelteKit’s way of giving an endpoint an extension. And the body goes out through `Response.json(...)`, the platform’s own static method: SvelteKit 3 deprecated the `json()` and `text()` helpers it used to export, because the two had become the same call — same `content-type`, same `{ status, headers }` second argument. Its 404 is the one `error()` in the project with an English sentence in it, and the comment says why that is right here and nowhere else: a program reads this answer, not a person — the element prints its own words for a failed fetch — and a request from somebody else’s page carries no language of ours to answer in.'
			},

			{ type: 'h3', id: 'the-frame', text: 'The frame' },
			code(`${ROUTES}/embed/[slug=slug]/+page.ts`, 1, 7),
			code(`${ROUTES}/embed/[slug=slug]/+page.svelte`, 1, 63),
			code('src/hooks.server.ts', 136, 158),
			{
				type: 'p',
				text: 'The frame page is outside the `(site)` group — no header — and has `csr = false`, so it is a few kilobytes of HTML and CSS. For a while it was a few kilobytes of HTML and no CSS of its own: the compiler option below that turns `src/lib/embed` into custom elements tested for any folder called `embed`, so the client build compiled this page as a custom element too, put its styles into a shadow root that never exists, and emitted no stylesheet for the server to link. The test is now the path `src/lib/embed`, and the end-to-end test of the frame asks for two things only this page’s own stylesheet provides: the card is the 22rem the CSS says, and the list has no indent (chapter {{end-to-end}}). It used to ask whether *a* stylesheet was linked, which was true with the bug too — the root layout’s global CSS is linked on every page, frame or not — so it could not fail. The stops are numbered the way the itinerary and the map number them — a counter in a disc of the stop’s kind colour, through the same `data-kind` — because a grid row is not `display: list-item`, and the list’s own markers had silently gone. Their indent had not: the browser gives an `<ol>` 40px of padding for the markers, drawn or not, and the discs sat 40px right of the title until the list’s padding was set to nothing. It refuses a private trip even to a member, because the frame is on somebody else’s page and their visitors are strangers. And it is the one route for which `hooks.server.ts` replaces `frame-ancestors "none"` with `*` after SvelteKit has built the policy — every other page in the app refuses to be framed, which is what stops clickjacking.'
			},

			{ type: 'h3', id: 'the-element', text: 'The custom element' },
			code('src/lib/embed/MeridianRoute.svelte', 1, 83, { partial: true }),
			{
				type: 'p',
				text: 'The file is an ordinary component with nothing at the top to say it is an element. What makes it one is how it is compiled: every build that loads `src/lib/embed` compiles it with `customElement: true`, and a component compiled that way gets a static `element` property — the custom element class Svelte generates around it, with an open shadow root by default. Its props become the element’s attributes, named after the props in lower case and read as strings, and Svelte finds the props in the `$props()` destructuring, which is why they are destructured rather than read off one `props` object; so `<meridian-route slug="…">` on a host page becomes `slug` in the component. Registering the class under a tag name is `element.ts`’s job, below. The element fetches the JSON and draws the stops as a projected line the way `RouteThumb` does. It is deliberately not the app’s component: an element that imported the design tokens would bring the tokens with it, and a shadow root means the host page’s CSS cannot reach in and ours cannot leak out. The stops are keyed by their ids, in the drawing and in the list, because two stops at one place — a hotel and a dinner in the same street — project to the same point, and a key has to name the thing it keys.'
			},
			code('src/lib/embed/MeridianRoute.svelte', 85, 129),
			{
				type: 'p',
				text: 'Inside, a boundary with `pending` and `failed` around an `await` in markup — the same async pattern as every page, in a component that will run on a page that has never heard of SvelteKit. That is the one difference, and the comment above the boundary spells it out: with no SvelteKit around it, no `handleError` runs, so `failed` is handed what `load` threw — an `Error`, tested with `instanceof` — where every boundary inside the app is handed an `App.Error`. The two declarations are `$derived`, so a host page that changes the `slug` attribute gets the new route. The style block is the whole of its styling, with literal colours, because there are no tokens where it is going — the same six pairs `tokens.css` holds — paper, raised paper, the hairline, two inks and the sea — written as `light-dark()`. Inside a shadow root `light-dark()` resolves against the `color-scheme` the element inherits from the host page, so the host decides: a page that declares `color-scheme: light dark` gets the dark card on a dark system, and a light-only page gets the light card whatever the visitor’s system says. A `prefers-color-scheme` query would have asked the visitor instead, and put a dark card on a light page.'
			},
			code('vite.config.ts', 92, 116),
			code('vite.element.config.ts', 1, 42),
			{
				type: 'p',
				text: 'Two compilers see this file. Inside the app, `dynamicCompileOptions` compiles anything under `src/lib/embed` with `customElement: true` for the client build only — the server build compiles it as a plain component it never renders. The path is matched as a path, three folders long; matching any folder named `embed` caught the frame page above as well. Outside the app, a second Vite config with no SvelteKit builds `src/lib/embed/element.ts` into one IIFE file in `static/embed`, which SvelteKit then serves like any static asset at `/embed/meridian-route.js`. One file, no chunks, the Svelte runtime bundled in: the opposite of the app’s split bundle, because a host page cannot resolve our chunk names. The `build` and `dev` scripts run it first.'
			},
			code('src/lib/embed/element.ts', 1, 36),
			{
				type: 'why',
				title: 'Why the tag is named here, and not in `<svelte:options customElement>`',
				text: 'Svelte’s documentation shows the tag in the component, `<svelte:options customElement="meridian-route" />`, and that defines the element as a side effect of importing it. It also makes the component *claim* to be an element in every compile that does not set the option — and three do: the app’s server build, `svelte-check`, and Svelte’s autofixer. Each of them warned `options_missing_custom_element`, and the project’s `check` script carried a flag that silenced that warning for the whole project, which would have hidden the same mistake anywhere else. The same documentation offers the other road for exactly this case — leave out the tag, and name the element afterwards with `customElements.define(\'my-element\', MyElement.element)` — so the component is an ordinary one everywhere, the one module that should define it does, and no warning is silenced. The test that holds it is the invite suite in chapter {{end-to-end}}, which finds the route drawn inside `<meridian-route>` on the settings page.'
			},
			code(`${ROUTES}/(site)/t/[slug=slug]/settings/EmbedSection.svelte`, 1, 60),
			code(`${ROUTES}/(site)/t/[slug=slug]/settings/EmbedSection.svelte`, 84, 111),
			{
				type: 'p',
				text: '`element.ts` is where the tag is decided: it takes `MeridianRoute.element`, refuses to go on if a build forgot the option, and calls `customElements.define` — after `customElements.get`, because defining one name twice throws, and a dev server re-running the module would do exactly that. The settings page shows both snippets and a live preview: it imports this module on mount — importing it is what defines the element — and writes `<meridian-route>` into its own markup. The snippet strings are assembled in two halves because a literal closing script tag inside a script block would end the block as far as the Svelte parser is concerned; that sentence is in the source too, because the next person to touch it would otherwise “fix” it.'
			},

			{ type: 'h3', id: 'health', text: 'And one endpoint for the machines' },
			code(`${ROUTES}/healthz/+server.ts`, 1, 36),
			{
				type: 'p',
				text: 'The question a load balancer, a container runtime and a person with `curl` all ask: is this process able to serve? “Able” means the database answers. `version` from `$app/env` is the commit the build was made from, so “which version is live?” is one request. `no-store`, because a cached “healthy” is worse than none. Chapter {{deploying}} shows the Dockerfile and the CI job asking it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which two security exceptions the embed needs and where each is made.',
					'You can explain `dynamicCompileOptions` and why the element also has its own Vite config.',
					'You know why the element has its own styles and its own colours.',
					'You can say where the element’s tag name is defined, and why there rather than in `<svelte:options>`.'
				]
			}
		]
	},

	{
		slug: 'the-offline-itinerary',
		title: 'The offline itinerary',
		summary:
			'A service worker for the one scenario the product names — a trip read in a train tunnel: `self` from `$app/service-worker`, the build from `$app/manifest`, the deploy’s `version` from `$app/env`, three caching rules and the one the server can veto with `no-store`; why a remote query is never cached; a separate type-check for a worker; the copies a shared device must forget; a header that says “Offline”; a new worker after a deploy; and an end-to-end suite that waits for the worker instead of the clock.',
		goal: 'Add a service worker to a SvelteKit 3 app that makes pages readable offline without ever serving stale data online or one person’s pages to the next, type-check it, register it the way SvelteKit does, and test it without a flaky line.',
		blocks: [
			{
				type: 'p',
				text: 'The product names one scenario for this: the train from Lisbon to Porto goes through tunnels, and the person checking which platform the connection leaves from loses the network at exactly that moment. So the promise is narrow and exact — **a trip opened once can be read again with no network** — and everything in this chapter is either that promise or a guard on it. It is not an installable app (there is no web manifest) and it does not take changes offline; chapter {{what-we-are-building}} lists both under what the project does not build, and why.'
			},
			{
				type: 'p',
				text: 'A service worker is a script the browser runs beside the pages of one origin, in its own global scope with no `document`, and it can answer the pages’ requests itself: every `fetch` from a page it controls passes through its `fetch` event first. That makes it a programmable cache in front of the network, which is the whole of offline reading — and also the whole of the danger. A cache that answers a request the server should have answered serves yesterday’s data to somebody who is online, and a cache on a shared laptop serves one person’s pages to the next. Both are worse than no worker at all, so the file is mostly rules about what it will *not* answer.'
			},
			code('src/service-worker/index.ts', 1, 29),

			{ type: 'h3', id: 'setup', text: 'The setup is a file' },
			{
				type: 'p',
				text: 'SvelteKit’s documentation puts it in one sentence: “if you have a `src/service-worker/index.ts` file it will be bundled and automatically registered.” Nothing goes in `vite.config.ts`. The build compiles the file with Vite into `build/client/service-worker.js`, at the root of the app’s scope, and every server-rendered page carries a few lines in its inline start-up script that register it once the page has loaded — the registration the documentation prints under “Manual registration”, with `navigator.serviceWorker.register(…, { type: \'module\' })`. A module worker, because the bundle is an ES module. The script is the same inline block that starts the client, so the Content Security Policy already allows it (a nonce on dynamic pages, a hash on prerendered ones), and `worker-src \'self\'` — there for MapLibre’s worker since chapter {{the-config}} — is what lets the browser fetch `/service-worker.js` as a worker at all.'
			},
			{
				type: 'p',
				text: 'The option behind this is `serviceWorker` in the SvelteKit config, and the project leaves it alone. `register` is `true` by default; `options` is the `RegistrationOptions` object handed to `register()`, and SvelteKit adds `type: \'module\'` to whatever is there. `serviceWorker: { register: false }` exists for registering by hand — after a consent screen, say, or only for some people — and nothing here needs that. An earlier plan for this chapter registered the worker by hand with `{ type: dev ? \'module\' : \'classic\' }`; it is wrong twice over, because the documentation’s registration is a module in every case, and because “the service worker is bundled for production, but not during development” — `pnpm dev` never runs it, so there is no development case to switch on.'
			},
			{
				type: 'p',
				text: 'SvelteKit 2 had a module of its own for this, `$service-worker`, and SvelteKit 3 removed it; importing it is a build error that names the replacements. Its five exports, and where each went:'
			},
			{
				type: 'ul',
				items: [
					'**`base`** (the base path) → `resolve()` from `$app/paths` — and, inside a worker, the registration’s `scope`, below.',
					'**`build`** (Vite’s output) → `immutable` from `$app/manifest`.',
					'**`files`** (the `static/` folder) → `assets` from `$app/manifest`.',
					'**`prerendered`** → `prerendered` from `$app/manifest`.',
					'**`version`** → `version` from `$app/env`.'
				]
			},
			{
				type: 'note',
				text: 'Three modules may not be imported into a worker at all: `$app/forms`, `$app/navigation` and `$app/state` belong to a page, and the build refuses them with “Cannot import … into service-worker code”.'
			},

			{ type: 'h3', id: 'the-build', text: 'What the worker knows: the build, and the deploy' },
			code('src/service-worker/index.ts', 31, 57),
			{
				type: 'p',
				text: '`self` from `$app/service-worker` is `globalThis`, typed as a `ServiceWorkerGlobalScope` — the module exists so that `self.addEventListener(\'fetch\', …)` hands you a `FetchEvent` and not a DOM event. `version` from `$app/env` is `config.version.name`, which is the commit this build was made from (chapter {{the-config}}), and it goes into every cache name, so each deploy gets caches of its own. `$app/manifest` lists the build: `immutable` is every file Vite wrote — the hashed JavaScript, CSS, fonts, the MapLibre worker, the globe’s chunk — `assets` is every file in `static/`, and `prerendered` is every page and endpoint rendered at build time. In this project that last list is the guides in three languages, `/api/world.json`, and one entry worth noticing: `_app/remote/<hash>/places`, the prerendered remote function from chapter {{remote-functions-the-reads}}, written to disk at build time like a page.'
			},
			{
				type: 'p',
				text: '`immutable` and `prerendered` are empty in development, says the documentation, which is one more reason the worker only exists in a build. Each `path` is relative to the base path, and the documentation’s example turns them into absolute pathnames with `resolve()` from `$app/paths`. In TypeScript that does not compile, and the compiler is right: `resolve()` takes one of this app’s routes or pathnames — the same typed union `href()` is built on (chapter {{the-shell}}) — and `_app/immutable/nodes/0.BaOiqs_e.js` is neither. `assets` is typed more narrowly still: `{ path: AssetPath }`, where `AssetPath` is generated from `static/` and here is exactly `"embed/meridian-route.js" | "robots.txt"`, so `asset(\'robots.txt\')` type-checks and `asset(\'robot.txt\')` does not. The worker sidesteps both with a fact about where it lives: SvelteKit serves it from the root of the app, so its registration’s `scope` *is* the base path, and resolving a path against the scope gives the pathname a request will have. (`%sveltekit.assets%`, the placeholder `app.html` can use for a favicon, is the same idea in the template — “either `paths.assets`, if specified, or a relative path to `paths.base`” — and a separate `paths.assets` host is the one configuration SvelteKit refuses outright with a worker: “Cannot use service worker alongside `config.paths.assets`”.)'
			},
			code('src/service-worker/index.ts', 61, 77),
			{
				type: 'p',
				text: '`install` copies the build into this deploy’s cache, and `waitUntil` holds the worker in the installing state until the copy is done — if one file fails, `addAll` fails, and the worker is discarded rather than activated with half a build. `activate` runs when the worker takes over and deletes every cache that is not its own, which is how a deploy’s files leave the device. The copy is the whole build, about 8 MB on disk at the time of writing, and most of it is the globe: three.js, and two 3D-model decoders, Draco and Basis, that arrive in the build with the 3D libraries although this globe loads no model. The documentation’s caution applies — “you should also be careful about caching large assets” — and the trade made here is that every tab works in the tunnel, the globe included. If the size ever matters, the decoders are the first thing to leave out of `FILES`.'
			},

			{ type: 'h3', id: 'three-rules', text: 'Three rules, and the requests it never answers' },
			code('src/service-worker/index.ts', 79, 100),
			{
				type: 'p',
				text: 'The `fetch` handler sorts every request into one of four kinds. A **hashed** file of the build — `immutable`, Vite’s output — is answered from the copy, always: **cache first**, because its name contains a hash of its content, so a newer version would have a different name and there is never a reason to ask the network again. The rest of the build — `static/` and every prerendered page and endpoint — has no hash in its name: `guides/lisbon-in-three-days` and `api/world.json` are called the same after the next deploy. Those are **network first**, with the install-time copy as the offline answer; served from the copy, a guide edited in the next deploy would stay old *online* for as long as the old worker held the tab. A page — a navigation, `request.mode === \'navigate\'` — is asked of the network first and kept (below). And everything else gets no `respondWith` at all, which means the browser fetches it exactly as if there were no worker: **network only**. That last rule is the one that keeps the app honest online.'
			},
			{
				type: 'why',
				title: 'Why a remote query is never answered from a cache',
				text: 'Every read in this app is a remote function, and its request is a `GET` to `/_app/remote/…` with the arguments in the URL — exactly the kind of request a naive worker caches. Then `tripBySlug` would answer from the copy *online*: a stop a companion added an hour ago missing, a deleted trip still there, with nothing on screen to say so. The live stream is worse: `watchTrip` is one long response that never ends, and a cache can only store a response that has. So remote calls and `__data.json` — which carries a layout’s per-person data — go straight to the network and fail without one, and the page handles the failure as it always has. The exception proves the rule: `places()` is a `prerender` function, its answer is fixed at build time, it is listed in `prerendered`, and so it is a file of the build and comes from the copy, which keeps the place search working in the tunnel.'
			},
			code('src/service-worker/index.ts', 113, 153),
			{
				type: 'p',
				text: 'A page is **network first**: online, the person always gets today’s page and the worker keeps a copy; offline, the `fetch` throws and the copy is served, or the error is thrown on if there is none. The copy is written with `event.waitUntil`, beside the response rather than in front of it, so the page streams to the screen while it is being kept. What is kept is decided by `worthKeeping`, and each condition is a lesson. A redirect never arrives as a 200 — a navigation’s redirects come to the worker as an opaque response with status 0 — so the sign-in page is never stored under the address of the trip that redirected to it. An error page is not the page. An endpoint answers JSON, not `text/html`, and the `/api/` test before it keeps Better Auth’s routes out entirely. And `Cache-Control: no-store` is the server saying “never write this down”: the health endpoint sends it (chapter {{embedding-a-trip}}), and any page that ever should not be kept can say so without a change here. `ignoreVary` is explained in the comment: `Vary: Cookie` (chapter {{security-headers-and-csp}}) protects caches shared between people, and this one is not.'
			},
			{
				type: 'note',
				text: 'The obvious way to tell a page from an endpoint is to match the URL against the app’s routes — `$app/manifest` exports `routes`, each a `ManifestRoute` with an `id` and `page` and `endpoint` flags, and `$app/paths` exports `match()`. It cannot be done in a worker: `match()` there throws “Cannot use `match(...)` inside a service worker, as it depends on the SvelteKit client instance”. The response’s own content type is the better test anyway — it is what the server actually sent.'
			},

			{ type: 'h3', id: 'type-check', text: 'A worker has its own types' },
			code('src/service-worker/tsconfig.json', 1, 19),
			code('package.json', 20, 20),
			{
				type: 'p',
				text: 'A worker’s global scope has `caches`, `clients` and `FetchEvent`, and no `window` or `document`, so it cannot be type-checked against the DOM library the rest of the app uses. SvelteKit generates a second base config for it, `$app/tsconfig/service-worker`, with `"lib": ["ESNext", "WebWorker"]`, and the documentation’s two steps are the two files: the root `tsconfig.json` excludes `src/service-worker` (chapter {{the-config}}), and this one extends the worker’s base with the same strictness as the rest of the project. The catch is that `svelte-check` only reads one tsconfig per run, so excluding the folder from the root config quietly stops anything from checking it at all. `check` therefore runs a second program: `tsc -p src/service-worker`. Not a second `svelte-check --tsconfig`: given a folder with no `.svelte` file in it, `svelte-check` warns that it found nothing to check, and here a warning fails the build (chapter {{the-toolchain}}). Plain TypeScript is `tsc`’s job, and `tsc` follows the worker’s imports, so `#lib/offline/pages.ts` is checked as worker code too. Both directions of the check have teeth:'
			},
			{
				type: 'terminal',
				code: `
$ echo "self.foo();" >> src/service-worker/index.ts && pnpm exec tsc -p src/service-worker
src/service-worker/index.ts(135,6): error TS2339: Property 'foo' does not exist on type 'ServiceWorkerGlobalScope'.

$ echo "document.title;" >> src/service-worker/index.ts && pnpm exec tsc -p src/service-worker
src/service-worker/index.ts(135,1): error TS2584: Cannot find name 'document'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.`
			},

			{ type: 'h3', id: 'shared-device', text: 'The shared device' },
			code('src/lib/offline/pages.ts', 1, 52),
			{
				type: 'p',
				text: 'The pages the worker keeps were rendered on the server *for the person signed in*: a private trip’s itinerary, their companions, their name in the header. On a phone that is fine. On the family laptop, the hotel’s lobby computer, a colleague’s machine borrowed for a minute, it means the next person can switch off the Wi-Fi, type the address of a trip they were never invited to, and read it. `Vary: Cookie` cannot help — it is a header for caches between people, and this cache is inside the one browser profile they share. So the app itself empties the cache, and the cache’s name lives in a module both sides import: the worker opens the cache by it, the app deletes by it. It deletes by the *prefix*, not the full name, and the comment says why: after a deploy, a tab running the new code can sit beside a worker that is still the old one, holding a cache with the old version in its name.'
			},
			code(`${UI}/Header.svelte`, 163, 179),
			{
				type: 'p',
				text: 'The event that matters is signing out, and the header’s form handles it with the remote form’s own hook. `signOut.enhance(callback)` replaces the default submission with yours; the callback receives a copy of the form, and `form.submit()` performs the submission without calling the callback again. So the copies are deleted, and only then is the session ended — in that order, so that there is no moment at which a person is signed out and their pages are still on the device. Without JavaScript the form still signs out, and there is nothing to delete: registering a worker is itself a script, so a device that never ran the app’s JavaScript holds no copies. The case in between — a sign-out pressed before the page has hydrated — is the layout’s, next.'
			},
			code('src/routes/(site)/+layout.svelte', 20, 34),
			{
				type: 'p',
				text: 'A session can also end without the button: it expires, it is revoked from another device, or the person presses “Sign out” on a slow phone before the page has hydrated and the form submits the plain way, with no callback. Every one of those ends the same way — the next page renders with nobody signed in — so the `(site)` layout, which knows who is signed in, deletes the copies whenever it finds nobody. It is an effect because it is a write to something outside the component in answer to a value, and it runs again when `data.user` changes. Its cost is a `caches.keys()` on a signed-out page load, and its trade is deliberate: a stranger reading a public trip gets no offline copy, because the policy is simple to state and to test — *the device keeps pages only while somebody is signed in*. What it cannot cover is a session that expires and is then opened offline before any page has been loaded online; the copies stay until the next deploy, or the next page load with a network. The sign-out button is the guarantee; the layout is the net.'
			},

			{ type: 'h3', id: 'honest-header', text: 'A header that says “Offline”' },
			code(`${TRIP}/TripView.svelte`, 94, 143),
			code(`${TRIP}/TripView.svelte`, 385, 416),
			{
				type: 'p',
				text: 'A page served from the copy hydrates from the copied build and runs like any other — and its live stream cannot connect. Before this chapter the chip would have said “Connecting…” for three seconds and then offered the coral “Reconnect”, a button that cannot work in a tunnel. Now the status has a fourth state, first in the derivation: `online` from `svelte/reactivity/window` is `navigator.onLine` as a reactive value, and when it is `false` the chip says “Offline” in the quiet grey and offers nothing. It is `undefined` on the server, which is why the test is `=== false`: a page rendered on a server must not claim to be offline. The sizer gained a fourth label, so the slot stays the width of the widest in every language.'
			},
			{
				type: 'p',
				text: 'Coming back online is the subtle half. SvelteKit’s documentation promises that when a live query’s connection drops it “will attempt to reconnect passively, with exponential backoff, and actively if `navigator.onLine` goes from `false` to `true`” — and the client’s source has the condition the sentence leaves out: that applies to a stream that had connected. A live query whose *first* connection fails has never delivered a value, and it fails for good: `done` becomes `true`, and only `reconnect()` starts it again. A page opened in a tunnel is exactly that case. So `ononline`, a handler on `<svelte:window>`, asks: if the stream is not connected when the network returns, `reconnect()` it. `reconnect()` stops whatever attempt is under way before it starts one, so the handler does not need to know whether the first attempt had finished failing — which is what keeps the end-to-end test free of a race. It is an event, so it is a handler, not an effect watching `online.current`: nothing is being derived.'
			},

			{ type: 'h3', id: 'updates', text: 'A new worker after a deploy' },
			code('src/routes/+layout.svelte', 106, 131),
			{
				type: 'p',
				text: 'The documentation is precise about when a browser looks for a new worker: “when a full-page navigation happens within its scope, and after functional events such as `push` and `sync`. Client-side navigations are neither.” A trip planner is a page people leave open for days, so a deploy could go unnoticed by its worker for as long as the tab lives. The root layout asks on every navigation — `navigator.serviceWorker.getRegistration()`, then `registration.update()` — which is the documentation’s own pattern, with three changes: no request when there is no network, because `afterNavigate` also runs when a page hydrates and a page read offline hydrates too; none for a shallow `goto` — `isShallowGoto`, the test chapter {{the-itinerary}} explains — because opening the stop dialog is not a visit to a page and would fetch `service-worker.js` every time; and a failed check is fire-and-forget, a background chore the next navigation repeats. SvelteKit keeps the same rule for its own chore of this kind: when a client-side navigation fails and a check finds a newer build live, it asks the registered worker to update and then loads the page the plain way, and since 3.1 a failed update there no longer stops that load. A new worker found this way installs in the background and “take[s] over as soon as the number of tabs managed by the existing service worker drops to zero”. It does not swap itself in under an open page. That is why only hashed files are served from the copy: everything whose name outlives its content — pages, prerendered guides, `static/` — is asked of the network first, so a waiting worker never serves an old one online, and the deploy banner (chapter {{the-shell}}) already turns the next navigation into a full reload.'
			},
			{
				type: 'note',
				text: 'Two refinements are named and left out. `self.skipWaiting()` would let a new worker take over open tabs at once, and the pattern that makes it safe is to call it from the deploy banner’s button and reload when `navigator.serviceWorker` fires `controllerchange` — a listener on an object outside any component, which is the honest use of `on()` from `svelte/events`. Nothing needs it today, for the reason above. And `@vite-pwa/sveltekit`, the generator most SvelteKit projects reach for, was declined in chapter {{choosing-libraries}}: its SvelteKit integration reads a `svelte.config.js` that SvelteKit 3 does not have, and a worker of a few dozen lines written against `$app/manifest`, each rule with its reason beside it, is easier to read than a generated one.'
			},

			{ type: 'h3', id: 'proof', text: 'Proving it without a clock' },
			code('e2e/offline.e2e.ts', 1, 58),
			{
				type: 'p',
				text: 'Service workers are a classic source of flaky tests, because so much of their life happens in the background, and the header of the file says how this suite avoids every one of them: it waits for the thing each step needs, and never for a number of milliseconds. The worker registers on `load`, so the test waits for `navigator.serviceWorker.ready`, which resolves when a worker is active — the build copied. A worker controls only the pages that load *after* it is active, so the page is reloaded once and the test asserts there is now a `controller`. The copy of the page is written beside the response, so `expect.poll` asks Cache Storage until it is there. Offline is `context.setOffline(true)`, and in Playwright 1.64 that reaches the worker’s own network as well as the page’s — so with no network the worker’s `fetch` really fails, and what the page shows really came from the copy. `response.fromServiceWorker()` says so.'
			},
			code('e2e/offline.e2e.ts', 60, 114),
			{
				type: 'p',
				text: 'Three tests, one per promise. The first reads the trip offline — the heading, two seeded stops, “Offline” and no Reconnect — and then goes back online and waits for “Live”, which is the reconnect above working. The second signs out through the header and checks two things: the copy is gone the moment the sign-out has finished, and a navigation to the trip with no network now fails as it would with no worker at all. The third ends the session without the button — `clearCookies()` is an expired session as far as the server can tell — loads the home page, and waits for the layout to empty the cache. Each was proven against broken code before it was trusted: with the worker’s fallback removed the first fails on its offline reload, with both deletions removed the second fails on its first check, and with the layout’s effect removed the third never sees the copy go. The rest of the suite runs with workers blocked, and chapter {{end-to-end}} says why.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which requests the worker answers from the build, which from a kept page, and which it never answers — and why remote queries are in the last group.',
					'You can map each export of the removed `$service-worker` module to its SvelteKit 3 replacement.',
					'You know why the worker has its own tsconfig, why `tsc` checks it and not `svelte-check`, and how you would prove the check has teeth.',
					'You can explain what the shared-device problem is, which two places delete the copies, and why they delete by prefix.',
					'You can say why a page opened offline needs `reconnect()` when the network returns, when SvelteKit already reconnects a dropped stream.',
					'You can name three things that make a service-worker test flaky, and what this suite waits for instead of each.'
				]
			}
		]
	}
];
