# Abacus

A spreadsheet in the browser. A formula language with fifty functions, an
engine that recalculates only what changed, a grid that scrolls a million rows,
passkeys instead of passwords, a second person editing beside you, CSV in and
out, and a container that deploys it.

Project 7 of _Ultimate SvelteKit 3_. Its course is in `../abacus-course`.

## Run it

```bash
pnpm install
cp .env.example .env
pnpm run db:push && pnpm run db:seed
pnpm run dev
```

The seed creates a house account and publishes one sheet per template. Open
`/sheet/local` for a sheet with no account, `/templates` for the three
templates, `/s/seedbudget` for a published sheet, or `/lesson` for the
reactivity lesson. Sign in at `/signin` with a passkey — there is no password
anywhere.

## Verify it

```bash
pnpm run verify   # check, lint, unit + browser tests, build, end-to-end
```

The end-to-end suite prepares its own `e2e.db` with the migrations in
`drizzle/`, builds, and runs against `node build/index.js` — the adapter's own
server — on desktop Chrome and a Pixel 7 profile. Passkey ceremonies run for
real on a virtual authenticator attached through the DevTools protocol.

## Deploy it

```bash
PUBLIC_ORIGIN=http://localhost:3000 SESSION_SECRET=$(openssl rand -base64 32) docker compose up --build
```

The Dockerfile bakes `PUBLIC_ORIGIN` in at build time (SvelteKit's
`paths.origin` and the passkey relying-party id both come from it), runs as
`node`, migrates before it listens, answers `/healthz`, and stops on `SIGTERM`.
The CI workflow builds the image, probes the health check and checks the exit
code.

## What is in it

| Where                                  | What                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/lib/formula`                      | The language: lexer, Pratt parser, AST, evaluator, fifty-odd functions, reference highlighting                   |
| `src/lib/engine`                       | The dependency graph: incremental recalculation, Tarjan for cycles, reference rewriting, a property test         |
| `src/lib/sheet`                        | The model: addresses, locale parsing and `Intl` formatting, the document schema, operations, the `Sheet` class   |
| `src/lib/grid`                         | The interface: prefix-sum axes, a virtualised ARIA grid with frozen panes, the cell editor, the formula bar      |
| `src/lib/csv`                          | A streaming CSV parser, a Web Worker that runs it, and the export                                                |
| `src/lib/server`                       | The schema, the signed session cookie, passkeys, sheets, the live broadcaster                                    |
| `src/lib/remote`                       | Every server call: `query`, `query.live`, `command`, `form`, `requested().refreshAll()`                          |
| `src/lib/lesson`                       | The same engine written out of `$derived`, for the lesson page                                                   |
| `src/hooks.server.ts` / `src/hooks.ts` | `sequence`, a font `preload` filter, a per-route `frame-ancestors`, `handleError` by `kind`, `init`, `transport` |
| `scripts/`                             | `migrate.ts` (what the container runs), `seed.ts`, `prepare-e2e-db.js`                                           |
| `e2e/`                                 | Twenty-three scenarios on desktop and a Pixel 7 profile, including real passkeys and two browsers on one sheet   |

## Environment

See `.env.example`. Every variable is declared in `src/env.ts` with a schema; an
undeclared one cannot be imported and a malformed one fails at boot.
`PUBLIC_ORIGIN` is read at build time as well as at run time.
