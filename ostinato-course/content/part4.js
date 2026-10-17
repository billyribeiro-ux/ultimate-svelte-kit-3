/**
 * PART 4 — The server
 * (chapters 21–26)
 *
 * Four tables, a cookie instead of a password, and every read and write as a
 * remote function. Then the live query that makes a jam room, and the hooks
 * that run around every request. The theme of this part is *where the line
 * is*: `src/lib/server` cannot be imported by the browser, `.remote.ts` is the
 * boundary made explicit, and `src/hooks.ts` is the one file both sides share.
 */

import { code } from './quote.js';

export const part4 = [
	{
		slug: 'the-schema',
		title: 'The schema, and the environment',
		summary:
			'Four tables in Drizzle, a pattern as one JSON column, relations for the query builder, one libSQL client with WAL, and every environment variable declared once with a valibot schema.',
		goal: 'Read a small schema and know why it is small; understand what `relations()` is for; and see how SvelteKit 3 replaces the deprecated `$env/*` modules with a typed, validated declaration in one file.',
		blocks: [
			{
				type: 'p',
				text: 'The smallest schema of the six projects, on purpose. A pattern is read and written whole and never queried by its insides, so it is one JSON column; a table of steps would be a hundred and twenty-eight rows per pattern for no query that anybody runs.'
			},
			code('src/lib/server/db/schema.ts', 1, 13),
			code('src/lib/server/db/schema.ts', 20, 31),
			code('src/lib/server/db/schema.ts', 33, 62),
			{
				type: 'p',
				text: 'The unique index on `(artist_id, slug)` is what makes `/@handle/slug` an address: one artist cannot publish two patterns with the same slug, and the publish function (ch. 24) appends `-2`, `-3` until it finds one free. The two plain indexes are the two ways the gallery sorts. `remix_of` points at another pattern and is set to `null` when that one is deleted — a remix outlives its original, which is how remixes work.'
			},
			code('src/lib/server/db/schema.ts', 64, 76),
			code('src/lib/server/db/schema.ts', 78, 95),
			{
				type: 'why',
				title: 'Why `relations()` exists when the foreign key already does',
				text: 'The `references()` on `artistId` is a database fact: the database will refuse a pattern whose artist does not exist. Drizzle’s *relational query builder* — `db.query.patterns.findMany({ with: { artist } })` — does not read that fact; it reads these `relations()` declarations. Without them the `with:` clause throws a confusing error about `referencedTable` at the first prerender, which is exactly how this project found out.'
			},
			{ type: 'h3', id: 'the-client', text: 'One client, WAL on' },
			code('src/lib/server/db/index.ts', 1, 25),
			{
				type: 'p',
				text: 'A top-level `await` in a module is fine on the server, and here it sets two pragmas before anything else can run a query. WAL — write-ahead logging — lets readers proceed while a writer appends, and a jam room is many readers and one writer at a time. The busy timeout makes a second writer wait a few milliseconds rather than fail with `SQLITE_BUSY`.'
			},
			{ type: 'h3', id: 'the-environment', text: 'The environment, declared' },
			{
				type: 'p',
				text: 'In SvelteKit 2 environment variables came from the `$env/static/*` and `$env/dynamic/*` modules. SvelteKit 3 deprecates them — they are removed in SvelteKit 4 — in favour of one file: `src/env.ts` calls `defineEnvVars` with every variable the app reads, each with a description, a schema and — if the browser may see it — `public: true`. A variable not declared here cannot be imported. `DATABASE_URL` comes in through `$app/env/private`; `PUBLIC_ORIGIN` through `$app/env/public`.'
			},
			code('src/env.ts', 23, 40),
			code('src/env.ts', 47, 65),
			{
				type: 'note',
				text: 'Environment variables are strings. `TRACE_BUFFER` is turned into a number *here*, once, with `v.transform(Number)` followed by the checks a number needs — rather than in every file that reads it with a `Number()` and a hopeful default. If the value is missing, the default `"200"` goes through the same pipe.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the pattern is one JSON column and when that would be the wrong choice.',
					'You can explain what `relations()` adds that `references()` does not.',
					'You can add a new environment variable and say which import path the app would use for it.'
				]
			}
		]
	},

	{
		slug: 'identity-without-passwords',
		title: 'Identity without passwords',
		summary:
			'A signed cookie says which handle this browser is. HMAC-SHA256 with `crypto.subtle`, one `null` for every failure, `getRequestEvent()` inside helpers, and a shared handle schema that the server enforces and the form preflights.',
		goal: 'Understand the difference between signed and encrypted, write a cookie that cannot be forged in four lines of Web Crypto, and use `getRequestEvent()` from a helper that has no `event` argument.',
		blocks: [
			{
				type: 'p',
				text: 'Ostinato has no sign-in. When somebody publishes they choose a handle, and from then on a cookie says “this browser is @handle”. That is enough to own patterns and delete them, and it is the whole of the identity system — the right amount for “who made this groove” and the wrong amount for anything with money in it, which is why nothing here has money in it.'
			},
			code('src/lib/handle.ts', 1, 18),
			{
				type: 'p',
				text: 'The handle schema lives outside `src/lib/server` so that the publish form’s `preflight` (ch. 20) can import it. Nothing under `src/lib/server` may reach a client bundle — SvelteKit refuses at build time — and that refusal is what keeps `SESSION_SECRET` from wandering into the browser by way of a well-meant import.'
			},
			code('src/lib/server/identity.ts', 1, 19),
			code('src/lib/server/identity.ts', 40, 69),
			{
				type: 'why',
				title: 'Why signed, not encrypted',
				text: 'The cookie’s contents — an id and a handle — are not secret. Anybody can decode them; nobody can *change* them, because the HMAC would no longer match. Encryption would hide something that does not need hiding and add a key-management problem for it. `crypto.subtle` is in Node and in every browser, so this is four lines rather than a dependency.'
			},
			code('src/lib/server/identity.ts', 71, 107),
			{
				type: 'warn',
				text: 'One `null` for every failure: a missing dot, a bad signature, a payload that is not an artist. A caller that could distinguish “tampered” from “malformed” is a caller that will one day treat one of them as trusted. The `verify` call is inside `try` because a signature that is not valid base64 throws before the HMAC is even checked.'
			},
			{ type: 'h3', id: 'the-helpers', text: 'The current artist, from anywhere' },
			code('src/lib/server/artist.ts', 1, 27),
			{
				type: 'p',
				text: 'A remote function has no `event` argument. `getRequestEvent()` from `$app/server` reaches the request it is running inside — `locals`, `cookies`, `url` — which is what lets `requireArtist()` be a plain function any remote function calls. `error(401, …)` is typed as `never`, so the return after it is unreachable and the return type is `Artist`, not `Artist | undefined`.'
			},
			code('src/app.d.ts', 5, 15),
			code('src/lib/server/artist.ts', 29, 73),
			{
				type: 'p',
				text: 'Claiming a handle is three cases: it is already yours, it is somebody else’s (a 409 that the form turns into a message under the field, ch. 24), or it is free. The cookie is `httpOnly` so a script on the page cannot read it, `sameSite: "lax"` so a link from elsewhere still arrives signed in, and `secure` whenever the app is served over HTTPS — which `event.url.protocol` knows and a constant would have to guess.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what an attacker who reads the cookie learns, and what they cannot do with it.',
					'You can explain why `HandleSchema` is in `src/lib` and not `src/lib/server`.',
					'You can call `requireArtist()` from a new remote function and say what happens for a browser with no cookie.'
				]
			}
		]
	},

	{
		slug: 'reads',
		title: 'Reads: query, batch and prerender',
		summary:
			'The store returns `Published` records with real patterns inside; the `.remote.ts` file turns them into `query`, `query.batch` for thirty cards in one request, and `prerender` for the featured strip computed at build time.',
		goal: 'Write a remote query with a valibot argument, know when `query.batch` turns N requests into one, and know what `prerender` leaves out of the server bundle.',
		blocks: [
			{
				type: 'p',
				text: 'Two files. `src/lib/server/patterns.ts` talks to the table and returns the shape the app uses — a `Published` record with a real `Pattern` in it, not a row with a JSON string. `src/lib/remote/patterns.remote.ts` exposes those to the browser, one function at a time, each with its argument validated on the way in.'
			},
			code('src/lib/server/patterns.ts', 17, 47),
			code('src/lib/server/patterns.ts', 58, 76),
			{
				type: 'p',
				text: '`withArtist` is a `with:` clause reused by every read, so a pattern always arrives with its artist’s id and handle and nothing else about them. `resolveVanity` is one join — handle plus slug to id — and is what the `reroute` hook asks (ch. 26).'
			},
			{ type: 'h3', id: 'the-remote-file', text: 'The remote file' },
			code('src/lib/remote/patterns.remote.ts', 1, 14),
			code('src/lib/remote/patterns.remote.ts', 30, 48),
			{
				type: 'p',
				text: '`query(schema, fn)`: the schema is valibot — SvelteKit accepts anything that implements Standard Schema — and the argument the function receives is the schema’s *output* type. `getPattern` throws a 404 with `error()`, so the page that calls it does not have to. `getMine` takes no argument and reads the cookie through `currentArtist()`.'
			},
			{ type: 'h3', id: 'batch', text: 'Thirty cards, one request' },
			code('src/lib/remote/patterns.remote.ts', 50, 62),
			{
				type: 'why',
				title: 'Why `query.batch`',
				text: 'A gallery page renders thirty cards and each one calls `getCounts(id)`. Without batching that is thirty requests. `query.batch` tells SvelteKit to collect every argument used during one render, call the function *once* with all of them, and hand each caller its own answer through the lookup the function returns. The store’s `countsFor` is one `WHERE id IN (...)` query. Nothing in the cards changes — they still call `getCounts(id)` — which is the whole point.'
			},
			code('src/lib/server/patterns.ts', 111, 121),
			{ type: 'h3', id: 'prerender', text: 'Computed at build time' },
			code('src/lib/remote/patterns.remote.ts', 64, 76),
			{
				type: 'p',
				text: 'The featured strip on the landing page changes when the app is deployed and not before. `prerender` runs the function during the build and writes the result as a static file; the landing page, itself prerendered, reads that file. With no argument there is one possible call, so `dynamic: true` is absent and the function is left out of the server bundle entirely.'
			},
			code('src/lib/server/patterns.ts', 78, 100),
			{
				type: 'checkpoint',
				items: [
					'You can say what type the argument of `getPatterns` has, and where that type came from.',
					'You can explain what changes for the caller when a query becomes a `query.batch` — and what does not.',
					'You can say when a prerendered remote function is re-run.'
				]
			}
		]
	},

	{
		slug: 'writes',
		title: 'Writes: command and form',
		summary:
			'Commands with single-flight refreshes, a publish form that works with JavaScript off, `invalid(issue.handle(...))` for a 409 under the right field, two submit buttons, a redirect from a form handler, a per-card delete form with `remove.for(id)`, and what the browser is handed when a write is refused.',
		goal: 'Choose between `command` and `form`, refresh exactly the queries a write changed in the same response, and turn a server error into a field message.',
		blocks: [
			{
				type: 'p',
				text: 'Two kinds of write. A `command` is a function the browser calls from JavaScript — a play was heard, a heart was pressed. A `form` is a `<form>`: it posts, it works with JavaScript off, and with `enhance` it is taken over without a reload. Publishing is a form because it is the one write that should survive a broken script.'
			},
			{ type: 'h3', id: 'commands', text: 'Commands, and what they refresh' },
			code('src/lib/remote/patterns.remote.ts', 82, 100),
			{
				type: 'p',
				text: '`requested(getCounts, 8).refreshAll()` is the server half of an optimistic update. The browser called `recordPlay(id).updates(getCounts(id).withOverride(...))` — bump the number on screen now, and *name* the query it wants refreshed. `requested` refreshes exactly the instances the client named, up to eight, and the real counts come back in the same response as the command’s result. One round trip, no stale number. And in SvelteKit 3 it is not optional: a refresh the client asked for and the server did not answer fails that query on the *client*, once the response is back, with a 400 `HttpError`, “Requested update was not handled by the remote function”. The server did nothing wrong by its own lights; the browser notices that the key it asked for is missing from the answer. So every command or form that a caller drives with `.updates(…)` either refreshes what was named — `requested(…).refreshAll()` here, `getMine().refresh()` in `remove` — or says `ignore()` on purpose.'
			},
			{
				type: 'note',
				text: '`void getPattern(id).refresh()` is the other kind of refresh: server-driven. This handler *knows* `getPattern(id)` changed, so it says so, and any browser with that query open gets the new value in the response — whether or not it asked. The two compose: the client names what it is showing, the server names what it changed.'
			},
			code('src/lib/server/patterns.ts', 173, 194),
			{ type: 'h3', id: 'the-form', text: 'The publish form' },
			code('src/lib/remote/patterns.remote.ts', 102, 162),
			{
				type: 'p',
				text: 'The schema *is* the form: `publish.fields.handle` and the rest in the studio (ch. 20) are typed from it. The pattern travels as one hidden field of JSON named `_pattern`. The underscore is SvelteKit’s convention for a value that must not be echoed back into the page after a failed non-JS submission — designed for passwords, and just as useful for two kilobytes the studio already holds.'
			},
			{
				type: 'why',
				title: 'Why `invalid(issue.handle(...))`',
				text: '`claimHandle` says “taken” with a 409, which on a page would be an error page. On a form it should be a message under the handle field. `issue.handle(message)` builds that issue, and `invalid(...)` throws it so that the form re-renders with the message in `publish.fields.handle.issues()` — and, with JavaScript off, with the other fields still filled in. A plain `invalid("...")` with no field is a form-level issue, shown by `allIssues()`; the unreadable-pattern case uses that, because no field a person typed is at fault.'
			},
			{
				type: 'p',
				text: 'Two submit buttons share the form and `action` says which was pressed. For “open”, the handler throws `redirect(303, resolve("/(app)/p/[id]", { id }))` and the enhanced submission follows it to the new pattern’s page; for “stay”, it returns the vanity address and the panel shows it. A redirect from a remote `form` handler is a remote-functions feature and worked before SvelteKit 3 — the 3.0 release note about enhanced forms that navigate is about `use:enhance` form *actions* whose `action` points at another page, which this project does not have. The address is `resolve()`d rather than written as a string for the same reason as every link (ch. 27): the route id is checked at build time.'
			},
			code('src/lib/server/patterns.ts', 123, 171),
			{
				type: 'p',
				text: 'The slug loop: `boom-bap`, then `boom-bap-2`. Two publishes of the same title in quick succession could both pass the check and meet the unique index (ch. 21); the `catch` retries with the next number rather than surfacing a 500 for something that is not the person’s fault.'
			},
			code('src/lib/remote/patterns.remote.ts', 164, 175),
			{
				type: 'p',
				text: 'Deleting is a form too, rendered once per card as `{...remove.for(id)}` in the gallery (ch. 30), so each card has its own pending state. `requireArtist()` is the authorisation, and the store’s `WHERE id = ? AND artist_id = ?` is the check that a person deletes only their own.'
			},
			{ type: 'h3', id: 'the-handle-forms', text: 'Choosing and forgetting a handle' },
			code('src/lib/remote/artist.remote.ts', 16, 48),
			{
				type: 'p',
				text: 'Both set a cookie, so both are forms. `becomeArtist` refreshes `whoAmI()` — the query the header reads — so the name appears at the top of the page without a reload. And when the form was submitted from a jam room, it calls `watchRoom(room).reconnect()`: the room’s live stream read the cookie when it opened and still thinks this browser is “someone”; `reconnect` ends that stream and starts a fresh one, carried back in the same response, and the new one reads the new cookie. The documented case for `reconnect` is exactly a mutation that changes something a live query depends on.'
			},
			{ type: 'h3', id: 'refused', text: 'When a write is refused, in the browser' },
			{
				type: 'p',
				text: 'Everything above is the server’s half: `error(404, "Not yours, or not there")`, a 409 turned into a field message. The browser’s half is a `catch`. When a command or an enhanced form submission is refused outright, the promise the page awaited rejects — and what it rejects *with* decides whether the person reads the server’s sentence or a guess.'
			},
			code('src/lib/errors.ts', 1, 37),
			{
				type: 'why',
				title: 'Why a helper for one line',
				text: 'Because the obvious line is wrong twice over. The rejection is SvelteKit’s `HttpError`, `{ status, body }`, where `body` is the `App.Error` that `handleError` produced — so the server’s words are `body.message`. It is not an `Error`, so `(e as Error).message` is `undefined`: the jam room (ch. 31) showed an empty toast for every refused edit. And a `catch` that ignores the value and prints its own sentence throws away the one thing the server took the trouble to say — which is what the gallery’s “Could not delete that” and the studio’s “Publishing failed” did, before both became the fallback rather than the message. `isHttpError` tells a refusal from a request that never arrived, which is the only case that gets the caller’s fallback. A `failed` snippet is the opposite case and must *not* call this: a boundary is handed the `App.Error` itself, and `error.message` is already the sentence (ch. 30, 31). One more field is worth carrying: an unexpected failure has the `id` that `handleError` logged it under (ch. 26). The error page prints it as a reference; a toast is all somebody sees when a command fails, so `messageOf` puts it in brackets after the sentence — “Something went wrong on our side. (ref 3f1c…)” — and the person has something to quote. `errors.spec.ts` pins all three cases.'
			},
			{
				type: 'note',
				text: 'The server side of this project already read the right field. `isHttpError(e) && e.status === 409` and `e.body.message` in `publish` and `becomeArtist` are inside remote functions, where `claimHandle` throws the `HttpError` that `error(409, …)` makes. Only the browser’s reads were wrong, and only a browser showed it: a probe that made each remote function throw, and recorded what every `catch` and `failed` snippet was handed.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why publishing is a form and loving is a command.',
					'You can explain the difference between `requested(...).refreshAll()` and `getPattern(id).refresh()`.',
					'You can turn a thrown HTTP error into a message under a specific field.',
					'You can say what a `catch` around `await lovePattern(id)` is handed, and where its message is.'
				]
			}
		]
	},

	{
		slug: 'live-jam',
		title: 'A live query: the jam room',
		summary:
			'One pattern many browsers edit. An in-memory broadcaster, `query.live` as an async generator with `finally` for leaving, a one-value mailbox so slow browsers get the latest, and commands that refresh nothing because the stream already did.',
		goal: 'Write a `query.live`, understand why its body is a generator and what `finally` is for, and know the honest limit of an in-process broadcaster.',
		blocks: [
			{
				type: 'p',
				text: 'A jam room is one pattern that several browsers edit at once. The database row is the truth; the broadcaster is how everybody hears that the truth changed. Each write notifies every open stream for that room, and each stream yields the new snapshot to its browser.'
			},
			code('src/lib/server/rooms.ts', 1, 17),
			{
				type: 'warn',
				text: 'Subscribers live in a `Map` in this module, which means *one process*. Two instances of the server would each know only their own listeners, and a step toggled on one would not be heard on the other. The fix is a shared channel — Postgres `NOTIFY`, a Redis stream — and the file says so, because a deployment discovering it is worse than a comment.'
			},
			code('src/lib/server/rooms.ts', 29, 53),
			code('src/lib/server/rooms.ts', 69, 112),
			{
				type: 'p',
				text: '`updateRoom` takes a *mutation*: a function that edits a freshly parsed copy of the pattern. The result is validated with the model’s `PatternSchema` before it is written, so a command that sets a step to velocity 900 is refused here — not stored and then refused by every browser that reads it. `version` goes up by one per write; a browser can tell “changed” from “same” without comparing two kilobytes of JSON.'
			},
			code('src/lib/server/rooms.ts', 114, 143),
			{
				type: 'p',
				text: 'Joining registers a listener *and who it belongs to*. Both joining and leaving re-broadcast, because “who is here” is part of the snapshot and it just changed. An anonymous browser is “someone” with a random id — present, but nameless until it chooses a handle.'
			},
			{ type: 'h3', id: 'query-live', text: '`query.live`' },
			code('src/lib/remote/rooms.remote.ts', 1, 16),
			code('src/lib/remote/rooms.remote.ts', 60, 90),
			{
				type: 'why',
				title: 'Why a generator',
				text: 'A `query` returns once. A `query.live` is an async *generator*: it `yield`s every time there is something new, and SvelteKit streams each value — over server-sent events — to every browser that has the query open. When the last browser closes it, SvelteKit stops iterating the generator, which runs the `finally`, which calls `leave()`. There is no connection to manage, no `close` handler to forget. A live query awaited during server rendering runs for its first value only — but the jam page awaits this one inside a boundary with a `pending` snippet, and the server renders only that snippet, so here the stream is always opened by the browser after hydration. That is why `getRoomName` exists beside it: the page’s `load` awaits it (ch. 31), so the one thing the server must know before it sends a status — whether the room exists — is asked by a plain `query`, and `/jam/nowhere` is a real 404.'
			},
			code('src/lib/remote/rooms.remote.ts', 26, 58),
			{
				type: 'p',
				text: 'The mailbox holds *one* value. Live streams are not event logs: if the room changes three times while a slow browser is still receiving the first, it should get the latest, not a backlog. A push while nobody is waiting replaces what was there; a `next()` while nothing is there waits. Twenty lines, and it is the difference between a room that keeps up and one that falls further behind with every edit.'
			},
			{ type: 'h3', id: 'the-commands', text: 'Commands that refresh nothing' },
			code('src/lib/remote/rooms.remote.ts', 96, 116),
			{
				type: 'p',
				text: '`step: StepSchema` contains `v.instance(Note)` — the argument arrives through the `transport` hook (ch. 26) and is a real `Note` by the time it is validated. And the command refreshes nothing, on purpose: `updateRoom` broadcasts, the live query yields the new snapshot to every browser including this one, and the grid redraws from that. A refresh here would be a second copy of the same news.'
			},
			code('src/lib/remote/rooms.remote.ts', 154, 165),
			{
				type: 'checkpoint',
				items: [
					'You can say what runs when the last browser leaves a room, and how SvelteKit causes it.',
					'You can explain what would go wrong if the mailbox were a queue.',
					'You can say why `setRoomStep` does not call `watchRoom(room).refresh()`.'
				]
			}
		]
	},

	{
		slug: 'hooks',
		title: 'Hooks: around every request',
		summary:
			'`handle` as a sequence — identity, then security with a font preload filter; `handleFetch`, and why the catch-all needs nothing special from it; `handleError` by `kind`; `init`; and the two universal hooks, `transport` and `reroute`.',
		goal: 'Know which hook runs when, why hook types come from `@sveltejs/kit/hooks` in SvelteKit 3, how `transport` lets a class cross the wire, and what `reroute` can and cannot change.',
		blocks: [
			{
				type: 'p',
				text: 'Hooks are the code that runs around every request. The server ones are in `src/hooks.server.ts`; the two that the browser also needs — what a `Note` looks like on the wire, and what `/@handle/slug` means — are in `src/hooks.ts`, which runs on both sides.'
			},
			code('src/hooks.server.ts', 1, 32),
			{
				type: 'warn',
				text: 'The hook *types* come from `@sveltejs/kit/hooks` in SvelteKit 3; `@sveltejs/kit` no longer exports `Handle` at all. The comment above is about the build: Vite strips a type-only import without checking it, so with the old import the dev server and `vite build` carry on and every destructured argument is `any`. TypeScript does notice — `svelte-check` reports `Module \'"@sveltejs/kit"\' has no exported member \'Handle\'` — which is one more reason the `check` script is the first step of `verify` (ch. 39).'
			},
			{ type: 'h3', id: 'identity-and-security', text: 'Identity, then security' },
			code('src/hooks.server.ts', 34, 44),
			{
				type: 'p',
				text: 'The cookie is read once per request into `locals.artist`, and that is all. It used to tag the request’s root span with the handle too, so that the diagnostics page could answer “what did @someone do”. But that page is public (ch. 32) — the app has no operators to check for — and a handle beside every path somebody visited is a record of what they did, published. What goes into a span is decided by who can read the spans.'
			},
			code('src/hooks.server.ts', 46, 90),
			{
				type: 'p',
				text: 'SvelteKit preloads scripts and styles by default and never fonts. In SvelteKit 3 a `font` input to the `preload` filter carries its source `filename` — the project-relative path before hashing — so the hook can name the two latin subsets the first paint needs, rather than guessing at a hashed URL. The three security headers come from `SECURITY_HEADERS` in `lib/security.ts`, the same object the adapter is given for the files it serves without running this hook (ch. 36). `Vary: Cookie` goes on pages because the header shows the handle; the API and the remote functions set their own cache headers and are left alone.'
			},
			{ type: 'h3', id: 'handle-fetch', text: '`handleFetch`, and the catch-all that has no routes' },
			code('src/hooks.server.ts', 92, 131),
			{
				type: 'why',
				title: 'Why same-origin calls are passed straight on, even from the catch-all',
				text: 'A same-origin `fetch` from a `load` or a hook is normally answered in-process: SvelteKit calls its own `respond` and no socket is involved. The adapter’s catch-all function (ch. 34) looks like the exception — it has no routes, so “answer it yourself” sounds like a 404, and the `reroute` hook asking `/api/resolve` what `/@handle/slug` means would never find out. It is not, because SvelteKit already handles it. A sub-request that matches no route in the server it reached is sent out as a real HTTP request: `respond.js` says “we can’t load the endpoint from our own manifest, so we need to make an actual HTTP request”, and calls the global `fetch`. That request arrives at this process like any other and is answered by the `api` function. An earlier version of this hook switched to `globalThis.fetch` itself when `event.platform.entry` said `router`; the adapter reported the catch-all as `pages`, so the branch never ran, and the vanity-address test passed without it all along. It is gone, and the end-to-end test is the proof that nothing is needed here.'
			},
			{
				type: 'note',
				text: 'The `event.tracing?.current?.addEvent(...)` has two optional chains, and both earned their place: during `reroute` no route is known yet and there is no current span. Without the `?.`, every vanity address was a 500. Found by the end-to-end suite, which is why it has a vanity-address test.'
			},
			{ type: 'h3', id: 'errors-and-init', text: 'Errors by kind, and `init`' },
			code('src/hooks.server.ts', 133, 167),
			{
				type: 'p',
				text: 'SvelteKit 3 folded the old `handleValidationError` hook into `handleError`: a remote function argument that failed its schema arrives with `kind: "validation"` and its `issues`. In the app’s own code that cannot happen — the types would not compile — so it is either an old tab on a new deployment or somebody prodding the endpoints, and neither deserves detail. Only `unknown` errors get a correlation id.'
			},
			code('src/hooks.server.ts', 169, 184),
			{
				type: 'p',
				text: '`init` runs once before the first request. Reaching the database here turns “the deploy is broken” into a process that never claims to be healthy — which is what a load balancer needs in order to keep the old version serving. `building` guards it, because the prerender step runs the server too and must not need a database.'
			},
			{ type: 'h3', id: 'transport', text: '`transport`: a class crosses the wire' },
			code('src/hooks.ts', 16, 39),
			{
				type: 'p',
				text: 'SvelteKit serialises what crosses the boundary with devalue, which knows about `Map`, `Set`, `Date` and typed arrays and nothing about `Note`. A transporter teaches it: `encode` returns a plain value for an instance and something falsy for anything else — that is how devalue asks “is this yours?” — and `decode` builds the instance back. A pattern from `getPattern` arrives with real `Note`s; a `Note` inside a command argument makes the same trip the other way, which is what lets the jam room accept a `Step` exactly as the grid holds it.'
			},
			{ type: 'h3', id: 'reroute', text: '`reroute`: an address that is not a route' },
			code('src/hooks.ts', 41, 76),
			{
				type: 'p',
				text: '`/@handle/slug` is not a route. `reroute` asks the server which pattern it names and returns `/p/<id>`; SvelteKit renders that route with the vanity address still in the bar. It is `async` and uses the `fetch` it is given — in-process on the server, a real request in the browser — and the result is cached per URL, so a shared link costs one lookup per session. The early `return` for every other path is the important line: a hook that fetched on every navigation would make every navigation slow. The answer is parsed with a valibot schema rather than cast: `safeParse`, because a reply of the wrong shape should be the same as no answer — a 404 — and not a 500 from a hook every vanity address passes through.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can list the hooks in the order they run for one page request.',
					'You can add a second class to `transport` and say what `encode` must return for a value that is not one.',
					'You can explain why `reroute` returns early for most paths and what the cache does for the rest.'
				]
			}
		]
	}
];
