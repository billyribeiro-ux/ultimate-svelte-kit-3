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
			code('src/lib/server/db/schema.ts', 72, 121),
			{
				type: 'p',
				text: 'A sheet has `access` — private, or anybody signed in who has the link — a `version` that goes up by one per write, so a stale write can be refused, and a `published` copy frozen at `publishedAt`. The `ops` table is the log the live query replays to a browser that joins late.'
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
			code('scripts/prepare-e2e-db.js', 1, 30),
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
			code('src/lib/remote/auth.remote.ts', 67, 85),
			code('src/lib/auth/passkey.ts', 1, 27),
			code('src/lib/auth/passkey.ts', 40, 64),
			{
				type: 'p',
				text: 'The browser’s half: ask for options, hand them to `startRegistration` or `startAuthentication`, send the answer back. `explain` turns the credential API’s error names into sentences a person can act on — `NotAllowedError` is a cancelled prompt, `InvalidStateError` is “this device already has a passkey for that account”.'
			},
			code('e2e/passkeys.ts', 1, 44),
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
			code('src/lib/server/sheets.ts', 88, 112),
			{
				type: 'why',
				title: 'Why “it exists but not for you” is a 404',
				text: 'A sheet somebody else owns returns the same 404 as a sheet that does not exist. A 403 would confirm the id is real, and an id in a URL is never enough on its own. `requireOwned` does the same for the owner-only operations — rename, access, delete, publish — and `requireSheetRow` for the ones a link-holder may do.'
			},
			code('src/lib/server/sheets.ts', 135, 170),
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
			code('src/lib/server/live.ts', 1, 41),
			code('src/lib/server/live.ts', 43, 90),
			{
				type: 'p',
				text: 'The broadcaster is a `Map` of rooms, each a `Map` from listener to presence. `join` returns a leave function; `broadcast` sends a message to every listener with the current presence attached; a cursor move updates one presence and broadcasts an empty operation set. In-process, which is right for one server and would need a shared channel for two — the header says so.'
			},

			{ type: 'h3', id: 'the-mailbox', text: 'The mailbox' },
			code('src/lib/remote/live.remote.ts', 24, 82),
			{
				type: 'why',
				title: 'Why the mailbox coalesces, and why it can be closed',
				text: 'Live streams are not event logs. If the sheet changes three times while a slow browser is still receiving the first message, it should get all three *operations*, in one message — so a push while nobody is waiting is merged into what is there. And `close()` exists because an async generator suspended on an `await` cannot be interrupted from outside: `return()` queues behind the pending promise, so a browser that closed its tab would keep its seat in the room until the next message happened to arrive. The end-to-end test that asserts Bob’s chip disappears when Bob leaves is the test that found this.'
			},
			code('src/lib/remote/live.remote.ts', 84, 126),
			{
				type: 'p',
				text: 'The generator: require a person, join the room, and wire the request’s abort signal to the mailbox — the adapter fires it when the socket closes. Then catch up (every operation since the version the tab has), and loop on the mailbox until it is closed. The `finally` leaves the room, and it now runs promptly.'
			},
			code('src/lib/remote/live.remote.ts', 125, 147, { partial: true }),
			{
				type: 'p',
				text: '`send` applies a batch of operations to the stored document in a transaction with the op log, gets back the new version, and broadcasts the batch with the sender’s client id. The sender receives its own batch and ignores it; everyone else applies it.'
			},
			code('src/lib/server/sheets.ts', 172, 217),

			{ type: 'h3', id: 'the-browser', text: 'The browser’s side' },
			code('src/lib/sheet/live.svelte.ts', 1, 48, { partial: true }),
			code('src/lib/sheet/live.svelte.ts', 50, 58),
			code('src/lib/sheet/live.svelte.ts', 90, 128),
			{
				type: 'p',
				text: '`LiveSheet` hooks the sheet’s `onop`: every local operation is queued, batched for a hundred milliseconds, and sent — a hundred at a time. A 409, 413 or 404 is a conflict the page must show and a reload must fix; anything else is a network failure, the operations are put back, and it tries again in two seconds. `status` is the honest state of the connection, and the page shows it, because a sheet that silently stopped saving is worse than one that says so.'
			},
			code('src/routes/(app)/sheet/[id]/+page.svelte', 30, 53),
			{
				type: 'p',
				text: 'On the page, `watchSheet(...)` returns the live query. Its `current` is the latest message and is reactive, so an effect that reads it runs once per message — which is where the room’s operations are applied. `beforeNavigate` flushes the queue before the page is left, and the effect’s cleanup disposes the connection.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what happens when three operations arrive while a browser is slow, and how many messages it gets.',
					'You can explain why `return()` on the generator was not enough and what the abort signal adds.',
					'You can trace one keystroke from `sheet.onop` to another tab’s `applyRemote`.'
				]
			}
		]
	},

	{
		slug: 'hooks',
		title: 'Hooks: identity, headers, one framed route, errors by kind',
		summary:
			'`sequence` of two handles, a `preload` filter that names font files by source `filename`, a per-route `frame-ancestors` swap, `handleFetch`, `handleError` that tells validation failures from real ones, `init`, and the `transport` that carries an `ErrorValue` across the wire.',
		goal: 'Read every hook in the project and say what each is for — and what the September 2026 releases changed in them.',
		blocks: [
			code('src/hooks.server.ts', 1, 37),
			{
				type: 'p',
				text: 'The types come from `@sveltejs/kit/hooks`. Importing them from `@sveltejs/kit` compiles to `any` for every destructured argument — not an error, so the file keeps working and every parameter silently loses its type. The comment is there because it happened.'
			},
			code('src/hooks.server.ts', 39, 102),
			{
				type: 'p',
				text: 'Three things in the security handle. The `preload` filter preloads the two font files the first paint needs, by source filename — since 3.0.0-next.24 a `font` input carries its `filename`, so nothing has to guess at a hashed URL. The security headers. And the one route that may be framed: the config says `frame-ancestors \'none\'` for the whole app, and for `/embed/` the hook replaces it after SvelteKit has built the policy. The config is the rule; the hook is the exception, stated once.'
			},
			code('src/hooks.server.ts', 104, 119),
			code('src/hooks.server.ts', 121, 147),
			{
				type: 'why',
				title: 'Why handleError looks at kind',
				text: 'SvelteKit 3 tells `handleError` what kind of error it is holding: `app` for a deliberate `error(404, …)`, `framework` for its own, `validation` for a remote function argument that failed its schema, `unknown` for something genuinely broken. Only the last deserves a correlation id and a stack in the log; a validation failure logs the field path and answers with a plain message; the first two keep SvelteKit’s defaults. Before `kind`, every one of those was an `unknown` with a stack trace.'
			},
			code('src/hooks.server.ts', 149, 158),
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
			code('src/hooks.client.ts', 1, 20),
			{
				type: 'checkpoint',
				items: [
					'You can say what goes wrong if the hook types are imported from `@sveltejs/kit`.',
					'You can explain how `/embed/` gets a different `frame-ancestors` from everything else.',
					'You can list the four `kind`s and what each one gets from `handleError`.'
				]
			}
		]
	}
];
