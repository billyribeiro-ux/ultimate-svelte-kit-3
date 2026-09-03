# Ultimate SvelteKit 3

Seven complete projects, each with its own build-along course.

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
| [`ostinato/`](./ostinato) | **Project 6** — Ostinato, a groovebox in the browser. A step sequencer with a two-clock scheduler and synthesised instruments, patterns that fit in a URL, a gallery with vanity addresses, live jam rooms, an embeddable custom element, and an adapter written from scratch — every feature of Svelte 5 and SvelteKit 3, each one used for something. |
| [`ostinato-course/`](./ostinato-course) | Its 39-chapter course, for somebody who has finished project 5. Open `ostinato-course/dist/index.html`. |
| [`abacus/`](./abacus) | **Project 7** — Abacus, a spreadsheet in the browser. A formula language with a Pratt parser and fifty functions, an engine that recalculates only what changed and is property-tested against a from-scratch evaluator, a grid that scrolls a million rows, passkeys instead of passwords, a second person editing beside you over a live query, CSV in a worker, and a container that migrates before it listens — and a lesson page where the same engine is written out of `$derived`. |
| [`abacus-course/`](./abacus-course) | Its 39-chapter course, for somebody who has finished project 6. Open `abacus-course/dist/index.html`. |
| [`meridian/`](./meridian) | **Project 8** — Meridian, a collaborative trip planner. A pnpm workspace with a published geodesy library, an itinerary two people edit at once over a live query with presence, a map drawn from bundled world geodata with no tile server, a globe flyover in Threlte, fair expense splits in minor units, a Tiptap notes editor through an attachment, Markdown guides prerendered in three languages, an embeddable custom element, and a survey of the Svelte ecosystem as of September 2026 — every current Svelte 5 and SvelteKit 3 capability, each used for something. |
| [`meridian-course/`](./meridian-course) | Its 45-chapter course, for somebody who has finished project 7, with an ecosystem part on choosing libraries. Open `meridian-course/dist/index.html`. |

Requires **Node 24.20.0** (the current LTS line, "Krypton") and **pnpm 11+**.
All eight pin it in `.nvmrc` and `engines`.

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

# Project 6 — the groovebox. Open /studio, or /jam/lobby in two windows.
cd ostinato && pnpm install && cp .env.example .env
pnpm run db:push && pnpm run db:seed && pnpm run dev

# Project 7 — the spreadsheet. Open /sheet/local, or sign in with a passkey.
cd abacus && pnpm install && cp .env.example .env
pnpm run db:push && pnpm run db:seed && pnpm run dev

# Project 8 — the trip planner. Open /t/seediberia in two windows, as Ana and Ben.
cd meridian && pnpm install && cp .env.example .env
pnpm run db:migrate && pnpm run db:seed && pnpm run dev
```

Each seed prints what you need to open the thing it built: Halfpast prints the
demo studio's booking page, both sign-ins and a customer manage link; Tessera
prints an owner, a viewer, and a board short link worth opening twice; Sextant
prints a workspace, a sign-in, an ingest key, and the twenty minutes of its six
hours of telemetry during which `payments-api` is timing out; Ostinato publishes
three grooves under `@ostinato` and opens the lobby jam room; Abacus publishes
one sheet per template at `/s/seedbudget`, `/s/seedloan00` and `/s/seedgrades`;
Meridian seeds three people (`ana@`, `ben@`, `cal@meridian.test`, password
`meridian-demo-2026`) and two trips, one private and one visible by link.

## Reading the courses

```bash
open strikeflow-course/dist/index.html
open halfpast-course/dist/index.html
open sequent-course/dist/index.html
open tessera-course/dist/index.html
open sextant-course/dist/index.html
open ostinato-course/dist/index.html
open abacus-course/dist/index.html
open meridian-course/dist/index.html
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

The Ostinato course is built the same way — 294 blocks quoted from the project
by line range, `node ostinato-course/verify.js` to check the ranges — and adds
`tools/snapfile.js`, which snaps every range in a chapter file to whole
statements so that fixing thirty of them after a refactor is one command.

The Abacus course uses the same tooling — 287 blocks quoted by line range,
`node abacus-course/verify.js` for the ranges, `tools/check-dist.js` for the
built pages — and its `verify` and `build` run in CI beside the project's own
suite, with `git diff --exit-code` on `dist/` so the committed pages are always
the ones the build produces.

The Meridian course is the same again — 322 blocks quoted by line range, the
range checker, the page checker, and the CI job — and is the one to read for
the ecosystem: a part of four chapters on which libraries were chosen, which
were rejected and why, and the three shapes a library takes when it meets
Svelte 5 (headless, wrapper, imperative through an attachment).

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

## Project 6 — Ostinato

A groovebox. Sixteen steps, a synthesised kit, a bass that moves. The five
projects before it each had a domain problem at the centre; this one has the
framework at the centre, and the rule for every feature was that it had to be
*for* something. There is no `$host` demo page; there is a custom element that
needs `$host` to dispatch an event.

- **A real scheduler.** Two clocks: a timer looks a hundred milliseconds ahead
  and the audio clock plays exactly on time. Swing, velocity and tempo changes
  land on the next sixteenth. Four synthesised drums and two synths from
  oscillators and noise; offline rendering to a WAV whose header a test reads
  back with a `DataView`.
- **Links that are saves.** A versioned byte codec puts a whole pattern in about
  two hundred URL-safe characters — a seventh of the JSON — with notes encoded
  only for the tracks that have them. Every preset round-trips; damaged links
  fail with a sentence.
- **The studio is every binding Svelte has.** `bind:group`, function bindings
  with `bind:checked={get, set}`, `bind:indeterminate`, `bind:textContent` on a
  `contenteditable`, `bind:files` cleared with a `DataTransfer`, media bindings,
  `$bindable` knobs chained through two components into deep `$state`; springs
  on the pointer and never on the value; attachments for a wheel listener that
  must not be passive and a meter drawn at sixty frames a second; `fork()` to
  render a WAV on hover before the click; `settled()`, `$state.eager`,
  `$inspect.trace`, `$props.id()`, `hydratable`, `<select defaultValue>`.
- **The server is every remote function.** `query`, `query.batch` for thirty
  cards in one request, `query.live` as an async generator with a one-value
  mailbox, `prerender` baked into a static landing page, `command` with
  `requested(...).refreshAll()` and `withOverride` for optimistic counts, and
  two `form`s that work with JavaScript off — one with `preflight`, two submit
  buttons and `invalid(issue.handle(...))` for a 409 under the right field.
- **An adapter written from scratch.** Two functions and a catch-all with no
  routes, joined by SvelteKit 3's `applyReroute`, bundled with rolldown,
  instrumented with `builder.instrument`, emulated in development, and
  contributing a Vite plugin of its own. The end-to-end suite runs against its
  output, not `vite preview`.
- **The rest of SvelteKit 3**: async `reroute` for `/@handle/slug` addresses
  that are not routes, `transport` for a class that crosses the wire, a `QUERY`
  handler with a test file beside the route, `handleError` by `kind`, a font
  `preload` filter by source filename, OpenTelemetry spans read back on a
  diagnostics page, a service worker on `$app/manifest`, a CSP in `auto` mode
  proved by a test that hashes every inline script itself.
- 58 unit and browser tests, 33 end-to-end scenarios run on desktop and a Pixel
  7 profile. Writing them found five real bugs, including a `forkPreloads` back
  navigation that completed without rendering and an `await` in markup that ran
  once and never again.

```bash
cd ostinato
pnpm run verify   # check, lint, unit + browser, build, e2e
```

## Project 7 — Abacus

A spreadsheet. Type a number into a cell, type `=A1*2` into the next one, and
the second cell follows the first. That is the whole idea, and it is where
reactivity was invented — so this is the project where the framework's own
subject is the domain. When you have written a dependency graph by hand, with a
dirty set and a topological sort and cycle detection, `$derived` stops being
magic; the lesson page puts the two side by side and lets you edit either.

- **A formula language.** A hand-rolled lexer with spans, a Pratt parser whose
  precedence table is the readable part (`-2^2` is 4, because every
  spreadsheet says so), an evaluator that receives its arguments as thunks so
  `IF` is lazy and `IFERROR` can catch, fifty-odd functions with signatures the
  completion list reads, criteria (`">5"`, `"a*"`), decimal rounding that
  shifts the point as text, and serial dates in UTC.
- **An engine that recalculates only what changed.** Cells in a plain `Map`,
  edges recorded when a formula is compiled, Kahn's algorithm over the dirty
  set, Tarjan for cycle members so `#CYCLE!` is a value everything downstream
  can see, and reference rewriting when rows are inserted, deleted or copied.
  Property-tested: a thousand random sheets and ten thousand random edits
  against a from-scratch evaluator, from a printed seed.
- **One number between the engine and the grid.** The `Sheet` class is a few
  `$state` fields and a `version`; every cell read touches the version first,
  so ten thousand visible cells subscribe to one signal instead of being ten
  thousand proxies. Undo is commands with inverses — a deleted row remembers
  its cells and every formula the deletion rewrote.
- **A grid that scrolls a million rows.** Prefix-sum axes for resizable rows,
  two-axis virtualisation, frozen panes as zero-sized sticky layers, one
  `cell` snippet rendered in five layers, an ARIA grid keyboard model, a fill
  handle, two clipboard formats, and a formula bar whose coloured references
  are a mirror under a transparent input. Assignable `$derived`s where the
  autofixer said an effect was wrong.
- **No account, or a passkey.** The local sheet lives in the Origin Private
  File System with two tabs in step over a `BroadcastChannel`. Accounts are
  WebAuthn: single-use challenges, a cloned-key counter, the relying-party id
  from a `static` environment variable, and a valibot schema for the browser's
  answer that matches the library's types with no casts.
- **A second person editing beside you.** Numbered operations over a
  `query.live` with a coalescing mailbox that closes on the request's abort
  signal, presence chips, other people's cursors on the grid, a shared
  document the server keeps current without running the engine.
- **The rest of SvelteKit 3**: `router.resolution: 'server'`, `csr = false`
  pages that ship no JavaScript, templates prerendered from `entries()`, a
  `+page@.svelte` embed with its own `frame-ancestors`, a streamed CSV
  response, a `QUERY` handler, `handleError` by `kind`, a font `preload`
  filter by source filename, `transport` for an error class, and a universal
  `load` beside component-level queries — with the chapter that says which of
  the three each piece of data should come from.
- **Shipped as a container.** A three-stage Dockerfile that bakes the origin
  in, runs as `node`, migrates with `node --import` before it listens and
  answers `SIGTERM`; a workflow that runs the suite, builds the image, probes
  the health check and checks the exit code.
- 86 unit and browser tests, 23 end-to-end scenarios run on desktop and a Pixel
  7 profile with real passkey ceremonies on a virtual authenticator. Writing
  them found five real bugs, each now a comment in the code that names the
  test that caught it.

```bash
cd abacus
pnpm run verify   # check, lint, unit + browser, build, e2e
```

## Project 8 — Meridian

A trip planner for a few friends. One of them starts a trip, the others join
from a link, and from then on everybody is looking at the same itinerary: a
stop added on one phone appears on the other without a reload, the chips at
the top say who is here and which stop they are looking at, and the ledger
says who owes whom to the cent. It is the project where the *ecosystem* is the
subject as much as the framework: every library in it was chosen against four
written questions, and the course keeps the list of the ones that lost.

- **A published library first.** `@meridian/waypoint` is a pnpm workspace
  package: great-circle distance, bearing, destination and interpolation, a
  `Route` class written with runes in a `.svelte.ts` file, and two components
  — built with `@sveltejs/package`, checked with publint and
  arethetypeswrong, and consumed by the app the way a stranger would consume
  it. The Markdown guides call it at build time.
- **A document two people edit at once.** One `query.live` per trip, a room
  the server publishes to when anything changes, last-write-wins per stop,
  and presence — heartbeat, selection, arrival and departure — on the same
  stream. Commands refresh the queries they invalidate in the same response,
  and `untrack` around a command inside an effect is the chapter that explains
  the one infinite loop the suite found.
- **A map with no tile server.** svelte-maplibre over MapLibre GL, with a
  style built from a bundled TopoJSON of the world served by an endpoint that
  `read()`s the asset — so `connect-src 'self'` holds, the map works offline
  and in CI, and nobody learns where you are planning to go. A Threlte globe
  draws the same route as great-circle arcs and flies along it, unless
  `prefers-reduced-motion` says not to.
- **Money that adds up.** Minor units everywhere, largest-remainder splits
  that always sum to the whole and always give the extra cent to the same
  person, a greedy settle-up with at most `people − 1` transfers, TanStack
  Table for the ledger, LayerChart for the two charts, and `Intl` for every
  number and date in three locales.
- **Three languages, one URL scheme.** Paraglide 2 with `/de` and `/pt-br`
  prefixes through `reroute`, a locale in `AsyncLocalStorage` so a remote
  function speaks the right language without being told, and guides written
  in mdsvex, prerendered from `entries()` in all three languages with
  `csr = false` — not one script tag on the page.
- **The interface, tab by tab.** Bits UI for the dialog, the combobox, the
  command palette and the date-range picker; svelte-dnd-action with
  `animate:flip` for the itinerary; Tiptap 3 through `{@attach}` for the notes
  with an autosave command; a `<meridian-route>` custom element compiled with
  `dynamicCompileOptions` for the client only and shipped as its own file by a
  second Vite config; view transitions; an update banner from
  `version.pollInterval`.
- **The platform, in one config.** `tracing` with an in-memory OpenTelemetry
  exporter behind a diagnostics page, a Content Security Policy in `auto` mode
  with the theme boot script allowed by hash, `frame-ancestors` rewritten per
  request for the one route that may be framed, `handleError` by `kind`,
  `handleFetch` with a timeout, `init` that refuses to be healthy without the
  database, and a redirect target that is sanitised rather than rejected.
- **Shipped as a container.** A three-stage Dockerfile that installs a
  workspace with `--frozen-lockfile --ignore-scripts`, bakes the origin in,
  runs as `node`, migrates with `node --import` before it listens and answers
  `SIGTERM`; a workflow that verifies the project and the library, builds and
  *runs* the image, probes the health check, fetches a prerendered guide out
  of it in two languages, and checks the exit code.
- 43 unit and browser tests across two Vitest projects, 18 end-to-end
  scenarios each run on a desktop and a Pixel 7 profile, with two browser
  contexts on one trip. Writing them found six real bugs — an effect loop, a
  combobox that never searched, a page that did not refresh after Save, a
  phone layout that pushed the page wider than the screen, text typed before
  hydration that hydration threw away, and seeded ids one character short of
  a UUID that made every command on a seeded row fail silently — each now a
  comment in the code and a chapter in the course.

```bash
cd meridian
pnpm run verify           # check, lint, unit + browser, build, e2e
pnpm run verify:package   # the library: svelte-package, publint, arethetypeswrong
```
