/**
 * PART 0 — What we are building, and the decision everything else follows from
 * (chapters 01–04)
 *
 * The first two chapters have almost no code in them, and that is deliberate. An
 * observability product makes one architectural decision very early — *do you
 * own the question language, or do you borrow one?* — and every file after it is
 * a consequence. Start typing before you have answered it and you will write a
 * log viewer with a search box.
 */

import { code } from './quote.js';

export const part0 = [
	{
		slug: 'what-we-are-building',
		title: 'What we are building',
		summary:
			'Sextant: a self-hosted observability platform — logs, traces, metrics, and a query language of our own to ask them questions.',
		goal: 'Understand what the finished product does, and why each hard part of it is unavoidable rather than chosen.',
		blocks: [
			{
				type: 'p',
				text: 'We are going to build **Sextant**: a self-hosted observability platform. It takes in log lines, distributed-tracing spans and metric samples; it stores them so they can be asked questions cheaply; and it answers those questions in a language we write ourselves, from the characters up.'
			},
			{
				type: 'p',
				text: 'That last clause is the project. Everything else in the list is ordinary work — an HTTP endpoint, a table, a chart. The query language is what makes the rest of it coherent, and it is also the part most people would rather not do.'
			},

			{ type: 'h3', id: 'the-tour', text: 'The tour' },
			{
				type: 'ul',
				items: [
					'**SQF**, a pipeline query language: a hand-written lexer, a Pratt parser with a real precedence table, a type checker that knows a duration is not a number, an evaluator, and a planner that pushes what it can into SQL and is honest about the rest.',
					'**Ingest** that survives a bad day: streamed rather than buffered, bounded, rate-limited per tenant, idempotent on retry, and with a cardinality limit that refuses loudly instead of quietly filling the disk.',
					'**Mergeable sketches** — DDSketch for percentiles and HyperLogLog for distinct counts — because you cannot store every sample and you cannot average percentiles.',
					'**Trace assembly**: spans arriving in any order, with parents missing and the occasional cycle, turned into one tree that renders.',
					'**Alerts** with a `for` duration, hysteresis, a state machine written as a pure function, and a transactional outbox so that "it is firing" and "somebody was told" cannot disagree.',
					'**An interface dense enough to use at three in the morning**: a virtualized log table, a flame graph, a waterfall, canvas charts, a query editor with completion and error underlines — and no editor library.',
					'**A live tail** with real backpressure, which counts what it dropped and says so.'
				]
			},
			{
				type: 'p',
				text: 'Roughly fifteen thousand lines when it is finished. About four thousand of them are the query language, and we write those first, because nothing above them can be designed until they exist.'
			},

			{ type: 'h3', id: 'why-observability', text: 'Why an observability tool, specifically' },
			{
				type: 'p',
				text: 'Because it is the honest hard case for a *data* application, in the same way a collaborative canvas is the honest hard case for a *state* application. Three things are true of telemetry at once, and each one breaks the design you would reach for first.'
			},
			{
				type: 'ol',
				items: [
					'**There is far too much of it.** A modest service emits more log lines in an hour than a person will read in a career. Every screen has to be an aggregate, a sample, or a window — and each of those is a different piece of maths.',
					'**The volume is worst exactly when it matters.** Something breaks, error rates go up two orders of magnitude, and the tool people need in order to understand it is the tool now being asked to swallow a hundred times its usual load. Every limit in this project exists for that minute.',
					'**The questions are not known in advance.** A dashboard answers the questions somebody thought of last quarter. The question during an incident is always a new one, which is why a query language is not a luxury feature.'
				]
			},
			{
				type: 'why',
				title: 'Why this is worth your time even if you never build a telemetry product',
				text: 'A lexer, a Pratt parser and a type checker are the most transferable three hundred lines in software: config formats, spreadsheet formulas, search filters, template languages, feature-flag expressions, permission rules. Most of them are implemented with regular expressions and `eval` because "writing a parser" sounds like a month. It is an afternoon, and you will never fear one again.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape of it' },
			{
				type: 'terminal',
				code: `
  collectors ──▶ POST /api/v1/ingest ──▶ ingest.ts ──▶ SQLite (WAL)
                       (API key)          bounded,        │
                                          streamed,       │
                                          idempotent      │
                                                          │
   ┌──────────────────────── the browser ─────────────────┼─────────┐
   │                                                      │         │
   │   text ──▶ lexer ──▶ parser ──▶ checker ──▶ editor    │         │
   │             │          │          │                  │         │
   │             └──────────┴──────────┴── same three, on the server │
   │                                            ▼                   │
   │                                       storage.run              │
   │                                     ┌──────┴──────┐            │
   │                                     │ pushdown?   │            │
   │                                     └──┬───────┬──┘            │
   │                                        │       │               │
   │                                     SQL WHERE  evaluator       │
   │                                        └───┬───┘               │
   │   table ◀── chart ◀── flame ◀── waterfall ◀┘                   │
   └────────────────────────────────────────────────────────────────┘`
			},
			{
				type: 'p',
				text: 'The thing to notice is the line that says **the same three, on the server**. The lexer, parser and checker that draw a squiggle under a typo as somebody types are the same modules that reject a malformed query arriving in a URL. Not a port of them — the same files, imported twice.'
			},
			{
				type: 'p',
				text: 'That is the payoff for writing the language rather than borrowing one, and it is why the editor in this project has no editor library in it. Highlighting comes from the real lexer, so it can never colour a pipe inside a string; the error underlines are the checker’s own spans; completion knows that an aggregate is illegal outside `summarize` because the checker knows it.'
			},

			{ type: 'h3', id: 'what-sqf-looks-like', text: 'What a question looks like' },
			{
				type: 'terminal',
				code: `
from logs
| where level == "error" and service == "checkout"
| summarize n = count() by service, bucket = bin(timestamp, 1m)
| sort bucket asc`
			},
			{
				type: 'p',
				text: 'A pipeline, read top to bottom, each stage taking rows and producing rows. Not SQL: SQL is a superb language for a question you have finished thinking about, and a poor one for a question you are still forming, because you have to write the `SELECT` before you know what you want to select.'
			},
			{
				type: 'p',
				text: 'It is also a language with an opinion. `duration > 500` is a **type error** — a duration is not a number, and comparing one to a bare `500` is somebody who has not decided whether they meant milliseconds or seconds. `duration > 500ms` is the query they meant. We will build the checker that says so, in chapter 11.'
			},

			{ type: 'h3', id: 'what-we-will-not-build', text: 'What we are deliberately not building' },
			{
				type: 'ul',
				items: [
					'**A clustered store.** One SQLite file, in WAL mode. Everything about the query layer is the same at a thousand times the size; the storage engine is not, and swapping it is a chapter that teaches nothing about SvelteKit.',
					'**A sampling pipeline.** Head and tail sampling are essential above a certain volume and are entirely a story about the collector, which is somebody else’s process.',
					'**A dashboard builder.** Saved views exist and are four fields. A drag-and-drop dashboard is a fortnight of layout code and no new ideas.'
				]
			},
			{
				type: 'note',
				text: 'Each of those is named rather than silently omitted. A course that quietly leaves out the hard third of a product teaches you to underestimate the next one.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can say in one sentence what Sextant does and what it refuses to do.',
					'You can explain why the query language comes first rather than last.',
					'You understand why the same lexer runs in the browser and on the server.'
				]
			}
		]
	},

	{
		slug: 'why-a-query-language',
		title: 'Why a query language, and what it must refuse',
		summary:
			'The four things a search box cannot do, the three properties a language for telemetry needs, and the decision to make units part of the type system.',
		goal: 'Be able to justify writing a language instead of borrowing one — and know which decisions have to be made before the first line of the lexer.',
		blocks: [
			{
				type: 'p',
				text: 'Every observability product starts with a search box, and every one of them grows a language within two years. It is worth understanding why, because the reasons are the requirements.'
			},

			{ type: 'h3', id: 'what-a-search-box-cannot-do', text: 'What a search box cannot do' },
			{
				type: 'ol',
				items: [
					'**Aggregate.** "How many errors per service per minute" is not a filter. The moment somebody wants a number rather than a list, the box needs a second concept, and there is nowhere to put it.',
					'**Compose.** Filter, then group, then filter *the groups* — "services whose p95 went above a second" — is three operations in a fixed order. A box has one.',
					'**Be typed.** `duration:500` means nothing without a unit, and a box that silently picks one is a box that lies to somebody at 3am.',
					'**Be pushed down.** A box is matched by scanning. A language has a *shape* the planner can read, which is the difference between a query that stays fast as the data grows and one that does not.'
				]
			},
			{
				type: 'why',
				title: 'The real reason, which is none of those',
				text: 'A language is a contract. Once "what can I ask" is written down as a grammar and a schema, every part of the product can read it: completion, documentation, the planner, the error messages, the alert rules. A search box has no contract, so each of those has to be built by hand and they drift.'
			},

			{ type: 'h3', id: 'three-properties', text: 'Three properties, chosen deliberately' },
			{
				type: 'p',
				text: '**Pipelines, not nesting.** Each stage takes rows and gives rows. You can read a query out loud in the order it happens, and you can delete the last line and get a valid, simpler query — which is exactly what somebody does when they are exploring.'
			},
			{
				type: 'p',
				text: '**A closed schema.** Three sources — `logs`, `spans`, `metrics` — each with a fixed column list. Not because dynamic columns are impossible, but because a typo in a column name should be an error with a suggestion rather than a filter that silently matches nothing. "It returned no rows" is the most expensive wrong answer this product can give.'
			},
			{
				type: 'p',
				text: '**Units in the type system.** A `duration` is not a `number`, and a `timestamp` is not a `duration`. This is the decision that costs the most and pays the most, and it is worth being specific about what it buys.'
			},

			{ type: 'h3', id: 'units', text: 'The units decision, concretely' },
			{
				type: 'terminal',
				code: `
from spans | where duration > 500
                              ^^^
A duration cannot be compared with a plain number.
  hint: write a duration, like \`500ms\` or \`2s\`

from spans | where duration > 500ms      ← what they meant
from spans | where duration > 2s         ← also fine`
			},
			{
				type: 'p',
				text: 'Every telemetry system in the world has a story about somebody who set a threshold in the wrong unit. The alert did not fire, or fired constantly; either way the fix was one character and the discovery took a week. Making it a type error costs about forty lines in the checker and removes the whole class.'
			},
			{
				type: 'p',
				text: 'It also has a second-order effect that is easy to miss. Because a duration keeps its type through an aggregation — `max(duration)` is a duration, not a number — the *interface* can format it as `1.2s` rather than `1200`, everywhere, without anybody configuring a column. Types earn their keep twice.'
			},

			{ type: 'h3', id: 'what-it-must-refuse', text: 'What the language must refuse' },
			{
				type: 'p',
				text: 'A language is defined at least as much by what it rejects. Four refusals, decided now:'
			},
			{
				type: 'ul',
				items: [
					'**An aggregate outside `summarize`.** `where count() > 5` has no meaning — count of what? — and the checker says so rather than the evaluator returning something.',
					'**A bare column in a `summarize` that is not grouped.** Classic SQL lets you do this and returns an arbitrary row’s value.',
					'**`=` where `==` is meant.** Having both in a language is a well-known source of bugs. The mitigation here is that they are never interchangeable: `=` is legal only in an alias position and `==` only in an expression, so writing the wrong one is always a parse error with a specific message rather than a query that runs and means something else.',
					'**A comparison between incompatible units**, as above.'
				]
			},
			{
				type: 'note',
				text: 'Notice that three of the four are *checker* rules rather than *grammar* rules. A grammar that tried to encode them would be unreadable and would give terrible errors. Deciding what belongs in the parser and what belongs in the checker is most of language design.'
			},

			{ type: 'h3', id: 'the-source-of-truth', text: 'One source of truth for the schema' },
			{
				type: 'p',
				text: 'Here is the whole schema for one source, and it is worth reading now even though nothing uses it yet. Every column carries a type and a sentence, and both are load-bearing: the type is what the checker enforces, and the sentence is what completion shows.'
			},
			code('src/lib/sqf/schema.ts', 76, 100),
			{
				type: 'p',
				text: 'One table like that per source, and one list of functions beside it. Completion reads it, the checker reads it, the planner reads it, and the documentation *is* it. That is the contract a search box does not have.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can name four things a search box cannot do, and say which one is really about the planner.',
					'You can explain what putting units in the type system buys, twice over.',
					'You can say which of the four refusals belong in the parser and which in the checker, and why.'
				]
			}
		]
	},

	{
		slug: 'the-toolchain',
		title: 'The toolchain, and one config file',
		summary:
			'Node, pnpm, SvelteKit 3, Vite, Vitest and Playwright — and why SvelteKit 3 has no svelte.config.js.',
		goal: 'Get an empty project running, and understand every line of the one configuration file it has.',
		blocks: [
			{
				type: 'p',
				text: 'SvelteKit 3 moved all framework configuration into the Vite plugin. There is no `svelte.config.js`; there is `vite.config.ts`, and it is the only config file in this project other than `tsconfig.json` and the linter.'
			},
			{
				type: 'terminal',
				code: `
pnpm create svelte@next sextant
cd sextant
pnpm install`
			},
			{
				type: 'p',
				text: 'The config is a *function* rather than an object, and that is not stylistic. It has to read the environment before the build starts, because one value is substituted into the output.'
			},
			code('vite.config.ts', 10, 21, { partial: true }),
			{
				type: 'p',
				text: 'The value in question is the origin, and it is the single most common way to lose an afternoon on a SvelteKit deployment. Read this comment properly, because the symptom is bizarre: every `GET` works perfectly and every `POST` comes back as a cross-site error.'
			},
			code('vite.config.ts', 23, 35),
			{
				type: 'warn',
				text: 'The failure mode is worth spelling out. Without `paths.origin`, `adapter-node` reconstructs the origin from request headers and assumes `https`. A server on plain HTTP computes `https://localhost:4173`, the browser sends `http://localhost:4173`, and every form submission is rejected as cross-site by an application whose pages all render.'
			},

			{ type: 'h3', id: 'compiler-options', text: 'Two compiler options that shape the whole project' },
			code('vite.config.ts', 37, 55),
			{
				type: 'p',
				text: '`experimental.async` is the one that matters. It allows `await` inside `$derived` and directly in markup, which turns "run a query, wait, draw the answer" into exactly that — instead of a `loading` boolean threaded through four components, an `error` field beside it, and an effect that assigns into state.'
			},
			{
				type: 'p',
				text: 'It is also what makes `getAbortSignal()` usable, and we will use it in chapter 38 to tear down a streaming connection the instant the query changes underneath it.'
			},

			{ type: 'h3', id: 'remote-functions', text: 'Remote functions, and a preload flag we turn off' },
			code('vite.config.ts', 59, 89),
			{
				type: 'p',
				text: 'The second half of that block is a small piece of engineering history rather than a configuration note. `forkPreloads` is exactly the feature this application wants — it speculatively runs the next page inside a Svelte fork, so an abandoned preload does not leave a query running against the database — and it was turned on for that reason.'
			},
			{
				type: 'p',
				text: 'The end-to-end suite found it. Opening a trace from the traces list on the phone profile failed roughly one time in three, with the remote query coming back as a bare `Bad Request` while loading the same URL directly always worked. Three runs on, three failures; three runs off, three passes. It is off, and the bisect is written down where the next person will find it.'
			},
			{
				type: 'why',
				title: 'Why the reasoning stays in the file',
				text: 'A flag flipped with no comment is a flag somebody flips back in six months, and the bug returns as "the trace page is flaky sometimes". The comment costs twenty lines and is the only artefact of an hour of bisecting.'
			},

			{ type: 'h3', id: 'two-test-projects', text: 'Two test projects, and why' },
			code('vite.config.ts', 196, 203),
			{
				type: 'p',
				text: 'A real Chromium for component tests, not a DOM emulator, and the reason is specific: the virtualizer in chapter 28 measures rows with `getBoundingClientRect()`. jsdom has no layout, so every element is 0×0 — a virtualizer under jsdom renders zero rows and passes every assertion you thought to write.'
			},
			code('vite.config.ts', 205, 228, { partial: true }),
			{
				type: 'p',
				text: 'And the server project runs one file at a time. SQLite allows exactly one writer; two specs that both seed rows meet `SQLITE_BUSY` in parallel, and the symptom is a dozen unrelated assertions failing at random in whichever file lost the race.'
			},
			{
				type: 'note',
				text: 'WAL mode and a busy timeout — which we set in chapter 21 — make the *application* tolerate concurrent writers and are worth having for their own sake. They do not make a test suite deterministic, because a timeout that is long enough is still a race. Serialising the files costs two seconds and removes the class.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can explain why `PUBLIC_ORIGIN` has to be a build-time value.',
					'You can say what `experimental.async` changes about how a component expresses waiting.',
					'You know why the component tests run in a real browser and the server tests run one file at a time.'
				]
			}
		]
	},

	{
		slug: 'the-environment',
		title: 'The environment, declared once',
		summary:
			'`defineEnvVars`, valibot schemas that run at boot, and the four numbers that decide whether this survives a bad day.',
		goal: 'Set up typed, validated environment variables — and choose the limits that make a flood a refusal rather than an outage.',
		blocks: [
			{
				type: 'p',
				text: 'SvelteKit 3 replaced the `$env/*` magic modules with a single declaration file. A variable that is not declared cannot be imported — a type error at build time, rather than an `undefined` that surfaces in production three weeks later.'
			},
			code('src/env.ts', 1, 23),
			{
				type: 'p',
				text: 'The schemas are valibot, and they run **once, at boot, against the real environment**. A missing `DATABASE_URL` is a process that refuses to start, not a request that fails at 4am.'
			},
			code('src/env.ts', 25, 48, { partial: true }),
			{
				type: 'p',
				text: '`public: true` is something you have to type, which is the point: a secret cannot reach the browser by accident. And `static: true` on the origin is the other half of the build-time story from the last chapter — the value is inlined rather than read at runtime, because `vite.config.ts` reads the same variable during the build and a value that could differ between the two would make the CSRF check compare two different origins.'
			},

			{ type: 'h3', id: 'the-limits', text: 'The four numbers' },
			{
				type: 'p',
				text: 'An observability platform fails in a specific way, and it is worth stating before we choose any numbers.'
			},
			code('src/env.ts', 55, 62),
			{
				type: 'p',
				text: 'Every limit below exists to make that minute a refusal with a `Retry-After` rather than an outage. Two of them are ordinary; one of them is the most important number in the system.'
			},
			code('src/env.ts', 64, 76),
			{
				type: 'p',
				text: 'And the important one:'
			},
			code('src/env.ts', 78, 93),
			{
				type: 'why',
				title: 'Why cardinality is the number that matters',
				text: 'A metric with a `user_id` label is one series per user. A million series is not "a bigger bill" — it is a query planner choosing a different plan, a rollup table larger than the raw data, and a dashboard that stops loading. The limit has to exist, it has to be **per metric** so that one bad metric cannot starve the rest, and exceeding it has to be visible rather than silently dropped. Chapter 23 is where we build that, and where the strangest bug in this project lives.'
			},

			{ type: 'h3', id: 'why-not-process-env', text: 'Why not just read `process.env`' },
			{
				type: 'p',
				text: 'Because of the three properties this file has that `process.env` does not: a variable cannot be read without being declared, a value cannot be wrong in a way that survives boot, and a secret cannot be imported into client code. Each of those replaces a class of incident with a build error.'
			},
			{
				type: 'p',
				text: 'There is one place in the project that reads `process.env` directly, and it is `drizzle.config.ts` — because drizzle-kit runs as its own process, outside SvelteKit, where the generated module does not exist. Naming the exception is how you keep it to one.'
			},
			{
				type: 'terminal',
				code: `
cp .env.example .env
# fill in BETTER_AUTH_SECRET with: openssl rand -base64 32
pnpm db:push`
			},

			{
				type: 'checkpoint',
				items: [
					'Your project boots and refuses to boot with a variable missing.',
					'You can explain why `PUBLIC_ORIGIN` is both public and static.',
					'You can say why the cardinality limit is per metric rather than per tenant.'
				]
			}
		]
	}
];
