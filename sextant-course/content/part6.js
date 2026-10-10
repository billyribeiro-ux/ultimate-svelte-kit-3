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
			code('src/lib/state/workspace.svelte.ts', 46, 70, { partial: true }),
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
			code('src/lib/state/workspace.svelte.ts', 146, 188),
			{
				type: 'p',
				text: 'Arriving on `?q=from+logs` with no `range` rewrites the URL to include it, once, shortly after load. That is deliberate: the address bar is the state, so it should say all of it — and a link copied a moment later then carries the whole view rather than the half somebody happened to type.'
			},

			{ type: 'h3', id: 'the-write', text: 'The write itself: a shallow `goto`' },
			code('src/lib/state/workspace.svelte.ts', 228, 266),
			{
				type: 'p',
				text: 'SvelteKit 3 folded `pushState` and `replaceState` into `goto`. `shallow: true` means "change the URL and `page.state`, run no `load`", and `replace: true` is the difference between one history entry per pause in typing and one per page. The old pair still exists, deprecated; the new spelling is better because *every* change to the address bar now goes through one function with one set of options — and because `goto` only accepts a URL that resolves to a route, which is where the next block comes in. (The early return in the middle has a section of its own, below.)'
			},
			code('src/lib/state/workspace.svelte.ts', 101, 118),
			{
				type: 'p',
				text: 'The class does not know its own route. The page hands it a function that turns a search string into a URL through `resolve()` from `$app/paths`, and the return type — `ResolvedPathname` — is the proof that the URL points at a route this app has. That is what keeps the `goto` typed, and what lets the class be tested with no router at all.'
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
			code('src/routes/[tenant]/explore/+page.svelte', 47, 107),
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
				text: 'The in-effect changed for the same reason. In SvelteKit 3 `page.url` keeps describing the page as it was *rendered*; the address bar after a shallow `goto` is `page.shallow.url`. Adopting `page.url` was harmless while writes could not be held back. Once they can, it would undo a zoom made just before a trace was opened: closing the drawer goes back to an entry that SvelteKit renders from the page’s first URL.'
			},

			{ type: 'h3', id: 'holding-the-window', text: 'A test that holds the window open' },
			code('e2e/explore.e2e.ts', 154, 187),
			{
				type: 'p',
				text: 'A race found under load is not proved fixed by a suite that passes under no load. These tests install Playwright’s clock and stop it once the page has written its URL out — which is also the proof that it hydrated, because only the client adds `view` — so "a write is waiting" is a fact the test arranged rather than a coincidence it hopes for. Each one checks that less than 400ms of page time has passed before the moment that matters, holds the next page’s request so its navigation is still in flight, then moves the clock past the debounce.'
			},
			{
				type: 'p',
				text: 'There are four, two for each half of the claim. Two check that nothing is written where it must not be: onto the drawer’s entry, or into a navigation to another page, and that includes pressing Run, which skips the effect and leaves only the guard in `#write`. The other two check that what was held back is still written: when the drawer closes, and when the navigation comes back to this page. Each was run against the code without the rule it covers, and failed at the step it targets.'
			},
			code('e2e/explore.e2e.ts', 299, 338),
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
			code('src/routes/[tenant]/explore/+page.svelte', 230, 274),
			{
				type: 'p',
				text: '`goto(url, { shallow: true, state })` adds a history entry — so the back button closes the drawer — without running a single `load` function. The results stay exactly as they were. SvelteKit 3 spells it this way instead of `pushState(url, state)` so that one function owns every change to the address bar, and so that the URL has to be one `resolve()` can vouch for.'
			},
			{
				type: 'p',
				text: 'And the URL it writes is a **real page**. Reloading lands on `/[tenant]/traces/[traceId]`, which renders the same two views at full size. That combination — shallow within a session, real when shared — is what shallow routing is for, and it is why the drawer is not simply a component with an `open` prop.'
			},

			{ type: 'h3', id: 'page-state', text: 'The drawer reads history, not a variable' },
			code('src/routes/[tenant]/explore/+page.svelte', 482, 492),
			{
				type: 'warn',
				text: 'A local `open` variable that the shallow `goto` also happens to set is the version that looks right and is broken: the back button changes the history entry and leaves the variable true. Reading `page.state` directly means there is exactly one source of truth, and the browser’s own navigation is it.'
			},

			{ type: 'h3', id: 'closing', text: 'Four ways to close, one implementation' },
			code('src/lib/components/TraceDrawer.svelte', 44, 51, { partial: true }),
			{
				type: 'p',
				text: 'Escape, the button, the backdrop and the back button all do the same thing: `history.back()`. Anything else leaves the history entry behind, so the back button reopens a drawer somebody just closed.'
			},

			{ type: 'h3', id: 'modifier-clicks', text: 'And a link that is still a link' },
			code('src/lib/components/TraceDrawer.svelte', 115, 136),
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
				text: '`resolve(\'/[tenant]/traces/[traceId]\', { tenant, traceId })` instead of a template string. The route id is a member of a union SvelteKit generates from `src/routes`, so a link to a page that was renamed is a type error rather than a 404 somebody finds a week later — and `eslint-plugin-svelte`\'s `no-navigation-without-resolve` asks every `href` and every `goto` to go through it, for the same reason. The explore page imports it as `resolvePath`, because it already has a `resolve` of its own for time ranges, and two functions with one name are easier to read apart than to tell apart.'
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
					'Reloading the drawer’s URL lands on a full page.'
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
			code('src/routes/[tenant]/explore/+page.server.ts', 1, 27),
			{
				type: 'p',
				text: 'Two returned values, and the difference between them is the whole lesson. `q` and `range` come straight off the URL and the page cannot render without them — there is no sensible loading state for the contents of a query box, and rendering an empty one that fills in a moment later means the editor is briefly wrong and the caret jumps.'
			},
			{
				type: 'p',
				text: '`services` is a promise, returned unawaited. SvelteKit streams it: the HTML goes out immediately and the value arrives in a later chunk. It feeds completion, which nobody can use until they have focused the editor and typed something.'
			},
			code('src/routes/[tenant]/explore/+page.server.ts', 7, 48),
			{
				type: 'why',
				title: 'The `.catch` is load-bearing, not defensive',
				text: 'A rejection in a streamed promise arrives **after** the response has started, so it cannot become an error page. It becomes an unhandled rejection in the browser and a page that never finishes hydrating — a blank interface with no error anywhere. Resolving to an empty list degrades completion and nothing else.'
			},

			{ type: 'h3', id: 'consuming', text: 'And nothing to show while it lands' },
			code('src/routes/[tenant]/explore/+page.svelte', 331, 345),
			{
				type: 'p',
				text: '`{#await … then}` with no pending branch, on purpose: the editor is fully usable without completion, and a spinner over a working editor would be worse than no spinner.'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule, stated once' },
			{
				type: 'p',
				text: '**Await what the first paint needs; stream what the first interaction needs.** Streaming everything is a page of spinners. Awaiting everything is a page that waits for its slowest query.'
			},

			{
				type: 'checkpoint',
				items: [
					'The explore page renders rows before the completion catalogue has loaded.',
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
			code('src/lib/components/LiveTail.svelte', 106, 128, { partial: true }),
			{
				type: 'warn',
				text: '`decode(value, { stream: true })` is the part that is correct on a slow network and wrong without it. A chunk boundary can fall in the middle of a UTF-8 sequence — which happens the moment a log line contains an emoji or an accent — and a decoder without it emits a replacement character for the split byte and another for its partner. The bug looks like corrupt data from the server.'
			},
			{
				type: 'p',
				text: 'And an abort is the *normal* way this ends: the query changed, or the component unmounted. Reporting it as a failure would put a red error on the screen every time somebody edits their query.'
			},

			{
				type: 'checkpoint',
				items: [
					'Editing the query tears down the old stream before the new one starts.',
					'A log line with an emoji arrives intact across a chunk boundary.',
					'Stopping the tail does not produce an error.'
				]
			}
		]
	},

	{
		slug: 'remote-functions',
		title: 'Remote functions: query, batch, form and command',
		summary:
			'Four kinds, one rule for choosing between them, and two mistakes that both render a 500 page over a working form.',
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
			code('src/routes/[tenant]/alerts/+page.svelte', 213, 234),
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
			code('src/routes/[tenant]/alerts/+page.svelte', 241, 264),
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
				text: '`error(400, …)` inside a form handler throws an `HttpError`, which SvelteKit turns into a 500 error **page** — the whole form, and the list around it, replaced by "Internal Error". `invalid(issue.query(…))` puts the message beside the field and marks the input. Both mistakes in this chapter were found by one end-to-end test that creates a rule; both looked perfectly reasonable in review.'
			},

			{ type: 'h3', id: 'per-instance', text: 'One instance per row' },
			{
				type: 'p',
				text: 'A remote form is a single object with one attached `<form>` element, so spreading the same one inside an `{#each}` throws — and the page then renders its error branch, which looks like the query failed rather than like a markup mistake. `.for(id)` mints one instance per id, which is also what gives each row its own pending state.'
			},
			code('src/routes/[tenant]/alerts/+page.svelte', 84, 103),

			{
				type: 'checkpoint',
				items: [
					'A results table draws forty sparklines in one round trip.',
					'Your rule form works with JavaScript disabled.',
					'An invalid rule shows a message beside the field rather than an error page.'
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
			code('src/routes/api/v1/query/+server.ts', 230, 233),
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
			code('src/routes/api/v1/query/+server.ts', 56, 92),
			{
				type: 'p',
				text: 'The `_` in `_RequestSchema` is a SvelteKit convention rather than a style choice — it is what lets a `+server.ts` export something that is not a route handler. The chapter on verifying it explains the escape hatch where the test that reaches through it lives; here the schema itself is the point.'
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
			code('src/routes/api/v1/query/+server.ts', 94, 125, { partial: true }),
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
			code('src/routes/api/v1/query/+server.ts', 148, 181),
			{
				type: 'p',
				text: 'Not a second, laxer path for machines. A query the interface refuses must be refused here too, or the two disagree about what the language *is* — and the API becomes the place people go to run the thing the product told them was wrong. The span comes back with the message so a client can underline exactly what the editor would.'
			},

			{ type: 'h3', id: 'the-response', text: 'What the response has to say out loud' },
			code('src/routes/api/v1/query/+server.ts', 195, 227),
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
			'Five hooks, what each is genuinely for, and the one that turns a broken deploy into a process that never claims to be healthy.',
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
					'A broken database means the process never starts.'
				]
			}
		]
	}
];
