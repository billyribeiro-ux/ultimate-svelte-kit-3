/**
 * PART 5 — The pages
 * (chapters 27–32)
 *
 * Everything the studio is not. Two layouts and a group; a landing page
 * that is a file; the pattern page with a share card drawn on the server; a
 * gallery that previews without leaving; the jam room, which is the live
 * query made visible; and a diagnostics page that reads the server's own
 * spans. The theme is async Svelte in real pages — `await` in markup,
 * boundaries, `$state.eager` — and the SvelteKit pieces that only matter
 * once there is more than one page.
 */

import { code } from './quote.js';

export const part5 = [
	{
		slug: 'layouts-and-groups',
		title: 'Two layouts and a group',
		summary:
			'A root layout with view transitions and a progress bar; an `(app)` group layout with the header, `$state.eager` for the current link, the new-version banner, and the artist’s name from a remote query; plus the small pieces every page uses.',
		goal: 'Know what a layout group is and why the embed demo escapes it; use `onNavigate` for a view transition that never holds a navigation hostage; and reach for `$state.eager` when async Svelte holds a value back that should not wait.',
		blocks: [
			{
				type: 'p',
				text: 'The root layout is deliberately almost empty: the stylesheet, the view transitions, a progress bar. The header lives one level down, in `(app)/+layout.svelte`. The parentheses make `(app)` a *layout group* — a folder that adds a layout without adding a segment to the URL — and the one page that must have no header, the embed demo that pretends to be somebody else’s site, resets to the root with a `+page@.svelte`.'
			},
			code('src/routes/+layout.svelte', 19, 70),
			{
				type: 'why',
				title: 'Why the transition has a timeout',
				text: '`onNavigate` returns a promise SvelteKit waits for before completing the navigation. Wrapping it in `startViewTransition` hands the browser both states of the page and lets it cross-fade. But a transition must never hold a navigation hostage: the promise resolves when the update callback runs, or when the transition reports it cannot start, or after three hundred milliseconds — whichever is first. While chasing a flaky back navigation this guard was the first suspect and was innocent (the cause was `forkPreloads`, ch. 38); it stayed because it rules out a whole class of hang for nothing.'
			},
			code('src/routes/+layout.svelte', 79, 89),
			{ type: 'h3', id: 'the-app-layout', text: 'The app layout' },
			code('src/routes/(app)/+layout.svelte', 8, 26),
			code('src/routes/(app)/+layout.svelte', 28, 39),
			code('src/routes/(app)/+layout.svelte', 79, 96),
			{
				type: 'why',
				title: 'Why `$state.eager`',
				text: 'With async Svelte, a navigation’s state changes are held back until the new page’s `await`s resolve, so the interface never shows half an update. That is right for content and wrong for the thing somebody just clicked: a nav link that stays un-highlighted for the four hundred milliseconds a remote query takes feels broken. `$state.eager(pathname)` reads the *incoming* value immediately — for this one attribute and nothing else. The rest of the page still waits.'
			},
			code('src/routes/(app)/+layout.svelte', 41, 56),
			code('src/routes/(app)/+layout.svelte', 64, 71),
			{
				type: 'p',
				text: '`version.pollInterval` in the config makes SvelteKit check for a new build every minute and set `updated.current` when it finds one. Client-side navigation would then ask for JavaScript files that no longer exist, so `beforeNavigate` turns the next navigation into a full page load. The banner gives the person the choice to do that now; the hook makes sure it happens anyway. `data-sveltekit-reload` on the link is what makes it a real reload rather than a client-side navigation.'
			},
			code('src/routes/(app)/+layout.svelte', 98, 117),
			{
				type: 'p',
				text: 'Who this browser is comes from `whoAmI()`, a remote query, rather than from layout data. The forms that change the answer call `whoAmI().refresh()` in their handlers (ch. 24), and the new value arrives in the same response as the submission. A layout `load` would have needed a second round trip to notice — and in an earlier version of this project, it did, and the header showed the old name until the next navigation.'
			},
			{ type: 'h3', id: 'small-pieces', text: 'The small pieces' },
			code('src/lib/components/Section.svelte', 4, 17),
			code('src/lib/components/Section.svelte', 20, 26),
			{
				type: 'p',
				text: '`<svelte:element this={...}>` renders whichever tag the string names, so one component is an `h2` on the landing page and an `h3` inside a panel, and the document outline — what a screen reader navigates by — stays honest.'
			},
			code('src/lib/components/Logo.svelte', 14, 30),
			code('src/lib/toast/toast.ts', 1, 34),
			{
				type: 'p',
				text: '`toast("Saved")` from anywhere — an event handler, a `catch` block — with no `<Toasts />` host to remember. `mount` creates a component at a target, `unmount` removes it, and `{ outro: true }` lets its `transition:fly` play on the way out. These are the same two functions SvelteKit itself uses to start the app.'
			},
			code('src/routes/+error.svelte', 1, 33),
			{
				type: 'note',
				text: 'With SvelteKit 3 the error page is a real `<svelte:boundary>` around the page below it, on the server as well as the client: a component that throws while rendering lands here rather than taking the whole response down. `page.error.id` is the correlation id `handleError` adds for unknown errors (ch. 26) — and `src/error.html` is the page for when even this cannot render.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `(app)` does to the URL, and what `+page@.svelte` does to the layout chain.',
					'You can explain when `$state.eager` is the right tool and when it would be wrong.',
					'You can trace what happens on the first navigation after a deploy.'
				]
			}
		]
	},

	{
		slug: 'the-landing-page',
		title: 'The landing page is a file',
		summary:
			'Prerendered, with a `prerender` remote function baked in, `hydratable` for random numbers that must agree with themselves, a GSAP entrance loaded only for people who will see it, and a demo grid that plays in pure CSS.',
		goal: 'Prerender a page and know what that means for the data on it; fix a hydration mismatch with `hydratable`; and load an animation library without making anybody who does not need it pay for it.',
		blocks: [
			code('src/routes/(app)/+page.ts', 1, 8),
			{
				type: 'p',
				text: 'The landing page is the same for everybody and changes when the app is deployed, so it is prerendered: a static file, the fastest thing a server can send. The featured strip inside it is a `prerender` remote function (ch. 23), so the crawler runs that at build time too, and the page needs no database to serve.'
			},
			code('src/routes/(app)/+page.svelte', 9, 37),
			{
				type: 'why',
				title: 'Why `hydratable`',
				text: 'The dots behind the hero drift with random delays. Random on the server and random again in the browser means the markup SvelteKit hydrates does not match the markup it rendered — a hydration mismatch, and a visible jump as the dots relocate. `hydratable(key, fn)` runs the function once on the server, bakes the result into the page under that key, and hands the browser *that* value instead of a new one. Any value that is computed once and must be the same on both sides is a candidate: a random seed, a timestamp, a shuffled order.'
			},
			code('src/routes/(app)/+page.svelte', 48, 89),
			code('src/routes/(app)/+page.svelte', 232, 263),
			{
				type: 'p',
				text: 'The demo grid plays with no audio and no JavaScript: every lit pad has the same two-second CSS animation, offset by its column with `animation-delay: calc(var(--column) * 0.125s)`. Sixteen steps at 120 bpm are two seconds, and each column fires an eighth of a second later. It obeys `prefers-reduced-motion` with one rule, because it is CSS.'
			},
			{ type: 'h3', id: 'the-entrance', text: 'The entrance' },
			code('src/lib/motion/cinematic.ts', 1, 20),
			code('src/lib/motion/cinematic.ts', 25, 55),
			{
				type: 'p',
				text: 'GSAP is imported *inside* the attachment, dynamically, so the sixty kilobytes of it never reach anyone who does not see the animation — and someone who asked for reduced motion gets no import at all. Nothing in the stylesheet starts at `opacity: 0`; GSAP’s `from` sets the start state at the moment it begins, so a failed import leaves everything visible. The markup says `{@attach cinematic()}` and nothing else.'
			},
			{ type: 'h3', id: 'the-featured-strip', text: 'The featured strip' },
			code('src/routes/(app)/+page.svelte', 91, 121),
			{
				type: 'p',
				text: '`{#each await getFeatured() as published}` — an `await` directly in an `{#each}`. At build time this resolved and was baked into the page, so on a real visit the list arrives with the HTML and the `pending` snippet never shows. The `failed` snippet is there for the one case that is left: a build with no database.'
			},
			code('src/lib/components/PatternCard.svelte', 7, 27),
			code('src/lib/components/PatternCard.svelte', 30, 50),
			{
				type: 'p',
				text: 'A card takes two optional snippets: `actions`, where a gallery puts its delete form, and `grid`, which replaces the picture — the gallery uses it to crossfade the picture into a preview (ch. 30). `Snippet<[Pattern]>` is a snippet that takes one argument. The card knows nothing about either use.'
			},
			code('src/lib/components/MiniGrid.svelte', 4, 16),
			code('src/lib/components/MiniGrid.svelte', 18, 45),
			{
				type: 'p',
				text: 'The picture is an SVG so that it scales to a card, a hero and a share image from the same markup. A `{const}` inside a nested `{#each}` computes `on` once per cell, and the `class` array reads it three times.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `export const prerender = true` does and what it forbids the page from doing.',
					'You can find a hydration mismatch in a page of your own and say whether `hydratable` is the fix.',
					'You can explain why the GSAP import is inside the attachment rather than at the top of the file.'
				]
			}
		]
	},

	{
		slug: 'the-pattern-page',
		title: 'The pattern page and its share card',
		summary:
			'`RouteParams` from `$app/types` with the layout group in the id, an optimistic love count with `withOverride`, a `Player` that provides a studio only if none exists, and a share card rendered by `svelte/server` with a CSP built from the hashes it returns.',
		goal: 'Type a route’s params from the route table, do an optimistic update that corrects itself, use the third function `createContext` returns, and render a component to a string on the server for something that is not a page.',
		blocks: [
			code('src/routes/(app)/p/[id]/+page.ts', 4, 11),
			code('src/routes/(app)/p/[id]/+page.svelte', 9, 17),
			{
				type: 'p',
				text: '`$app/types` knows every route. `RouteParams<"/(app)/p/[id]">` is `{ id: string }`, derived from the folder name — layout group included, because the group is part of the route’s *id* even though it is not part of its URL — and it stops compiling if the folder is renamed, which is what a type for a URL should do.'
			},
			code('src/routes/(app)/p/[id]/+page.svelte', 20, 31),
			{ type: 'h3', id: 'the-view', text: 'The view, and an optimistic heart' },
			code('src/lib/components/PatternView.svelte', 11, 47),
			{
				type: 'why',
				title: 'Why `withOverride`',
				text: 'Loving a pattern should bump the number *now*. `lovePattern(id).updates(getCounts(id).withOverride(fn))` applies `fn` to the query’s current value on screen immediately, sends the command, and asks the server to refresh that query in the same response (ch. 24). When the real count arrives, the override is dropped and the real value takes over. If the command fails, the override is dropped and the number returns to what the server last said. No spinner, no stale count, no manual rollback.'
			},
			code('src/lib/components/PatternView.svelte', 67, 85),
			{
				type: 'warn',
				text: '`{const counts = $derived(await getCounts(published.id))}` — with the `$derived`. A bare `{const counts = await …}` evaluates once, and the optimistic override above would update a number nobody was watching. This is the same lesson as the WAV render (ch. 20) and the jam room (ch. 31), and it is the single most common mistake with `await` in markup.'
			},
			code('src/lib/components/PatternView.svelte', 88, 92),
			{ type: 'h3', id: 'the-player', text: 'A player that provides a studio only if none exists' },
			code('src/lib/studio/Player.svelte', 10, 57),
			{
				type: 'p',
				text: '`createContext` in Svelte 5.57 returns three functions: `get`, `set` and `has`. The studio page provides a studio (ch. 19) and this component finds it with `hasStudio()`. The published page and the jam room provide none, so it creates one and provides it, and the meters and panels beneath work exactly as they do in the studio. A `Snippet<[{ step; playing }]>` hands the playhead to whatever the parent renders inside.'
			},
			code('src/lib/studio/Player.svelte', 59, 85),
			{
				type: 'p',
				text: '`bpm` and `swing` are optional `$bindable` props. The jam room binds them to overridable deriveds (ch. 31); the published page leaves them alone and `localBpm` falls back to the pattern. `onend` on the transport fires when a knob gesture finishes, and the parent decides what a finished gesture means.'
			},
			{ type: 'h3', id: 'the-share-card', text: 'The share card' },
			code('src/lib/share/Card.svelte', 4, 19),
			code('src/lib/share/Card.svelte', 65, 78),
			code('src/lib/share/Card.svelte', 94, 109),
			{
				type: 'p',
				text: 'A Svelte component as an SVG template, with a `<svelte:boundary>` around the drawing. A pattern row written by an old version might not parse; without the boundary the whole render throws and the page has no image. With it, the `failed` snippet draws a plain card with the title and whatever `transformError` allowed it to know.'
			},
			code('src/routes/(app)/p/[id]/card.svg/+server.ts', 1, 22),
			code('src/routes/(app)/p/[id]/card.svg/+server.ts', 30, 53),
			{
				type: 'p',
				text: '`render` from `svelte/server` is the function SvelteKit calls for every page, used here for a document that is not a page. `csp: { hash: true }` asks for the SHA-256 of any inline script the render produced — typed as `Sha256Source[]` — and the header is built from the list rather than assumed empty, so a future `hydratable` in the card would be covered rather than blocked. `transformError` decides what the `failed` snippet may know: the card gets a sentence, the log gets the stack.'
			},
			code('src/lib/vanity.ts', 15, 31),
			code('src/lib/vanity.ts', 33, 49),
			{
				type: 'p',
				text: 'The vanity address is one regular expression, shared by the `reroute` hook (ch. 26), the resolver endpoint (ch. 32) and every page that prints an address, so all three agree on its shape. `slugify` normalises to NFKD and strips the combining marks, which is why “Café groove” becomes `cafe-groove` and not `caf-groove`.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can write the `RouteParams` type for the jam room and say why the group is in it.',
					'You can explain what happens to an overridden value when the command fails.',
					'You can say what `hashes.script` contains for this card, and what would change it.'
				]
			}
		]
	},

	{
		slug: 'the-gallery',
		title: 'The gallery',
		summary:
			'The sort lives in the URL; `await` in an `{#each}` with batched counts; a preview that opens with `preloadData` and `pushState` without leaving; `crossfade` between a card and the dialog; and a delete form per card with `remove.for(id)` and an optimistic override.',
		goal: 'Build a list page with async Svelte, preview a route without navigating to it, and delete optimistically with a per-item form.',
		blocks: [
			code('src/routes/(app)/gallery/+page.svelte', 21, 31),
			{
				type: 'p',
				text: 'The sort is read from `page.url.searchParams`, so a sorted gallery is a link: `/gallery?sort=loved`. The chips are plain `<a href="?sort=…">` — SvelteKit navigates, `page.url` changes, the derived recomputes, and the query below re-runs with a new argument. No state, no handler.'
			},
			code('src/routes/(app)/gallery/+page.svelte', 82, 92),
			code('src/routes/(app)/gallery/+page.svelte', 94, 124),
			{
				type: 'p',
				text: 'Two `await`s in one `{#each}`: the list, and each card’s counts. Every `await getCounts(published.id)` in this render is one batched request (ch. 23). The boundary shows the `pending` snippet until the list is in, and because the page is server-rendered, that snippet appears only on a client-side navigation with a cold cache.'
			},
			{ type: 'h3', id: 'preview', text: 'Preview without leaving' },
			code('src/routes/(app)/gallery/+page.svelte', 47, 72),
			{
				type: 'why',
				title: 'Why `preloadData` and then `pushState`',
				text: 'On a wide screen, clicking a card opens it in a dialog rather than navigating away. `preloadData(href)` runs the pattern page’s `load` — which calls `getPattern` and warms its cache — and `pushState(href, { preview })` then changes the URL to the pattern’s address with the id in history state, *without* rendering the pattern page. Reload, and the real page appears at that URL; press back, and the dialog closes. On a phone, or with a modifier key held, the link is a link. This is shallow routing again (ch. 18), with a URL this time.'
			},
			code('src/routes/(app)/gallery/+page.svelte', 179, 208),
			{
				type: 'p',
				text: 'The dialog reads `page.state.preview` and calls `getPattern(id)` — cached by the preload — inside its own boundary. `data-sveltekit-reload` on “Open the full page” forces a real navigation, because the URL is already the pattern’s address and a client-side navigation to the same URL is a no-op.'
			},
			{ type: 'h3', id: 'crossfade', text: 'Crossfade' },
			code('src/routes/(app)/gallery/+page.svelte', 33, 45),
			{
				type: 'p',
				text: '`crossfade` returns a pair of transitions. An element leaving with `out:send` and another entering with `in:receive` under the same key are animated as one thing moving between two places — here, the card’s picture travelling into the dialog and back. The card renders its picture through the `grid` snippet with `{#if page.state.preview !== published.id}`, so opening the preview *removes* the card’s picture (send) as the dialog’s appears (receive). When there is no partner, `fallback` fades.'
			},
			{ type: 'h3', id: 'yours', text: 'Yours, with a delete per card' },
			code('src/routes/(app)/gallery/+page.svelte', 127, 176),
			{
				type: 'p',
				text: '`remove.for(mine.id)` gives each card its own instance of the form, so a pending delete disables *its* button and no other. The `enhance` callback submits with `.updates(getMine().withOverride(list => list.filter(...)))`: the card disappears before the server has answered, and comes back if the server refuses. The `id` travels as a hidden field, so with JavaScript off the same form still posts and the server still checks ownership.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `preloadData` returns and why the code checks `result.type`.',
					'You can explain what `send` and `receive` need in common to animate as one element.',
					'You can say why `remove.for(id)` exists rather than one shared `remove` form.'
				]
			}
		]
	},

	{
		slug: 'the-jam-page',
		title: 'The jam room',
		summary:
			'The live query on screen: `$derived(await room)` so the page follows every yield, overridable `{let}` deriveds for knobs in mid-gesture, `room.connected` and `reconnect()`, `online` from the window, presence with `animate:flip`, a handle form that carries the room id, and every edit as a command.',
		goal: 'Consume a `query.live` correctly — including the mistake that shows the first snapshot forever — and let a person edit a value that the server also updates, without the two fighting.',
		blocks: [
			code('src/routes/(app)/jam/[room]/+page.svelte', 22, 41),
			{
				type: 'p',
				text: '`watchRoom(id)` is the live query from chapter 25. Awaiting it gives the current room; after that, its value updates every time the server yields. `room.connected` says whether the stream is up, and `room.reconnect()` restarts it by hand — SvelteKit reconnects on its own with backoff, and eagerly when the browser comes back online.'
			},
			code('src/routes/(app)/jam/[room]/+page.svelte', 49, 66),
			{
				type: 'warn',
				text: 'The comment in the file is the whole chapter in three sentences. A declaration tag with a plain `await` runs *once* — it is a blocking promise, not a subscription — and would show the first snapshot forever, while the server yields to nobody. Wrapping it in `$derived` is what makes it re-run every time the live query yields: the resource’s `then` is reactive, and a derived is what tracks it. This cost an afternoon and two end-to-end tests, and it is the reason every `await` in this project’s markup that should follow its inputs is written `$derived(await …)`.'
			},
			{
				type: 'why',
				title: 'Why `{let bpm = $derived(...)}`',
				text: 'The tempo knob has two writers: the person turning it, and the room’s next snapshot. An *overridable derived* — `let` rather than `const` — follows the room and can be assigned by the knob while a gesture is in progress. When the next snapshot arrives the derived recomputes and the override is gone, replaced by whatever the server settled on, which is usually the same number. Neither writer needs to know about the other.'
			},
			code('src/routes/(app)/jam/[room]/+page.svelte', 68, 98),
			{
				type: 'p',
				text: 'Presence is the `present` array from the snapshot: every open stream, by handle. Keyed by id with `animate:flip` and a `scale` transition, so a person joining slides into place and a person leaving shrinks away. `online` from `svelte/reactivity/window` is `navigator.onLine` as a reactive value, and the chip says so before the stream has noticed.'
			},
			code('src/routes/(app)/jam/[room]/+page.svelte', 100, 119),
			{
				type: 'p',
				text: 'A browser with no handle sees a form. It carries the room id as a hidden field, and the handler (ch. 24) calls `watchRoom(room).reconnect()` so that the stream — which read the cookie when it opened — restarts and shows the new name in the presence list. The same `whoAmI()` query the header reads is read here, and the form’s `refresh()` updates both.'
			},
			code('src/routes/(app)/jam/[room]/+page.svelte', 121, 160),
			{
				type: 'p',
				text: 'The grid is the studio’s `StepGrid` with `tools={false}` — no per-track buttons, because tracks are shared — and every callback is a command. `onpaint` reads the current step from the snapshot, computes the next velocity with the same `cycleVelocity` the studio uses, and sends a `Step` with a real `Note` in it; the `transport` hook (ch. 26) carries it across. Nothing is changed locally: the room’s next yield is what redraws the pad, for this browser and every other.'
			},
			code('src/routes/(app)/jam/[room]/+page.svelte', 162, 186),
			{
				type: 'checkpoint',
				items: [
					'You can say what would be on screen if line 57 lost its `$derived`.',
					'You can explain what happens to a knob override when the next snapshot arrives.',
					'You can trace one pad click from this page to every other browser in the room.'
				]
			}
		]
	},

	{
		slug: 'diagnostics-and-the-api',
		title: 'Diagnostics, tracing and the API',
		summary:
			'An in-memory span exporter and the instrumentation file that registers it; a page that reads the adapter’s virtual module, `event.platform`, `updated.check()` and `$state.snapshot`; and three endpoints — the resolver the reroute hook asks, a `QUERY` search with a co-located test, and the plain JSON the embed fetches.',
		goal: 'See where SvelteKit’s OpenTelemetry spans go and how to read them; use `getRequestEvent()` inside a query; and export a `QUERY` handler with a test file beside it.',
		blocks: [
			{ type: 'h3', id: 'where-the-spans-go', text: 'Where the spans go' },
			code('src/lib/server/tracing.ts', 1, 16),
			code('src/lib/server/tracing.ts', 34, 46),
			code('src/lib/server/tracing.ts', 84, 98),
			{
				type: 'p',
				text: 'SvelteKit emits an OpenTelemetry span for every `handle`, `load`, form action and remote function when `tracing: { server: true }` is set. OpenTelemetry hands finished spans to an *exporter*; this one keeps the last few hundred in a ring, bounded by `TRACE_BUFFER`. Module-level state on the server is usually the bug; here it is the point — the ring *is* the cross-request memory, holds nothing private, and is read only by the diagnostics page.'
			},
			code('src/instrumentation.server.ts', 1, 27),
			{
				type: 'why',
				title: 'Why an instrumentation file',
				text: 'An OpenTelemetry provider has to be registered as the global one *before* anything asks for a tracer, or those early spans go to a no-op provider and vanish. SvelteKit guarantees `src/instrumentation.server.ts` runs before any application code — in development through the Vite server, in production because the adapter wires it in front of the entrypoint with `builder.instrument` (ch. 34). The file exists for that ordering and nothing else.'
			},
			{ type: 'h3', id: 'the-page', text: 'The page' },
			code('src/lib/remote/diagnostics.remote.ts', 16, 39),
			code('src/routes/(app)/diagnostics/+page.svelte', 1, 27),
			code('src/routes/(app)/diagnostics/+page.svelte', 35, 96),
			{
				type: 'p',
				text: 'Three sources on one page. `virtual:adapter` is the module the adapter’s Vite plugin provides (ch. 34) — the app can say which adapter built it without hard-coding the name. `runtime.platform` is `event.platform`, filled in by the adapter’s runtime or its emulator, read with `getRequestEvent()` inside a query. And `updated.check()` asks the server for its version right now rather than waiting for the next poll.'
			},
			code('src/routes/(app)/diagnostics/+page.svelte', 99, 107),
			{
				type: 'p',
				text: '`$state.snapshot(filters)` — the right use of it, this time (compare ch. 14). `filters` is a `$state` object, and the remote function wants plain data with no proxy in it; for a plain object, `$state.snapshot` is exactly that. Change the limit and the derived re-awaits.'
			},
			code('src/routes/(app)/diagnostics/+page.svelte', 155, 183),
			{
				type: 'p',
				text: 'One request as a waterfall: the spans of one trace, oldest first, each bar positioned by its start and sized by its duration. Every value is a `{const}` in markup; there is no script-side state for the drawing at all.'
			},
			{ type: 'h3', id: 'the-endpoints', text: 'Three endpoints' },
			code('src/routes/api/resolve/+server.ts', 1, 29),
			{
				type: 'p',
				text: 'A plain endpoint rather than a remote function, because a remote function is called *by* the router once a route is known, and this runs *before* the route is known — that is what rerouting is. Cached for an hour when it finds something, `no-store` when it does not.'
			},
			code('src/routes/api/patterns/+server.ts', 1, 19),
			code('src/routes/api/patterns/+server.ts', 28, 43),
			code('src/routes/api/patterns/+server.ts', 65, 92),
			{
				type: 'p',
				text: '`QUERY` is the HTTP method for “a read with a body” — a GET may not carry one, and a POST says “this changes something”, which a search does not. SvelteKit 3.0.0-next.24 added it to the methods a `+server.ts` may export. The schema is exported with a leading underscore, SvelteKit’s escape hatch for “this export is not a handler”, so the test beside it can import it.'
			},
			code('src/routes/api/patterns/+server.test.ts', 1, 40),
			{
				type: 'note',
				text: 'Until SvelteKit 3.0.0-next.19 every `+`-prefixed file under `src/routes` was a route, and this file would have been an endpoint exporting `describe`. Files with `.test.`, `.spec.` or `.stories.` in their names are now skipped by the router, so a schema’s defaults — the part of an API nobody reads and everybody depends on — get a fast unit test next to the thing they describe.'
			},
			code('src/routes/api/patterns/[id]/+server.ts', 1, 13),
			code('src/routes/api/patterns/[id]/+server.ts', 21, 37),
			{
				type: 'p',
				text: 'The embeddable player (ch. 33) fetches this from somebody else’s page. Plain JSON with numbers for notes, because the element has no `transport` hook and rebuilds `Note`s itself; `Access-Control-Allow-Origin: *`, because the whole point is other origins, and there is nothing to protect that is not already on the pattern’s page.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `SimpleSpanProcessor` does with a finished span and where it ends up.',
					'You can explain why the resolver is a `+server.ts` and not a `query`.',
					'You can add a `QUERY` handler to a route of your own and put its test beside it.'
				]
			}
		]
	}
];
