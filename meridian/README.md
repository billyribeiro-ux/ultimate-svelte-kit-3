# Meridian

A collaborative trip planner, and project 8 of _Ultimate SvelteKit 3_. A few
friends plan a trip together: stops on days, a map and a globe of the route,
a shared ledger that says who owes whom, notes that save themselves, guides in
three languages, and a link that puts the route on somebody else's page.

It is built on Svelte 5.57, SvelteKit 3.0.0-next.25 and Vite 8, as of
September 2026, and it exists to use every current capability of both for
something real. The course in [`../meridian-course`](../meridian-course) reads
every line of it in order and says why.

## Run it

Requires Node 24.20.0 (`.nvmrc`) and pnpm 11. This is a pnpm workspace: the
app at the root, the geodesy library in `packages/waypoint`.

```bash
pnpm install                 # also builds the library, compiles the messages, syncs the types
cp .env.example .env         # DATABASE_URL, PUBLIC_ORIGIN, BETTER_AUTH_SECRET, STOP_LIMIT
pnpm run db:migrate          # the SQL migrations in drizzle/
pnpm run db:seed             # three people, two trips
pnpm run dev
```

The seed creates `ana@meridian.test`, `ben@meridian.test` and
`cal@meridian.test`, all with the password `meridian-demo-2026`. Open
`/t/seediberia` in two windows, signed in as Ana in one and Ben in the other,
and add a stop in either. `/t/seedjapan2` is visible by link, so it also
answers at `/embed/seedjapan2` and `/api/route/seedjapan2.json`.

## Prove it

```bash
pnpm run check               # svelte-check, strict
pnpm run lint                # prettier + eslint
pnpm run test:unit -- --run  # two Vitest projects: Node for logic, Chromium for components
pnpm run build               # the custom element, then the app
pnpm run test:e2e            # Playwright against node build/index.js, desktop and Pixel 7
pnpm run verify              # all of the above, in that order
pnpm run verify:package      # the library: svelte-package, publint, arethetypeswrong
```

The end-to-end suite rebuilds its own database from the migrations and the
seed before every run and never touches `local.db`.

## Ship it

```bash
PUBLIC_ORIGIN=http://localhost:3000 BETTER_AUTH_SECRET=$(openssl rand -base64 32) docker compose up --build
curl -s localhost:3000/healthz
```

`PUBLIC_ORIGIN` is a build argument: SvelteKit bakes it into the server, so it
is one image per origin. The container runs as `node`, migrates before it
listens, answers `SIGTERM`, and reports through `/healthz`. The workflow in
`../.github/workflows/meridian.yml` verifies the project, builds and runs the
image, and checks the course.

## Where things are

| Path                                     | What                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/waypoint/`                     | `@meridian/waypoint` — geodesy, a `Route` class with runes, two components, packaged and proven |
| `src/lib/domain/`                        | ids, dates, money, fair splits, the itinerary as data, valibot schemas                          |
| `src/lib/server/`                        | Drizzle schema and queries, Better Auth, live rooms, tracing, geodata                           |
| `src/lib/remote/`                        | remote functions: queries, live queries, forms, commands, one prerendered query                 |
| `src/lib/trip/`                          | the trip page: itinerary, palette, dialogs, expenses, notes, companions, presence               |
| `src/lib/map/`, `src/lib/globe/`         | svelte-maplibre with bundled world geodata; the Threlte flyover                                 |
| `src/lib/embed/`                         | the `<meridian-route>` custom element and its own Vite config                                   |
| `src/lib/guides/`, `src/content/guides/` | mdsvex guides, prerendered in three languages                                                   |
| `src/lib/styles/`, `src/lib/ui/`         | tokens, mobile-first CSS, the shell, the theme                                                  |
| `src/hooks.server.ts`, `src/hooks.ts`    | locale, identity, security headers, `reroute`, `transport`                                      |
| `vite.config.ts`                         | every SvelteKit option, commented: CSP, tracing, version, prerender, the test projects          |
| `e2e/`                                   | five Playwright suites; `collab.e2e.ts` runs two browsers on one trip                           |
| `Dockerfile`, `compose.yaml`             | three stages, one process, a health check                                                       |
