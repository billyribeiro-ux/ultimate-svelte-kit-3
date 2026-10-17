/**
 * PART 5 — The server
 * (chapters 24–29)
 *
 * The schema and its migrations, a signed cookie, passkeys, the remote
 * functions for sheets, live collaboration over a live query, and the hooks
 * that wrap every request.
 */

import { code } from './quote.js';

export const part5 = [
	{
		slug: 'the-schema',
		title: 'The schema, and migrations instead of push',
		summary:
			'Five tables. A sheet is one JSON document with a version number; passkeys are public keys in `credentials`; one-time `challenges` expire. Migrations are files in `drizzle/`, applied by a script the Dockerfile runs before the server listens.',
		goal: 'Design a small schema on purpose, and know the difference between `drizzle-kit push` and a migration.',
		blocks: [
			code('src/lib/server/db/schema.ts', 1, 27),
			{
				type: 'p',
				text: 'The comment gives the two reasons the schema is small: a sheet is read and written whole, so a table of cells would be a row per cell for no query anybody runs; and there is no password column anywhere. Timestamps are integers because SQLite has no date type.'
			},
			code('src/lib/server/db/schema.ts', 29, 70),
			{
				type: 'p',
				text: 'A credential is the public half of a passkey plus the bookkeeping that makes it safe: a signature `counter` for detecting a cloned key, the `transports` the browser can use to find it, and a `label` the person chose. A challenge is a random value with an expiry, because a challenge that can be replayed is not a challenge.'
			},
			code('src/lib/server/db/schema.ts', 72, 127),
			{
				type: 'p',
				text: 'A sheet has `access` — private, or anybody signed in who has the link — a `version` that goes up by one per write, so a stale write can be refused, and a `published` copy frozen at `publishedAt`. The `ops` table is the log the live query replays to a browser that joins late: each row is one batch, with the version it produced and the tab that sent it, which is what lets a browser that reconnects skip what it already has (ch. 28).'
			},
			code('src/lib/server/db/index.ts', 1, 25),
			{
				type: 'p',
				text: 'One client for the process, in WAL mode with a busy timeout: a shared sheet is many readers and one writer at a time, and the timeout makes a second writer wait a few milliseconds instead of failing at once.'
			},

			{ type: 'h3', id: 'migrations', text: 'Migrations' },
			code('scripts/migrate.ts', 1, 45),
			{
				type: 'why',
				title: 'Why the production database is migrated and the development one is pushed',
				text: '`drizzle-kit push` compares the schema with the database and alters it directly. That is right for a development database nobody minds losing. A production database holds somebody’s budget, and every change to it should be a file that was reviewed before it ran — which is what `drizzle-kit generate` writes into `drizzle/` and `migrate()` applies in order, keeping a table of what has been applied so running it twice is running it once. The end-to-end suite builds its database with the migrations too (`scripts/prepare-e2e-db.js`), so a schema change that was not turned into a migration fails there, before it fails in production.'
			},
			code('drizzle/0001_op_client.sql', 1, 1),
			{
				type: 'p',
				text: 'The project’s second migration, whole. Chapter 28 needed the op log to say which tab sent each batch; the column went into `schema.ts`, `drizzle-kit generate --name op_client` wrote this file and its snapshot, and every database that runs `migrate()` gets it once — the development one, the end-to-end one, and a production one at its next start. Rows written before it have no tab, and the column is nullable to say so honestly rather than inventing one.'
			},
			code('scripts/prepare-e2e-db.js', 1, 31),
			code('scripts/seed.ts', 1, 39),
			{
				type: 'p',
				text: 'The seed creates a house account and one published sheet per template, with fixed ids, so `/s/seedbudget` exists on every machine and the tests can open it. It is idempotent: a row that already exists is left alone.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why there is no `cells` table.',
					'You can explain what `counter` on a credential detects.',
					'You can say which command each of `db:push`, `db:generate` and `scripts/migrate.ts` runs and when.'
				]
			}
		]
	},

	{
		slug: 'identity',
		title: 'Identity: a signed cookie',
		summary:
			'“This browser is user X”, signed with HMAC so it cannot be changed, verified on every request by the `handle` hook, and read by remote functions through `getRequestEvent`. Pure functions over strings, tested without a request.',
		goal: 'Sign and verify a session token with `crypto.subtle`, and know why every failure is one `null`.',
		blocks: [
			code('src/lib/server/identity.ts', 1, 37),
			{
				type: 'p',
				text: 'Signed, not encrypted: the contents — an id and a name — are not secret; nobody can *change* them, because the HMAC would no longer match. `iat` is issued-at, so a session can be retired by age without a database lookup.'
			},
			code('src/lib/server/identity.ts', 39, 75),
			code('src/lib/server/identity.ts', 77, 119),
			{
				type: 'why',
				title: 'Why verify returns one null for every failure',
				text: 'A missing dot, a bad signature, a payload that is not a user, a session too old — all `null`. A caller that could distinguish “tampered” from “expired” is a caller that will one day treat one of them as trusted. The tests in `identity.spec.ts` forge a payload with the real signature, sign with another secret, and age a token past thirty days, and expect `null` each time.'
			},
			code('src/lib/server/identity.spec.ts', 7, 32),
			code('src/lib/server/session.ts', 1, 49),
			{
				type: 'p',
				text: 'A remote function has no `event` argument, but it runs inside a request, and `getRequestEvent()` reaches it. `requireUser` is the 401 that no caller has to write. The cookie is `httpOnly`, `sameSite: \'lax\'` so a link from elsewhere still arrives signed in, and `secure` whenever the app is served over HTTPS — which `event.url.protocol` knows and a constant would have to guess.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what is in the cookie and what stops a person editing it.',
					'You can explain how `currentUser()` works without an `event` parameter.',
					'You can say why `secure` is computed rather than hard-coded.'
				]
			}
		]
	},

	{
		slug: 'passkeys',
		title: 'Passkeys: signing in without a password',
		summary:
			'A key pair: the private half stays in the device, the public half lives in `credentials`. Two remote calls per ceremony — begin and finish — with single-use challenges that expire, a counter that detects a cloned key, and the origin checked against `PUBLIC_ORIGIN`.',
		goal: 'Implement WebAuthn registration and authentication with the bookkeeping most relying parties get wrong, and describe the browser’s answer with a schema that matches the library’s types.',
		blocks: [
			code('src/lib/server/passkeys.ts', 1, 43),
			{
				type: 'p',
				text: 'The verification is `@simplewebauthn/server`; what this file adds is the bookkeeping every relying party has to do. The relying-party id is the *hostname* of `PUBLIC_ORIGIN` — no scheme, no port — which is why that variable is `static` and baked in at build time: a passkey registered for one hostname must not be asserted against another.'
			},
			code('src/lib/server/passkeys.ts', 45, 74),
			{
				type: 'p',
				text: 'A challenge is stored with a five-minute expiry and *consumed* when taken: deleted on the way out, so it cannot be used twice. Expired ones are swept whenever a new one is stored.'
			},

			{ type: 'h3', id: 'registration', text: 'Registration' },
			code('src/lib/server/passkeys.ts', 80, 117),
			{
				type: 'p',
				text: 'For a new person, a user id is minted now and travels through the challenge row; it becomes a row in `users` only when the ceremony finishes, so an abandoned sign-up leaves nothing behind. For an existing person adding a second passkey, their current credentials are *excluded* so the same key is not registered twice — the end-to-end suite checks that the same virtual device is refused with exactly that error.'
			},
			code('src/lib/server/passkeys.ts', 119, 164),
			{
				type: 'p',
				text: '`expectedOrigin` and `expectedRPID` come from the configuration, never from the request; a request that claims another origin is the attack. `requireUserVerification` is false because a hardware key with no PIN is still a passkey.'
			},

			{ type: 'h3', id: 'authentication', text: 'Authentication' },
			code('src/lib/server/passkeys.ts', 170, 236),
			{
				type: 'why',
				title: 'Why there is no username field',
				text: 'The passkey is *discoverable*: `beginAuthentication` sends no `allowCredentials`, so the browser shows the person their accounts for this site and nobody types a name first. The counter check after verification is the cloned-key defence: a response with a counter at or below the stored one came from a copy, the library refuses it, and the new value is stored so the next copy is caught too.'
			},

			{ type: 'h3', id: 'the-wire', text: 'The wire: a schema that matches the library’s types' },
			code('src/lib/remote/auth.remote.ts', 37, 65),
			{
				type: 'p',
				text: 'The browser’s answer arrives as JSON, and a remote command validates its argument with valibot. The schema names every field the library reads — base64url strings, the two attachment kinds, the extension outputs — and `v.object` drops anything else a client sends. The output type is assignable to the library’s `RegistrationResponseJSON`, and the library’s type from the browser package is assignable to the schema’s input, so both directions are checked by the compiler with no casts. The first draft used `looseObject` and needed two `as unknown as` casts; that was the sign the schema was wrong, not the types.'
			},
			code('src/lib/remote/auth.remote.ts', 67, 81),
			code('src/lib/auth/passkey.ts', 1, 28),
			code('src/lib/auth/passkey.ts', 41, 73),
			{
				type: 'p',
				text: 'The browser’s half: ask for options, hand them to `startRegistration` or `startAuthentication`, send the answer back. `explain` turns a failure from either half into a sentence a person can act on. The server’s half fails with SvelteKit’s `HttpError` — `finishAuthentication` refusing a passkey it has never seen — and its sentence is in `body.message`. The browser’s half throws an `Error` whose `name` says what happened: `NotAllowedError` is a cancelled prompt, `InvalidStateError` is “this device already has a passkey for that account”. The first version checked only for an `Error`, and an `HttpError` is not one, so every refusal from the server came out as “Something went wrong with the passkey.” Chapter 29 has the two shapes side by side.'
			},
			code('e2e/passkeys.ts', 1, 64),
			{
				type: 'p',
				text: 'How this is tested: Chromium’s DevTools protocol attaches a *virtual authenticator* — a software device that creates key pairs and signs challenges — and everything else is real. Chapter 37 has the tests.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what a challenge is for and why it is deleted when taken.',
					'You can explain what `excludeCredentials` prevents and what error the browser raises.',
					'You can say why the valibot schema is explicit rather than loose, and what the casts were telling you.'
				]
			}
		]
	},

	{
		slug: 'sheets-over-the-wire',
		title: 'Sheets over the wire: queries, forms, commands',
		summary:
			'Every read and write of a stored sheet as a remote function: `query` for reads, `form` for anything a page without JavaScript must still do, `command` for the rest. Access checks that answer 404 for “not yours”, a version check on save, and a cell limit.',
		goal: 'Choose between query, form and command for each operation, and refresh exactly the queries a write invalidates.',
		blocks: [
			code('src/lib/server/sheets.ts', 1, 17),
			code('src/lib/server/sheets.ts', 89, 113),
			{
				type: 'why',
				title: 'Why “it exists but not for you” is a 404',
				text: 'A sheet somebody else owns returns the same 404 as a sheet that does not exist. A 403 would confirm the id is real, and an id in a URL is never enough on its own. `requireOwned` does the same for the owner-only operations — rename, access, delete, publish — and `requireSheetRow` for the ones a link-holder may do.'
			},
			code('src/lib/server/sheets.ts', 136, 171),
			{
				type: 'p',
				text: '`saveDocument` is the autosave path when nobody else is on the sheet. `baseVersion` is what the browser last saw; if the row has moved on, somebody else saved first and this save is refused with a 409 rather than silently overwriting theirs. `CELL_LIMIT` — the environment variable from chapter 03 — keeps one paste from turning the database into a swap file.'
			},

			{ type: 'h3', id: 'the-remote-file', text: 'The remote file' },
			code('src/lib/remote/sheets.remote.ts', 1, 32),
			code('src/lib/remote/sheets.remote.ts', 34, 55),
			{
				type: 'p',
				text: '`create` is a form: it works with JavaScript off, and it *redirects* from inside the handler to the new sheet, which is what a form submission that made something should do. It accepts a template name or a whole document — the local sheet being saved to an account — and `invalid(issue._doc(…))` is how a handler reports a field-level problem the page can show beside the field.'
			},
			code('src/lib/remote/sheets.remote.ts', 57, 78),
			{
				type: 'p',
				text: 'Every write ends by refreshing the queries it invalidated: `getMine()` for the workspace list, `getSheet(id)` for the open page. `remove` uses `requested(getMine, 1).refreshAll()` — refresh the query *as the requesting page has it*, in the same response, which is what makes a delete feel instant with no JavaScript at all. On the page (ch. 34), `remove.for(id)` gives each card its own pending state.'
			},
			code('src/lib/remote/sheets.remote.ts', 80, 113),
			{
				type: 'p',
				text: 'Publishing is a command because it is a button with a result — the public address — and not a form because nothing about it needs to work without JavaScript. `getPublished` is a query anybody may call, because that is what published means, and the page that shows it ships no JavaScript at all (ch. 35).'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why `create` is a form and `publish` is a command.',
					'You can explain what `baseVersion` prevents and what the browser does with a 409.',
					'You can list which queries `rename` refreshes and why each.'
				]
			}
		]
	},

	{
		slug: 'live-collaboration',
		title: 'Live collaboration: a live query, a mailbox, and numbered operations',
		summary:
			'`watchSheet` is a `query.live`: an async generator that yields every time something happens on the sheet. Operations go the other way through a command, the server numbers them, and every tab applies the ones that are not its own echo.',
		goal: 'Build real-time collaboration on a live query with a broadcaster, a coalescing mailbox, and a clean exit when a browser goes away.',
		blocks: [
			code('src/lib/remote/live.remote.ts', 1, 22),
			code('src/lib/server/live.ts', 1, 54),
			code('src/lib/server/live.ts', 56, 99),
			{
				type: 'p',
				text: 'What travels is a *batch*: the operations one `send` carried, the version they produced, and the tab that sent them. A message is a list of batches, oldest first, plus who is in the room. The broadcaster is a `Map` of rooms, each a `Map` from listener to presence. `join` returns a leave function; `broadcast` sends one batch — or, given `null`, only the presence — to every listener; a cursor move updates one presence and broadcasts no batch at all. In-process, which is right for one server and would need a shared channel for two — the header says so.'
			},

			{ type: 'h3', id: 'the-mailbox', text: 'The mailbox' },
			code('src/lib/remote/live.remote.ts', 24, 77),
			{
				type: 'why',
				title: 'Why the mailbox coalesces, and why it can be closed',
				text: 'Live streams are not event logs. If the sheet changes three times while a slow browser is still receiving the first message, it should get all three *batches*, in one message — so a push while nobody is waiting is appended to what is there. And `close()` exists because an async generator suspended on an `await` cannot be interrupted from outside: `return()` queues behind the pending promise, so a browser that closed its tab would keep its seat in the room until the next message happened to arrive. The end-to-end test that asserts Bob’s chip disappears when Bob leaves is the test that found this.'
			},
			code('src/lib/remote/live.remote.ts', 79, 123),
			{
				type: 'p',
				text: 'The generator: require a person who may open the sheet, join the room, and wire the request’s abort signal to the mailbox — the adapter fires it when the socket closes. Then catch up — every batch since the version the tab loaded — and loop on the mailbox until it is closed. The `finally` leaves the room, and it now runs promptly. Every id a tab sends is checked by one schema, `ClientSchema`, because it is now stored with each batch.'
			},
			code('src/lib/remote/live.remote.ts', 125, 144),
			{
				type: 'p',
				text: '`send` applies a batch of operations to the stored document in a transaction with the op log, gets back the new version, and broadcasts the batch with its version and the sender’s client id. The sender receives its own batch and skips it; everyone else applies it.'
			},
			code('src/lib/server/sheets.ts', 173, 220),

			{ type: 'h3', id: 'the-browser', text: 'The browser’s side' },
			code('src/lib/sheet/live.svelte.ts', 1, 78, { partial: true }),
			{
				type: 'p',
				text: '`status` is one value with four shapes, and only `refused` carries anything: the server’s own sentence. It is `$state.raw` because it is replaced, never changed inside — there is nothing in it for a deep proxy to watch — and the three plain shapes are single objects, so writing the state a tab is already in hands `$state.raw` the value it holds, which notifies nobody. The first version kept a `status` string and a separate `problem`, and nothing stopped the two disagreeing: the chip said “Saved” over a reason that no longer applied.'
			},
			code('src/lib/sheet/live.svelte.ts', 80, 137),
			{
				type: 'why',
				title: 'Why every batch carries its version, and the browser counts them',
				text: 'A browser can be handed the same batch twice, and there are three ways it happens. `since` is an argument of the live query, fixed when the page made it, so a reconnect after a dropped connection replays *every* batch since the page loaded. A new iterator — the page makes one after `reconnect()` — starts with the latest message, which the old loop may already have applied. And a batch committed between the room hearing about it and the catch-up being read is in both. Cells written twice come out the same; a row inserted twice is two rows, and every later edit lands one row out. The first version applied whatever arrived, and a probe that dropped the connection for half a second left the second tab showing a cell twice that the server held once. So each batch is taken in once, by version: anything at or below the version the page loaded is already in the sheet, and every later one is remembered in a set. A set, not a high-water mark, because two batches can arrive out of order and the earlier one must still be applied. The tab that sent a batch knows it by its client id — stored in the op log, so it survives the replay too — and skips it, because its own edits were applied as they were typed.'
			},
			code('src/lib/sheet/live.svelte.ts', 169, 220),
			{
				type: 'p',
				text: '`LiveSheet` hooks the sheet’s `onop`: every local operation is queued, batched for a hundred milliseconds, and sent — a hundred at a time. What happens when a send fails depends on whether the server answered. A 4xx is the server refusing *this batch* — “A sheet may hold at most 200,000 cells”, a sheet that has been deleted, a session that has ended — and sending it again would be refused again, so the tab moves to `refused` with the server’s sentence and stops sending. Anything else — no answer at all, or a 5xx — may work in a moment, so the operations go back on the queue and it tries again in two seconds. Nothing is thrown: every caller is a timer or a navigation hook that would only turn a refusal into an unhandled rejection, and the outcome is `status`, which the page renders.'
			},
			{
				type: 'why',
				title: 'Why a refused sheet stops for good',
				text: 'When the server turns a batch down, the tab holds edits the stored sheet does not. Every operation after that is built on a sheet the server never saw: send it, and it may be accepted — a deleted cell, say — and the chip goes back to “Saved” over a sheet whose import is gone. That is what the first version did, and it is the worst thing a sheet can do: say it saved what it lost. So `#enqueue` refuses to queue anything once the status is `refused`, the edit stays on screen, and the page says what happened and offers the only honest way back: a reload, which builds the sheet again from what the server kept.'
			},
			code('src/routes/(app)/sheet/[id]/+page.svelte', 32, 68),
			{
				type: 'p',
				text: 'On the page, `watchSheet(...)` returns the live query, and the room’s operations are applied by iterating it. A live query is async-iterable, and the SvelteKit docs offer that for “direct, imperative access to the underlying stream of values (rather than the reactive `current` property)”. The first version applied messages in an effect that read `current`, which holds only the latest message: it saw each one only if Svelte happened to run the effect before the next arrived. The iterator has a rule too — “if values arrive faster than the consumer drains the iterator, only the latest pending value is kept” — so `live.follow` never keeps it waiting: `receive` is synchronous, and the loop asks for the next message in the same turn as it was handed the last, before the connection can deliver another. One loop lasts as long as the stream. A dropped connection does not end it — SvelteKit reconnects behind the same iterator, and the loop waits — so the effect starts a loop whenever the query is not `done`, and only a stream the server ended or refused needs a new one, which `reconnect()` brings. Starting the loop is wrapped in `untrack`. Subscribing reads the query’s latest value, and an effect depends on whatever it reads while it runs: without `untrack`, every message re-ran the effect, which threw its loop away and subscribed again — the new loop starting, as a new iterator does, with the message the old one had just applied. The version check absorbed the duplicates; `untrack` stops them being made. `current` and `connected` stay, for the status chip. `beforeNavigate` flushes the queue before the page is left, and the last effect’s cleanup disposes the connection.'
			},
			code('e2e/collab.e2e.ts', 84, 126),
			{
				type: 'p',
				text: 'The test for the replay: two tabs, a cell and then a row inserted above it, and the connection taken away and given back with `setOffline`. Against the first version it fails before the connection even drops: the second tab never shows the inserted row, because the effect reading `current` met a later message first. With the loop in place and the version check taken out, it fails after the reconnect instead — “first” pushed down a second row, because the catch-up applied the insert again. The refused batch has its own test in chapter 37, which imports more cells than the end-to-end server allows.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what happens when three operations arrive while a browser is slow, and how many messages it gets.',
					'You can explain why `return()` on the generator was not enough and what the abort signal adds.',
					'You can trace one keystroke from `sheet.onop` to another tab’s `applyRemote`.',
					'You can name three ways a browser receives a batch it already has, and say what stops it applying one twice.',
					'You can say which failures put operations back on the queue and which stop the tab, and why a refused tab does not resume.'
				]
			}
		]
	},

	{
		slug: 'hooks',
		title: 'Hooks: identity, headers, one framed route, errors by kind',
		summary:
			'`sequence` of two handles, a `preload` filter that names font files by source `filename`, a per-route `frame-ancestors` swap, `handleFetch`, `handleError` that tells validation failures from real ones on the server and leaves a deliberate `error(…)` alone in the browser, `init`, the `transport` that carries an `ErrorValue` across the wire, and the two shapes of error a page has to read.',
		goal: 'Read every hook in the project and say what each is for — and what the September 2026 releases changed in them.',
		blocks: [
			code('src/hooks.server.ts', 1, 36),
			{
				type: 'p',
				text: 'The types come from `@sveltejs/kit/hooks`, where SvelteKit 3 moved every one of them. The old import from `@sveltejs/kit` is now a type error — TS2305, “Module \'"@sveltejs/kit"\' has no exported member \'Handle\'” — once for each name, followed by an implicit `any` for every argument those types used to describe, and `pnpm run check` fails on it. That was tried, in a copy of this project, rather than assumed. The one place an old import fails quietly is a hooks file written in JavaScript with JSDoc types and no `checkJs`, where nothing type-checks the file at all; in a strict TypeScript project like this one, it cannot slip through.'
			},
			code('src/hooks.server.ts', 38, 101),
			{
				type: 'p',
				text: 'Three things in the security handle. The `preload` filter preloads the two font files the first paint needs, by source filename — in SvelteKit 3 a `font` input carries its `filename`, so nothing has to guess at a hashed URL. The security headers. And the one route that may be framed: the config says `frame-ancestors \'none\'` for the whole app, and for `/embed/` the hook replaces it after SvelteKit has built the policy. The config is the rule; the hook is the exception, stated once.'
			},
			code('src/hooks.server.ts', 103, 118),
			code('src/hooks.server.ts', 120, 146),
			{
				type: 'why',
				title: 'Why handleError looks at kind',
				text: 'SvelteKit 3 tells `handleError` what kind of error it is holding: `app` for a deliberate `error(404, …)`, `framework` for its own, `validation` for a remote function argument that failed its schema, `unknown` for something genuinely broken. Only the last deserves a correlation id and a stack in the log; a validation failure logs the field path and answers with a plain message; the first two keep SvelteKit’s defaults. In SvelteKit 2 the hook never saw a deliberate `error(…)` at all and validation failures went to a separate `handleValidationError`; SvelteKit 3 sends every error here and `kind` says which is which.'
			},
			code('src/hooks.server.ts', 148, 157),
			{
				type: 'p',
				text: '`init` runs once, before the first request, and reaches the database. A deploy with a broken database becomes a process that never claims to be healthy — which is what a load balancer needs in order to keep the old version serving.'
			},

			{ type: 'h3', id: 'universal', text: 'The universal hooks' },
			code('src/hooks.ts', 1, 28),
			{
				type: 'p',
				text: 'SvelteKit serialises what crosses the boundary with devalue, which knows about `Map`, `Set` and `Date` and nothing about a class called `ErrorValue`. A transporter teaches it: `encode` returns a plain value for an instance (and something falsy for anything else, which is how devalue asks “is this yours?”), `decode` builds the instance back. A published sheet’s values arrive with real errors in them — `instanceof` works — rather than objects every consumer would have to rehydrate.'
			},
			code('src/hooks.client.ts', 1, 30),
			{
				type: 'p',
				text: 'The client hook looks at `kind` as the server’s does. An `error(404, \'No such template\')` thrown by a universal `load` while the browser is navigating arrives as `app`, and returning nothing keeps its status and message, so the error page says *No such template* and shows no reference — a 404 is not a bug. Only an `unknown` error, a component that threw, is logged and given one. In SvelteKit 2 the hook never saw an `error(…)` at all, so a hook that answered everything with “Something went wrong in this tab.” was harmless; SvelteKit 3 sends it every error, and the same five lines started hiding every deliberate message behind one sentence and putting a reference number on a missing page. The end-to-end suite now follows a link to a template that does not exist, and fails if that comes back.'
			},

			{ type: 'h3', id: 'two-shapes', text: 'Two shapes of error in the browser' },
			code('src/lib/errors.ts', 1, 45),
			{
				type: 'why',
				title: 'Why a catch block and a failed snippet read different fields',
				text: 'Await a remote function in a handler — `await publish(id)`, `await form.submit()`, `await getPublished(id)` outside the markup — and a refusal rejects with SvelteKit’s `HttpError`: `{ status, body }`, where `body` is the `App.Error` the server’s hook produced. The sentence is `body.message`. It is not an `Error`, so `(e as Error).message` is `undefined` — an empty toast — and `e instanceof Error ? e.message : \'Something went wrong\'` throws the server’s words away every time; this project had both. A boundary is the other shape. The SvelteKit docs say a `failed` snippet’s error “went through the `handleError` hook and is of type `App.Error`”: `{ status, message }`, read as `error.message`. Neither was taken on trust. In a built app, a query that threw `error(418, \'probe\')` reached a `failed` snippet as a plain `{ status: 418, message: \'probe\' }`, and a command that threw `error(409, …)` rejected its caller with an object whose own keys were `status` and `body`. In SvelteKit 2, sending render errors through `handleError` was an experimental option, `handleRenderingErrors`; in SvelteKit 3 it is how every boundary works, so the hook — not whatever was thrown — decides what a `failed` snippet shows. The module therefore has two functions, one per shape: `messageOf` for a `catch`, `failureOf` for a `failed` snippet, which Svelte hands an `unknown` and which reads the message after checking it is there, rather than with a cast that would compile whatever the shape.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `pnpm run check` reports if the hook types are imported from `@sveltejs/kit`, and the one kind of project where that mistake would go unnoticed.',
					'You can explain how `/embed/` gets a different `frame-ancestors` from everything else.',
					'You can list the four `kind`s and what each one gets from `handleError`, on the server and in the browser.',
					'You can say what a `catch` around a remote call receives, what a `failed` snippet receives, and where the server’s sentence is in each.'
				]
			}
		]
	}
];
