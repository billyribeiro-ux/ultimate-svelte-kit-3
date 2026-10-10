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

`pnpm run build` needs `PUBLIC_ORIGIN` and `PUBLIC_DEFAULT_TIME_ZONE` in the
environment — from `.env` locally, from the job's `env:` in CI. They are declared
`static: true` in `src/env.ts`, so SvelteKit inlines them at build time and
refuses to build without them (`SvelteKit error: env_invalid`) rather than ship a
bundle with `undefined` baked in. The e2e suite supplies its own values in
`playwright.config.ts`, which is why it never notices a missing `.env`.

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
