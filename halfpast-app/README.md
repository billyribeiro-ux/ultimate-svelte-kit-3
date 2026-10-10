# Halfpast

Appointment booking for people who would rather be cutting hair.

A real-time booking platform built with SvelteKit 3: live availability that
updates every open browser when somebody books, honest time zone handling, and
a database schema that makes double-booking impossible to write rather than
merely unlikely.

Requires **Node 24.21.0** (the current LTS, pinned in `.nvmrc` and `engines`)
and **pnpm 12.10.1** (pinned in `packageManager`, so Corepack picks it for you).
Built on SvelteKit 3.0.1, Svelte 5.57, Vite 8 and Vitest 5.

## Quick start

```sh
pnpm install
cp .env.example .env        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

The seed prints the demo studio's booking page, both staff sign-ins and a
customer manage link. The demo password for every staff account is in
`scripts/seed.ts`.

## What is interesting in here

- **Concurrency solved by the schema.** A composite primary key on
  `(staff, five-minute cell)` means two customers racing for the same eleven
  o'clock produce one booking and one polite refusal — enforced by SQLite, not
  by application code that could forget. Proved by a ten-way race test.
- **Time done properly.** Instants, calendar dates and wall-clock readings are
  kept strictly apart, converted with `@internationalized/date`. Both daylight
  saving transitions, a 45-minute-offset zone and past-midnight shifts are all
  covered by tests.
- **Live availability** via `query.live` async generators — a booked slot
  disappears from every open booking page without a reload, and an idle page
  costs one connection and zero queries.
- **Remote functions throughout**: `query`, `command`, `form`, `form.for(id)`,
  and forms that complete a booking with JavaScript switched off.
- **Better Auth** (staff only — customers never get accounts, they get a signed
  link in an email), with the drizzle adapter and the `minimal` entry point.

## The commands

```sh
pnpm run verify     # check, lint, unit, build, e2e — the whole gate
pnpm run check      # svelte-check across the project
pnpm test           # unit suite, then the Playwright e2e suite
pnpm run db:studio  # poke at the database in a browser
```

## Building without a `.env`

`pnpm run build` needs five variables, not two. SvelteKit validates every
variable declared in `src/env.ts` when it builds, not only the ones it inlines.
The [environment variables docs](https://svelte.dev/docs/kit/environment-variables)
put it in one line: "If a value is invalid, the app will fail to start (or
build)." The build counts because "SvelteKit analyses your app during the `build`
step by running it", so in a clean clone, or a CI job with no `.env`, the build
stops at `Analysing routes` with `SvelteKit error: env_invalid` and names every
variable it could not validate.

The five come in two kinds, and each kind wants a different value:

- **`PUBLIC_ORIGIN` and `PUBLIC_DEFAULT_TIME_ZONE` are `static: true`.** For a
  static variable "the build time value is inlined into the bundle", so the value
  you build with is the value that ships. Build with the real ones.
  `PUBLIC_ORIGIN` also becomes `paths.origin` in `vite.config.ts`, the origin the
  CSRF check trusts.
- **`DATABASE_URL`, `ORIGIN` and `BETTER_AUTH_SECRET` are dynamic**, which is the
  default: "the value is read from the environment when the app starts". None of
  them ends up in `build/`, and when `node build` starts, the server reads the
  real values and validates them again. For `ORIGIN` and the secret, the build
  only needs values that pass their schemas: an absolute URL, and at least 32
  characters. `DATABASE_URL` needs more than that, and the next two paragraphs
  say why.

`DATABASE_AUTH_TOKEN` is the one you can leave out. Its schema returns
`undefined` for a missing value, which is how `src/env.ts` says "optional".

`DATABASE_URL` is the exception to "pass the schema and you are done". Its
schema accepts any non-empty string, but the build does more than validate it.
Running the app to analyse it imports `src/lib/server/db/index.ts`, which hands
the URL to libSQL's `createClient` and then sets its pragmas. So the value must
also be a URL libSQL can parse: `:memory:`, `file:`, `libsql:`, `http(s):` or
`ws(s):`. Anything else gets past `env_invalid` and fails the build a step
later, with a stack trace from inside a generated chunk instead of a message
naming the variable. `DATABASE_URL=placeholder` stops with
`LibsqlError: URL_INVALID`, and a `postgres://` URL with
`URL_SCHEME_NOT_SUPPORTED`.

A URL libSQL can parse gets used, not just checked. A build pointed at a file
creates that file, and a build pointed at a remote database can send it the WAL
pragma, so a build pointed at production can talk to production. `:memory:` is
the value that parses and leaves nothing behind, a database that disappears when
the build ends. A whole build with no `.env` looks like this:

```sh
PUBLIC_ORIGIN=https://halfpast.example \
PUBLIC_DEFAULT_TIME_ZONE=Europe/London \
DATABASE_URL=:memory: \
ORIGIN=https://halfpast.example \
BETTER_AUTH_SECRET=build-time-placeholder-never-read-at-runtime \
pnpm run build
```

Swap in your real public origin and time zone. The other three can stay exactly
as written, because the built server never sees them. Locally, `.env` supplies
all five. The e2e suite sets its own in `playwright.config.ts`, which is why it
never notices a missing `.env`.

## Toolchain notes

- `pnpm install` is clean except for one widened peer: `better-auth` still
  declares `@sveltejs/kit ^2`. The reason it is safe, and the rule that widens
  it, are both in `pnpm-workspace.yaml`.
- pnpm 12 holds back packages younger than a day; the three it excluded when the
  toolchain was pinned are listed in `pnpm-workspace.yaml` with the same note.

## Provenance

The project was scaffolded with the Svelte CLI and then built out by hand:

```sh
pnpm dlx sv create --template minimal --types ts \
  --add prettier eslint vitest="usages:unit,component" playwright \
  sveltekit-adapter="adapter:node" drizzle="database:sqlite+client:libsql" \
  better-auth="demo:password" experimental="features:async,remoteFunctions" \
  --install pnpm halfpast-app
```

The 35-chapter build-along course lives in
[`../halfpast-course/`](../halfpast-course) — open
`halfpast-course/dist/index.html`.
