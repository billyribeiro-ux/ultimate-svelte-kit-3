# Ultimate SvelteKit 3

Three complete projects, each with its own build-along course.

| Folder | What it is |
| --- | --- |
| [`strikeflow-site/`](./strikeflow-site) | **Project 1** — a production-grade marketing site for a fictional real-time options flow product. SEO, charts, lead capture, cinematic motion. |
| [`strikeflow-course/`](./strikeflow-course) | Its 37-chapter course, starting from never having written a line of code. Open `strikeflow-course/dist/index.html`. |
| [`halfpast-app/`](./halfpast-app) | **Project 2** — Halfpast, a real-time appointment booking platform. Live availability, honest time zones, and a database that refuses to double-book. |
| [`halfpast-course/`](./halfpast-course) | Its 35-chapter course, for somebody who has finished project 1. Open `halfpast-course/dist/index.html`. |
| [`sequent/`](./sequent) | **Project 3** — Sequent, a stock exchange. A matching engine, an opening auction, central clearing, a double-entry ledger, and an event log the whole venue can be rebuilt from. |
| [`sequent-course/`](./sequent-course) | Its 42-chapter course, for somebody who has finished project 2. Open `sequent-course/dist/index.html`. |

Requires **Node 24.19.0** (the current LTS line, "Krypton") and **pnpm 10+**.
All three pin it in `.nvmrc` and `engines`.

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
```

The seed prints the demo studio's booking page, both sign-ins and a customer
manage link.

## Reading the courses

```bash
open strikeflow-course/dist/index.html
open halfpast-course/dist/index.html
open sequent-course/dist/index.html
```

No build step, no server. Each chapter is a real page with prev/next links, so
you can bookmark where you are and Ctrl+F the chapter you are actually reading.
Rebuild any of them with `node build.js` in its folder.

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
- 118 unit tests, 80 end-to-end tests across desktop and Pixel 7.

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
