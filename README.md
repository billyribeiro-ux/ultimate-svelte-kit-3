# Ultimate SvelteKit 3

Five complete projects, each with its own build-along course.

| Folder | What it is |
| --- | --- |
| [`strikeflow-site/`](./strikeflow-site) | **Project 1** — a production-grade marketing site for a fictional real-time options flow product. SEO, charts, lead capture, cinematic motion. |
| [`strikeflow-course/`](./strikeflow-course) | Its 37-chapter course, starting from never having written a line of code. Open `strikeflow-course/dist/index.html`. |
| [`halfpast-app/`](./halfpast-app) | **Project 2** — Halfpast, a real-time appointment booking platform. Live availability, honest time zones, and a database that refuses to double-book. |
| [`halfpast-course/`](./halfpast-course) | Its 35-chapter course, for somebody who has finished project 1. Open `halfpast-course/dist/index.html`. |
| [`sequent/`](./sequent) | **Project 3** — Sequent, a stock exchange. A matching engine, an opening auction, central clearing, a double-entry ledger, and an event log the whole venue can be rebuilt from. |
| [`sequent-course/`](./sequent-course) | Its 42-chapter course, for somebody who has finished project 2. Open `sequent-course/dist/index.html`. |
| [`tessera/`](./tessera) | **Project 4** — Tessera, a local-first collaborative canvas. Conflict-free data types written from scratch, an editor that keeps working with the network unplugged, and no server anywhere deciding who wins. |
| [`tessera-course/`](./tessera-course) | Its 44-chapter course, for somebody who has finished project 3. Open `tessera-course/dist/index.html`. |
| [`sextant/`](./sextant) | **Project 5** — Sextant, a self-hosted observability platform. Logs, traces, metrics, and a query language written from the characters up: a lexer, a Pratt parser, a type checker that knows a duration is not a number, and a planner that pushes what it can into SQL. |
| [`sextant-course/`](./sextant-course) | Its 46-chapter course, for somebody who has finished project 4. Open `sextant-course/dist/index.html`. |

Requires **Node 24.20.0** (the current LTS line, "Krypton") and **pnpm 11+**.
All five pin it in `.nvmrc` and `engines`.

## Quick start

```bash
# Project 1 — the marketing site
cd strikeflow-site && pnpm install && cp .env.example .env && pnpm run dev

# Project 2 — the booking platform
cd halfpast-app && pnpm install && cp .env.example .env
pnpm run db:migrate && pnpm run db:seed && pnpm run dev

# Project 3 — the exchange. Three processes, one command.
cd sequent && pnpm install && cp .env.example .env
pnpm run seed && pnpm run dev

# Project 4 — the collaborative canvas. Open the printed link in two windows.
cd tessera && pnpm install && cp .env.example .env
pnpm run db:migrate && pnpm run db:seed && pnpm run dev

# Project 5 — the observability platform. The seed prints a sign-in and a key.
cd sextant && pnpm install && cp .env.example .env
pnpm run db:push && pnpm run db:seed && pnpm run dev
```

Each seed prints what you need to open the thing it built: Halfpast prints the
demo studio's booking page, both sign-ins and a customer manage link; Tessera
prints an owner, a viewer, and a board short link worth opening twice; Sextant
prints a workspace, a sign-in, an ingest key, and the twenty minutes of its six
hours of telemetry during which `payments-api` is timing out.

## Reading the courses

```bash
open strikeflow-course/dist/index.html
open halfpast-course/dist/index.html
open sequent-course/dist/index.html
open tessera-course/dist/index.html
open sextant-course/dist/index.html
```

No build step, no server. Each chapter is a real page with prev/next links, so
you can bookmark where you are and Ctrl+F the chapter you are actually reading.
Rebuild any of them with `node build.js` in its folder.

The Tessera course ships `node tessera-course/verify.js`, which checks that
every code block naming a file appears **verbatim** in that file. A course that
quotes a codebase drifts from it the first time somebody refactors, and the
drift is invisible — the prose still reads correctly and is simply no longer
what the project does. This makes that a property rather than a promise.

The Sextant course goes one step further: it does not paste code at all. Every
block names a file and a **line range**, and the text is read out of the project
when the course is built, so drift is impossible rather than detectable. That
frees `node sextant-course/verify.js` to check the thing that still needs
judgement — whether the ranges are sensible. A quotation can be perfectly
faithful and useless if it starts on the closing brace above it or stops halfway
through an `if`, and no byte-comparison notices.

## Project 1 — StrikeFlow

A marketing site, taken seriously.

- SvelteKit 3: config in `vite.config.ts`, `#lib` subpath imports, typed env
  vars, remote `form()` with working progressive enhancement
- A complete SEO layer — canonical/OG/Twitter plus a cross-referenced JSON-LD
  `@graph`, generated sitemap, robots.txt and llms.txt
- Vanilla CSS design system, mobile-first, `min-width` queries only
- TradingView Lightweight Charts v5 via `{@attach}`, code-split and SSR-safe
- Gated PDF download with HMAC-signed expiring tokens
- A cinematic GSAP motion system that cannot blank the page, and that
  reduced-motion visitors never download
- 30 unit tests, 70 end-to-end tests across desktop and mobile profiles

## Project 2 — Halfpast

A booking platform, which is a harder problem than it sounds — two customers
tapping the same eleven o'clock is a correctness question, and "we open at nine"
is a sentence about a wall clock rather than a moment in time.

- **Concurrency solved by the schema.** A composite primary key on
  `(staff, five-minute cell)` makes double-booking impossible to write, not
  merely unlikely. Proved by a ten-way race test that asserts one winner, nine
  polite refusals, and no orphaned rows.
- **Time done properly.** Instants, calendar dates and wall-clock readings kept
  strictly apart; `@internationalized/date` for the conversions; both daylight
  saving transitions, a 45-minute-offset zone and past-midnight shifts all
  covered by tests that run in under a second.
- **Live availability** via `query.live` and async generators — a booked slot
  disappears from every open booking page without a reload, and an idle page
  costs one connection and no queries.
- **Remote functions throughout**: `query`, `command`, `form`, `form.for(id)`,
  single-flight mutations, and forms that complete a booking with JavaScript
  switched off.
- **Async Svelte**: `await` in `$derived`, boundaries with `failed` snippets,
  and notes on the two sharp edges that cost this project an afternoon each.
- Better Auth for staff, a bearer token in an email for customers, and an
  authorisation layer that answers 404 for "not yours" and 403 for "not yours to
  change".
- 118 unit tests, 82 end-to-end tests across desktop and Pixel 7.

```bash
cd halfpast-app
pnpm run verify   # check, lint, unit, build, e2e
```

## Project 3 — Sequent

An exchange. Orders match by price and time, the opening auction clears
everything at one price, every trade posts to a ledger that balances by
construction, and the entire venue can be replayed from its log and arrive at
exactly the same state.

- **The engine is a pure function.** `(state, command) → events`, with no clock,
  no database and no randomness. That is what makes replay meaningful, fuzzing
  possible, and "what happened in March" a question with an answer.
- **Event sourced for real.** An append-only log, a single-writer sequencer,
  checkpointed consumers, and snapshots that are strictly an optimisation —
  delete every projection and `rebuild()` puts them back.
- **Double-entry clearing.** Every trade produces postings that sum to zero, so
  the trial balance is zero by construction and a non-zero one means somebody
  wrote to the ledger outside the one function that may.
- **Three processes**: `web` accepts commands and decides nothing, `engine` is
  the only writer of events, `worker` drains a transactional outbox. Any of them
  can be killed mid-batch without losing or duplicating work.
- **A public API** with API keys, scopes, token-bucket rate limits, cursor
  pagination and one fixed error shape — plus signed webhooks and an SSRF check
  that survives IPv6 normalisation.
- **Mobile first**, on a screen designed for six monitors: no horizontal scroll
  at 390px, dense tables that side-scroll with a pinned column, and a motion
  system whose defining feature is how little of it there is.
- 374 unit, property-based, fault-injection and load tests across 21 files.

```bash
cd sequent
pnpm run verify   # check, test, build
```

## Project 4 — Tessera

A collaborative canvas. Two people draw on the same board at the same moment and
both edits survive. One of them goes through a tunnel, keeps working, and
everything they did arrives intact when the signal comes back. No server decides
who wins, because no server is asked.

- **A CRDT written from scratch, and property-tested.** Hybrid logical clocks, a
  version vector keyed by stamp, an add-wins observed-remove set, per-field
  last-write-wins registers, an RGA sequence for collaborative text, and base-62
  fractional indexing for stacking order. A randomised suite replays hundreds of
  thousands of hostile delivery schedules from printed seeds and asserts that
  every replica ends up byte-identical. It found two real bugs.
- **Local-first, in that order.** An edit changes the document synchronously,
  persists to an IndexedDB outbox, and only then goes near the network. Nothing
  in the interface waits for a server and nothing is disabled because one is
  missing.
- **Permissions checked per operation, on the server.** A collaborative editor
  ships the document model *and the code that mutates it* to every browser, so
  hiding the toolbar is a courtesy and the ingestion path is the only place a
  "no" means anything.
- **The whole of SvelteKit 3**: remote functions including `query.live`,
  `form.for(id)` and single-flight mutations; universal `reroute` and `transport`
  hooks; `defineParams` with Standard Schema matchers; `defineEnvVars`;
  `$app/manifest` in a service worker; a layout reset; and one component compiled
  to a custom element through `dynamicCompileOptions`.
- **Svelte 5 throughout**: runes, `$state.raw`, `{@attach}` attachments,
  `<svelte:boundary>`, `SvelteMap`/`SvelteSet`, and a `Tween` that holds both
  instant and animated camera movement so there is only ever one source of truth
  for where you are looking.
- **Mobile first**, including a canvas: a bottom sheet that becomes a sidebar, a
  toolbar that clears the home indicator, and the entire end-to-end suite run
  twice — desktop and a Pixel 7 profile.
- 115 unit tests and 28 end-to-end tests, three of which drive two independent
  browser contexts against one board.

```bash
cd tessera
pnpm run verify   # check, lint, unit, build, e2e
```

## Project 5 — Sextant

An observability platform. Logs, traces and metrics go in; questions come out —
in a language written from the characters up, because the thing that makes a
query editor good for your own language is that nothing in it can drift from the
compiler.

- **A real query language.** A hand-written lexer with error recovery, a Pratt
  parser whose entire precedence table is eight readable lines, a type checker
  that threads a scope through pipeline stages, an evaluator, and a planner that
  compiles a predicate to SQL *only* when SQL's answer is identical including
  nulls. Units are part of the type system: `duration > 500` is a type error and
  `duration > 500ms` is the query somebody meant.
- **The same front end, twice.** The lexer that colours the editor is the lexer
  that parses the query on the server. Completion knows an aggregate is illegal
  outside `summarize` because the checker knows it. There is no editor library
  anywhere in this project.
- **Sketches, because you cannot hold the data.** DDSketch for percentiles you
  are allowed to merge — averaging a p95 both overstates and understates,
  depending on the shape, which the tests demonstrate in both directions — and
  HyperLogLog for distinct counts in 2KB, including the avalanche finaliser
  everybody leaves out and the linear-counting correction that makes it usable.
- **Ingest that survives a bad day.** Streamed rather than buffered, refused on
  `content-length` before the body is read, rate-limited per tenant with a
  `Retry-After`, idempotent by unique index, and a per-metric cardinality limit
  whose rejections are counted and returned rather than logged.
- **Alerts with a transactional outbox.** "It is firing" and "somebody was told"
  are committed together, because every other ordering loses a page or sends it
  twice. A `for` duration, hysteresis, and the case that decides whether an
  alerting system is trustworthy: no data is not zero.
- **An interface for three in the morning.** A variable-height virtualizer with
  `flushSync` scroll anchoring, a flame graph drawn by a snippet that renders
  itself, an ARIA-tree waterfall on `content-visibility`, canvas charts
  downsampled in a worker over transferred typed arrays, and a live tail that
  says how many lines it dropped.
- **SvelteKit 3 where it earns it**: the URL as state via `SvelteURLSearchParams`
  and one debounced `replaceState`; shallow routing whose URL is also a real
  page; streamed loads that await what paints and stream what waits;
  `getAbortSignal()` around a streaming `fetch`; `query.batch`, `form`,
  `command`, `handleFetch`, `handleError` and `init`.
- 337 unit tests and 83 end-to-end tests across desktop and a Pixel 7 profile.
  Writing them found six real bugs, including a `forkPreloads` interaction that
  broke opening a trace one time in three, and a NUL byte in a series key that
  SQLite silently truncated at — collapsing every series into one row with no
  error anywhere.

```bash
cd sextant
pnpm run verify   # check, lint, unit, build, e2e
```
