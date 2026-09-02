/**
 * PART 6 — SvelteKit 3 in anger (chapters 35–40)
 *
 * Six chapters where the framework is the subject: the URL as state, shallow
 * routing, streamed loads, abort signals, remote functions and hooks. Each one
 * exists because this application needed it, not because it is on a list.
 */

import { code } from './quote.js';

export const part6 = [
	{
		slug: 'the-url-is-the-state',
		title: 'The URL is the state',
		summary:
			'`SvelteURLSearchParams`, one debounced `replaceState`, and the two markers that a single field could not be.',
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
			code('src/lib/state/workspace.svelte.ts', 44, 68, { partial: true }),
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
			code('src/lib/state/workspace.svelte.ts', 75, 97, { partial: true }),
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
			code('src/lib/state/workspace.svelte.ts', 132, 174),
			{
				type: 'p',
				text: 'Arriving on `?q=from+logs` with no `range` rewrites the URL to include it, once, shortly after load. That is deliberate: the address bar is the state, so it should say all of it — and a link copied a moment later then carries the whole view rather than the half somebody happened to type.'
			},

			{
				type: 'checkpoint',
				items: [
					'Typing a query updates the address bar once, not once per character.',
					'The back button restores the previous query.',
					'Pressing Run immediately after typing produces a correct URL.'
				]
			}
		]
	},

	{
		slug: 'shallow-routing',
		title: 'Shallow routing, and a drawer the back button closes',
		summary:
			'`pushState` with `page.state`, a URL that is also a real page, and why the drawer reads history rather than a variable.',
		goal: 'Open a trace without losing the query that found it, and share the link anyway.',
		blocks: [
			{
				type: 'p',
				text: 'Somebody ran a query, found a slow request, and wants to see why — and then wants to look at the next one. A full navigation loses the query, the scroll position and the place in the list, and getting back means the browser’s back button *and* re-finding the row.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 189, 226, { partial: true }),
			{
				type: 'p',
				text: '`pushState` with a `page.state` payload adds a history entry — so the back button closes the drawer — without running a single `load` function. The results stay exactly as they were.'
			},
			{
				type: 'p',
				text: 'And the URL it writes is a **real page**. Reloading lands on `/[tenant]/traces/[traceId]`, which renders the same two views at full size. That combination — shallow within a session, real when shared — is what shallow routing is for, and it is why the drawer is not simply a component with an `open` prop.'
			},

			{ type: 'h3', id: 'page-state', text: 'The drawer reads history, not a variable' },
			code('src/routes/[tenant]/explore/+page.svelte', 448, 458),
			{
				type: 'warn',
				text: 'A local `open` variable that `pushState` also happens to set is the version that looks right and is broken: the back button changes the history entry and leaves the variable true. Reading `page.state` directly means there is exactly one source of truth, and the browser’s own navigation is it.'
			},

			{ type: 'h3', id: 'closing', text: 'Four ways to close, one implementation' },
			code('src/lib/components/TraceDrawer.svelte', 44, 51, { partial: true }),
			{
				type: 'p',
				text: 'Escape, the button, the backdrop and the back button all do the same thing: `history.back()`. Anything else leaves the history entry behind, so the back button reopens a drawer somebody just closed.'
			},

			{ type: 'h3', id: 'modifier-clicks', text: 'And a link that is still a link' },
			code('src/lib/components/TraceDrawer.svelte', 106, 124),
			{
				type: 'p',
				text: 'A modifier-click or a middle-click must keep its normal meaning. Hijacking every click is how a link stops being a link — and "open in a new tab" is exactly what somebody does with a trace they want to keep while they look at the next one.'
			},

			{ type: 'h3', id: 'view-transitions', text: 'View transitions, in six lines and two guards' },
			code('src/routes/+layout.svelte', 9, 48),
			{
				type: 'p',
				text: 'The guards matter as much as the feature. `startViewTransition` does not exist in every browser, and there the navigation simply happens — which is the correct fallback and needs no polyfill. And somebody who asked their system for reduced motion asked for this too; honouring it *here* rather than only in CSS means the transition is never started, which is cheaper and avoids the flash that killing a running animation produces.'
			},
			{
				type: 'p',
				text: 'There is no slide, no scale and no stagger. In a tool somebody uses for eight hours, a transition that is *noticeable* is a transition that is annoying by lunchtime.'
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
			code('src/routes/[tenant]/explore/+page.svelte', 302, 316),
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
			code('src/routes/[tenant]/alerts/+page.svelte', 218, 233),
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
			code('src/hooks.server.ts', 45, 87, { partial: true }),
			{
				type: 'warn',
				text: '`Vary: Cookie` on a response whose content depends on who is asking. Without it, any cache between the server and the browser — a CDN, a corporate proxy, the browser’s own — may serve one person’s page to another. On an application whose pages contain other people’s logs, that is the most serious single-line omission available.'
			},

			{ type: 'h3', id: 'handlefetch', text: '`handleFetch`, which is not about the browser' },
			code('src/hooks.server.ts', 68, 112),
			{
				type: 'p',
				text: '`handleFetch` intercepts `fetch` calls made **on the server**, inside a load or a remote function. Two things belong here and nowhere else: a timeout, because a `fetch` with no timeout will eventually hang a request handler forever; and a `User-Agent`, so that whoever receives the call can tell what is calling them.'
			},

			{ type: 'h3', id: 'handleerror', text: '`handleError`, keyed on `kind`' },
			code('src/hooks.server.ts', 114, 131),
			{
				type: 'p',
				text: 'SvelteKit distinguishes a 404, a thrown `error()`, a validation failure and something genuinely broken. Only the last is worth a log line and a correlation id — writing an id for every 404 buries the one that matters, which is the precise mechanism by which teams stop reading their own error logs.'
			},

			{ type: 'h3', id: 'init', text: '`init`, and an honest limitation' },
			code('src/hooks.server.ts', 133, 167),
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
