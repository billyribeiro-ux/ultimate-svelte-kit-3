/**
 * PART 6 — SvelteKit 3 in anger (chapters 35–41)
 *
 * Seven chapters where the framework is the subject: the URL as state, shallow
 * routing, streamed loads, abort signals, remote functions, the read API and
 * hooks. Each one exists because this application needed it, not because it is
 * on a list.
 */

import { code } from './quote.js';

export const part6 = [
	{
		slug: 'the-url-is-the-state',
		title: 'The URL is the state',
		summary:
			'`SvelteURLSearchParams`, one debounced shallow `goto`, and the two markers that a single field could not be.',
		goal: 'Put the query, the range and the view in the address bar without a navigation per keystroke.',
		blocks: [
			code('src/lib/state/workspace.svelte.ts', 1, 34),
			{
				type: 'p',
				text: 'The argument is not tidiness. People find something in an observability tool and paste it into a chat, and state that lives in a component turns that link into an empty page — which is the entire product failing at the only moment it mattered.'
			},
			{
				type: 'p',
				text: 'The address bar also gives three things for free, each of which is real work otherwise: the back button undoes a change to the query, a reload does not lose it, and the server can render the first result rather than shipping an empty shell that fetches after hydration.'
			},

			{ type: 'h3', id: 'why-not-goto', text: 'Why not `goto` on every keystroke' },
			{
				type: 'p',
				text: 'Because it is a navigation: a hundred history entries for a sentence, and a re-run of every `load` on the route. The shape that works is to edit a local reactive params object and sync it to the address bar when the edits settle — which is exactly what `SvelteURLSearchParams` is for.'
			},
			code('src/lib/state/workspace.svelte.ts', 114, 150),
			{
				type: 'note',
				text: 'A plain `URLSearchParams` in `$state` would need replacing wholesale on every edit to be reactive at all, and `.set()` on it would silently do nothing. This is the case the reactive built-ins exist for, and the mirror image of the virtualizer’s plain `Map` in chapter 28.'
			},

			{ type: 'h3', id: 'the-bug', text: 'One marker cannot answer two questions' },
			{
				type: 'p',
				text: 'The first version had a single `#synced` field. It was wrong in a way no unit test would have found, and the end-to-end suite found it in one test.'
			},
			{
				type: 'terminal',
				code: `
type a query, press Run immediately   → the URL never changes. ever.
type a query, wait, press Run         → the URL updates fine.

cause:  \`adopt()\` ended with \`#synced = params.toString()\`.
        The adopt effect also *read* the params, so every keystroke
        re-ran it, saw a URL it had not written, and recorded the
        current params as "already synced".
        \`flush()\` then compared equal and did nothing — and so did
        the debounced write, forever after.`
			},
			code('src/lib/state/workspace.svelte.ts', 77, 99, { partial: true }),
			{
				type: 'p',
				text: 'Two fields: what the address bar last *said*, and what we last *wrote*. And the params are read inside `untrack`, so the adopt effect depends only on the URL — without which every keystroke re-runs it and the two would be conflated again by a different route.'
			},
			{
				type: 'why',
				title: 'Why a unit test would not have found it',
				text: 'Because both halves work in isolation. Typing updates the params; flushing writes them. The bug lives in the *interaction* between an effect that reads and an effect that writes, which only exists once both are mounted in a real page — and only shows up if you press Run inside the debounce window.'
			},

			{ type: 'h3', id: 'canonicalising', text: 'And a consequence worth naming' },
			code('src/lib/state/workspace.svelte.ts', 148, 190),
			{
				type: 'p',
				text: 'Arriving on `?q=from+logs` with no `range` rewrites the URL to include it, once, shortly after load. That is deliberate: the address bar is the state, so it should say all of it — and a link copied a moment later then carries the whole view rather than the half somebody happened to type.'
			},

			{ type: 'h3', id: 'the-write', text: 'The write itself: a shallow `goto`' },
			code('src/lib/state/workspace.svelte.ts', 230, 268),
			{
				type: 'p',
				text: 'SvelteKit 3 folded `pushState` and `replaceState` into `goto`. `shallow: true` means "change the URL and `page.state`, run no `load`", and `replace: true` is the difference between one history entry per pause in typing and one per page. The migration guide gives the reasons, and they are about behaviour, not spelling: the old pair is deprecated, and “shallow routing now triggers navigation hooks” — `beforeNavigate`, `onNavigate` and `afterNavigate` run for a shallow `goto`, with `navigation.shallow` to tell them apart. Every change to the address bar now goes through one function with one set of options, `replace`, `state` and the new `persistState`, which reapplies `page.state` after a reload. (The early return in the middle has a section of its own, below.)'
			},
			code('src/lib/state/workspace.svelte.ts', 101, 112),
			{
				type: 'p',
				text: 'The class does not know its own route, which is what lets it be tested with no router at all. The page hands it a function that turns a search string into a URL through `resolve()` from `$app/paths`, typed `ResolvedPathname`, the type `resolve()` returns. Be clear about what does the checking. `goto` accepts any string, and a URL that is no route is rejected only when the call runs — and the deprecated `pushState` rejects it in exactly the same way. What makes every `goto` in the project take a resolved path is the linter: `eslint-plugin-svelte`’s `no-navigation-without-resolve`, part of its recommended set, which chapter 36 comes back to.'
			},

			{ type: 'h3', id: 'settling-writes', text: 'A write that is still settling belongs to one entry' },
			{
				type: 'p',
				text: 'A debounced write is a promise made to the address bar 400ms ahead of time, and the entry it was made to is not always the one that is current when it comes due. The end-to-end suite found that out under load, in a test that had passed every time before.'
			},
			{
				type: 'terminal',
				code: `
arrive on ?q=… with no \`view\`, open a trace, press "Open full page"
— all inside the first 400ms —

expected URL   /demo/traces/19b4a728…
received URL   /demo/explore?q=…&range=-6h&view=table   ← over the trace page
page errors    navigation aborted  ×3

cause:  the write that adds \`view=table\` fired while the router was
        finishing the real navigation. A shallow \`goto\` is a navigation:
        it took that one over, and SvelteKit abandoned the navigation
        somebody had asked for — after its page had already rendered.`
			},
			code('src/routes/[tenant]/explore/+page.svelte', 52, 112),
			{
				type: 'p',
				text: 'Two conditions on one effect. `ownsAddressBar` holds the write while the drawer’s trace URL is in the address bar, and lets the effect run again when the drawer closes, so the write is made after all, to the entry it was meant for. `navigating.type !== null` holds it while the router is in the middle of anything: a link, the back button, the drawer opening. Reading `navigating` is also what makes the effect run at the two moments that matter. When a navigation starts, the effect runs and its cleanup drops the waiting timer before the timer can take the navigation over. When the router is idle again, it runs once more and schedules whatever is still unwritten.'
			},
			{
				type: 'p',
				text: 'Where that second run lands depends on where the person went. A navigation to another page unmounts this one, effect and all, so nothing is written anywhere. A navigation back to this page, such as the header’s own Explore link, keeps the page mounted, and the edit goes to the entry the link made. A rule that only dropped the waiting write would get the first case right and the second wrong: the address bar would stay bare for good while the page showed a zoomed range.'
			},
			{
				type: 'p',
				text: 'The last word is the early return in `#write`, in the block above. It is for the one write that does not come through the effect: `flush()`, when somebody presses Run while the next page loads. It refuses during every navigation, shallow ones included. A shallow `goto` takes over a shallow navigation just as it takes over a real one, and refusing costs nothing, because the effect writes once the router is idle.'
			},
			{
				type: 'warn',
				text: '`navigating.shallow` type-checks, and it is `undefined` every time. `navigating` is declared as `Navigation` or an object of nulls, so once `type !== null` has narrowed it, TypeScript offers everything a `Navigation` has, `shallow` included. The object itself has getters for `from`, `to`, `type`, `willUnload`, `delta` and `complete`, the same list the documentation gives. `shallow` belongs to the objects handed to `beforeNavigate`, `onNavigate` and `afterNavigate`. A first draft of this guard tried to let shallow navigations through with `!navigating.shallow`, and in fact refused during all of them. That is now the rule on purpose.'
			},
			{
				type: 'why',
				title: 'Why the old `replaceState` did not race like this',
				text: 'The deprecated function is still in SvelteKit 3, and for backwards compatibility it runs no navigation hooks and leaves the router’s in-flight navigation alone. `goto(url, { shallow: true })` is a navigation: it fires `beforeNavigate`, `onNavigate` and `afterNavigate` — the root layout’s view-transition guard depends on that — and it takes over whatever navigation the router is in the middle of. Going back to `replaceState` would only have changed the symptom. It would still have written the explore URL onto whichever entry was current: the drawer’s, or the trace page’s the moment the router had pushed it.'
			},
			{
				type: 'note',
				text: 'The effect that adopts the URL — the *In* effect in the block above — changed for the same reason. In SvelteKit 3 `page.url` keeps describing the page as it was *rendered*; the address bar after a shallow `goto` is `page.shallow.url`. Adopting `page.url` was harmless while writes could not be held back. Once they can, it would undo a zoom made just before a trace was opened: closing the drawer goes back to an entry that SvelteKit renders from the page’s first URL.'
			},

			{ type: 'h3', id: 'holding-the-window', text: 'A test that holds the window open' },
			code('e2e/explore.e2e.ts', 179, 212),
			{
				type: 'p',
				text: 'A race found under load is not proved fixed by a suite that passes under no load. These tests install Playwright’s clock and stop it once the page has written its URL out — which is also the proof that it hydrated, because only the client adds `view` — so "a write is waiting" is a fact the test arranged rather than a coincidence it hopes for. Each one checks that less than 400ms of page time has passed before the moment that matters, then moves the clock past the debounce. Three of them also hold the next page’s request, so that its navigation is still in flight when the write comes due; the drawer’s test holds nothing, because what must keep the write back there is the drawer’s own URL, which stays in the address bar for as long as the drawer is open.'
			},
			{
				type: 'p',
				text: 'There are four, two for each half of the claim. Two check that nothing is written where it must not be: onto the drawer’s entry, or into a navigation to another page, and that includes pressing Run, which skips the effect and leaves only the guard in `#write`. The other two check that what was held back is still written: when the drawer closes, and when the navigation comes back to this page. Each was run against the code without the rule it covers, and failed at the step it targets.'
			},
			code('e2e/explore.e2e.ts', 324, 363),
			{
				type: 'warn',
				text: 'A stopped clock stops more than your own timers. In async mode Svelte’s `tick()` resolves on a frame or a zero-length timeout, and on a clock that never moves neither comes — so the drawer waited for its data and then never painted, and the first version of these tests failed against the fixed code too. `openTheDrawer` moves the clock a millisecond at a time instead, which lets the frames through and stays nowhere near the 400ms.'
			},

			{
				type: 'checkpoint',
				items: [
					'Typing a query updates the address bar once, not once per character.',
					'The back button restores the previous query.',
					'Pressing Run immediately after typing produces a correct URL.',
					'Opening a trace within 400ms of an edit leaves the drawer open, and "Open full page" lands on the trace’s own URL.',
					'Closing the drawer writes the edit that was waiting.',
					'Pressing the header’s Explore link within 400ms of an edit still ends with the edit in the address bar.'
				]
			}
		]
	},

	{
		slug: 'shallow-routing',
		title: 'Shallow routing, and a drawer the back button closes',
		summary:
			'A shallow `goto` with `page.state`, a URL that is also a real page, and why the drawer reads history rather than a variable.',
		goal: 'Open a trace without losing the query that found it, and share the link anyway.',
		blocks: [
			{
				type: 'p',
				text: 'Somebody ran a query, found a slow request, and wants to see why — and then wants to look at the next one. A full navigation loses the query, the scroll position and the place in the list, and getting back means the browser’s back button *and* re-finding the row.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 336, 379),
			{
				type: 'p',
				text: '`goto(url, { shallow: true, state })` adds a history entry — so the back button closes the drawer — without running a single `load` function. The results stay exactly as they were. SvelteKit 3 spells it this way instead of `pushState(url, state)` because shallow routing is now a navigation like any other: one function owns every change to the address bar, and the navigation hooks hear about this one too.'
			},
			{
				type: 'p',
				text: 'And the URL it writes is a **real page**. Reloading lands on `/[tenant]/traces/[traceId]`, which renders the same two views at full size. That combination — shallow within a session, real when shared — is what shallow routing is for, and it is why the drawer is not simply a component with an `open` prop.'
			},

			{ type: 'h3', id: 'page-state', text: 'The drawer reads history, not a variable' },
			code('src/routes/[tenant]/explore/+page.svelte', 644, 654),
			{
				type: 'warn',
				text: 'A local `open` variable that the shallow `goto` also happens to set is the version that looks right and is broken: the back button changes the history entry and leaves the variable true. Reading `page.state` directly means there is exactly one source of truth, and the browser’s own navigation is it.'
			},

			{ type: 'h3', id: 'closing', text: 'Four ways to close, one implementation' },
			code('src/lib/components/TraceDrawer.svelte', 44, 49),
			{
				type: 'p',
				text: 'Escape, the button, the backdrop and the back button all do the same thing: `history.back()`. Anything else leaves the history entry behind, so the back button reopens a drawer somebody just closed.'
			},

			{ type: 'h3', id: 'focus', text: 'Focus in, and focus back' },
			code('src/lib/components/TraceDrawer.svelte', 51, 73),
			{
				type: 'p',
				text: 'A dialog that opens without moving focus leaves a screen reader reading the page behind it. The attachment focuses the panel as it is mounted, and the function it returns gives the focus back when the panel is removed — and because every way of closing ends with the panel removed, that one function covers all four.'
			},
			{
				type: 'why',
				title: 'Why an attachment, and not `bind:this` with an `$effect`',
				text: 'Attachments “run in an effect when an element is mounted to the DOM”, and the function one returns is called “after the element is later removed from the DOM”. That is this behaviour exactly, said once, on the element it is about. The first version bound the panel to a variable and watched the variable from an effect — the same thing said in two places — and cast `document.activeElement` to `HTMLElement` so that it could call `focus()`. The property is typed `Element | null`, and `instanceof` narrows it where the cast only asserted.'
			},
			{
				type: 'note',
				text: 'The comment is honest about what is missing. Tab can still leave the panel for the page behind it; keeping it in would take `inert` on everything the drawer covers.'
			},

			{ type: 'h3', id: 'modifier-clicks', text: 'And a link that is still a link' },
			code('src/lib/components/TraceDrawer.svelte', 119, 140),
			{
				type: 'p',
				text: 'A modifier-click or a middle-click must keep its normal meaning. Hijacking every click is how a link stops being a link — and "open in a new tab" is exactly what somebody does with a trace they want to keep while they look at the next one.'
			},
			{
				type: 'warn',
				text: 'This link used to have an `onclick` that guarded the modifier keys by hand and then, for a plain click, pushed shallow state for the URL the address bar already showed — a no-op that *looked* like navigation, and no test said otherwise. Migrating `pushState` to `goto(url, { shallow: true })` is what exposed it: once `shallow` was a word in the call, it was visibly the wrong word, because leaving the drawer for the full page is the one real navigation in the file. The fix was deletion, and `e2e/trace.e2e.ts` now has the test that was missing.'
			},

			{ type: 'h3', id: 'typed-links', text: 'Every internal link is typed' },
			code('src/routes/+layout.svelte', 5, 13),
			{
				type: 'p',
				text: '`resolve(\'/[tenant]/traces/[traceId]\', { tenant, traceId })` instead of a template string. The route id is a member of a union SvelteKit generates from `src/routes`, so a link to a page that was renamed is a type error rather than a 404 somebody finds a week later — and `eslint-plugin-svelte`\'s `no-navigation-without-resolve` asks every `href` and every `goto` to go through it, for the same reason. The explore page imports it as `resolvePath`, because it already has a `resolve` of its own for time ranges, and the alias means the two `resolve`s cannot be confused.'
			},

			{ type: 'h3', id: 'view-transitions', text: 'View transitions, in six lines and two guards' },
			code('src/routes/+layout.svelte', 19, 66),
			{
				type: 'p',
				text: 'The guards matter as much as the feature. `startViewTransition` does not exist in every browser, and there the navigation simply happens — which is the correct fallback and needs no polyfill. And somebody who asked their system for reduced motion asked for this too; honouring it *here* rather than only in CSS means the transition is never started, which is cheaper and avoids the flash that killing a running animation produces.'
			},
			{
				type: 'p',
				text: 'There is no slide, no scale and no stagger. In a tool somebody uses for eight hours, a transition that is *noticeable* is a transition that is annoying by lunchtime.'
			},
			{
				type: 'note',
				text: 'The third guard is new with SvelteKit 3, which runs the navigation hooks for shallow navigations too. Both shallow callers in this app are the wrong shape for a cross-fade — the explore page rewrites its query string every time typing settles, and the drawer slides over a page that must stay exactly where it was — so `navigation.shallow` returns early before the transition is ever started.'
			},

			{
				type: 'checkpoint',
				items: [
					'Opening a trace changes the URL and does not re-run any load.',
					'The back button closes the drawer and the results are still there.',
					'Reloading the drawer’s URL lands on a full page.',
					'Opening the drawer moves the focus into it, and closing it by any route puts the focus back.'
				]
			}
		]
	},

	{
		slug: 'streamed-loads',
		title: 'Streamed loads: await what paints, stream what waits',
		summary:
			'The rule for deciding, and the `.catch` that is not defensive programming.',
		goal: 'Send HTML immediately and let the slow half arrive later, without breaking hydration.',
		blocks: [
			code('src/routes/[tenant]/explore/+page.server.ts', 1, 28),
			{
				type: 'p',
				text: 'Two returned values, and the difference between them is the whole lesson. `q` and `range` come straight off the URL and the page cannot render without them — there is no sensible loading state for the contents of a query box, and rendering an empty one that fills in a moment later means the editor is briefly wrong and the caret jumps.'
			},
			{
				type: 'p',
				text: '`services` is a promise, returned unawaited. SvelteKit streams it: the HTML goes out immediately and the value arrives in a later chunk. It feeds completion, which nobody can use until they have focused the editor and typed something.'
			},
			code('src/routes/[tenant]/explore/+page.server.ts', 29, 48),
			{
				type: 'why',
				title: 'The `.catch` is load-bearing, not defensive',
				text: 'A rejection in a streamed promise arrives **after** the response has started, so it cannot become an error page. It becomes an unhandled rejection in the browser and a page that never finishes hydrating — a blank interface with no error anywhere. Resolving to an empty list degrades completion and nothing else.'
			},

			{ type: 'h3', id: 'consuming', text: 'Reading it without waiting for it' },
			code('src/routes/[tenant]/explore/+page.svelte', 245, 251),
			code('src/routes/[tenant]/explore/+page.svelte', 431, 442),
			{
				type: 'p',
				text: 'The editor is drawn at once, on the server as well, and its catalogue reads `services.current`: an empty list in the first paint, and the streamed list as soon as it lands. Nothing on the screen depends on it except the completion list, and nobody asks for a completion in the first moment of a page. When the list arrives, the editor is not drawn again — the same textarea, with the same caret, simply has more to offer.'
			},
			code('src/lib/reactivity/streamed.svelte.ts', 38, 51),
			{
				type: 'p',
				text: 'A stand-in until the promise resolves, then the value, in a `$state.raw` field. Raw, because the value is replaced whole and never changed in place, so a deep proxy around it would be work for nothing. The page creates one inside a `$derived`, so a navigation that streams a new list makes a new `Streamed`, and the old one is dropped with the promise it was waiting for.'
			},
			{
				type: 'why',
				title: 'Why not `{#await data.services then services}`',
				text: 'That was the first version, and it cost two things. “During server-side rendering, only the pending branch will be rendered”, and the pending branch here was empty, so the editor was the one control missing from the server’s HTML: a link to a refused query, opened before the JavaScript arrived, explained the refusal and offered nowhere to fix it. And in the browser the `then` branch is drawn from scratch when the promise lands, so an editor inside it is a new editor — an early click or a caret placed while the list was in flight would be thrown away. The block is the right tool when the content *is* the value; here the value only improves a control that is useful without it.'
			},
			{
				type: 'note',
				text: 'Not an `$effect` that copies the value into `$state` either. An effect would need a flag to ignore a promise that landed after it had been replaced, and an effect that writes state another rune could hold is the pattern the `$effect` documentation warns against. A small class keeps the promise and the state it settles into together, and the `$derived` that creates it decides when it is replaced.'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule, stated once' },
			{
				type: 'p',
				text: '**Await what the first paint needs; stream what the first interaction needs.** Streaming everything is a page of spinners. Awaiting everything is a page that waits for its slowest query.'
			},

			{
				type: 'checkpoint',
				items: [
					'The explore page, editor and rows, is in the server’s HTML before the completion catalogue has loaded.',
					'Completion still offers service names once the catalogue lands, and the caret does not move when it does.',
					'A failing catalogue query degrades completion and nothing else.',
					'You can say which of your loads should be awaited and why.'
				]
			}
		]
	},

	{
		slug: 'abort-signals',
		title: '`getAbortSignal`, and a streaming fetch',
		summary:
			'Two abort signals for two layers, why `EventSource` is the wrong tool here, and the bookkeeping a signal removes.',
		goal: 'Consume server-sent events with `fetch`, and cancel cleanly when the query changes.',
		blocks: [
			code('src/lib/components/LiveTail.svelte', 6, 48),
			{
				type: 'p',
				text: '`EventSource` is the purpose-built API and has two limitations that matter. It cannot send headers, and it takes no `AbortSignal` — so cancelling means calling `.close()` from a teardown wired by hand. It also reconnects on its own schedule, which sounds helpful and means a tail that was deliberately stopped comes back.'
			},

			{ type: 'h3', id: 'the-signal', text: 'What `getAbortSignal()` removes' },
			{
				type: 'p',
				text: 'The manual version is: create a controller, start the stream, return a teardown from the effect that aborts it, and remember that the teardown runs both on unmount **and** on every re-run. That is four things to keep in step, and the failure mode of getting it wrong is invisible — an orphaned stream that keeps its server-side subscription alive, one per query edit, until the tab is closed.'
			},
			code('src/lib/components/LiveTail.svelte', 68, 83),
			{
				type: 'note',
				text: 'Read every dependency *before* the first `await`. After an await the effect is no longer tracking, and a dependency read later silently never triggers a re-run. That is the one rule of async effects and it is easy to break by moving a line.'
			},

			{ type: 'h3', id: 'two-signals', text: 'Two signals, opposite halves of one problem' },
			code('src/lib/remote/query.remote.ts', 58, 82),
			{
				type: 'p',
				text: 'The client signal stops the browser waiting for an answer it no longer wants. The request signal — `getRequestEvent().request.signal`, which adapter-node aborts when the client disconnects — stops the *server computing it*. Editing a query while a tail is open needs both, or the browser drops a stream the server is still happily filling.'
			},

			{ type: 'h3', id: 'sse-by-hand', text: 'Parsing SSE, which is fifteen lines' },
			code('src/lib/components/LiveTail.svelte', 116, 138, { partial: true }),
			{
				type: 'warn',
				text: '`decode(value, { stream: true })` is the part that is correct on a slow network and wrong without it. A chunk boundary can fall in the middle of a UTF-8 sequence — which happens the moment a log line contains an emoji or an accent — and a decoder without it emits a replacement character for the split byte and another for its partner. The bug looks like corrupt data from the server.'
			},
			{
				type: 'p',
				text: 'And an abort is the *normal* way this ends: the query changed, or the component unmounted. Reporting it as a failure would put a red error on the screen every time somebody edits their query.'
			},

			{ type: 'h3', id: 'a-readable-refusal', text: 'A refusal the tail can read' },
			code('src/lib/components/LiveTail.svelte', 87, 104),
			{
				type: 'p',
				text: 'The tail used to ask for `text/event-stream` and nothing else, and that decided what a refusal looked like. SvelteKit answers an `error()` from an endpoint “with either a fallback error page or a JSON representation of the error object, depending on the request’s `Accept` headers”. A tail of a query with a `summarize` in it got the HTML page, `response.json()` could not read it, and “The tail could not start (400).” stood in for the server’s sentence every time. Accepting JSON as well changes nothing on success, because the stream is still a stream, and the refusal then arrives as `{ status, message }`.'
			},
			code('e2e/explore.e2e.ts', 606, 620),

			{
				type: 'checkpoint',
				items: [
					'Editing the query tears down the old stream before the new one starts.',
					'A log line with an emoji arrives intact across a chunk boundary.',
					'Stopping the tail does not produce an error.',
					'A tail the server refuses says why, in the server’s words.'
				]
			}
		]
	},

	{
		slug: 'remote-functions',
		title: 'Remote functions: query, batch, form and command',
		summary:
			'Four kinds, one rule for choosing between them, two mistakes that both render a 500 page over a working form, and the two shapes a refusal arrives in.',
		goal: 'Call the server without writing an endpoint, and know which kind each call should be.',
		blocks: [
			code('src/lib/remote/query.remote.ts', 1, 8),
			{
				type: 'p',
				text: 'A `query` is a read. The interesting thing about this one is what it does *twice*: it parses and checks the query text, even though the editor already did.'
			},
			code('src/lib/remote/query.remote.ts', 33, 41),
			{
				type: 'p',
				text: 'Not redundancy for its own sake. The editor’s copy exists to draw a squiggle as somebody types; this one exists because the query text arrives in a URL that anybody can edit. A checker that only runs in the browser is a suggestion.'
			},

			{ type: 'h3', id: 'batch', text: '`query.batch`, and a resolver that returns a function' },
			code('src/lib/remote/query.remote.ts', 94, 110),
			{
				type: 'p',
				text: 'A results table of forty rows wants a small chart per row, and forty separate calls is forty round trips — on a connection with 80ms of latency that is three seconds of staircase before the last chart appears.'
			},
			{
				type: 'p',
				text: 'The subtlety worth knowing is in the last paragraph: the resolver must return a **function**, not an array. Returning an array makes the mapping positional, and positional mapping breaks the moment the resolver deduplicates — which it must, because a table with the same service twice would otherwise ask for it twice.'
			},

			{ type: 'h3', id: 'form-vs-command', text: '`form` or `command`: the rule' },
			code('src/lib/remote/alerts.remote.ts', 1, 16),
			{
				type: 'p',
				text: '`command` is a function call over the network: it needs JavaScript, and if the bundle has not loaded, nothing happens. `form` is a real `<form>` that posts, progressively enhanced when the bundle is there. **The rule is what the action costs when it silently does nothing.** For "save this alert rule", the cost is somebody believing they are covered when they are not — so it is a form. For an enable/disable toggle that is instant, reversible and visibly reflected, a command.'
			},

			{ type: 'h3', id: 'fields', text: 'Fields come from the form, not from a `name` attribute' },
			code('src/routes/[tenant]/alerts/+page.svelte', 249, 270),
			{
				type: 'terminal',
				code: `
<input name="threshold" />        ← throws:
    "Form contained a field that wasn't created with form.fields.as(...)"
    …and the submission 500s, replacing the whole page.

<input {...save.fields.threshold.as('text')} />   ← correct`
			},
			{
				type: 'p',
				text: 'What the spread buys is worth the ceremony: the field carries its own `aria-invalid`, its value survives a failed submission without a re-render, and a rename in the valibot schema becomes a type error here rather than a form that silently posts a key the server ignores.'
			},

			{ type: 'h3', id: 'default-value', text: '`defaultValue`, because a remote form resets itself' },
			code('src/routes/[tenant]/alerts/+page.svelte', 277, 300),
			{
				type: 'p',
				text: 'A remote form resets after a successful submission — and a reset does not restore what is *selected*, it restores what each option says is its **default**: `option.defaultSelected`, which is the `selected` attribute. `fields.as(\'select\', …)` sets the select’s value **property** and marks no option at all, so before this line every option’s default was `false` and a reset fell to the first one.'
			},
			{
				type: 'terminal',
				code: `
$ # delete the defaultValue attribute, keep everything else
$ npx playwright test e2e/alerts.e2e.ts -g "form reset keeps the direction"

  Error: expect(locator).toHaveValue(expected) failed
  Expected: "below"
  Received: "above"

  1 failed`
			},
			{
				type: 'p',
				text: 'Editing a rule that fires **below** a threshold, saving it, and being left looking at **above** — a different rule, with the form still looking filled in. `defaultValue` on `<select>`, added in Svelte 5.57, is the reset target stated next to the value, and the test above exists so that deleting it fails rather than passing quietly.'
			},

			{ type: 'h3', id: 'invalid', text: 'And `invalid`, not `error`' },
			code('src/lib/remote/alerts.remote.ts', 117, 143),
			{
				type: 'warn',
				text: '`error(400, …)` inside a form handler throws an `HttpError`, which SvelteKit turns into a 500 error **page** — the whole form, and the list around it, replaced by "Internal Error". `invalid(issue.query(…))` puts the message beside the field and marks the input. Both of these mistakes were found by one end-to-end test that creates a rule; both looked perfectly reasonable in review.'
			},

			{ type: 'h3', id: 'per-instance', text: 'One instance per row' },
			{
				type: 'p',
				text: 'A remote form is a single object with one attached `<form>` element, so spreading the same one inside an `{#each}` throws — and the page then renders its error branch, which looks like the query failed rather than like a markup mistake. `.for(id)` mints one instance per id, which is also what gives each row its own pending state.'
			},
			code('src/routes/[tenant]/alerts/+page.svelte', 113, 122),

			{ type: 'h3', id: 'a-refused-command', text: 'A command the server refuses' },
			{
				type: 'p',
				text: 'The toggle used to call `toggleRule(…)` and forget it. When the server refused, nothing said so: the rejection went unhandled, and the box went on showing what had been asked for rather than what the server had kept. A boundary could not have helped. The Svelte documentation is plain that errors “in event handlers or after a `setTimeout` or async work” are **not** caught by error boundaries. So the page catches the rejection itself, puts the box back, and shows the refusal in the row.'
			},
			code('src/routes/[tenant]/alerts/+page.svelte', 42, 70),
			{
				type: 'p',
				text: 'The line that matters is the one that reads the message, because a refusal reaches the browser in two shapes. A `failed` snippet is handed what SvelteKit’s `handleError` made of the error, and the documentation says so in a comment on its own example: “error went through the `handleError` hook and is of type `App.Error`” — `{ status, message }`, plus whatever the app adds. Awaiting a command hands back something else: the `HttpError` the client rebuilt from the response, with the message on `body` and none of its own. A probe that ended the session under a live page, then made a list reload and pressed the toggle, printed both.'
			},
			{
				type: 'terminal',
				code: `
boundary (traces list)  {"status":401,"message":"Sign in to continue."}
                        a plain object: not an Error, and no body

command (toggleRule)    HandledHttpError, which extends HttpError
                        {"status":401,"body":{"status":401,"message":"Sign in to continue."}}
                        not an Error, and no message`
			},
			{
				type: 'p',
				text: 'So a boundary reads `message`, a command’s `catch` reads `body.message`, and each is the wrong field for the other: the wrong one is `undefined`, and a fallback sentence quietly takes its place. `isHttpError` tells a refusal from a request that never reached the server, which is the one case the fallback here is for. Server code is unchanged by any of this. A remote function or a hook that catches an `error()` holds the `HttpError` itself, and `isHttpError(e) && e.body.message` is still right there.'
			},
			{
				type: 'note',
				text: 'The documentation writes the snippet as `failed(error: App.Error)`. Svelte types a boundary’s `failed` as `Snippet<[error: unknown, reset: () => void]>`, so `svelte-check` refuses that annotation — “Type `unknown` is not assignable to type `Error`” — and the snippets here take `error` untyped and cast it where they read it: `(error as App.Error).message`.'
			},
			code('e2e/alerts.e2e.ts', 132, 157),
			{
				type: 'terminal',
				code: `
$ # the old handler: call the command, catch nothing
$ pnpm exec playwright test e2e/alerts.e2e.ts -g 'refuses'

  ✘ a toggle the server refuses says why, and the box goes back
      Expected: "Sign in to continue."
      Error: element(s) not found

  2 failed`
			},

			{ type: 'h3', id: 'what-a-boundary-catches', text: 'What a boundary can catch' },
			{
				type: 'p',
				text: 'The explore page puts its results in one `<svelte:boundary>`, and the comment above it promised that a refused query — a 400 from the checker is the common case — would be explained by the boundary’s `failed` snippet. It never was. Pressing Run on `from logs | where` replaced the whole page with SvelteKit’s error page: a “400” heading, “Expected a value” under it, and no editor to fix the query in.'
			},
			{
				type: 'p',
				text: 'Two rules decide where a failure lands, one for the browser and one for the server, and the page had broken both. The browser’s rule is about where a value is *read*. The server’s is about where an `await` is *written*.'
			},

			{ type: 'h3', id: 'values-made-from-the-result', text: 'In the browser: thrown where it is read' },
			{
				type: 'p',
				text: 'An awaited value that rejects keeps the rejection as its value, and reading it throws. Read in the markup inside a boundary, it throws there, and “errors in `await` expressions will bubble to the nearest error boundary” means that one. A `$derived` that throws is the exception that caught the explore page out: Svelte computes a derived on behalf of the component that *declared* it, so what it throws is reported to the boundary around the declaration, not to the one around whatever read it.'
			},
			{
				type: 'p',
				text: 'The page declared three values made from the result — the rows, the columns and the chart — as `$derived`s in its script. When the query was refused, each one threw as it read the result, and each reported from the script: to the boundary SvelteKit puts around every page, whose `failed` is the error page. The traces page shows the other half of the rule. It awaited its query in the script too, but only its markup read the result, inside its boundary, so in the browser its refusal was caught where it was read — the `boundary (traces list)` line in the probe output above is exactly that. Its trouble was on the server.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 548, 563),
			{
				type: 'p',
				text: 'Declaration tags fix it without changing a line that uses the three. Declared inside the boundary, they report to it. The chart became a plain function, `chartOf()`, so that its `$derived` could be declared here with the other two.'
			},

			{ type: 'h3', id: 'on-the-server', text: 'On the server: every `await` in a script comes first' },
			{
				type: 'p',
				text: 'That made Run work, and a review found the other half the same day. A link to the same query still opened on the error page, and so did a reload after a refused Run, because Run writes the query into the address bar. The query itself was still awaited in the script, as `const result = $derived(await runQuery(…))`, and the Svelte documentation says what the server does with that: “All `await` expressions encountered outside boundaries with `pending` snippets will resolve and render their contents prior to `await render(...)` returning.” A boundary on the server catches only what is thrown inside it, and a script is not inside anything, so a refusal there refuses the whole render.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 128, 142),
			{
				type: 'p',
				text: 'So the `await` moved into the boundary as well. It is `{const result = $derived(await query)}`, the first of the declaration tags quoted above, and the script keeps only the request. A remote query is a promise and an object at once, which is what makes the split work. The script creates it, the markup awaits it, and a button can refresh it.'
			},
			{
				type: 'p',
				text: 'The `pending` snippet had to go with it, and it had been costing something all along. “During server-side rendering, a boundary with a `pending` snippet renders that snippet and ignores the rest of its content.” The server had been waiting for the query, because the script told it to, and then sending “Running…” where the rows should have been. Without the snippet, the server renders what the boundary holds: the result when the query answers, and the `failed` snippet when it refuses, because in SvelteKit 3 errors thrown during rendering are “routed through `handleError` and then passed to the nearest error boundary” — on the server as well as in the browser.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 514, 547),
			{
				type: 'why',
				title: 'Why the response is still a 400',
				text: 'SvelteKit gives the response the status of the error a boundary caught while it rendered, and here that is the checker’s 400. Forcing a 200 would be a small lie. A link to a query the server refuses is a bad request, and the status is what a load balancer, a crawler and this product’s own access log read. The person in front of the page gets the same fact as a sentence, next to the query they can fix.'
			},
			{
				type: 'warn',
				text: 'The caught error also becomes `page.error`, and `page.status` follows it — when the server renders, and again in the browser for every refusal a boundary catches — and neither is cleared when the next run succeeds. Nothing in Sextant reads them. Copy this pattern into an app whose layout does, and it will believe it is showing an error page long after it is not: on a page with boundaries like these, `page.error` means “a boundary caught something”, not “this route failed”.'
			},
			{
				type: 'note',
				text: 'A first repair kept the `await` in the script and caught the refusal there as a value, to throw it again inside the boundary. It worked, at the price of a wrapper type, a function that threw on purpose and an effect that watched every answer to reset the boundary — and the server still sent “Running…”. Moving one `await` replaced all of it.'
			},

			{ type: 'h3', id: 'three-more-pages', text: 'The same `await` on three more pages' },
			{
				type: 'p',
				text: 'The traces list, the trace page and the alerts list had all awaited their queries in the script, each with a `pending` snippet in its boundary. In the browser that held up, because each read its result only in the markup. On the server it was the explore page’s waste exactly: the server waited for the query, then sent “Loading…” in its place, and with JavaScript off the page said “Loading…” for good. Each got the same fix — the `await` inside the boundary as a declaration tag, and no `pending`.'
			},
			code('src/routes/[tenant]/traces/+page.svelte', 75, 90),
			{
				type: 'terminal',
				code: `
$ # the server's HTML for /demo/traces, signed in, before and after
  await in the script, pending snippet    "Loading…" ×1    trace links: 0
  await in the boundary, no pending        "Loading…" ×0    trace links: 100`
			},
			{
				type: 'p',
				text: 'The alerts page needed one more line. Its rule form sits outside the boundary and used to name a rule’s type as `(typeof list)[number]`; with `list` declared inside the boundary, the type is named from the query instead: `type Rule = Awaited<ReturnType<typeof rules>>[number]`.'
			},
			{
				type: 'p',
				text: 'The settings page keeps its `pending` snippets, and that is the same rule applied the other way. Its two lists were awaited in the markup already, inside boundaries that have a `pending` snippet, so the server never runs those queries at all: it sends “Loading…” and the browser asks once it is awake. What was wrong on the other pages was paying for both: the server waited for the data, sent it along in the page’s payload for the browser, and drew “Loading…” instead of it. Either draw it, or do not ask for it; chapter 43 has the settings lists.'
			},
			code('src/lib/components/TraceDrawer.svelte', 145, 155),
			{
				type: 'p',
				text: 'The drawer keeps its `pending` snippet, on purpose, and the reason is where it is drawn. It exists only in the browser, opened from `page.state`, so the server’s way with `pending` never comes into it — and with the `await` inside the boundary, the drawer opens at once and says it is loading. In the script, that snippet had never shown: a component’s own `await` is waited for by whatever boundary holds the component, not by the boundaries it draws, so the drawer appeared only once the trace had arrived.'
			},

			{ type: 'h3', id: 'a-boundary-per-run', text: 'A boundary for each run' },
			{
				type: 'p',
				text: 'A boundary that has failed then has to be drawn again. Its content is gone, so nothing in it is waiting for the next answer. Svelte has a block for exactly this: key blocks “destroy and recreate their contents when the value of an expression changes”. Keyed on the run — the query, the range and which press of Run asked — the results area is a new boundary for every run. The old area stays on screen while the new one waits for its answer, because Svelte keeps a block’s new content out of the page until its `await` has settled, and then the two change places — rows, or the next refusal.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 144, 157),
			{
				type: 'warn',
				text: 'The first version was keyed on `query`, and the tab froze when two runs overlapped. The remote-functions documentation says that queries “are cached while they’re on the page, meaning `getPosts() === getPosts()`”, and in SvelteKit 3.0.1 the client does not do that: each call makes a new object in front of the shared cache entry. With two runs in flight, each read of the key found a new object and started the block over, without end. A string built from the arguments is equal to itself.'
			},
			{
				type: 'terminal',
				code: `
$ # keyed on \`query\`: two runs in flight, both answers let go together
  page.evaluate(() => 1)    no answer in 2s: the tab is busy
  paused in                 skip_effect ← ensure ← {#key} ← update_effect ← flush

$ # in the page: two calls with the same arguments
  runQuery(args) === runQuery(args)    false`
			},

			{ type: 'h3', id: 'running', text: 'Run always asks, and says so' },
			code('src/routes/[tenant]/explore/+page.svelte', 159, 196),
			{
				type: 'p',
				text: 'Run sends a request every time, even when the query on screen is the one in the editor. A range like `-6h` means something new every minute, and an area that failed for a passing reason — a dropped connection, an expired session — can only be drawn again from a fresh answer. The client keeps a query’s last answer for as long as the query is on the page, so the new area would be drawn from the old answer without the `refresh()`. Each press also counts as a new run, so even the same question gets an area of its own.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 450, 454),
			{
				type: 'why',
				title: 'Why “Running…” needs `tick()` and `settled()`',
				text: 'Because Svelte keeps the old rows up on purpose. “When an `await` expression depends on a particular piece of state, changes to that state will not be reflected in the UI until the asynchronous work has completed”, and a status changed in the same update is held back with it, appearing only once there is nothing left to wait for. `$effect.pending()` cannot see it either: it counts the promises “pending in the current boundary, not including child boundaries”, and the run’s `await` is in the next area, a boundary not yet on the page. So the count goes up in an update of its own, and `tick()` lets it paint — in the documentation’s words, “without this, the change to `updating` will be grouped with the other changes, meaning it won’t be reflected in the UI” — and `settled()`, which “resolves when the current update is complete”, says when to take it down. The status is a live region that is always there and only sometimes has words in it, so a screen reader already knows it when “Running…” arrives; the results say `aria-busy` while they wait.'
			},

			{ type: 'h3', id: 'trying-again', text: 'Trying again' },
			code('src/routes/[tenant]/explore/+page.svelte', 198, 236),
			{
				type: 'p',
				text: '“Try again” is a run of the query on screen, not of whatever is now in the editor, so it shares everything above: a fresh answer, a new area, the refusal kept up until the answer is in. What it adds is the focus. The area it sits in is replaced by its own answer, so the button that was pressed is gone afterwards, and focus on a removed element falls back to the page body. Somebody pressing it with a keyboard was thrown to the top of the page after every try.'
			},
			{
				type: 'why',
				title: 'Why the focus is handed back after `settled()`',
				text: 'Each area offers an element for the focus through an attachment — the results section, which has `tabindex="-1"` so it can be focused without becoming a stop for Tab, or the new “Try again”. The first attempt had that element focus itself as it was attached, and the test that held the keyboard on a refusal failed: “Expected: focused, Received: inactive”. The rows case passed and the refusal did not, which gave it away. Svelte builds the next area out of sight and swaps it in once its `await` has settled, and a `failed` snippet is drawn the moment the refusal arrives — before the swap — so the button was focusing itself while it was not yet in the document, and the browser ignores that. After `settled()`, whichever area the answer drew is on the page.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 617, 639),
			{
				type: 'p',
				text: 'While a run is waiting, the button is `aria-disabled` rather than `disabled`. A disabled button gives up the keyboard focus that just pressed it, before there is anywhere for the focus to go.'
			},

			{ type: 'h3', id: 'testing-refusals', text: 'Tests for every way a refusal arrives' },
			code('e2e/explore.e2e.ts', 365, 400),
			{
				type: 'terminal',
				code: `
$ # the old page: rows, columns and chart as $derived in the script
$ pnpm exec playwright test e2e/explore.e2e.ts -g 'refuses is explained'

  ✘ a query the server refuses is explained where its results would be
      Expected: "Expected a value"
      Error: element(s) not found

  2 failed`
			},
			code('e2e/explore.e2e.ts', 402, 429),
			{
				type: 'p',
				text: 'With JavaScript off, the screen is only what the server sent, which is where this half of the bug lived. Run against three earlier pages, the same test fails for three different reasons, and together they show why it looks at the page as well as the status — down to the editor, with the query in it.'
			},
			{
				type: 'terminal',
				code: `
$ # the original page: the await and three $derived values in the script
  ✘ a link to a query the server refuses is the explore page, saying why
      Expected: "Expected a value"
      Error: element(s) not found          ← a 400, from SvelteKit's error page

$ # the first repair: the refusal caught in the script, \`pending\` kept
  ✘ a link to a query the server refuses is the explore page, saying why
      Expected: 400
      Received: 200                        ← and "Running…" where the reason belongs

$ # the editor inside {#await data.services}
  ✘ a link to a query the server refuses is the explore page, saying why
      Expected: "from logs | where"
      Error: element(s) not found          ← the reason, and nowhere to fix it`
			},
			{
				type: 'p',
				text: 'Two more tests use the live page: a link opens with the query in the editor, ready to fix, and a reload after a refused Run lands on the same explanation. The rest hold requests back, or cut them off. The first presses “Try again” with the keyboard on a refusal that will come back the same: it proves a request is made, that the refusal stays up and the page says it is running while it waits, and that the focus ends on the new button.'
			},
			code('e2e/explore.e2e.ts', 487, 519),
			{
				type: 'p',
				text: 'The second is the case the button exists for. It cuts the connection, runs a query, and expects the client hook’s sentence from chapter 41 in place of “Internal Error”; then it puts the connection back, presses “Try again”, and expects the rows, with the focus on them.'
			},
			code('e2e/explore.e2e.ts', 521, 545),
			{
				type: 'terminal',
				code: `
$ # focus taken by the new area as it was attached, not after settled()
  ✘ "Try again" asks again, keeps the refusal up until it answers, and keeps the keyboard there
      Expected: focused
      Received: inactive

$ # no refresh() before the new area: the client's old answer is reused
  ✘ a run lost to a dropped connection says so, and "Try again" draws its rows
      Expected: "2"
      Error: element(s) not found          ← the lost run's refusal, drawn again

$ # the same area for every run of the same query
  ✘ a run lost to a dropped connection says so, and "Try again" draws its rows
      Expected: "2"
      Error: element(s) not found          ← a failed area has nothing left to hear the rows`
			},
			{
				type: 'p',
				text: 'The last two hold answers back. One presses Run on the query already on screen and expects a request, “Running…” and `aria-busy` while it waits, and the old rows kept up until the new ones land. The other lets two runs’ answers go at once and expects the second one’s rows — the test that froze on the key made from `query`.'
			},
			code('e2e/explore.e2e.ts', 547, 578),
			code('e2e/explore.e2e.ts', 580, 604),
			{
				type: 'terminal',
				code: `
$ # Run on the query already on screen, with no refresh()
  ✘ Run asks the server again for the query already on screen, and says it is running
      page.waitForRequest: Test timeout of 30000ms exceeded.    ← nothing was asked

$ # the results area keyed on \`query\`
  ✘ two runs in flight at once end on the answer to the second
      Expected: "2"
      Received: "5"`
			},

			{
				type: 'checkpoint',
				items: [
					'A results table draws forty sparklines in one round trip.',
					'Your rule form works with JavaScript disabled.',
					'An invalid rule shows a message beside the field rather than an error page.',
					'A toggle the server refuses goes back to how it was and says why.',
					'A query the server refuses is explained where its rows would be, with the editor still there.',
					'A link to a refused query opens the explore page with the reason, the editor and a 400, even with JavaScript off.',
					'The traces, a trace and the alert rules are in the server’s HTML, not “Loading…”.',
					'Run asks the server every time, and says “Running…” until the answer is drawn.',
					'“Try again” after a dropped connection draws the rows, and leaves the keyboard on them.',
					'Two runs pressed in quick succession end on the answer to the second.'
				]
			}
		]
	},


	{
		slug: 'the-read-api',
		title: 'The read API, and the HTTP method almost nobody uses',
		summary:
			'Where a remote function is the wrong tool, why `QUERY` rather than `GET` or `POST`, and why `POST` is accepted anyway.',
		goal: 'Expose a read to callers that are not this application, without lying to caches about what it does.',
		blocks: [
			{
				type: 'p',
				text: 'The previous chapter’s rule for choosing between the four kinds of remote function has a case it does not cover, and it is not a rare one: **the caller is not a browser running this application.** A scheduled report, a Grafana panel, another service’s health check, somebody’s shell script. A remote function’s entire value is that a component imports it and the types run end to end, and none of that reaches a Go binary reading a YAML file. Those callers get an HTTP endpoint and an API key, the same way the collector does.'
			},
			{
				type: 'p',
				text: 'There is a second reason this route had to exist, and it is the more embarrassing one. The `read` scope has been in the schema since chapter 25, and until this route nothing accepted it — a key could hold a permission that no handler would honour. That is not a small gap: it is a permission that exists only in the mind of whoever ticked the box.'
			},

			{ type: 'h3', id: 'why-query', text: '`GET` cannot, and `POST` lies' },
			{
				type: 'p',
				text: 'Running a query is a **read**: safe, idempotent, no side effects. `GET` says exactly that and cannot carry a body, so the SQF text has to travel in the URL — where three separate things go wrong.'
			},
			{
				type: 'terminal',
				code: `
GET /api/v1/query?q=from%20logs%20%7C%20where%20user_id%20%3D%3D%20%22u_8123%22…

  1. length    SQF is bounded at 4,000 characters here. URLs are bounded at
               about 2,000 by intermediaries that never announce it — so a long
               query fails somewhere inside somebody's network with a 414.
  2. logs      every proxy, load balancer and CDN on the path writes the full
               URL to an access log. That user id is now in three log files
               that were never meant to hold it.
  3. escaping  a query is quotes, pipes, brackets and spaces. Percent-encoding
               all of it is the step every client gets wrong once.`
			},
			{
				type: 'p',
				text: '`POST` fixes all three and then lies about the semantics. It tells every cache and every retry policy that this request *changes something*: nothing may cache it, and a well-behaved client library will refuse to retry it on a timeout — which for a read is the one case where retrying is obviously safe.'
			},
			code('src/routes/api/v1/query/+server.ts', 229, 232),
			{
				type: 'p',
				text: '`QUERY` — which SvelteKit 3 added to `+server` handlers — is the method that means "a read, with a body". Safe and idempotent like `GET`, a body like `POST`. Exporting it is the same one-line shape as exporting `GET`, because it is just another method handler; what is new is that the router recognises the name.'
			},
			{
				type: 'why',
				title: 'Why `POST` is accepted as well',
				text: '`QUERY` is new, and a great deal of software between a script and this server will refuse a method it has never heard of: old proxies, corporate egress filters, HTTP client libraries that validate the method against a hard-coded list. The alias costs one line and is the difference between an API somebody can use today and one they file a ticket about. The response names the method it was answered with, so a client can tell which path it actually got.'
			},

			{ type: 'h3', id: 'the-body', text: 'The body, in the vocabulary the interface already uses' },
			code('src/routes/api/v1/query/+server.ts', 56, 91),
			{
				type: 'p',
				text: 'The `_` in `_RequestSchema` is a SvelteKit convention rather than a style choice — it is what lets a `+server.ts` export something that is not a route handler. Chapter 46 shows the test that imports it, in the file beside this one; here the schema itself is the point.'
			},
			{
				type: 'p',
				text: '`range` takes the same expressions the address bar does — `-6h`, or `from..to` in epoch milliseconds — so a link somebody copied out of the interface pastes straight into a script. Sharing the vocabulary is most of what makes an API feel like the same product rather than a second one bolted on.'
			},
			{
				type: 'p',
				text: 'The default `maxRows` is lower than the interface’s ceiling on purpose. A machine asking for twenty thousand rows on a schedule is nearly always a query that wanted a `summarize`, and the honest way to find that out is a truncation flag in the first response rather than a slow endpoint nobody looks at.'
			},

			{ type: 'h3', id: 'the-scope', text: 'The scope, finally load-bearing' },
			code('src/routes/api/v1/query/+server.ts', 93, 124, { partial: true }),
			{
				type: 'note',
				text: '`Response.json(...)`, the platform\'s own, rather than `json(...)` from `@sveltejs/kit`. SvelteKit 3 deprecates its helper because the standard one does the same job — serialise, set `content-type: application/json` — and a handler written against `Request` and `Response` alone is one a reader can follow with the MDN page open and nothing else. The ingest route made the same change.'
			},
			{
				type: 'p',
				text: 'The two scopes exist because they belong to different machines. A collector writes and must never be able to read another team’s logs; a reporting job is the exact reverse. A key that could do both would make a compromised collector a data breach rather than a nuisance — and a collector’s key lives in a config file on every host, which is the worst place a read credential could be.'
			},
			{
				type: 'p',
				text: 'The refusal is a **403, not a 401**. The credential is real; the scope is not. Answering 401 would tell the caller to go and fetch a better token, which it cannot do.'
			},

			{ type: 'h3', id: 'one-language', text: 'The same parser and the same checker' },
			code('src/routes/api/v1/query/+server.ts', 147, 180),
			{
				type: 'p',
				text: 'Not a second, laxer path for machines. A query the interface refuses must be refused here too, or the two disagree about what the language *is* — and the API becomes the place people go to run the thing the product told them was wrong. The span comes back with the message so a client can underline exactly what the editor would.'
			},

			{ type: 'h3', id: 'the-response', text: 'What the response has to say out loud' },
			code('src/routes/api/v1/query/+server.ts', 194, 226),
			{
				type: 'p',
				text: '`truncated` is in the payload rather than implied by the row count, because a machine cannot look at a banner. A script that pages by asking for a thousand rows and receiving a thousand has no way to distinguish "that is all of them" from "that is the first page" unless the response says so. `pushed` is the same courtesy about speed: it names which stages reached SQL, so a caller can tell a fast query from a slow one without timing it.'
			},
			{
				type: 'warn',
				text: '`Cache-Control: private, no-store` **and** `Vary: Authorization`. The response depends entirely on which key asked, and the key is in a header rather than the URL — so a shared cache keyed on the URL alone would serve one tenant’s rows to another. In a product whose whole content is other people’s logs, that is the worst caching bug available.'
			},

			{ type: 'h3', id: 'the-config-that-did-nothing', text: 'The CSRF exemption that did nothing' },
			{
				type: 'p',
				text: 'Both this route and the ingest route used to end with `export const config = { csrf: { checkOrigin: false } }` and a confident paragraph about exempting machines from the cross-site check. It had no effect whatsoever, and the tests passed either way — which is exactly why it survived so long.'
			},
			{
				type: 'terminal',
				code: `
node_modules/@sveltejs/kit/src/runtime/server/csrf.js

  const mutating_form_methods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  export function is_csrf_forbidden({ request, request_origin, self_origin, trusted_origins }) {
      return (
          (!request.headers.get('content-type') || is_form_content_type(request)) &&
          mutating_form_methods.has(request.method) &&
          request_origin !== self_origin &&
          (!request_origin || !trusted_origins.includes(request_origin))
      );
  }`
			},
			{
				type: 'p',
				text: 'Three things fall out of those nine lines. **`export const config` is adapter configuration** — runtime, region, that sort of thing — and an unrecognised key is ignored in silence. **The check runs before route resolution**, in `respond.js`, against app-level settings; a route cannot opt out of a decision made before it has been found. And **`checkOrigin` is gone in SvelteKit 3** — the replacement is `csrf.trustedOrigins`, which takes origins and is app-wide.'
			},
			{
				type: 'p',
				text: 'The exemption was also unnecessary, which is the part worth remembering. The check only fires for content types a cross-site HTML form can actually produce. A collector sends JSON, so it was never in the checked set — and `QUERY` is not even a mutating form method, so it is not in the set at all.'
			},
			{
				type: 'terminal',
				code: `
$ curl -X POST -H 'origin: https://evil.example' \\\\
       -H 'content-type: application/json' -d '{}' …/api/v1/ingest
HTTP/1.1 401 Unauthorized          ← reached the handler

$ curl -X POST -H 'origin: https://evil.example' -d 'a=1' …/api/v1/ingest
HTTP/1.1 403 Forbidden             ← a form submission, still refused

$ curl -X PUT  -H 'content-type: application/json' -d '{}' …/api/v1/query
HTTP/1.1 405 Method Not Allowed
allow: POST, QUERY                 ← QUERY is a real method handler`
			},
			{
				type: 'why',
				title: 'So what does keep a browser out?',
				text: 'The `Authorization` header. No cross-site form can set one, and a cross-origin `fetch` that sets one needs a preflight — which this app answers with a 405 and no `Access-Control-Allow-Origin`. The requests a browser can be tricked into making are exactly the ones these endpoints refuse; the ones they accept are the ones a browser cannot make. That was always the real argument, and the config export was standing in front of it taking the credit.'
			},
			{
				type: 'warn',
				text: 'A `POST` with **no** content type at all *is* in the checked set. A collector that omits the header gets a 403 about cross-site form submissions, which will make no sense to whoever is reading its log.'
			},

			{ type: 'h3', id: 'proving-it', text: 'Testing it as a machine, not as a browser' },
			code('e2e/query-api.e2e.ts', 3, 12),
			{
				type: 'p',
				text: 'Clearing `storageState` is the whole point of the setup. Playwright’s `request` fixture otherwise inherits the signed-in session, and the tests below would pass by authenticating as a person — proving nothing about the key path they claim to cover.'
			},
			code('e2e/query-api.e2e.ts', 116, 139),
			{
				type: 'p',
				text: 'The key is minted through the settings form in a real browser, because that is the only place a key exists in clear — the database stores a hash, by design. It costs one page load and keeps the test honest: it uses a key a person could actually have created.'
			},

			{
				type: 'checkpoint',
				items: [
					'`curl -X QUERY` with a `read` key returns rows; the same call with an ingest key returns 403.',
					'A query the editor rejects is rejected here with the same message and span.',
					'`maxRows: 5` on a bigger result comes back with `truncated: true`.'
				]
			}
		]
	},

	{
		slug: 'hooks',
		title: 'Hooks: auth, security, `handleFetch`, `handleError` and `init`',
		summary:
			'Five server hooks and one in the browser, what each is genuinely for, and the one that turns a broken deploy into a process that never claims to be healthy.',
		goal: 'Wire the request lifecycle, and put each concern where it can only be applied once.',
		blocks: [
			code('src/hooks.server.ts', 1, 27),
			{
				type: 'p',
				text: 'A `sequence` of two handles, and the order is the design: authentication populates `locals.user`, and the security headers are applied to whatever comes back regardless of which route produced it.'
			},

			{ type: 'h3', id: 'vary', text: 'The header that is easy to forget' },
			code('src/hooks.server.ts', 105, 118, { partial: true }),
			{
				type: 'warn',
				text: '`Vary: Cookie` on a response whose content depends on who is asking. Without it, any cache between the server and the browser — a CDN, a corporate proxy, the browser’s own — may serve one person’s page to another. On an application whose pages contain other people’s logs, that is the most serious single-line omission available.'
			},

			{ type: 'h3', id: 'preload', text: 'And the filter that fixed a font downloaded twice' },
			{
				type: 'p',
				text: 'The same `resolve` call carries a `preload` filter, and it is there because of a bug that had been shipping quietly. SvelteKit preloads `js` and `css` by default and never fonts — it cannot know which a page will use — so this project did what everybody does: copy two font files into `static/`, and hand-write two `<link rel="preload">` tags against those stable paths.'
			},
			{
				type: 'p',
				text: 'The stylesheet, meanwhile, imports the fontsource CSS, whose `@font-face` rules point at the **bundled, hashed** files. So the two preloaded copies matched no `@font-face` at all. The browser fetched 88KB nothing ever used, warned about it in a console message that is easy to miss, and then downloaded the real faces a second time.'
			},
			{
				type: 'terminal',
				code: `
$ grep -o 'src:url([^)]*)' .svelte-kit/output/client/_app/immutable/assets/*.css
  …/inter-latin-wght-normal.Dx4kXJAl.woff2      ← what the CSS uses
  …/jetbrains-mono-latin-wght-normal.B9CIFXIH.woff2

$ grep -rl "/fonts/" .svelte-kit/output/client
  (nothing)                                     ← what was preloaded`
			},
			{
				type: 'p',
				text: 'It could not be fixed before, and that is the point. A bundled font’s URL carries a content hash, so a filter could only match a path nobody can predict. SvelteKit 3 gives a `font` input a **`filename`** — the source path relative to the project root, before hashing — and matching on that is exact, survives every rebuild, and lets the fonts stay bundled.'
			},
			code('src/hooks.server.ts', 47, 59),
			code('src/hooks.server.ts', 61, 103, { partial: true }),
			{
				type: 'p',
				text: 'Only the two latin subsets. Inter ships seven and JetBrains Mono six; the `unicode-range` on each `@font-face` means the browser fetches only what a page needs, and preloading all thirteen would be four hundred kilobytes to save one round trip on two of them.'
			},
			{
				type: 'why',
				title: 'Why preloading matters more here than on most pages',
				text: 'The charts and the flame graph draw their labels into a canvas, and canvas text is measured against whatever font is loaded *at that moment*. A face that arrives late makes the first frame lay out against a fallback and every frame after it against the real one, so labels jump and truncation is computed twice. On an ordinary page a late font is a reflow; here it is a wrong picture.'
			},

			{ type: 'h3', id: 'handlefetch', text: '`handleFetch`, which is not about the browser' },
			code('src/hooks.server.ts', 122, 164, { partial: true }),
			{
				type: 'p',
				text: '`handleFetch` intercepts `fetch` calls made **on the server**, inside a load or a remote function. Two things belong here and nowhere else: a timeout, because a `fetch` with no timeout will eventually hang a request handler forever; and a `User-Agent`, so that whoever receives the call can tell what is calling them.'
			},

			{ type: 'h3', id: 'handleerror', text: '`handleError`, keyed on `kind`' },
			code('src/hooks.server.ts', 166, 183),
			{
				type: 'p',
				text: 'SvelteKit distinguishes a 404, a thrown `error()`, a validation failure and something genuinely broken. Only the last is worth a log line and a correlation id — writing an id for every 404 buries the one that matters, which is the precise mechanism by which teams stop reading their own error logs.'
			},

			{ type: 'h3', id: 'handleerror-client', text: 'And `handleError` in the browser' },
			{
				type: 'p',
				text: 'The same hook can live in `src/hooks.client.ts`, typed `HandleClientError`, and it sees what goes wrong in the browser: a render that throws, and a remote call that fails before any server could shape the error. That second case is the one this project needed it for. Drop the connection and press Run, and the explore page used to say “Internal Error”. The query never reached the server, and the sentence blamed it anyway — SvelteKit’s default for `kind: \'unknown\'` is a 500 that reads exactly that.'
			},
			code('src/hooks.client.ts', 11, 46),
			{
				type: 'p',
				text: 'A failed `fetch` rejects with a `TypeError`, and so does a bug, so the check reads the message as well, and the three browser engines each have one wording for “no response at all”. Anything it does not recognise passes through to SvelteKit’s default, and a refusal the server already shaped never reaches this hook: “errors that were already transformed by the server-side hook are not passed to the client-side hook a second time”. Chapter 39 has the test, which cuts the connection under a live page and then lets “Try again” put it right.'
			},

			{ type: 'h3', id: 'init', text: '`init`, and an honest limitation' },
			code('src/hooks.server.ts', 185, 219, { partial: true }),
			{
				type: 'p',
				text: 'Reaching the database in `init` turns "the deploy is broken" into a process that never claims to be healthy — which is what a load balancer needs in order to keep the old version serving.'
			},
			{
				type: 'why',
				title: 'And then it says what it cannot do',
				text: 'Both background loops assume a single process. Two instances behind a load balancer would each evaluate every rule and each drain the same outbox, so every alert is delivered twice. Making it multi-process needs a lease — a row somebody holds for thirty seconds and renews — and that is genuinely the next piece of work rather than something a comment can wave away. Saying so is better than a deployment discovering it.'
			},

			{
				type: 'checkpoint',
				items: [
					'Every authenticated response carries `Vary: Cookie`.',
					'A server-side `fetch` that hangs is cut off rather than hanging the request.',
					'A broken database means the process never starts.',
					'A query lost to a dropped connection says that, not “Internal Error”.'
				]
			}
		]
	}
];
