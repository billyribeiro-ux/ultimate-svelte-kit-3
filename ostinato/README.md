# Ostinato

A groovebox in the browser. Sixteen steps, a synthesised kit, a bass that moves.
Make a groove, share it as a link, publish it to the gallery, jam on it with
somebody else in real time, or put it on your own page with one element.

Project 6 of _Ultimate SvelteKit 3_. Its course is in `../ostinato-course`.

## Run it

```bash
pnpm install
cp .env.example .env
pnpm run db:push && pnpm run db:seed
pnpm run dev
```

The seed publishes three grooves under `@ostinato` and creates the lobby jam
room. Open `/studio`, `/gallery`, `/jam/lobby`, or `/@ostinato/four-on-the-floor`.

## Verify it

```bash
pnpm run verify   # check, lint, unit + browser tests, build, end-to-end
```

It needs the database from the step above: the landing page is prerendered
from it, so a build against an empty file fails at the featured strip. The
end-to-end suite prepares its own `e2e.db` and never touches `local.db`.

The end-to-end suite runs against the output of the project's **own adapter**
(`adapters/ostinato`) — `node build/index.js`, not `vite preview` — on desktop
Chrome and a Pixel 7 profile.

## What is in it

| Where                                  | What                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/audio`                        | The engine: a two-clock scheduler, synthesised drums and synths, offline rendering to WAV, per-track channel strips with meters |
| `src/lib/pattern`                      | The model, its DTO for storage, a URL codec that fits a pattern in ~200 characters, three presets                               |
| `src/lib/studio`                       | The instrument's interface: grid, pads, knobs, transport, mixer, panels, undo                                                   |
| `src/lib/remote`                       | Every server call: `query`, `query.batch`, `query.live`, `prerender`, `command`, `form`                                         |
| `src/lib/server`                       | Storage, the signed artist cookie, jam-room broadcasting, the tracing ring                                                      |
| `src/lib/embed`                        | `<ostinato-player>`, a custom element built twice: inside the app and as a standalone file                                      |
| `src/hooks.ts` / `src/hooks.server.ts` | `transport`, async `reroute`, `handle`, `handleFetch`, `handleError`, `init`                                                    |
| `src/instrumentation.server.ts`        | OpenTelemetry, exporting to an in-memory ring the diagnostics page reads                                                        |
| `src/service-worker/`                  | The application shell cached from `$app/manifest`, versioned by `$app/env`, type-checked as its own project                     |
| `adapters/ostinato`                    | An adapter written from scratch: two functions and a catch-all joined by `applyReroute`                                         |
| `e2e/`                                 | Thirty-six end-to-end scenarios on desktop and a Pixel 7 profile, including two-browser jam sessions                            |

## Environment

See `.env.example`. Every variable is declared in `src/env.ts` with a schema; an
undeclared one cannot be imported and a malformed one fails at boot.

## Toolchain

Node 24.22.0 (`.nvmrc`, the current LTS) and pnpm 12.14.0 (`packageManager`, so
Corepack picks it). SvelteKit 3.1.0 on Svelte 5.57, Vite 8.3 and
vite-plugin-svelte 7.3; Vitest 5 with `@vitest/browser-playwright`; Playwright
1.64; TypeScript 6.0 — the latest of each as of October 2026, with one
deliberate exception: TypeScript 7 exists, and SvelteKit, svelte-check and
typescript-eslint do not support it yet. `pnpm run verify` is the gate, and
`pnpm run check` type-checks the app and the service worker as two projects.
