# Sequent

A stock exchange. Order book, opening auction, pre-trade risk, central clearing,
double-entry ledger, multi-tenant permissions and a public API — built on an
event-sourced log that the whole venue can be rebuilt from.

This is project three of the course. It exists because the honest way to learn
distributed systems is to build one whose bugs cost money.

## Running it

```sh
pnpm install
pnpm seed     # two member firms, six people, two instruments, an opening auction
pnpm dev      # the engine process and the web process, together
```

Then <http://localhost:5173/sign-in>. Everybody's password is printed by the
seed, along with an API key.

`pnpm dev` runs **two processes**, and that is the point rather than an
inconvenience — see below.

## The shape of it

```
                  ┌──────────────┐
   browser ───────│  apps/web    │──── commands ──┐
   API client ────│  SvelteKit 3 │                │
                  └──────────────┘                ▼
                         ▲                 ┌─────────────┐
                         │                 │ command_log │  ← the only writer
                    reads│                 └─────────────┘     is the sequencer
                         │                        │
                  ┌──────┴───────┐                ▼
                  │ projections  │◀───────┌──────────────┐
                  │ tape, orders │ events │ apps/engine  │  ← single threaded,
                  │ positions,   │        │  pure rules  │     deterministic
                  │ the ledger   │        └──────────────┘
                  └──────────────┘
```

**Commands** are requests: *place this order*. They can be refused.
**Events** are facts: *this order traded 400 at 455050*. They already happened.

The web tier only ever appends commands. The engine is the only thing that
decides what happened, it does so one command at a time in a total order, and
it does so with a **pure function** — `apply(state, command) → events` in
`packages/core`. That function never touches a clock, a random number or the
network, which is why the venue can be replayed from the log and arrive at
exactly the same state, every time.

Everything else — the tape, the order book you can query, positions, the
ledger — is a **cache**. `rebuild()` deletes all of it and replays. There is a
test that does exactly that and asserts the result is identical.

## The packages

| | |
|---|---|
| `packages/protocol` | Commands, events, money, ids. The vocabulary, versioned. |
| `packages/core` | The matching engine, auctions and risk. Pure functions, no I/O. |
| `packages/store` | The log, projections, the ledger, tenancy, authorisation. |
| `apps/engine` | The process that turns commands into events, and recovers. |
| `apps/web` | SvelteKit 3: terminal, risk console, and the public API. |

## Why two processes

One process would work today and would hide the thing worth learning: the
engine and the web tier fail independently, deploy independently, and are
correct independently. Stop the engine and the venue stops matching but keeps
accepting orders — they queue in the log and are applied when it comes back.
That is not an accident of the design; it is the design.

It also forces an honest answer to a question a single process lets you dodge:
**what happens when a process dies mid-write?** The answer is in
`apps/engine/src/recover.ts`, and it is tested by deleting the snapshot,
corrupting the snapshot, and killing the engine at every point in a session.

## Money

Every price and amount is an **integer scaled by 10,000**. £45.505 is `455050`.

There are no floats anywhere in this codebase, and the reason is one line long:
`0.1 + 0.2 !== 0.3`. A venue that rounds is a venue that loses money, slowly, in
a way that takes an auditor to find.

## The tests

```sh
pnpm test        # 195 tests
pnpm check       # types, across all five packages
pnpm verify      # both, plus a production build
```

Two kinds worth knowing about:

**Property-based tests** (`packages/core/src/invariants.spec.ts`) generate
hundreds of random order sequences and assert things that must never be true —
the book is never crossed, quantity is conserved, an auction produces one price.
They found three real bugs that the example-based tests structurally could not:
a self-trade-prevention path that discarded fills it had already applied, an
auction that dropped trades after the first order was fully filled, and a phase
transition that began continuous trading on a crossed book.

**Recovery tests** (`apps/engine/src/recover.spec.ts`) prove the snapshot is an
optimisation rather than a source of truth, by deleting it and corrupting it and
checking the venue still arrives at the same state.
