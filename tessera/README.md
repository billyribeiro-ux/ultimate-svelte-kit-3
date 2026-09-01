# Tessera

A local-first, real-time collaborative canvas for system design.

Two people draw the same diagram at once. One of them is on a train with no
signal. When the train comes out of the tunnel, both boards agree — without a
merge dialogue, without a "your changes could not be saved", and without either
person having thought about it.

Requires **Node 24.20.0** (the current LTS, pinned in `.nvmrc` and `engines`)
and **pnpm 11+**.

## Quick start

```sh
pnpm install
cp .env.example .env        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

The seed prints two sign-ins — an owner and a viewer on the same board — and the
board's short link. Open it in two windows and drag something.

## What is interesting in here

- **A CRDT written from scratch, and property-tested.** Hybrid logical clocks,
  an add-wins observed-remove set, per-field last-write-wins registers, an RGA
  sequence for collaborative text, and base-62 fractional indexing for stacking
  order. A randomised suite replays hundreds of hostile delivery schedules from
  printed seeds and asserts that every replica ends up byte-identical.
- **Local-first, in that order.** An edit changes the document synchronously,
  persists to an IndexedDB outbox, and only then goes near the network. Nothing
  in the interface waits for a server, and nothing is disabled because one is
  missing.
- **Permissions checked per operation, on the server.** A collaborative editor
  ships the document model and the code that mutates it to every browser, so
  hiding the toolbar is a courtesy and the ingestion path is the only place a
  "no" means anything.
- **Presence that is not in the database.** A cursor position is true for about
  thirty milliseconds and its correct behaviour on a crash is to disappear.
- **A canvas that stays quick.** One promoted compositor layer, viewport
  culling, per-field signals so a drag invalidates two numbers rather than a
  subtree, and drag operations throttled to twenty a second with an exact commit
  on release.
- **Keyboard-first, genuinely.** Every shape is reachable, nameable and movable
  without a pointer, and the board has a real outline tree that a screen reader
  can walk — which is what makes `role="application"` on the canvas an honest
  claim rather than an excuse.
- **Three languages**, including one with no plural forms and no word spacing,
  because that is what proves the i18n layer rather than decorating it.

## The commands

```sh
pnpm run verify     # check, lint, unit, build, e2e — the whole gate
pnpm run check      # svelte-check across the project
pnpm test           # unit suite, then the Playwright e2e suite
pnpm run db:studio  # poke at the database in a browser
```

## Provenance

Scaffolded with the Svelte CLI and then built out by hand:

```sh
pnpm dlx sv create --template minimal --types ts \
  --add prettier eslint vitest="usages:unit,component" playwright \
  sveltekit-adapter="adapter:node" drizzle="database:sqlite+client:libsql" \
  better-auth="demo:password" experimental="versions:kit+features:async,remoteFunctions" \
  --no-install tessera
```

The build-along course lives in [`../tessera-course/`](../tessera-course) — open
`tessera-course/dist/index.html`.
