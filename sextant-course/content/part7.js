/**
 * PART 7 — The rest of the product, and proving it (chapters 42–46)
 *
 * Alerts end to end, the settings nobody thinks about until they matter, a seed
 * that tells a story, and the verification pass — which is where six real bugs
 * in this codebase were found.
 */

import { code } from './quote.js';

export const part7 = [
	{
		slug: 'the-transactional-outbox',
		title: 'Alerts end to end: the transactional outbox',
		summary:
			'Two facts that must never disagree, every ordering that gets one of them wrong, and the `isNull` that stops an outbox sending anything at all.',
		goal: 'Evaluate rules on a timer and deliver notifications exactly as often as they should be.',
		blocks: [
			code('src/lib/server/alerts.ts', 1, 35),
			{
				type: 'p',
				text: 'Two facts must never disagree: "this rule is firing" and "somebody was told". Every ordering that puts them in separate operations gets one of them wrong when the process dies in between — and the process will die in between, because it is a process.'
			},
			{
				type: 'terminal',
				code: `
write status, then send
    crash between → firing, nobody told. And because the status
    now says firing, the next evaluation sees no transition and
    never sends. Permanently silent.

send, then write status
    crash between → the page went out, the status still says ok.
    The next evaluation fires again. Duplicate pages, forever.

write status AND outbox row in one transaction; a worker delivers
    crash before delivery → an undelivered row, picked up on restart.
    crash during delivery  → possibly delivered twice, which is why
                             the payload carries a deduplication key.`
			},

			{ type: 'h3', id: 'the-transaction', text: 'The transaction' },
			code('src/lib/server/alerts.ts', 168, 215),
			{
				type: 'p',
				text: 'And the deduplication key is `rule + transition + when it started` — the same string for both copies of a redelivery and a different one for the next transition, which is exactly what a receiver needs to collapse them. A timestamp of *now* would produce a different key each time and defeat the whole point.'
			},

			{ type: 'h3', id: 'isnull', text: 'The one-word bug that makes an outbox do nothing' },
			code('src/lib/server/alerts.ts', 305, 339),
			{
				type: 'warn',
				text: 'In SQL, `x = NULL` is not false — it is NULL, which is not true, so the row never matches. Drizzle will happily build that comparison if you hand it a null, and the result is an outbox that accepts rows forever and sends nothing, with no error anywhere. `isNull` is the fix and the reason this is worth a paragraph.'
			},

			{ type: 'h3', id: 'backoff', text: 'Backoff as a timestamp' },
			code('src/lib/server/alerts.ts', 268, 284),
			{
				type: 'p',
				text: 'A timestamp rather than a sleep, so a restart resumes rather than retrying immediately and hammering whatever was already failing. And a maximum attempt count that stops rather than deletes: a row that has failed eight times has a real problem, and keeping it with its `lastError` is what makes the failure visible instead of only in a log.'
			},

			{ type: 'h3', id: 'the-value', text: 'And the convention that gets the number out' },
			code('src/lib/server/alerts.ts', 218, 230),
			{
				type: 'p',
				text: 'The first numeric column of the first row. A convention rather than a configuration field, because every alternative is worse: naming a column means a rule breaks silently when somebody renames it in the query, and an expression evaluated over the result is a second language.'
			},

			{ type: 'h3', id: 'the-test', text: 'The test that matters most' },
			code('src/lib/server/alerts.spec.ts', 113, 155),
			{
				type: 'p',
				text: 'Everything else in that file is arithmetic. This one is the difference between an alerting system you can rely on and one that goes quiet at the worst possible moment.'
			},

			{
				type: 'checkpoint',
				items: [
					'A firing rule writes one notification, not one per evaluation.',
					'A failed delivery backs off and survives a restart.',
					'A rule whose query returns nothing holds its state.'
				]
			}
		]
	},

	{
		slug: 'keys-and-views',
		title: 'Settings: keys you can never read back',
		summary:
			'A key shown once, revoke rather than delete, and a saved view that stores the range as it was written.',
		goal: 'Build the settings that only matter after something has gone wrong.',
		blocks: [
			code('src/lib/remote/settings.remote.ts', 19, 49),
			{
				type: 'p',
				text: 'Only the prefix is stored in clear, so the list can show `sxt_a1b2c3d4…` next to "created three weeks ago, last used four minutes ago" without any row being a live credential.'
			},
			code('src/lib/remote/settings.remote.ts', 51, 85),
			{
				type: 'why',
				title: 'A system that can show you a key again is one where the key is readable at rest',
				text: 'Which makes a database backup a fleet compromise. Returning the clear value once, from the call that mints it, is not a usability compromise — it is the property that makes every other control meaningful.'
			},

			{ type: 'h3', id: 'revoke', text: 'Revoke, not delete' },
			code('src/lib/remote/settings.remote.ts', 87, 109),
			{
				type: 'p',
				text: 'Deleting the row removes the record that a key existed at all — which is precisely the record somebody wants during an incident review, when the question is "what was this thing and who made it".'
			},

			{ type: 'h3', id: 'saved-views', text: 'A range stored as it was written' },
			code('src/lib/remote/settings.remote.ts', 131, 177, { partial: true }),
			{
				type: 'p',
				text: 'A saved view of "the last six hours" must mean the last six hours when it is opened, not the six hours that happened to be current when it was saved. Storing two timestamps would make every saved view a historical snapshot — a different and much less useful feature.'
			},
			{
				type: 'note',
				text: 'The same distinction appears in the range picker: a relative range is *live* and says so, and "pin" is the deliberate act that freezes it into two timestamps. A link to "the last hour" means something different tomorrow, and the interface has to make that visible rather than surprising.'
			},

			{ type: 'h3', id: 'roles', text: 'And the role each action needs' },
			{
				type: 'p',
				text: 'Reading the key list is `admin`, because knowing which integrations exist is itself worth restricting. Creating an alert rule is `member`, because a read-only viewer must not be able to page the whole team at three in the morning. Deleting one is `admin`, because it removes a safety net silently and the person who notices is whoever was relying on it during an incident.'
			},
			code('src/lib/remote/alerts.remote.ts', 176, 189),

			{ type: 'h3', id: 'typed-before-hydration', text: 'What was typed before the page woke up' },
			{
				type: 'p',
				text: 'The read API’s end-to-end tests mint their keys through this form, straight after the page loads. On the phone profile, under load, one of them typed the key’s name a few dozen milliseconds before the bundle hydrated — and hydration emptied the field, the `required` check stopped the submission without a request ever leaving the browser, and no key appeared. The trace showed it plainly: `fill` finished, the remote queries a hydrated page makes went out a few dozen milliseconds later, and at the very next action the input’s value was an empty string.'
			},
			code('src/lib/forms/keep-typed.ts', 1, 67),
			{
				type: 'p',
				text: 'The fix is the comparison Svelte already makes for `bind:value` — what is in the control now against what the server rendered — applied to the controls a remote form spreads its fields onto. It runs in the page’s `<script>`, which is the one moment that is both after the server’s HTML arrived and before the template hydrates over it.'
			},
			code('src/routes/[tenant]/settings/+page.svelte', 12, 14),
			{
				type: 'p',
				text: 'The explore page has the other server-rendered field somebody types into, the name a view is saved under, and asks for the same thing. Its script has a top-level `await`, and the call goes after it, because code after a top-level `await` still runs before the template, and later is better here: it reads whatever was typed while the `await` was waiting too.'
			},
			code('src/routes/[tenant]/explore/+page.svelte', 175, 178),
			{
				type: 'warn',
				text: 'The select is the worse half. An emptied name at least stops the form; a `read` scope chosen before hydration comes back as `ingest` and submits perfectly happily — a key that cannot do the one thing it was made for, and nothing on the screen to say so.'
			},

			{ type: 'h3', id: 'seeing-hydration', text: 'A test that has to see hydration happen' },
			code('src/routes/+layout.svelte', 68, 87),
			{
				type: 'p',
				text: 'The obvious hook was the wrong one. An `afterNavigate` of type `enter` is SvelteKit’s own word for “the app has hydrated”, and the first version of this marker used it. The marker then appeared on the settings page and on no other page. `enter` goes out once, a moment after hydration starts, to whichever callbacks are registered by then. `afterNavigate` registers in `onMount`, and on a page with a top-level `await` the layout does not mount until that `await` has resolved. `onMount` has no event to miss. So the marker has a test of its own, on all four workspace pages, checking both sides: absent while the bundle is held, present once it is let through.'
			},
			code('e2e/hydration.e2e.ts', 33, 48),
			{
				type: 'p',
				text: 'The form test holds the client bundle back, types and chooses while the page is only the server’s HTML, then lets the bundle through. It checks the marker on both sides — absent while it types, so it cannot accidentally type after hydration and prove nothing; present before it looks, so it cannot pass by looking before hydration had a chance to throw anything away — and then reads the key list the form’s own refresh brought back, so the scope it finds is the one the server stored. Its twin on the explore page saves a view and finds it listed under the name typed early.'
			},
			code('e2e/hydration.e2e.ts', 50, 77),

			{ type: 'h3', id: 'a-list-that-redraws', text: 'A list that redraws without a reload' },
			{
				type: 'p',
				text: 'That test used to reload the page before it read the list, and the reload was covering for a bug. Every form on this page refreshes the list it changed, in the same request: the handler calls `keys({ tenant }).refresh()`, and the new rows come back with the result. The page then drew the old ones. A key that had just been made was missing from the list, a revoked key still offered to be revoked, and a removed view stayed where it was. A reload put all three right, which is why nothing had noticed.'
			},
			code('src/routes/[tenant]/settings/+page.svelte', 31, 88),
			{
				type: 'p',
				text: 'Both lists were drawn with `{#await keys(…) then list}`. A throwaway page that read the same query four ways settled what was wrong. When the form came back, the `{#await}` block did run again, and it resolved with the rows from **before** the refresh. `query.current`, a bare `{await …}` and an `await` held in a `{@const}` all showed the new rows. One more result explains why the fix removes the block rather than adding something next to it: with an `{#await}` on the same query in the same boundary, an `await` beside it went stale too.'
			},
			{
				type: 'p',
				text: 'The console had said so at every stale read, in one line: Svelte’s `derived_inert` warning, “reading a derived belonging to a now-destroyed effect may result in stale values”. A query keeps its rows in `$derived` values, and the block was reading them after they had stopped updating. The old page printed it when a key was created and again when one was revoked; the new page prints nothing.'
			},
			{
				type: 'p',
				text: 'The page holds the rows in `{const list = $derived(await …)}` rather than in a `{@const}`, because the Svelte documentation now calls the older tag legacy: “`{@const x = y}` is legacy syntax — use `{const x = $derived(y)}` instead”. An `await` in the markup is also what the remote-functions documentation reaches for first: “while using `await` is recommended, as an alternative the query also has `loading`, `error` and `current` properties”.'
			},

			{ type: 'h3', id: 'two-states-that-never-ran', text: 'Two states that never ran' },
			{
				type: 'p',
				text: 'The blocks had a second fault, and it had been in plain view the whole time. Each list sits in a `<svelte:boundary>` with a `pending` snippet and a `failed` snippet, and in the browser neither one ever ran. A boundary waits for `await` expressions. Its `pending` snippet “will be shown when the boundary is first created, and will remain visible until all the `await` expressions inside the boundary have resolved”, and an `{#await}` block is not an `await` expression. It is a block that branches “on the three possible states of a Promise”, and these blocks had only the `then` branch.'
			},
			{
				type: 'p',
				text: 'So the server drew “Loading…”, because during server-side rendering a boundary with a `pending` snippet renders that snippet. Then the page hydrated and the block put nothing in its place. A list that was slow showed a blank space, and a list that failed stayed blank, with nothing in the console either. An `await` puts both states back. “Errors in `await` expressions will bubble to the nearest error boundary”, and the remote-functions documentation says the same of a query: “until the promise resolves — and if it errors — the nearest `<svelte:boundary>` will be invoked.”'
			},
			code('src/routes/[tenant]/settings/+page.svelte', 201, 209),
			{
				type: 'p',
				text: 'When the `failed` snippet finally ran, it showed one more mistake. The keys’ snippet looked for the server’s message on `error.body`, which is where an `HttpError` keeps it, and found nothing there. The boundary is not handed the error that was thrown. Svelte’s `mount` and `hydrate` take a `transformError` function that “transforms a render-time error before it is passed to a `failed` snippet”, and SvelteKit passes one that returns an `App.Error`. The message is on that object directly.'
			},
			{
				type: 'p',
				text: 'The same lookup sat in four more boundaries — the traces list, the trace page, the drawer and the alerts page — and each showed its fallback sentence whatever the server had said. The views’ snippet did not look at the error at all and had one sentence for every failure. All of them read `message` now, with no fallback, because every error a boundary is handed has been through `handleError` and has one. A command’s rejection is the exception, and the remote-functions chapter shows both shapes side by side.'
			},

			{ type: 'h3', id: 'testing-the-lists', text: 'Tests for the lists' },
			code('e2e/settings.e2e.ts', 43, 55),
			{
				type: 'p',
				text: 'The tests that change a list mark the document before they submit and check the mark afterwards. A list can come out right because the page was rendered again: a reload does that, and so does a click that lands before hydration and posts the form the old-fashioned way. Either one replaces the document and takes the mark with it, so neither can pass for a list that redrew in place.'
			},
			code('e2e/settings.e2e.ts', 65, 79),
			{
				type: 'p',
				text: 'The other two are about the states, and both look only after hydration, because the server’s HTML shows “Loading…” whatever the browser goes on to do. The first holds both list requests back and expects the live page to say it is loading. Then it lets the requests through and expects the rows. Holding a request is the same small helper the explore tests use, and two matchers say which requests to hold.'
			},
			code('e2e/settings.e2e.ts', 26, 41),
			code('e2e/settings.e2e.ts', 130, 150),
			{
				type: 'p',
				text: 'The second needs the server to refuse for real, so it ends the session between the page and its rows. The page is drawn signed in. The bundle is held while the cookie is cleared, and the lists are then asked for with no cookie at all. Both lists’ `failed` snippets must show the server’s own words, which is also the check that catches an `error.body` lookup, or a fixed sentence in its place.'
			},
			code('e2e/settings.e2e.ts', 152, 172),
			{
				type: 'terminal',
				code: `
$ # put the two {#await} blocks back, keep everything else
$ pnpm exec playwright test e2e/settings.e2e.ts

  ✘ a new key is listed as soon as it is made
      Expected substring: "· read"
      Error: element(s) not found
  ✘ a revoked key says so in the list, in place
      Expected: visible
      Error: element(s) not found
  ✘ a removed view leaves the list, in place
      Expected: 0
      Received: 1
  ✘ each list says it is loading until its rows arrive
      Expected: "Loading…"
      Error: element(s) not found
  ✘ a list that cannot load says so, with the server’s reason
      Expected: "Sign in to continue."
      Error: element(s) not found

  10 failed

$ # the await back in place, but the old \`error.body\` lookup in the keys' snippet
$ pnpm exec playwright test e2e/settings.e2e.ts -g 'cannot load'

  ✘ a list that cannot load says so, with the server’s reason
      Expected: "Sign in to continue."
      Received: "Could not load keys."

  2 failed`
			},
			{
				type: 'p',
				text: 'Five claims, on both viewports, and each fails on its own assertion. The revoke test makes its key and then opens the page from scratch, so it is about the revoke alone and not about the list that creating the key should have refreshed. The reload in the hydration test was then removed, because without it that test still checks what it always did — the scope the server stored — and now fails on the old page as well.'
			},

			{
				type: 'checkpoint',
				items: [
					'A key is displayed once and never again.',
					'A revoked key still appears, marked, with who made it and when.',
					'A saved view of "the last hour" means the last hour tomorrow.',
					'A name and a scope chosen before the page hydrates are the ones the key is minted with.',
					'A view name typed before the explore page hydrates is the name it is saved under.',
					'A new key is listed, a revoked one says so, and a removed view is gone — all without a reload.',
					'While a list loads it says so, and when it cannot load it says why.'
				]
			}
		]
	},

	{
		slug: 'the-seed',
		title: 'The seed, and why the data tells a story',
		summary:
			'Uniform random data makes every screen look the same and every one of them look wrong. This generates an incident.',
		goal: 'Produce demo data where every view has something to show, identically on every machine.',
		blocks: [
			code('scripts/seed.ts', 1, 30),
			{
				type: 'p',
				text: 'None of the interesting behaviour in this product is reachable from random input: the percentile that moves, the flame graph with one fat bar, the alert that pends and then fires. A generator that emits noise produces a latency chart that is flat noise and a trace where every span is the same length.'
			},

			{ type: 'h3', id: 'the-story', text: 'A normal afternoon, and twenty minutes that are not' },
			code('scripts/seed.ts', 174, 201, { partial: true }),
			{
				type: 'p',
				text: 'Traces are generated as **trees** rather than as independent spans, because the viewer’s whole job is to reassemble a tree — and data that was never a tree would let a broken assembler pass every test you thought to write.'
			},
			{
				type: 'p',
				text: 'The latency is log-normal-ish rather than uniform, because real latency is never symmetric: mostly fast, with a tail. A uniform generator produces a p50 and a p99 that are close together, which is the one thing latency never is.'
			},

			{ type: 'h3', id: 'determinism', text: 'Seeded, so the demo is the same demo' },
			code('scripts/seed.ts', 70, 88),
			{
				type: 'p',
				text: 'A fixed seed matters more than it sounds: a screenshot in the documentation stays true, and an end-to-end test can assert on a specific trace. It is also what lets the seed plant **one deliberately incomplete trace at a known id**, which turns the orphan-handling path from a coin toss into something a test can name.'
			},
			code('scripts/seed.ts', 310, 325, { partial: true }),

			{ type: 'h3', id: 'plain-node', text: 'And why it runs under plain Node' },
			code('scripts/seed.ts', 1, 29),
			{
				type: 'p',
				text: 'The seed imports `schema.ts`, `keys.ts` and `auth.options.ts` — and deliberately not `db/index.ts` or `auth.ts`, which read `$app/env/*`. Those modules are generated by SvelteKit’s Vite plugin and do not exist outside it, so importing them would mean booting a Vite dev server to insert some rows.'
			},
			code('scripts/seed.ts', 34, 43),
			{
				type: 'p',
				text: 'And `.env` is optional, not assumed. `prepare-e2e-db.js` and a CI job put the variables straight into the environment and have no file to load, and the first version of this line — a bare `process.loadEnvFile(\'.env\')` — made the end-to-end database refuse to seed on any machine without one. Only the *absence* is tolerated: a malformed file is still an error worth seeing.'
			},
			{
				type: 'why',
				title: 'The split is between environment and configuration',
				text: 'The seed duplicates the *environment* — three lines reading `process.env` — and shares the *configuration*, which is one function in `auth.options.ts`. The alternative, configuring Better Auth a second time, works until the day the two disagree about the password minimum, at which point the seed produces an account the application rejects and the error says nothing about why.'
			},

			{ type: 'h3', id: 'chunking', text: 'One more thing the first version got wrong' },
			code('scripts/seed.ts', 259, 270),
			{
				type: 'p',
				text: 'SQLite has a hard limit on bound parameters in one statement, and a thousand rows of twelve columns is comfortably past it. The error is `too many SQL variables`, which is a much less obvious message than it should be.'
			},
			{
				type: 'p',
				text: 'And the ids are seeded from a **counter** rather than from a timestamp. The first version used the span’s start time, which is unique most of the time — two requests in the same four-second tick can land on the same millisecond, and then their ids are identical and the insert dies on the unique index. That is also why they are OpenTelemetry-sized: 32 hex characters for a trace and 16 for a span. Shortening them to 8 for readability made the collision likely enough to hit at sixteen thousand spans.'
			},

			{
				type: 'checkpoint',
				items: [
					'`pnpm db:seed` twice produces byte-identical data.',
					'Every view — table, chart, flame graph, waterfall, alerts — has something to show.',
					'There is an incident in the data, and an alert that fires because of it.'
				]
			}
		]
	},

	{
		slug: 'the-csp',
		title: 'A content security policy, and the test that wrote it',
		summary:
			'The last line of defence for a product made of other people’s logs — configured, audited by code, and corrected twice by an end-to-end test.',
		goal: 'Ship a policy that is still a policy after somebody has had to make an error go away.',
		blocks: [
			{
				type: 'p',
				text: 'Everything upstream already stops a log line from becoming a script: the projection in chapter 24 hands out documented columns, Svelte escapes what it renders, and a log body is text in a cell. A CSP is what stands there when one of those is wrong — which is the only reason to have one, and the reason it belongs in a product whose pages are made of other people’s data.'
			},
			code('vite.config.ts', 164, 178),
			{
				type: 'p',
				text: 'Every directive is a decision. `script-src` with no `unsafe-inline`, because that keyword is what makes the whole policy decorative. `connect-src \'self\'`, so a script that somehow does run cannot post a query result to another host. `object-src \'none\'` and `base-uri \'self\'` because both are ways *around* `script-src` rather than risks of their own: a plugin document runs code outside it, and an injected `<base>` repoints every relative URL the policy is trusting.'
			},
			{
				type: 'warn',
				text: '`style-src` allows `\'unsafe-inline\'`, and that is a genuine compromise rather than an oversight. Svelte writes `style="…"` attributes for the virtualizer’s transforms and the waterfall’s bar widths, recomputed per frame; an attribute cannot carry a nonce and cannot usefully be hashed. The exposure is CSS injection, which is real and is not script execution. Writing it down is the difference between a trade and an accident.'
			},

			{ type: 'h3', id: 'the-mode', text: '`hash` was wrong, and only a test could say so' },
			{
				type: 'p',
				text: 'The first version used `mode: \'hash\'`, on an argument that is entirely sound: SvelteKit computes a sha256 for each inline script it emits, hashes are fixed at build time, and a nonce must be unique per response — so nonces make every page uncacheable. It was also completely wrong for this application.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm exec playwright test e2e/csp.e2e.ts

  Error: an inline script is covered by neither the nonce nor a hash:
         __sveltekit_1xjukmv.resolve(1, () => [["gateway","payments-a…

  1 failed`
			},
			{
				type: 'p',
				text: 'This application **streams**. A page renders its shell, and each `await` in markup resolves later by appending a `<script>__sveltekit_….resolve(1, …)</script>` to the response body — *after* the header has been sent. No hash for those can possibly be in it, so the browser blocks every one, and every streamed result on the page silently never arrives. There is no error a person would see; the table is simply empty.'
			},
			{
				type: 'p',
				text: '`mode: \'auto\'` is the answer SvelteKit already has: hashes for prerendered pages, whose whole document is known at build time, and nonces for dynamically rendered ones, where it is not. The cacheability argument costs nothing here — these pages carry `Vary: Cookie` and are per-tenant, so a shared cache was never going to hold them.'
			},

			{ type: 'h3', id: 'auditing', text: 'A policy that degrades quietly needs code to notice' },
			{
				type: 'p',
				text: 'A CSP does not break loudly when it stops working. Somebody adds a snippet, hits the console error, adds `\'unsafe-inline\'` to make it go away, and the header is still there, still long, still looks like a security control. Nothing fails. So the audit is code, the rules are named, and the messages are the words somebody would need to fix it.'
			},
			code('src/lib/security/csp.ts', 59, 71),
			{
				type: 'p',
				text: '`Sha256Source` comes from `svelte/server`, exported in Svelte 5.57: a template literal type of `` `sha256-${string}` ``. It is the type of the entries in a render’s `hashes.script`, which is exactly what hash-mode puts into `script-src`. Using Svelte’s own type rather than a local `string` alias means the compiler checks the narrowing rather than trusting the comment above it — `hashesIn` cannot quietly start returning `\'unsafe-inline\'`.'
			},
			code('src/lib/security/csp.ts', 87, 124, { partial: true }),
			{
				type: 'p',
				text: 'Problems, not a boolean. "The CSP is bad" is not something anybody can act on at four in the morning; "`script-src` allows `\'unsafe-inline\'`, which lets an injected `<script>` run" is. And `style-src` is deliberately absent from the rules, because a check that fires on a decision somebody already made and documented is a check people learn to skip.'
			},

			{ type: 'h3', id: 'proving-it', text: 'Two tests, because the harness is inside the picture' },
			code('e2e/csp.e2e.ts', 54, 76, { partial: true }),
			{
				type: 'p',
				text: 'Playwright injects its own inline scripts for tracing and screenshots, and a policy strict enough to be worth having blocks those too — so watching the console for `script-src` violations reports the harness, every time, and says nothing about the application. The first version of this test did exactly that, and reported two violations before anything on the page had loaded.'
			},
			{
				type: 'p',
				text: 'Fetching the HTML and checking it has no harness in the way. Every inline `<script>` must be covered — carrying the response’s nonce, or listed as a hash — and that is the check that found the streaming bug. The browser half is still worth having for everything that is not a script, and that half found the second bug.'
			},
			{
				type: 'terminal',
				code: `
"Loading the font 'data:font/woff2;base64,d09GMgABAAAAAAfsABQ…'
 violates the following Content Security Policy directive:
 \\"font-src 'self'\\". The action has been blocked."`
			},
			{
				type: 'p',
				text: 'Vite inlines any asset under `assetsInlineLimit`, which is four kilobytes, and one JetBrains Mono subset is under it — so the built stylesheet carries a `src:url(data:font/woff2;base64,…)` that `font-src \'self\'` refuses. In production that is a monospace column falling back to a system font, silently, because a blocked font is a console message nobody is watching. Reading the policy would never have found it.'
			},

			{
				type: 'checkpoint',
				items: [
					'Every page carries a policy, and `auditPolicy` returns nothing on it.',
					'A signed-in page gets a nonce; switching to `mode: \'hash\'` fails a test rather than a user.',
					'Loading the application under the policy produces no violations at all.'
				]
			}
		]
	},

	{
		slug: 'verifying-it',
		title: 'Verifying it, and the six bugs the tests found',
		summary:
			'337 unit tests, 123 end-to-end across two viewports, and the specific things each layer caught that the other could not.',
		goal: 'Get to green, and understand what each kind of test is actually for.',
		blocks: [
			{
				type: 'p',
				text: 'One command runs everything, in the order that fails fastest.'
			},
			code('package.json', 11, 30),
			{
				type: 'p',
				text: 'Type-check, lint, unit tests, **build**, then end to end. The build is before the end-to-end tests because the end-to-end tests run against the built output, and because a build failure is thirty seconds where an end-to-end failure is two minutes.'
			},

			{ type: 'h3', id: 'against-a-build', text: 'End to end against a production build' },
			code('playwright.config.ts', 3, 26, { partial: true }),
			{
				type: 'p',
				text: 'The dev server and the built server differ in the ways that break things — module resolution, minification, `adapter-node` request handling, and `PUBLIC_ORIGIN` being inlined at build time for the CSRF check. A suite that passes against `vite dev` and has never run against `vite build` will discover on deploy that every POST is rejected as cross-site.'
			},
			{
				type: 'p',
				text: 'Two viewports, and not as a resize inside one test: this application genuinely renders different DOM at different widths. The results table has no header row on a phone, the waterfall stacks, the drawer is a bottom sheet rather than a side panel. Those are the parts most likely to break and the parts nobody looks at.'
			},

			{ type: 'h3', id: 'the-six', text: 'The six bugs' },
			{
				type: 'p',
				text: 'Every test in the end-to-end suite was chosen by one rule — each covers a claim made in a comment somewhere in the source. Writing them found six things, and none of the six was findable by a unit test.'
			},
			{
				type: 'ol',
				items: [
					'**`flush()` never reached the address bar.** One marker for two questions; typing a query and pressing Run immediately left the URL on the old one, permanently. Both halves worked in isolation. Chapter 35.',
					'**`db.select()` leaked internal columns and Drizzle’s key names.** The chart view picked `id` as its numeric column and drew a line of primary keys; and a predicate on `trace_id` worked when pushed to SQL and matched nothing when it was not. Chapter 24.',
					'**The ingest 401 had a comment about a `WWW-Authenticate` header and no header** — `error()` throws an `HttpError` and cannot carry one. Chapter 22.',
					'**`error(400, …)` inside a remote `form` renders a 500 page over the whole form.** `invalid(issue.query(…))` puts the message beside the field. Chapter 39.',
					'**Remote form fields must come from `fields.<key>.as(type)`**; a plain `name=` attribute throws and the submission 500s. Chapter 39.',
					'**`forkPreloads` broke opening a trace one time in three on the phone profile.** Three runs on, three failures; three off, three passes. Chapter 3.'
				]
			},
			{
				type: 'p',
				text: 'A later audit of every error path found four more, by forcing each error under a live page and reading what reached the screen. Five `failed` snippets looked for the message where an `HttpError` keeps it, and always showed their fallback. The explore page’s results boundary never ran at all, because the values made from the result were `$derived`s in the script. The alert toggle’s refusal went unhandled. And the live tail asked for a stream alone and was answered with an HTML error page. Each has a test now that fails on the old code. Chapters 38, 39 and 43.'
			},
			{
				type: 'why',
				title: 'What each layer is for',
				text: 'The unit tests own the algorithms — the parser, the sketches, the state machine — where a property can be stated and checked exhaustively. The end-to-end tests own the *seams*: two effects that only interact once both are mounted, a header that only exists on a real response, a form that only fails when it is actually submitted. Neither can do the other’s job, and the six above are all seams.'
			},

			{ type: 'h3', id: 'a-test-per-claim', text: 'A test per claim, including the awkward one' },
			code('e2e/auth.e2e.ts', 17, 33, { partial: true }),
			{
				type: 'p',
				text: 'The sign-in page uses a real form action rather than a remote function, and the entire argument for that is "it has to work when the bundle does not". An argument nobody tests is a comment — so the test disables JavaScript and signs in anyway.'
			},
			{
				type: 'p',
				text: 'It also found something. With enhancement, the page is not re-rendered after a failed submission, so the typed password stayed in the DOM — visible over a shoulder, and one autofill away from being submitted again after the person had already decided it was wrong. The no-JavaScript path was already correct, which is exactly the sort of divergence that survives review.'
			},

			{ type: 'h3', id: 'flakes', text: 'And a word about flakes' },
			code('e2e/trace.e2e.ts', 119, 146),
			{
				type: 'p',
				text: 'The first version of that test opened traces one by one until it found an incomplete one — a coin toss it could not see. The seed now plants one at a fixed id, and the case becomes something a test can name. A flaky test is worse than no test, because it teaches people to re-run the suite.'
			},

			{ type: 'h3', id: 'co-located', text: 'A test that lives next to what it tests' },
			{
				type: 'p',
				text: 'The read API’s body schema is a contract with people writing scripts against a documented endpoint, and its *defaults* are the part nobody reads and everybody depends on — `maxRows` quietly becoming twenty thousand would turn one scheduled report into an outage. That belongs in a fast unit test, beside the thing it describes.'
			},
			{
				type: 'p',
				text: 'It could not live there before. Every `+`-prefixed file under `src/routes` was a route, so `+server.test.ts` would have been an endpoint exporting `describe` and `it`, and `svelte-kit sync` would have refused it. SvelteKit 3 skips `+` files whose names contain `.test.`, `.spec.` or `.stories.` when the route table is built.'
			},
			code('src/routes/api/v1/query/+server.test.ts', 28, 49),
			{
				type: 'p',
				text: 'The schema is exported as `_RequestSchema`, and the underscore is not decoration. SvelteKit refuses unknown exports from a `+server.ts` — the list is the HTTP methods plus `prerender`, `config` and a few others — with one deliberate escape hatch, `if (key[0] === \'_\') continue`. It is the convention for "not a route contract, but something somebody needs to reach".'
			},
			{
				type: 'terminal',
				code: `
$ npx svelte-kit sync && grep -r "server.test" .svelte-kit/generated .svelte-kit/types
  (nothing)                       ← not a route

$ npx vitest run src/routes/api/v1/query
  ✓ 9 passed                      ← still a test`
			},
			{
				type: 'note',
				text: 'The end-to-end tests in `e2e/query-api.e2e.ts` still exist and still matter — they cover authentication, scopes and the `QUERY` method reaching the handler. This covers the shape of what that handler is handed, in nine milliseconds rather than two minutes.'
			},

			{ type: 'h3', id: 'the-course-too', text: 'And the course is checked too' },
			{
				type: 'p',
				text: 'Every code block in this course is read out of the project by file and line range at build time, so it cannot drift. `verify.js` checks the thing that still needs judgement — that the ranges are inside their files, do not start inside a comment or on a blank line, and do not cut through a brace.'
			},
			{
				type: 'terminal',
				code: `
$ node sextant-course/verify.js
46 chapters · 256 blocks quoted from sextant/ by line range · 0 illustrative
every range is inside its file, whole, and starts somewhere a reader can follow

$ pnpm verify
✓ svelte-check     0 errors, 0 warnings
✓ eslint           clean
✓ vitest           337 passed
✓ vite build       done
✓ playwright       123 passed, 4 skipped, 2 viewports`
			},

			{
				type: 'checkpoint',
				items: [
					'`pnpm verify` is green from a clean checkout.',
					'You can say what a unit test can find that an end-to-end test cannot, and the reverse.',
					'You have no test that passes or fails on a coin toss.'
				]
			}
		]
	}
];
