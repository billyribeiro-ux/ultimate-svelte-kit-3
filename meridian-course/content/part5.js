/**
 * PART 5 — The interface
 * (chapters 22–31)
 *
 * The design system and the shell, then the trip page and each of its
 * tabs: the itinerary, the palette, the map, the globe, the expenses, the
 * notes, the companions. Ten chapters, and every library from the roll-call
 * in chapter 04 shows up in one of them with its wiring visible.
 */

import { code } from './quote.js';

const TRIP = 'src/lib/trip';
const UI = 'src/lib/ui';

export const part5 = [
	{
		slug: 'the-design-system',
		title: 'The design system',
		summary:
			'Tokens with `light-dark()`, a theme class on `MediaQuery`, the boot script that stops the flash, fonts from fontsource preloaded by filename, an `<enhanced:img>` hero, a GSAP reveal as an attachment, and the rule that nothing in the app writes a hex code.',
		goal: 'Build a light-and-dark design system that never flashes, respects reduced motion, and keeps every colour in one file.',
		blocks: [
			{
				type: 'p',
				text: 'Four CSS files, imported in order: tokens define, reset clears, base styles, utilities lay out. Every colour, size and duration the interface uses is named once in the first, and components reference the names. The one rule with no exceptions is that nothing else in `src` writes a hex code — the map style and the globe are the exceptions that prove it, and both say why.'
			},
			code('src/lib/styles/index.css', 1, 5),
			code('src/lib/styles/tokens.css', 1, 16),
			code('src/lib/styles/tokens.css', 18, 57, { partial: true }),
			{
				type: 'p',
				text: '`light-dark()` is the whole theming mechanism. Each token holds its light value and its dark value and the browser picks by `color-scheme`, which follows the system by default and is pinned by `data-theme` on `<html>` when a person chooses. No duplicated `@media (prefers-color-scheme)` blocks, no `.dark` cascade, and — because the choice is applied before the first paint — no flash. The palette is “a map on a table”: warm paper, ink, a teal that reads as water, and one hue per kind of stop that the itinerary and the map share through `--kind-*`.'
			},
			code('src/lib/styles/base.css', 1, 39, { partial: true }),
			{
				type: 'p',
				text: 'The display face is Fraunces, a variable font with an optical-size axis; `font-variation-settings: "opsz" 96` on headings asks for the display cut. The body is Inter. Both come from fontsource as stylesheets of `@font-face` rules with `unicode-range`, so a browser downloads the latin subset and nothing else — and chapter 14’s `preload` filter names those two files by their source filename.'
			},

			{ type: 'h3', id: 'theme', text: 'The theme, and the flash it prevents' },
			code(`${UI}/theme.svelte.ts`, 1, 56),
			{
				type: 'p',
				text: '`MediaQuery` from `svelte/reactivity` is the system’s preference as a reactive value: when the operating system switches at sunset, `resolved` changes and the toaster and the map style follow, without anybody polling. The class only decides what `color-scheme` is; the CSS does the work. `browser` from `$app/env` guards the storage reads, because this module is imported on the server too.'
			},
			code('src/app.html', 12, 25),
			{
				type: 'p',
				text: 'The one inline script in the app, and the reason `vite.config.ts` hashes it. A dark choice on a light system would otherwise paint light for one frame before hydration; this runs before the first paint and sets `data-theme` from storage. It carries no nonce attribute, because the guides are prerendered and SvelteKit refuses to prerender a template with `%sveltekit.nonce%` in it — the hash in `script-src` allows it everywhere.'
			},
			code(`${UI}/ThemeToggle.svelte`, 1, 35),
			{
				type: 'p',
				text: 'A radio group, because that is what it is: one of three, always exactly one. Arrow keys move between them for free, and a screen reader says “Theme, Light, 2 of 3” with no ARIA beyond the fieldset. `:has(input:checked)` styles the label from the state of the input inside it, which is what `:has()` was made for.'
			},

			{ type: 'h3', id: 'hero', text: 'A picture that is four pictures' },
			code('src/routes/(site)/+page.svelte', 18, 43),
			{
				type: 'p',
				text: '`<enhanced:img>` is rewritten at build time — by the preprocessor that must come first in `vite.config.ts` — into a `<picture>` with AVIF and WebP sources at several widths, plus `width` and `height` so nothing shifts while it loads. `sizes` tells the browser how wide the image is on screen, so it picks the smallest file that is still sharp. The source PNG is drawn by `scripts/make-hero.ts` with sharp, which is why sharp is a devDependency named out loud rather than a transitive one hoped for.'
			},

			{ type: 'h3', id: 'motion', text: 'One reveal, three rules' },
			code('src/lib/motion/reveal.ts', 1, 67),
			code('src/routes/(site)/+page.svelte', 45, 70),
			{
				type: 'p',
				text: 'The project’s cinematic budget is spent on the globe. Everything else moves the way a good editor cuts: rarely, and for a reason. The reveal is an attachment — a function that receives an element and returns a cleanup — with three rules the comment states: nothing is hidden until JavaScript runs, reduced motion means no motion, and it plays once. GSAP does the tween because its easing and stagger are better than hand-written keyframes and because it is the tool the earlier projects taught; it is used in one file.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain `light-dark()` and why the theme class only sets `color-scheme`.',
					'You know why the boot script has a hash and no nonce.',
					'You can state the three rules of the reveal and where each is enforced.'
				]
			}
		]
	},

	{
		slug: 'the-shell',
		title: 'The shell: a root that knows nobody',
		summary:
			'The root layout has no header and no `load`; the `(site)` group has both; the header computes its links with `{const}` and reads `scrollY` from `svelte/reactivity/window`; view transitions in `onNavigate`; a version banner from `updated.current`; two error pages sharing one view.',
		goal: 'Arrange layouts so that prerendered pages and per-request pages can coexist, and know what belongs at the root and what does not.',
		blocks: [
			{
				type: 'p',
				text: 'The layout split is the decision this chapter is about, and it came from a failure. The first version had the header in the root layout, fed by a root `+layout.server.ts` that loaded the signed-in person. Then the guides were prerendered, and a prerendered page is rendered once, at build time, with nobody signed in — and that answer is baked into its data. A signed-in person navigating to a guide would see “Sign in” in the header. So the root knows nobody, and the pages that need to know live in a group.'
			},
			code('src/routes/+layout.svelte', 1, 34, { partial: true }),
			code('src/routes/+layout.svelte', 36, 75, { partial: true }),
			{
				type: 'p',
				text: 'The last thing in the script is one line in `onMount`: a `data-hydrated` attribute on the root element. `onMount` in the root layout runs once the whole tree has hydrated, so the attribute is an honest signal that the JavaScript is running — a stylesheet can hide a control that needs it until then, and the end-to-end suite waits for it in the test that proves text typed *before* hydration survives (chapter 32).'
			},
			{
				type: 'p',
				text: 'What is left at the root is what every page shares: the fonts and stylesheet, the toaster, the deploy banner, and the two navigation hooks. `onNavigate` wraps the completion of every client-side navigation in `document.startViewTransition`, so the old page cross-fades into the new — and an element with a `view-transition-name`, like the trip title, morphs. `beforeNavigate` turns the next navigation into a full page load when `updated.current` says a new build was deployed, so no chunk from the old build is ever requested.'
			},
			code('src/routes/+layout.svelte', 78, 111),
			code('src/routes/(site)/+layout.server.ts', 1, 11),
			code('src/routes/(site)/+layout.svelte', 1, 27),
			{
				type: 'p',
				text: 'The only `load` in the project. Identity is needed by every page and by the shell around them, which is exactly the case a layout `load` exists for; everything page-specific comes through remote functions. The `(app)` group inside `(site)` adds a second layout load that redirects strangers to sign in — chapter 32 quotes it — so a page under it cannot forget to check.'
			},

			{ type: 'h3', id: 'header', text: 'The header' },
			code(`${UI}/Header.svelte`, 1, 30),
			code(`${UI}/Header.svelte`, 32, 42),
			{
				type: 'p',
				text: 'Two small Svelte 5 things. `scrollY` from `svelte/reactivity/window` is the window’s scroll position as a reactive value with the listener managed for us — `undefined` on the server, where there is no window — and one `$derived` turns it into the border that appears when the page has scrolled. `{const}` is a declaration tag: a value computed in the markup, scoped to the block, re-evaluated when its dependencies change. The link list depends on whether somebody is signed in, and the header is the only place that needs it, so it lives where it is used.'
			},
			code(`${UI}/Header.svelte`, 44, 101),
			{
				type: 'p',
				text: 'Mobile first: the nav is a sheet under the header, opened by a button with `aria-expanded` and `aria-controls`, and at fifty-two ems it becomes a row and the button disappears. Signing out is a `<form>` spread from a remote `form` with no fields, so it works with JavaScript off. The end-to-end helper in chapter 42 has to know about the sheet, which is the kind of thing a phone project in the test matrix catches.'
			},
			code(`${UI}/Footer.svelte`, 1, 15),
			code(`${UI}/UpdateBanner.svelte`, 1, 15),
			{
				type: 'p',
				text: 'The footer shows `version` from `$app/env` — the commit hash — so “which build is this?” is answered on every page. The banner appears when `updated.current` flips; its button is a plain reload, because there is nothing to save that the server does not already have.'
			},

			{ type: 'h3', id: 'errors', text: 'Two error pages, one view' },
			code(`${UI}/ErrorView.svelte`, 1, 28),
			code('src/routes/+error.svelte', 1, 23),
			{
				type: 'p',
				text: 'A URL that matches no route lands on the root `+error.svelte`, inside the root layout, which has no header — so the root error page brings a small one of its own. An error on a site page renders `(site)/+error.svelte`, inside the site layout, with the full header. Both render `ErrorView`, so the words live once: the status, a sentence, and the reference id from `handleError` when there is one.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the root layout has no `load`, and what would go wrong if it did.',
					'You can explain what `onNavigate` and `beforeNavigate` each do here.',
					'You know why there are two `+error.svelte` files and what each one adds.'
				]
			}
		]
	},

	{
		slug: 'the-trip-page',
		title: 'The trip page: one await, one state object, one stream',
		summary:
			'The page awaits `tripBySlug` in markup with no boundary; `TripView` starts the live query and reads props once with `untrack`; `TripState` derives everything from whichever snapshot is newer; two presence effects that must not loop; tabs from the URL.',
		goal: 'Build a page whose first paint comes from one query and whose every later paint comes from a live stream, with local interaction state kept apart from server state.',
		blocks: [
			{
				type: 'p',
				text: 'This is the page everything else hangs off, and it is short because the work is elsewhere. The page awaits one remote query; the view starts the live one; the state object derives every value the tabs read; and the tabs are components that take the state object as a prop.'
			},
			code('src/routes/(site)/t/[slug=slug]/+page.svelte', 1, 27),
			{
				type: 'p',
				text: 'One `await`, in the markup, with no boundary. The comment says why twice over: a `pending` snippet is what the server would render *instead of* the trip, so the first paint would be a placeholder and a second request; and the failure that matters is a 404, which belongs to `+error.svelte` with the right status and language — where an uncaught error from a remote function goes. `{#key slug}` makes a different trip a fresh `TripView`, which is what lets the view read its props once.'
			},

			{ type: 'h3', id: 'state', text: 'The state object' },
			code(`${TRIP}/state.svelte.ts`, 1, 29),
			code(`${TRIP}/state.svelte.ts`, 31, 65),
			{
				type: 'p',
				text: 'Two kinds of thing, kept apart. What the server says — the document — is derived from whichever is newer: the live query’s latest snapshot, or the first paint’s document until the stream delivers. What this person is doing — the selected stop, the tab — is local `$state` that is never sent anywhere. Everything else is `$derived` from the two, so a change on the server or a click on the screen re-derives exactly the parts that depend on it. The `$derived.by` closures are there because the private fields are assigned in the constructor, after field initialisers run; the comment explains the TypeScript reason.'
			},
			{
				type: 'why',
				title: 'Why a class and not a store, or a context',
				text: 'A class with `$state` and `$derived` fields is the Svelte 5 shape for “an object several components read from”. It is typed, it has methods, it can be constructed with arguments, and every field is fine-grained — a component that reads `view.total` re-renders when the total changes and not when the presence list does. A store would make every consumer subscribe to everything; a context would hide the dependency. Passing `view` as a prop is explicit, and `Itinerary`, `Expenses`, `Notes` and `Companions` all take exactly that.'
			},

			{ type: 'h3', id: 'the-view', text: 'The view' },
			code(`${TRIP}/TripView.svelte`, 27, 59),
			{
				type: 'p',
				text: '`watchTrip(slug)` is the live query; `.current` is the latest snapshot and `.connected` says whether the stream is up. It is created inside `untrack`, and so is the state object, because the props are read once on purpose — the page keys this component on the slug — and `untrack` both says so and quiets the compiler’s fair question. The tab comes from the URL: `?tab=map` is a link, so it works with the back button, can be shared, and needs no state.'
			},
			code(`${TRIP}/TripView.svelte`, 70, 107),
			{
				type: 'p',
				text: 'Read the comment above the effects slowly; it records two bugs the end-to-end suite found, and both are general. First, an effect that read `view.trip` re-ran every time the live query yielded — because `view.trip` is a new object each time — and its cleanup said goodbye, which woke the room, which yielded, which re-ran the effect: a loop through the server. The id is a string that never changes, so it is read once. Second, a remote command keeps a little reactive state of its own and reads it as it starts; called inside an effect, that read becomes a dependency and the write that follows re-runs the effect synchronously until Svelte stops it with `effect_update_depth_exceeded`. `untrack` around the call says: run this, depend on nothing it touches.'
			},
			{
				type: 'warn',
				text: 'The general rule: an `$effect` should read the reactive values it *reacts to* and nothing else. Anything it merely *uses* — a remote function, a library call that keeps state, a derived object you only need one field of — goes inside `untrack`, or is read once outside the effect. The Svelte MCP autofixer flags every function call inside an effect for exactly this reason; most are fine, and the ones that are not are loops.'
			},
			code('src/lib/remote/fire-and-forget.ts', 1, 22),
			{
				type: 'p',
				text: 'The heartbeat and the goodbye are sent and not awaited, and the first version wrote `.catch(() => {})` after each — reasonable for a heartbeat, whose next attempt is fifteen seconds away, and exactly how a real bug hid for an afternoon: when the seeded ids turned out not to be UUIDs (chapter 13), every heartbeat that named a seeded stop failed validation on the server and nobody heard. `fireAndForget()` keeps the production behaviour — nothing a person could act on — and adds a console warning in development, where somebody is looking. Silence is a decision; it should be one you can see in the code.'
			},
			code(`${TRIP}/TripView.svelte`, 128, 171),
			code(`${TRIP}/TripView.svelte`, 173, 184),
			code(`${TRIP}/TripView.svelte`, 186, 216, { partial: true }),
			{
				type: 'p',
				text: 'The header shows the live status: a pulsing chip while the stream is connected, a reconnect button when it is not — `live.reconnect()` is the method SvelteKit gives every live query. The tabs are links with `data-sveltekit-noscroll`. The itinerary tab is a split view on a desktop, with the map sticky beside the days, and a stack on a phone; both components take the same `view` and the same callbacks, and selecting a stop in one highlights it in the other because the selection lives in `view`.'
			},
			code(`${TRIP}/TripView.svelte`, 260, 268),
			{
				type: 'checkpoint',
				items: [
					'You can say why the trip page has no `pending` snippet and where a 404 goes.',
					'You can explain what `TripState.document` is derived from and what that means for caching.',
					'You can state the effect rule and identify both loops the presence effects avoid.'
				]
			}
		]
	},

	{
		slug: 'the-itinerary',
		title: 'The itinerary: days you can drag',
		summary:
			'One `dndzone` per day with svelte-dnd-action, `animate:flip` for the settling, an optimistic override that is derived rather than synced, `place()` from the domain on both sides, a stop card, a dialog with assignable deriveds, and a combobox over the gazetteer.',
		goal: 'Wire a drag-and-drop library into a live document so the screen shows the drop immediately and agrees with the server when it answers — and build the dialog and search that add stops.',
		blocks: [
			{
				type: 'p',
				text: 'svelte-dnd-action is an *action*: `use:dndzone` on a list, with the items and a shared `type` so cards can move between lists. It handles pointer, touch and keyboard — focus a card, press space, arrow — and tells you two things: `consider` (how the list would look if you dropped here) and `finalize` (you dropped here). Everything else is ours, and the interesting part is what happens between the drop and the server’s answer.'
			},
			code(`${TRIP}/Itinerary.svelte`, 15, 55, { partial: true }),
			{
				type: 'p',
				text: 'The override. The server is the source of truth and the live query will send the new order a few hundred milliseconds after the drop; in between, the screen should show what the drag said. So `override` is a copy of the groups with a version stamp, and `groups` is derived: use the override while the server’s version has not moved past the one we dropped on, and the live groups otherwise. Derived, not synced — there is no effect that copies one into the other and could get out of step. The prop is named `view` and not `state` for the reason in the comment: a local called `state` makes `$state` read as a store subscription.'
			},
			code(`${TRIP}/Itinerary.svelte`, 57, 69),
			code(`${TRIP}/Itinerary.svelte`, 71, 108),
			{
				type: 'p',
				text: 'Both the zone that lost the card and the zone that gained it fire `finalize`; only the one that received it — `TRIGGERS.DROPPED_INTO_ZONE` — sends the move. The move is a day and an index, which is what `moveStop` takes and what `place()` in the domain turns into row changes; the server writes them, the live query yields, and the derived `groups` switches back to the server’s order, which is the same order. If the command fails, the override is dropped and the cards animate back to where the server says they are.'
			},
			code(`${TRIP}/Itinerary.svelte`, 111, 170),
			{
				type: 'p',
				text: '`animate:flip` on each `<li>` is what makes the other cards slide out of the way rather than jump; `flipDurationMs` on the zone tells svelte-dnd-action to expect it. `dropTargetStyle: {}` turns off the library’s inline outline in favour of a class from the tokens. The empty-day item is inside the list so a day with nothing on it is still a drop target.'
			},

			{ type: 'h3', id: 'card', text: 'The card' },
			code(`${TRIP}/StopCard.svelte`, 1, 23),
			code(`${TRIP}/StopCard.svelte`, 25, 72),
			{
				type: 'p',
				text: 'The name is a button with `aria-pressed`, because selecting a stop is a toggle that highlights it on the map. The number is the route position from `view.scheduled`, so the list agrees with the map’s pins. `lookers` are the companions whose pointer is on this stop, as chips — presence at the granularity of a card. `data-kind` sets the `--kind` custom property from `tokens.css` for the coloured border, so the six kinds of stop share one hue table with the map.'
			},

			{ type: 'h3', id: 'dialog', text: 'The dialog: assignable deriveds' },
			code(`${TRIP}/StopDialog.svelte`, 15, 62),
			{
				type: 'p',
				text: 'One dialog for adding and editing, told apart by `mode`, and the fields are **assignable `$derived`s**. Each starts from the stop being edited (or from the day and point the add came from) and is then bound and edited like state; when `mode` changes — a different stop, or the dialog reopens — every field resets to the new starting value. That is exactly the semantics a form in a dialog wants, and before assignable deriveds it took an effect that copied props into state and a bug when it ran at the wrong time.'
			},
			code(`${TRIP}/StopDialog.svelte`, 64, 97),
			{
				type: 'p',
				text: 'Bits UI’s `Dialog` supplies the focus trap, the Escape key, the scroll lock and the ARIA; the form inside is plain HTML. Saving calls `addStop` or `updateStop` — commands, because a dialog only exists once JavaScript is running — and a date change on an existing stop goes through `moveStop`, the same function a drag uses, so “move to Thursday” means one thing in the whole application.'
			},
			code(`${TRIP}/StopDialog.svelte`, 99, 172),

			{ type: 'h3', id: 'search', text: 'A combobox over the gazetteer' },
			code(`${TRIP}/PlaceSearch.svelte`, 1, 45),
			{
				type: 'p',
				text: 'Bits UI’s `Combobox` is the accessible half — `role="combobox"`, a listbox, arrow keys, Escape, type-ahead, `aria-activedescendant`. The other half is ours: `const all = $derived(await places())` awaits the prerendered gazetteer inside a derived, which async mode allows, and `matches` filters a hundred names on every keystroke without a server. `query` is read from the input’s own event because the root’s `inputValue` is a prop to set, not one to bind — the kind of detail a headless library’s docs say once.'
			},
			code(`${TRIP}/PlaceSearch.svelte`, 47, 73),
			{
				type: 'checkpoint',
				items: [
					'You can explain the override, why it is derived, and what the version stamp compares against.',
					'You can say which `finalize` sends the move and why the other one must not.',
					'You can describe assignable deriveds in the dialog and what they replaced.'
				]
			}
		]
	},

	{
		slug: 'the-command-palette',
		title: 'The command palette',
		summary:
			'Ctrl+K: a `Dialog` around a `Command` from Bits UI, every stop and every action as an item with a value to match and an `onSelect` to run, and `goto` with `replace` so a tab switch does not fill the history.',
		goal: 'Add a keyboard-first way to reach anything on a page with two headless primitives and no filtering code of your own.',
		blocks: [
			{
				type: 'p',
				text: 'A command palette is a text input, a filtered list, and roving focus with Enter to run. Bits UI’s `Command` does the filtering, the scoring and the focus; a `Dialog` around it does the overlay and the focus trap. What is in the palette is this trip’s stops and a handful of actions.'
			},
			code(`${TRIP}/CommandPalette.svelte`, 1, 54),
			{
				type: 'p',
				text: '`<svelte:window onkeydown>` is how a component listens on the window without an `addEventListener` it has to remember to remove. `goto("?tab=map", { replace: true })` switches the tab through the URL — the same mechanism as clicking the tab — and `replace` keeps five palette jumps from becoming five history entries. The `GotoOptions` in SvelteKit 3 are `replace`, `replaceState`, `shallow`, `reset`, `refreshAll` and `invalidate`; the old `noScroll` and `keepFocus` are gone.'
			},
			code(`${TRIP}/CommandPalette.svelte`, 56, 67),
			code(`${TRIP}/CommandPalette.svelte`, 69, 129),
			{
				type: 'p',
				text: 'Each `Command.Item` is a `value` to match against — the stop’s name plus its id, so two stops with the same name stay distinct — and `keywords` that also match, so typing “food” finds the restaurant. `onSelect` runs the action. The groups have headings; the empty state is a component. The `class` props are ours from the tokens, which is what headless means in practice: every visible pixel is in the `<style>` block below, and the library brought the behaviour.'
			},
			{
				type: 'note',
				text: 'The end-to-end test for this presses `ControlOrMeta+k` — Playwright’s name for “Control on Linux and Windows, Command on a Mac” — types three letters, and clicks an option. It runs on the phone profile too, where there is no keyboard shortcut in real life, and passes, which says something about how well the primitive degrades.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `Command` does and what the component adds to it.',
					'You know why the tab switch is `goto` with `replace`, and which `GotoOptions` exist in SvelteKit 3.'
				]
			}
		]
	},

	{
		slug: 'the-map',
		title: 'The map with no tile server',
		summary:
			'svelte-maplibre over MapLibre GL: a style built from the prerendered world, a worker URL set once in a module script, great-circle legs as a GeoJSON line layer, draggable markers, a theme-following style patched with `diffStyleUpdates`, and geolocation through `createSubscriber`.',
		goal: 'Put an interactive vector map in a SvelteKit app that works offline, in CI and under a strict CSP, and wire its state in and out of Svelte.',
		blocks: [
			{
				type: 'p',
				text: 'The map is where most trip planners send you to a tile provider, an API key and a `connect-src` that names somebody else’s domain. This one draws every country from a bundled atlas and needs none of that. What it costs is streets, and at the scale a trip is planned — a country, a coastline, a city as a dot — that is the right trade for a project that has to work on a train and in CI.'
			},
			code('src/lib/map/style.ts', 1, 48),
			{
				type: 'p',
				text: 'A MapLibre style is JSON: sources and layers. One GeoJSON source, the prerendered `/api/world.json` from chapter 16, and three layers — sea, land, borders. No sprite, no glyphs, because no layer draws text. The colours are literals rather than tokens, and the comment says why: MapLibre paints a canvas and does not read the cascade, so the function takes the resolved scheme and the component rebuilds the style when the theme flips. The comment also says exactly what to change to put OpenFreeMap tiles under it — one source and one CSP line.'
			},

			{ type: 'h3', id: 'the-component', text: 'The component' },
			code('src/lib/map/MapView.svelte', 1, 13),
			{
				type: 'p',
				text: 'MapLibre parses geometry in a Web Worker, and Vite has to be told to emit that worker as a file — `?worker&url` does — and MapLibre has to be handed the URL once, before the first map. A `<script module>` runs once per module, not once per instance, which is exactly the place. The CSP’s `worker-src "self" blob:` in chapter 03 is for this file.'
			},
			code('src/lib/map/MapView.svelte', 15, 83),
			{
				type: 'p',
				text: 'The route is one great-circle line per leg — `arc()` from the library, forty-eight segments, unwrapped across the date line — as a GeoJSON `FeatureCollection` the `LineLayer` draws. `fit` is the padded bounds from the same library. `diffStyleUpdates` makes MapLibre patch three paint properties when the theme flips rather than tear the map down. `bind:map` hands the underlying `Map` instance back for the one imperative call, `fitBounds` on a button.'
			},
			code('src/lib/map/MapView.svelte', 85, 137),
			{
				type: 'p',
				text: 'svelte-maplibre’s components are thin and declarative: `<GeoJSON>` is a source, `<LineLayer>` a layer inside it, `<Marker>` a DOM element positioned by the map. Markers are `asButton` so they are focusable, draggable when the viewer may edit, and the pin inside is ours — numbered, coloured by kind through the same `--kind` property the card uses, scaled when selected. A click on empty map calls `onadd` with a point; the dialog in the last chapter opens with it.'
			},

			{ type: 'h3', id: 'geolocation', text: 'Where am I, as a reactive value' },
			code('src/lib/map/geolocation.svelte.ts', 1, 73),
			code('src/lib/map/MapView.svelte', 139, 175),
			{
				type: 'p',
				text: '`createSubscriber` from `svelte/reactivity` turns an external source of events into something a template can read like state. The function it is given runs when the value is first read inside an effect and its cleanup runs when nothing reads it any more — so the browser’s position watch starts the moment the template shows `geo.fix` and stops the moment it stops showing it. Nobody calls start; nobody forgets stop; the “Where am I” button toggles a boolean and the watch follows. That is the pattern for any subscription-shaped API — a `BroadcastChannel`, a `ResizeObserver`, a WebSocket — and chapter 40 returns to it.'
			},
			{
				type: 'why',
				title: 'Why svelte-maplibre and not the MapLibre API through an attachment',
				text: 'Because a map has a lot of *declarative* state — sources, layers, markers with positions — and a wrapper that turns those into components lets the itinerary’s stops become markers with an `{#each}`. An attachment would be right for the map instance itself and wrong for thirty markers that come and go. The line is: use a wrapper when the library’s objects map onto a tree the template already has; use an attachment when the library wants one element and owns it. Tiptap, in chapter 30, is the second case.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what the style contains, what it costs, and what one change would add tiles.',
					'You can explain why the worker URL is set in a module script and which CSP line it needs.',
					'You can describe `createSubscriber` and give one other API it would fit.'
				]
			}
		]
	},

	{
		slug: 'the-globe',
		title: 'The globe: Threlte, on demand',
		summary:
			'three.js through Threlte — `<T.Mesh>` is a mesh, children attach — with coastlines from the same atlas, arcs lifted off the surface, clickable markers, a `useTask` flyover that follows the library’s great-circle interpolation, a `MediaQuery` that holds it still, and a dynamic import so three.js reaches only the people who ask for it.',
		goal: 'Add a 3D scene to a SvelteKit page declaratively, animate it per frame without an effect loop, respect reduced motion, and load it lazily behind a boundary.',
		blocks: [
			{
				type: 'p',
				text: 'Threlte is Svelte for three.js. `<T.Mesh>` is a `THREE.Mesh`; its attributes are the object’s properties; a geometry and a material as children become that mesh’s geometry and material. The scene is markup, and the two things that are genuinely imperative — building vertex buffers and moving a camera per frame — are the only imperative code in the file.'
			},
			code(`${TRIP}/TripView.svelte`, 217, 250, { partial: true }),
			{
				type: 'p',
				text: 'Loading first, because it is the decision that matters most. three.js and Threlte are the largest dependency in the project and most visits never open the globe tab, so the import is dynamic, in markup, behind a boundary: `{const { default: Globe } = await import(...)}`. The `pending` snippet shows until the chunk arrives and the `failed` snippet if the network does not deliver it, with a `reset` that tries again. `browser` guards the whole thing because a WebGL scene has no server-rendered form; the server renders the loading text and nothing else.'
			},
			code('src/lib/globe/Globe.svelte', 1, 45),
			code('src/lib/globe/Globe.svelte', 47, 99),
			{
				type: 'p',
				text: 'The frame around the scene. It loads the coastlines — the same prerendered file the map reads, so the two agree about where Portugal is — and holds the two bits of state the scene does not own: whether the camera is flying, and whether this person prefers reduced motion. `MediaQuery` makes the second one live: change the operating system setting and the scene stops animating without a reload. The controls are outside the boundary, which is why the end-to-end test can see the button before the chunk has loaded.'
			},

			{ type: 'h3', id: 'the-scene', text: 'The scene' },
			code('src/lib/globe/Scene.svelte', 32, 67),
			code('src/lib/globe/Scene.svelte', 69, 92),
			{
				type: 'p',
				text: 'A latitude and longitude become a point on the unit sphere, with 0°E facing the default camera. The coastlines become a `BufferGeometry` of line segments — every ring of every polygon, pairs of consecutive points — which is twenty thousand vertices and one draw call. `interactivity()` from `@threlte/extras` is what makes `onclick` on a mesh work: it raycasts from the pointer into the scene.'
			},
			code('src/lib/globe/Scene.svelte', 94, 129),
			{
				type: 'p',
				text: 'Each leg gets an arc from the library’s `arc()`, lifted off the surface by an amount that grows with the leg’s length so a long flight visibly arcs and a short hop hugs the ground. The geometries are built in `$derived`, so a change to the stops rebuilds exactly the arcs, and the `$effect` with a cleanup disposes the previous set — buffers are GPU memory, and a globe that leaks one per drag would not survive a planning session.'
			},
			code('src/lib/globe/Scene.svelte', 131, 184),
			{
				type: 'p',
				text: 'The flyover. `useTask` runs a function every frame with the time since the last one, and the function advances along the current leg by `delta / seconds`, puts the camera above `interpolate(a, b, progress)` — the library’s great-circle interpolation, so the camera follows the line it draws — and looks at the centre. The flight variables are plain `let`s, not `$state`: they change sixty times a second and nothing renders them, so making them reactive would only schedule work. Reduced motion means a change of selection is a cut, not an ease, and the flight button does not exist.'
			},
			code('src/lib/globe/Scene.svelte', 186, 242),
			{
				type: 'p',
				text: 'The markup. A camera with `OrbitControls` from extras, disabled while flying so the two do not fight; two lights; `Stars` for a restrained bit of cinema, with `speed={0}` under reduced motion; the sphere; a slightly larger back-facing shell for an atmosphere; the coastlines; the arcs; and one small mesh per stop, scaled up when selected and clickable. `bind:ref={camera}` hands the three.js camera to the task. Every colour here is a literal, like the map’s, because WebGL does not read the cascade.'
			},
			{
				type: 'why',
				title: 'Why Threlte and not three.js in an attachment',
				text: 'The same line as the map. A scene is a tree — camera, lights, meshes, materials — and a template is a tree; Threlte maps one onto the other and `{#each markers}` gives you a mesh per stop for free, with disposal handled when the each block shrinks. An attachment would be the right shape for a single canvas that an imperative renderer owns end to end, and there is one of those in project 5. Here, three quarters of the scene is declarative and Threlte lets it stay that way.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the globe is a dynamic import in markup and what the boundary’s two snippets do.',
					'You can explain what `useTask` is and why the flight variables are not `$state`.',
					'You know where reduced motion is honoured in this component, and by what mechanism.'
				]
			}
		]
	},

	{
		slug: 'expenses-with-tanstack-and-layerchart',
		title: 'Expenses: a headless table, two charts, and the settle-up',
		summary:
			'TanStack Table v9 with opt-in features and a typed column-meta slot, a `get data()` getter so the table follows the live document, a small render helper instead of `FlexRender`, `aria-sort` on the header; LayerChart for a bar and a pie; the domain’s `balances()` and `settle()`; and a remote form whose fields carry their types.',
		goal: 'Use a headless data-table library the Svelte 5 way, chart the same rows, and let a form submit numbers and arrays to a schema that expects them.',
		blocks: [
			{
				type: 'p',
				text: 'Three views of the same rows: a sortable table, two charts, and the settle-up. The table is TanStack Table, which is headless in the strictest sense — it sorts, groups and paginates, and renders nothing — and v9 is the first version whose Svelte adapter is written for runes.'
			},
			code(`${TRIP}/Expenses.svelte`, 23, 58, { partial: true }),
			code(`${TRIP}/Expenses.svelte`, 60, 80),
			{
				type: 'p',
				text: 'Rows are derived from the live document with the payer’s name already looked up, so the table never sees an id. The category labels are message functions — the table shows “Food” in English and “Essen” in German through the same column definition.'
			},
			code(`${TRIP}/Expenses.svelte`, 82, 131),
			{
				type: 'p',
				text: 'Three v9 idioms. `tableFeatures` names the features this table uses — sorting, and nothing else — so the bundle carries sorting and not the twelve other things a data grid can do. `columnMeta: {} as { align?: "end" }` is a *type-only slot*: `meta.align` on a column is now typed, with no global declaration merging, which is how v8 did it. And `get data() { return rows }` is a getter, so the table sees the latest rows whenever the live document changes without being re-created; the adapter syncs options in `$effect.pre`, before the rows below are read.'
			},
			code(`${TRIP}/Expenses.svelte`, 137, 151),
			code(`${TRIP}/Expenses.svelte`, 240, 300),
			{
				type: 'p',
				text: 'The markup is a plain `<table>` in our own CSS. Header and cell templates in TanStack are functions that return strings, or strings; the library’s own `FlexRender` also renders components, and this table only needs text, so a ten-line `render` helper calls the template with the context the library provides. `aria-sort` goes on the `<th>`, not the button inside it — the attribute belongs to the column header — and `getToggleSortingHandler()` is the whole of the sorting interaction.'
			},

			{ type: 'h3', id: 'charts', text: 'Two charts' },
			code(`${TRIP}/Expenses.svelte`, 153, 186),
			{
				type: 'p',
				text: 'LayerChart is components over d3 scales: `<BarChart data x y>` and `<PieChart data key value>` draw with sensible defaults and take the same tokens for colour through a class. The data for both is derived from the rows into small arrays of `{ label, total }`, and the `Map` inside each derivation is a plain one on purpose — built whole and never mutated after, which the ESLint comment says, because the Svelte plugin would otherwise suggest a `SvelteMap` that signals on every insert for nobody. The settle-up is the domain’s `balances()` and `settle()` on the raw minor units: the cents on screen are the cents the server would compute.'
			},

			{ type: 'h3', id: 'the-form', text: 'A form that submits numbers and arrays' },
			code(`${TRIP}/Expenses.svelte`, 329, 417),
			{
				type: 'p',
				text: 'Every field is rendered through `fields.x.as(...)`, which encodes the field’s type into its name so the server can coerce it: `as("number")` gives the schema a number, `as("checkbox", member.userId)` for each companion gives it a `string[]`, `as("select")` a string, `as("hidden", value)` a fixed value. Chapter 17 showed the schema these arrive at; the compile-time check runs both ways, so a checkbox for a field the schema calls a number does not build. `issues()` under each field are the messages the schema or `invalid()` produced, and `pending` disables the button while a submission is in flight. With JavaScript off, the same form posts and the page re-renders with the same issues.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the three v9 idioms and say what each replaced.',
					'You can explain why `aria-sort` is on the `<th>` and what `render` does instead of `FlexRender`.',
					'You can say how a checkbox array and a number reach the schema with the right types.'
				]
			}
		]
	},

	{
		slug: 'notes-with-tiptap-through-an-attachment',
		title: 'Notes: Tiptap through an attachment',
		summary:
			'Tiptap has no Svelte binding and needs none: `{@attach tiptap()}` hands it the element and destroys it on cleanup. A debounced `command` saves the JSON; a counter makes `isActive()` reactive for the toolbar; remote edits arrive through the live query and are applied only when the person is not mid-sentence.',
		goal: 'Integrate an imperative editor library with an attachment, make its non-reactive API drive a toolbar, and merge remote changes without stamping on someone typing.',
		blocks: [
			{
				type: 'p',
				text: 'Tiptap’s `Editor` takes a DOM element and owns it. That is exactly the contract of a Svelte attachment: a function that receives the element when it is in the document and returns a cleanup for when it is not. No `onMount`, no `bind:this`, no lifecycle to get out of order — and no wrapper library, because there is nothing for one to add.'
			},
			code(`${TRIP}/Notes.svelte`, 19, 46, { partial: true }),
			code(`${TRIP}/Notes.svelte`, 48, 69),
			{
				type: 'p',
				text: 'The attachment creates the editor with the document from the live snapshot, the `editable` flag from the viewer’s role, and two callbacks: `onUpdate` schedules a save, `onTransaction` bumps a counter. The cleanup destroys the instance. `editor` is `$state.raw` because a Tiptap editor is a large object with its own internal state and must not be proxied — `raw` stores the reference and signals only on reassignment.'
			},
			code(`${TRIP}/Notes.svelte`, 71, 101),
			{
				type: 'p',
				text: 'Two small mechanisms. Saving is a debounce — type, pause eight hundred milliseconds, one `command` with the whole document, validated by the same `NoteDocSchema` the server checks so a too-long note is refused before the request. And the effect handles the other direction: when the live document carries a note somebody else saved, replace the editor’s content — but only when this person is not focused in it, which is what “mid-sentence” means here. Last writer wins on a page two people rarely edit at the same moment; the comment says which project has the CRDT.'
			},
			code(`${TRIP}/Notes.svelte`, 103, 146),
			{
				type: 'p',
				text: '`editor.isActive("bold")` is not reactive; it is a method on an object Svelte knows nothing about. The counter is the bridge: every Tiptap transaction increments `transactions`, the `$derived.by` reads it — `void transactions` is the read — and so recomputes after every edit, and the toolbar buttons follow the cursor. The tools array is data: a key, a message function for the label, an icon, and a command chain, rendered by one `{#each}`.'
			},
			code(`${TRIP}/Notes.svelte`, 149, 179),
			{
				type: 'why',
				title: 'Why not a Svelte wrapper for Tiptap',
				text: 'Several exist. Each is a component that calls `new Editor` in `onMount` and exposes the instance through a store or a prop — which is what the eleven lines of `tiptap()` do, with an attachment’s cleanup semantics for free. A wrapper would add a dependency, a version to track against Tiptap’s own, and an abstraction between you and the editor’s excellent API. The rule from chapter 01: could we remove it later? Here there was nothing to add in the first place.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can write an attachment for a library that owns an element and say what the cleanup must do.',
					'You can explain the counter that makes a non-reactive API reactive.',
					'You can say when a remote note replaces the editor’s content and when it does not.'
				]
			}
		]
	},

	{
		slug: 'companions-presence-and-settings',
		title: 'Companions, presence, the join page and settings',
		summary:
			'The member list with roles and “here now”; the owner’s invite link and two moderation buttons; presence chips fed by the live query; the join page as one query and one form; and the settings page — an owner-only page, a form that reads its props once, single-flight refresh, and a delete that asks first.',
		goal: 'Finish the trip’s social surface: everything a person can do to another person on the trip, and the page an owner uses to change the trip itself.',
		blocks: [
			{
				type: 'p',
				text: 'The last tab and the two pages around it. Nothing here introduces a new library; it is the remote functions from chapter 19 with faces, and the interesting parts are the choices about which write is a form and which is a command.'
			},
			code(`${TRIP}/Companions.svelte`, 10, 38, { partial: true }),
			code(`${TRIP}/Companions.svelte`, 40, 73),
			{
				type: 'p',
				text: 'Making an invite is a `command` because the result exists to be copied — a link, on screen, with a button that writes it to the clipboard. Leaving is a `form`, because it is a page with a button and should work with JavaScript off. `here` is a set derived from the presence list, so the chip beside a companion who has the trip open appears and disappears with the stream.'
			},
			code(`${TRIP}/Companions.svelte`, 76, 128),
			code(`${TRIP}/Companions.svelte`, 130, 162),
			code(`${TRIP}/Presence.svelte`, 1, 25),
			code(`${TRIP}/Presence.svelte`, 27, 42),
			{
				type: 'p',
				text: 'Presence is one chip per other person, with the stop under their pointer in the tooltip, fed entirely by `view.presence` — which the server refreshes from its thirty-second time-to-live. The initials are computed from the name; there are no avatars in this app, and a coloured circle with two letters is what a person recognises across a table.'
			},

			{ type: 'h3', id: 'join', text: 'The join page' },
			code('src/routes/(site)/(app)/join/[token]/+page.svelte', 1, 46),
			{
				type: 'p',
				text: 'One query says whether the link still works; one remote form accepts it. The page is under `(app)`, so a stranger is sent to sign in and brought back here afterwards — the invite test in chapter 42 follows exactly that path with a brand-new account. Every state the invite can be in has a sentence: already a member, used, expired, or a button.'
			},

			{ type: 'h3', id: 'settings', text: 'Settings: owner only' },
			code('src/routes/(site)/t/[slug=slug]/settings/+page.svelte', 1, 33),
			{
				type: 'p',
				text: 'The remote function already refuses to *change* anything for anybody but the owner. This page refuses to *show* itself, with a 403 rather than a 404, because a member who is not the owner already knows the trip exists — `error()` in markup, which SvelteKit turns into the right status on the server and the error page in the browser.'
			},
			code('src/routes/(site)/t/[slug=slug]/settings/SettingsForm.svelte', 1, 28),
			code('src/routes/(site)/t/[slug=slug]/settings/SettingsForm.svelte', 30, 55),
			{
				type: 'p',
				text: 'The fields start from the trip and belong to the form from then on: `untrack` reads the prop once, on purpose, and the page keys the form on the slug so a different trip is a different form. This is the *other* answer to the stop dialog’s question — assignable deriveds reset on a prop change; `untrack` says the prop never changes — and each is right where it is used. The save is a command with `.updates(tripBySlug(trip.slug))`: single-flight from the client’s side, naming the query this page is holding so the server refreshes it in the same response and the embed section below sees the new visibility before the toast appears.'
			},
			code('src/routes/(site)/t/[slug=slug]/settings/SettingsForm.svelte', 118, 129),
			{
				type: 'p',
				text: 'Delete is a remote `form` with a `confirm()` in its `onsubmit`. With JavaScript off the form posts and the trip is gone; with it on, the browser asks first, and `preventDefault` cancels the submission if the person changes their mind. That is progressive enhancement in four lines, and it is the pattern for every destructive button in the app.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the invite is a command and leaving is a form.',
					'You can explain the settings page’s 403 and where `error()` in markup is handled.',
					'You can compare `untrack` in the settings form with assignable deriveds in the stop dialog and say when each is right.'
				]
			}
		]
	}
];
