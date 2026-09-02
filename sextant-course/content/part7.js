/**
 * PART 7 — The rest of the product, and proving it (chapters 41–44)
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

			{
				type: 'checkpoint',
				items: [
					'A key is displayed once and never again.',
					'A revoked key still appears, marked, with who made it and when.',
					'A saved view of "the last hour" means the last hour tomorrow.'
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
			code('scripts/seed.ts', 165, 192, { partial: true }),
			{
				type: 'p',
				text: 'Traces are generated as **trees** rather than as independent spans, because the viewer’s whole job is to reassemble a tree — and data that was never a tree would let a broken assembler pass every test you thought to write.'
			},
			{
				type: 'p',
				text: 'The latency is log-normal-ish rather than uniform, because real latency is never symmetric: mostly fast, with a tail. A uniform generator produces a p50 and a p99 that are close together, which is the one thing latency never is.'
			},

			{ type: 'h3', id: 'determinism', text: 'Seeded, so the demo is the same demo' },
			code('scripts/seed.ts', 61, 79),
			{
				type: 'p',
				text: 'A fixed seed matters more than it sounds: a screenshot in the documentation stays true, and an end-to-end test can assert on a specific trace. It is also what lets the seed plant **one deliberately incomplete trace at a known id**, which turns the orphan-handling path from a coin toss into something a test can name.'
			},
			code('scripts/seed.ts', 301, 316, { partial: true }),

			{ type: 'h3', id: 'plain-node', text: 'And why it runs under plain Node' },
			code('scripts/seed.ts', 1, 29),
			{
				type: 'p',
				text: 'The seed imports `schema.ts`, `keys.ts` and `auth.options.ts` — and deliberately not `db/index.ts` or `auth.ts`, which read `$app/env/*`. Those modules are generated by SvelteKit’s Vite plugin and do not exist outside it, so importing them would mean booting a Vite dev server to insert some rows.'
			},
			{
				type: 'why',
				title: 'The split is between environment and configuration',
				text: 'The seed duplicates the *environment* — three lines reading `process.env` — and shares the *configuration*, which is one function in `auth.options.ts`. The alternative, configuring Better Auth a second time, works until the day the two disagree about the password minimum, at which point the seed produces an account the application rejects and the error says nothing about why.'
			},

			{ type: 'h3', id: 'chunking', text: 'One more thing the first version got wrong' },
			code('scripts/seed.ts', 250, 261),
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
		slug: 'verifying-it',
		title: 'Verifying it, and the six bugs the tests found',
		summary:
			'316 unit tests, 57 end-to-end across two viewports, and the specific things each layer caught that the other could not.',
		goal: 'Get to green, and understand what each kind of test is actually for.',
		blocks: [
			{
				type: 'p',
				text: 'One command runs everything, in the order that fails fastest.'
			},
			code('package.json', 11, 31),
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
			code('e2e/trace.e2e.ts', 102, 129),
			{
				type: 'p',
				text: 'The first version of that test opened traces one by one until it found an incomplete one — a coin toss it could not see. The seed now plants one at a fixed id, and the case becomes something a test can name. A flaky test is worse than no test, because it teaches people to re-run the suite.'
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
44 chapters · 213 blocks quoted from sextant/ by line range · 0 illustrative
every range is inside its file, whole, and starts somewhere a reader can follow

$ pnpm verify
✓ svelte-check     0 errors, 0 warnings
✓ eslint           clean
✓ vitest           316 passed
✓ vite build       done
✓ playwright       57 passed, 2 viewports`
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
