/**
 * PART 4 — The web tier (chapters 23–28)
 *
 * Everything so far runs happily in a terminal. This part puts a SvelteKit 3
 * application in front of it, and spends most of its time on the four places
 * where Kit 3 is genuinely different from Kit 2 — and on one Svelte 5 trap that
 * only shows up during server rendering.
 */

export const part4 = [
	{
		slug: 'a-kit-3-app-from-nothing',
		title: 'A Kit 3 app from nothing',
		summary:
			'No svelte.config.js, no $lib, and a tsconfig that has to say which files are yours.',
		goal: 'Create the venue app and understand every line of its configuration.',
		blocks: [
			{
				type: 'p',
				text: 'We have a matching engine, a log, projections and a ledger. None of it has a screen. This part builds the SvelteKit 3 application that participants actually use, and it starts with configuration — not because configuration is interesting, but because Kit 3 moved four things and each one produces a confusing error if you carry a Kit 2 habit into it.'
			},
			{
				type: 'terminal',
				code: `
mkdir -p apps/web/src/{lib,routes}
cd apps/web`
			},
			{
				type: 'p',
				text: 'That is the whole scaffold. There is no `npx sv create` step in this course because typing the files out is how you find out what each one is for.'
			},

			{ type: 'h3', id: 'no-svelte-config', text: 'There is no svelte.config.js' },
			{
				type: 'p',
				text: 'In Kit 2, `svelte.config.js` held the adapter, the aliases, the CSRF setting and the compiler options, and `vite.config.js` held Vite\'s. Two files, one project, and a constant low-level question of which one a given setting lived in. Kit 3 deletes the first: **everything is an option on the `sveltekit()` Vite plugin.**'
			},
			{
				type: 'code',
				file: 'apps/web/vite.config.ts',
				lang: 'ts',
				code: `
import { defineConfig, loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';

/* … */
export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			sveltekit({
				// …
				paths: { origin: env['PUBLIC_ORIGIN'] ?? 'http://localhost:4173' },

				/* … */
				csrf: { trustedOrigins: ['*'] },

				compilerOptions: { runes: true, experimental: { async: true } },
				adapter: adapter(),
				experimental: { remoteFunctions: true }
			})
		],
		// The native libSQL binary cannot be bundled.
		ssr: { external: ['@libsql/client', 'libsql'] },
		server: { port: 5173 }
	};
});`
			},
			{
				type: 'p',
				text: 'Line by line, because every one of these is load-bearing:'
			},
			{
				type: 'ul',
				items: [
					'**`defineConfig(({ mode }) => …)`** — a *function*, not an object. `loadEnv` has to run before the plugin is constructed, because `paths.origin` needs a value out of `.env` and Vite has not read those yet when a plain object literal is evaluated. Write it as an object and `PUBLIC_ORIGIN` is `undefined` at exactly the moment it is needed.',
					'**`paths.origin`** — the origin the app believes it is served from. More on this in a moment; it is the single most surprising thing in the file.',
					'**`csrf.trustedOrigins`** — replaces Kit 2\'s `checkOrigin: false`. We set `[\'*\']` and write our own check, for reasons that get a whole chapter.',
					'**`compilerOptions.runes: true`** — no legacy mode. Every component is runes-only, so a stray `export let` is an error rather than a silent reactivity mismatch.',
					'**`compilerOptions.experimental.async: true`** — turns on `await` inside `$derived` and in component markup. The terminal is built on it.',
					'**`experimental.remoteFunctions: true`** — turns on `.remote.ts` files. Forget it and every import from one resolves to nothing, with an error that does not mention the flag.',
					'**`ssr.external`** — `@libsql/client` loads a native `.node` binary. Vite cannot bundle that, and the error if it tries is a module-not-found for a file that plainly exists.'
				]
			},
			{
				type: 'why',
				title: 'paths.origin is baked in at build time',
				text: 'This is not a runtime setting. `adapter-node` v6 reads `paths.origin` during `vite build` and compiles the value into the output. Change your domain and you must **rebuild**, not restart. And when the value is absent the adapter falls back to reconstructing the origin from the `Host` header, assuming `https` — so a plain-HTTP preview computes `https://localhost:4173`, which never matches the real `http://localhost:4173`, and every single POST returns 403 with no explanation beyond "Cross-site POST form submissions are forbidden".'
			},
			{
				type: 'note',
				text: 'If a deployed Kit 3 app suddenly rejects every form and you changed nothing but the hostname, `paths.origin` is the first place to look — and a restart will not fix it.'
			},

			{ type: 'h3', id: 'no-dollar-lib', text: 'There is no $lib either' },
			{
				type: 'p',
				text: '`$lib` is gone. Kit 3 uses **Node subpath imports** — a plain `package.json` feature that existed long before Kit and needs no bundler magic to understand.'
			},
			{
				type: 'code',
				file: 'apps/web/package.json',
				lang: 'json',
				code: `
{
	"name": "@sequent/web",
	…
	"type": "module",
	…
	"imports": {
		"#lib/*": "./src/lib/*"
	}
}`
			},
			{
				type: 'code',
				file: 'anywhere in src/',
				lang: 'ts',
				code: `
// Kit 2
import { db } from '$lib/server/db';

// Kit 3 — note the extension
import { db } from '#lib/server/db.ts';`
			},
			{
				type: 'p',
				text: 'Two things changed and both catch people. The prefix is `#` because that is the character Node reserved for internal imports, and **the file extension is required**. Not `.js` standing in for a TypeScript file — the actual `.ts`. Node\'s type stripping resolves what you wrote, so what you write has to exist.'
			},
			{
				type: 'why',
				title: 'Why this is better than an alias',
				text: 'A `$lib` alias only exists inside the bundler. Run a file under plain `node`, feed it to a test runner that does not share the config, or point an editor at it without the plugin loaded, and the import is unresolvable. `#lib/*` is resolved by Node itself, so a script, a test, an editor and the bundler all agree without being told anything.'
			},

			{ type: 'h3', id: 'tsconfig', text: 'The tsconfig has to say which files are yours' },
			{
				type: 'p',
				text: 'This one cost an afternoon. `svelte-kit sync` generates a base config and you extend it, exactly as in Kit 2. What changed is that the Kit 3 base deliberately sets **no `include` and no `exclude`.**'
			},
			{
				type: 'terminal',
				code: `
$ pnpm --filter @sequent/web check

...
build/server/chunks/index-BqK2v8.js:1:2847
  Error: Parameter 'e' implicitly has an 'any' type.
...
2952 errors`
			},
			{
				type: 'p',
				text: 'Two thousand nine hundred and fifty-two type errors, none of them in code anybody wrote. With no `include`, TypeScript falls back to "every file under this directory", so `svelte-check` walked into `build/` and type-checked the app\'s own minified production output. The fix is to say what you meant:'
			},
			{
				type: 'code',
				file: 'apps/web/tsconfig.json',
				lang: 'json',
				code: `
{
	// …
	"extends": "$app/tsconfig",

	/* … */
	"include": [
		"src/**/*.ts",
		"src/**/*.js",
		"src/**/*.svelte",
		"scripts/**/*.ts",
		"vite.config.ts",
		".svelte-kit/types/**/*.ts"
	],
	"exclude": ["build", "node_modules", ".svelte-kit/output", ".svelte-kit/adapter-node"],

	"compilerOptions": {
		"strict": true,
		// …
		"noUncheckedIndexedAccess": true,
		"noImplicitOverride": true,
		"noFallthroughCasesInSwitch": true,
		"sourceMap": true
	}
}`
			},
			{
				type: 'warn',
				text: '`.svelte-kit/types/**/*.ts` **must** be in `include`. That is where Kit writes the generated route types that `./$types` resolves to. Leave it out and every `PageServerLoad` import fails with a module-not-found for a file that is sitting right there on disk.'
			},
			{
				type: 'p',
				text: '`noUncheckedIndexedAccess` deserves a note. It makes `array[0]` have type `T | undefined`, which sounds pedantic until you remember what this application is. Half the code on a trading screen is "the best bid" — and on a book with nothing in it, the honest answer genuinely is "there isn\'t one". The flag stops us pretending otherwise.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain where Kit 3 configuration lives and why `defineConfig` takes a function',
					'You can explain what `paths.origin` does and why changing it needs a rebuild',
					'You can write a `#lib/*` import from memory, extension included',
					'You know why `include` and `exclude` are not optional in a Kit 3 tsconfig'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'environment-variables-declared',
		title: 'Environment variables, declared',
		summary:
			'src/env.ts replaces the four $env modules, and makes leaking a secret into the browser a type error.',
		goal: 'Declare every variable the app reads, with a valibot schema on each.',
		blocks: [
			{
				type: 'p',
				text: 'Kit 2 had four magic modules: `$env/static/private`, `$env/static/public`, `$env/dynamic/private`, `$env/dynamic/public`. They worked, but they had two problems. Nothing told you which variables an app actually needed until it crashed, and the only thing standing between a secret and the browser bundle was remembering which of four import paths you were typing.'
			},
			{ type: 'p', text: 'Kit 3 replaces all four with one file you write.' },
			{
				type: 'code',
				file: 'apps/web/src/env.ts',
				lang: 'ts',
				code: `
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

const required = v.pipe(v.string(), v.trim(), v.minLength(1));

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'libSQL connection string. \`file:sequent.db\` in development.',
		schema: required
	},
	PUBLIC_ORIGIN: {
		description: 'Where the app is served from. Used for CSRF checks.',
		public: true,
		static: true,
		schema: v.pipe(
			required,
			v.url('Must be an absolute URL'),
			v.transform((value) => value.replace(/\\/+$/, ''))
		)
	}
});`
			},
			{
				type: 'p',
				text: 'A variable not in this file **cannot be imported**. Not "returns undefined" — the import does not typecheck. That single change moves an entire class of production incident to the moment you type the wrong name.'
			},

			{ type: 'h3', id: 'the-three-flags', text: 'The three things you declare' },
			{
				type: 'ul',
				items: [
					'**`schema`** — a valibot schema. It runs at startup, so `DATABASE_URL=""` fails immediately with a clear message instead of producing an unopenable database three layers down.',
					'**`public: true`** — this value is allowed in the browser. It is absent by default, so a secret reaching the client requires somebody to *type the word public*, which is exactly the kind of mistake that survives a review and the kind that does not.',
					'**`static: true`** — inlined at build time rather than read from `process.env` at request time. Faster, and it means the value cannot change under a running process. Use it for things that genuinely do not vary between restarts.'
				]
			},
			{
				type: 'p',
				text: 'Note what the `PUBLIC_ORIGIN` schema does beyond checking: `v.transform` strips trailing slashes. `https://sequent.exchange/` and `https://sequent.exchange` are the same origin to a person and different strings to a comparison — and this value is compared against an `Origin` header on every state-changing request. Normalising it once here is better than remembering to normalise it at every use.'
			},
			{
				type: 'why',
				title: 'Validate at the edge, once',
				text: 'This is the same principle as the protocol codecs in Part 1. Untyped, unvalidated data gets checked exactly once, at the boundary where it enters, and everything inside works with values whose shape is guaranteed. Environment variables are a boundary. They come from a shell, a `.env` file, a CI secret store, or a hosting dashboard, and any of those can hand you an empty string.'
			},

			{ type: 'h3', id: 'importing', text: 'Using them' },
			{
				type: 'code',
				lang: 'ts',
				code: `
// Server only. Importing this from a component is a build error.
import { DATABASE_URL } from '$app/env/private';

// Safe anywhere, because we declared it public.
import { PUBLIC_ORIGIN } from '$app/env/public';`
			},
			{
				type: 'p',
				text: 'Two modules instead of four. The static/dynamic distinction moved into the declaration where it belongs, so the import path now encodes only the thing you must not get wrong: whether the browser is allowed to see it.'
			},
			{
				type: 'note',
				text: 'Our `.env.example` is checked in and the real `.env` is not. `defineEnvVars` gives you a free bonus here: because every variable has a `description`, the declaration file *is* the documentation, and it cannot drift from the code the way a README does.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can declare a new environment variable with a schema',
					'You can explain what `public: true` and `static: true` each change',
					'You know which import path is safe in a component and which is not',
					'You can explain why the origin is normalised in the schema rather than at the comparison'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'remote-functions',
		title: 'Remote functions',
		summary:
			'query, command, form and query.live — and why every argument needs a schema even though the caller is your own page.',
		goal: 'Replace load functions and form actions with typed server functions you can call from anywhere.',
		blocks: [
			{
				type: 'p',
				text: 'A `.remote.ts` file exports functions that run on the server. A component imports them and calls them like ordinary async functions. SvelteKit generates the endpoint, the fetch, the serialisation and the types.'
			},
			{
				type: 'p',
				text: 'This replaces `+page.server.ts` load functions and form actions for most work, and the difference is not syntax. A load function is tied to a route: it runs when that URL loads, and nowhere else. A remote function is tied to *nothing* — any component on any page can call it, and so can another remote function.'
			},

			{ type: 'h3', id: 'query', text: 'query — reading' },
			{
				type: 'code',
				file: 'apps/web/src/routes/terminal/market.remote.ts',
				lang: 'ts',
				code: `
// …
import type { Row } from '@libsql/client';
// …
import { command, getRequestEvent, query } from '$app/server';

// …

export const getMyOrders = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'view_orders');

	const result = await db.execute({
		sql: \`SELECT order_id, client_order_id, instrument_id, side, price, quantity, filled,
					 time_in_force, status, cancel_reason, updated_at
			  FROM order_record WHERE firm_id = ? ORDER BY seq DESC LIMIT 100\`,
		args: [viewer.firmId]
	});

	return result.rows.map((row: Row) => ({ /* … */ }));
});`
			},
			{
				type: 'code',
				lang: 'svelte',
				code: `
<script lang="ts">
	import { getMyOrders } from './market.remote.ts';

	const orders = $derived(await getMyOrders());
</script>

{#each orders as order (order.orderId)}
	<tr>…</tr>
{/each}`
			},
			{
				type: 'p',
				text: 'That is the whole thing. `await` inside `$derived` is the `experimental.async` flag from the last chapter, and it is what makes a remote call read like a local one. Kit deduplicates identical calls within a render, caches the result, and re-runs the query when something calls `.refresh()` on it.'
			},

			{ type: 'h3', id: 'schemas', text: 'Every argument gets a schema' },
			{
				type: 'p',
				text: 'A remote function that takes arguments takes a valibot schema first. This is not optional and it is not a style preference.'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/terminal/market.remote.ts',
				lang: 'ts',
				code: `
const symbol = v.pipe(v.string(), v.regex(/^[A-Z][A-Z0-9.]{0,15}$/, 'Not an instrument symbol'));
const positiveInteger = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1e15));`
			},
			{
				type: 'why',
				title: 'The caller is not your page',
				text: 'It is tempting to think "the only thing that calls this is my own component, which always sends a valid symbol". The generated endpoint is a **public HTTP route**. Anybody can `curl` it with anything, and on a trading venue somebody eventually will, four hundred times a second, with a symbol containing a SQL fragment. The schema is the boundary, and it is the same boundary as the protocol codecs and the environment variables — the pattern of this entire codebase is *validate once, at the edge*.'
			},
			{
				type: 'note',
				text: 'SvelteKit enforces the discipline for you: inside a remote function, `event.url` and `event.params` **throw** if you read them. A remote function is not a route, so it has no URL to read, and the framework refuses to let you pretend otherwise. Everything that varies must arrive as a validated argument.'
			},

			{ type: 'h3', id: 'command', text: 'command — writing' },
			{
				type: 'code',
				file: 'apps/web/src/routes/terminal/market.remote.ts',
				lang: 'ts',
				code: `
export const placeOrder = command(
	v.object({
		accountId: v.pipe(v.string(), v.minLength(1)),
		instrumentId: symbol,
		clientOrderId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
		side: v.picklist(['buy', 'sell'] as const),
		orderType: v.picklist(['limit', 'market'] as const),
		price: v.optional(positiveInteger),
		quantity: positiveInteger,
		timeInForce: v.picklist(['gtc', 'day', 'ioc', 'fok'] as const)
	}),
	async (input) => {
		const viewer = requireViewer();

		const seq = await submit(viewer, {
			kind: 'place_order',
			selfTradePrevention: 'cancel_both',
			...input,
			instrumentId: asInstrumentId(input.instrumentId)
		});

		// Refresh the participant's own order list in the same response, so the
		// ticket does not have to fire a second request to show what it just sent.
		void getMyOrders().refresh();

		return { seq };
	}
);`
			},
			{
				type: 'p',
				text: 'The `.refresh()` call is the part worth stealing. A command can tell a query it is stale, and Kit sends the fresh data back **in the same HTTP response as the command\'s result**. One round trip places the order and updates the blotter. Without it you need a second request, and the gap between them is the window where the screen shows an order the person just placed as not existing.'
			},
			{
				type: 'p',
				text: '`void` in front is deliberate: we are not awaiting it, because we do not want the command\'s response held up by a refresh, and an un-awaited promise without `void` is the kind of thing a linter should complain about.'
			},

			{ type: 'h3', id: 'form', text: 'form — progressive enhancement' },
			{
				type: 'p',
				text: '`form()` is `command()` for things that should work with JavaScript switched off. It takes the same schema, and it returns an object you spread onto a `<form>` element.'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
export const signOut = form(v.object({}), async () => {
	const event = getRequestEvent();
	const sessionId = event.cookies.get('sequent_session');

	if (sessionId) {
		await db.execute({ sql: 'DELETE FROM session WHERE session_id = ?', args: [sessionId] });
		event.cookies.delete('sequent_session', { path: '/' });
	}

	redirect(303, '/sign-in');
});`
			},
			{
				type: 'code',
				lang: 'svelte',
				code: `
<form {...signOut}>
	<button type="submit">Sign out</button>
</form>`
			},
			{
				type: 'p',
				text: 'With JavaScript, that posts in the background and updates in place. Without it, the browser does a normal form submission and the `redirect(303, …)` sends you to the sign-in page. Same code, both worlds. Signing in and signing out are the two things that must never depend on a bundle having loaded, which is why they are forms and not commands.'
			},

			{ type: 'h3', id: 'live', text: 'query.live — streaming' },
			{
				type: 'p',
				text: 'The last kind takes an **async generator**, and everything it yields is pushed to every browser subscribed with the same arguments.'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/terminal/market.remote.ts',
				lang: 'ts',
				code: `
export const watchMarket = query.live(
	v.object({ instrumentId: symbol, depth: v.optional(positiveInteger, 10) }),
	async function* (args) {
		requireViewer();
		const { request } = getRequestEvent();

		yield await snapshotOf(args.instrumentId, args.depth);

		for await (const batch of tailEvents(db, await currentSeq(), {
			signal: request.signal,
			idleMs: 40
		})) {
			// Only wake for events about this instrument. A quiet instrument on a
			// busy venue should cost nothing.
			const relevant = batch.some((record) => {
				const body = record.body as { instrumentId?: string };
				return body.instrumentId === args.instrumentId;
			});

			if (relevant) yield await snapshotOf(args.instrumentId, args.depth);
		}
	}
);`
			},
			{
				type: 'p',
				text: 'The shape is always the same three steps: yield the current answer immediately, so the page has something to draw; wait for a reason to look again; yield the new answer. The interesting decisions are in the waiting.'
			},
			{
				type: 'why',
				title: 'Coalescing is not an optimisation',
				text: 'A busy instrument produces hundreds of events a second. Yield once per event and you push hundreds of renders a second at a browser that can paint sixty — the queue grows, the tab heats up, and the ladder falls **behind** the market it exists to show. So `tailEvents` drains every event waiting and hands back one batch, and the loop yields one snapshot. Under load that is one render per batch; when quiet the batch is one event long and it is one render per event. The rate adapts to the market instead of to a timer, which is what a `setInterval` would give you and is worse in both directions — too slow when quiet, still too fast when busy.'
			},
			{
				type: 'warn',
				text: '`request.signal` is what makes this safe to leave running. When the tab closes, the signal aborts, `tailEvents` returns, and the generator\'s cleanup runs. Without it, every abandoned terminal leaves a database poller behind forever, and the venue slowly dies of people closing laptops.'
			},
			{
				type: 'note',
				text: 'Use `query.live` for the one thing that genuinely moves under somebody\'s eyes. On this page it is the book and the tape. The instrument list is a plain `query`, because instruments change when the venue lists something, which is roughly never during one session. Reserving the live machinery for what earns it is the difference between a streaming connection that pays for itself and one that is on because it was easy to switch on.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can write a `query`, a `command`, a `form` and a `query.live`',
					'You can explain why every argument needs a schema even for your own page',
					'You can explain what `.refresh()` inside a command saves you',
					'You can explain why the live generator coalesces, and what `request.signal` prevents'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'sessions-and-cookies',
		title: 'Sessions and cookies',
		summary: 'Signing in without a library, and the two details that stop it leaking information.',
		goal: 'Build sign-in, sessions, and a hook that attaches the viewer to every request.',
		blocks: [
			{
				type: 'p',
				text: 'No auth library. Not because libraries are bad, but because this is about eighty lines and every one of them is a decision worth seeing.'
			},

			{ type: 'h3', id: 'sign-in', text: 'The sign-in form' },
			{
				type: 'code',
				file: 'apps/web/src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
/** One leading slash, and only one. \`//evil.example\` leaves the site. */
const SAFE_REDIRECT = /^\\/(?!\\/)[^\\s]{0,512}$/;
const HOME = '/terminal';

export const signIn = form(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.email('Enter the email you signed up with')),
		password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),
		redirectTo: v.optional(
			v.pipe(
				v.string(),
				// Sanitise rather than reject: the value lives in a hidden field the
				// person cannot see or correct, so a crafted link would otherwise
				// leave them unable to sign in at all.
				v.transform((value) => (SAFE_REDIRECT.test(value) ? value : HOME))
			),
			HOME
		)
	}),
	async (data) => { /* … */ }
);`
			},
			{
				type: 'p',
				text: 'That regular expression is an **open redirect** guard. A URL like `/sign-in?redirectTo=//evil.example` would, after a successful sign-in, bounce the person to an attacker\'s site — from your domain, immediately after they typed their password, which is the ideal moment to show them a convincing "session expired, sign in again" page. `//host` is a protocol-relative URL: it looks like a path and is not one.'
			},
			{
				type: 'note',
				text: 'Notice it *sanitises* rather than rejects. The field is hidden, so somebody handed a crafted link has no way to see or correct the value — rejecting would leave them staring at a validation error on a field that does not exist on screen. Reject what a person can fix; sanitise what they cannot.'
			},

			{ type: 'h3', id: 'one-message', text: 'One message for two failures' },
			{
				type: 'code',
				file: 'apps/web/src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
const row = result.rows[0];

/*
 * One message for "no such account" and "wrong password".
 *
 * Distinguishing them turns this form into a tool for discovering which
 * firms are members of the venue.
 */
if (!row || Number(row['is_active']) !== 1) {
	error(401, 'That email and password do not match an account.');
}
if (!verifySecret(data.password, String(row['password_hash']))) {
	error(401, 'That email and password do not match an account.');
}`
			},
			{
				type: 'p',
				text: 'On a consumer app this is a mild privacy nicety. On an exchange it is competitive intelligence: "is `trading@rival-fund.com` a member here?" is a question worth money, and a sign-in form that answers it with a different error message is answering it for free, to anyone, all day.'
			},
			{
				type: 'p',
				text: 'The same reasoning applies to the *deactivated* case, which is folded into the first branch. "That account exists but is switched off" tells you the account exists.'
			},

			{ type: 'h3', id: 'the-cookie', text: 'The cookie' },
			{
				type: 'code',
				file: 'apps/web/src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
const sessionId = crypto.randomUUID();
const expiresAt = Date.now() + 12 * 60 * 60 * 1000;

await db.execute({
	sql: 'INSERT INTO session (session_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
	args: [sessionId, String(row['user_id']), expiresAt, Date.now()]
});

event.cookies.set('sequent_session', sessionId, {
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	secure: !event.url.hostname.includes('localhost'),
	expires: new Date(expiresAt)
});

redirect(303, data.redirectTo);`
			},
			{
				type: 'ul',
				items: [
					'**`httpOnly`** — JavaScript cannot read it. An XSS bug then cannot steal the session, which downgrades a catastrophe to a bad day.',
					'**`sameSite: \'lax\'`** — the browser will not attach this cookie to a cross-site POST. That is CSRF defence number one; the next chapter is defence number two, because "number one" is a browser behaviour and we do not want our safety to depend only on that.',
					'**`secure`** off on localhost only — a `secure` cookie is not sent over plain HTTP, so hardcoding `true` makes local development silently fail to keep you signed in.',
					'**`expires`** matching the row in the database — the cookie and the server-side session agree on when it ends. Twelve hours, because a trading session is a working day and a token that outlives the day is a token somebody left on a shared machine.'
				]
			},
			{
				type: 'why',
				title: 'The session is a row, not a token',
				text: 'The cookie holds a random opaque ID with no meaning of its own. Everything about the session — who, until when — lives in a database row. That is what makes revocation possible: deleting the row ends the session *now*, everywhere. A self-contained signed token cannot be un-issued, only waited out.'
			},

			{ type: 'h3', id: 'the-hook', text: 'Resolving the viewer once' },
			{
				type: 'code',
				file: 'apps/web/src/hooks.server.ts',
				lang: 'ts',
				code: `
/**
 * Attach the viewer to every request, once.
 *
 * Only the session cookie is resolved here. API keys are handled inside the API
 * routes, because a key needs a rate-limit decision at the same moment it is
 * verified and the hook has nowhere to put one.
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('sequent_session');

	event.locals.viewer = sessionId
		? ((await viewerFromSession(db, sessionId, Date.now())) ?? null)
		: null;

	return resolve(event);
};`
			},
			{
				type: 'p',
				text: '`event.locals` is per-request scratch space. Filling it in a hook means every page, layout and remote function downstream reads `locals.viewer` without another database call, and there is exactly one place where "who is this?" is answered.'
			},
			{
				type: 'p',
				text: 'The `viewerFromSession` helper is the one from Part 3: it joins session to user to firm to role, checks the expiry against the timestamp we pass in, and returns `undefined` for anything expired or deactivated. Passing `Date.now()` in rather than reading the clock inside keeps it testable — the same discipline as the engine.'
			},
			{
				type: 'code',
				file: 'apps/web/src/hooks.server.ts',
				lang: 'ts',
				code: `
// Order matters: refuse forged requests before spending a database round trip
// resolving who they claim to be.
export const handle: Handle = sequence(handleCsrf, handleAuth, handleHeaders);`
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain what an open redirect is and why `//evil.example` is not a path',
					'You can explain why sign-in has one error message for two different failures',
					'You can name each cookie flag and what it defends against',
					'You can explain why the session is a database row rather than a signed token'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'the-csrf-check-we-wrote-ourselves',
		title: 'The CSRF check we wrote ourselves',
		summary:
			'Kit 3 blocked a legitimate DELETE and allowed a cross-origin JSON POST. Here is the bug, and the replacement.',
		goal: 'Understand CSRF properly, and write a check that is both stricter and looser than the default — in the right directions.',
		blocks: [
			{
				type: 'p',
				text: 'This chapter exists because of a bug report from a `curl` session, and it is the best kind: the framework was not wrong, it was solving a slightly different problem than the one we had.'
			},

			{ type: 'h3', id: 'what-csrf-is', text: 'What the attack actually is' },
			{
				type: 'p',
				text: 'A browser attaches your cookies to a request for our domain **whoever asked for it**. So a page on `evil.example` can contain this:'
			},
			{
				type: 'code',
				lang: 'html',
				code: `
<form action="https://sequent.exchange/api/v1/orders" method="POST">
	<input type="hidden" name="instrumentId" value="ACME">
	<input type="hidden" name="side" value="sell">
	<input type="hidden" name="quantity" value="1000000">
</form>
<script>document.forms[0].submit()</script>`
			},
			{
				type: 'p',
				text: 'You visit that page while signed in to the venue. The browser sends the request with your session cookie attached, the venue sees a valid session, and you have just sold a million shares. You clicked nothing on our site. That is cross-site request forgery.'
			},
			{
				type: 'p',
				text: 'What stops it is the `Origin` header. The browser sets it to the site the request came *from*, and page JavaScript cannot change it. Same origin — fine. Different origin — refuse.'
			},

			{ type: 'h3', id: 'the-bug', text: 'The bug' },
			{
				type: 'p',
				text: 'While testing the public API by hand, this happened:'
			},
			{
				type: 'terminal',
				code: `
$ curl -X DELETE http://localhost:5173/api/v1/orders/ORD-1 \\
    -H "Authorization: Bearer sq_live_9f2a…"

Cross-site POST form submissions are forbidden`
			},
			{
				type: 'p',
				text: 'A body-less `DELETE`, authenticated with a Bearer token, from a command-line tool with no origin at all, refused as a cross-site form submission.'
			},
			{
				type: 'p',
				text: 'Kit\'s rule is: block a non-GET request when its `Content-Type` is form-like **or absent** and the `Origin` does not match. A `DELETE` with no body sends no content type. There is nothing an API client can do about this — you cannot ask people to set a content type on a request that has no content.'
			},
			{
				type: 'p',
				text: 'And there is a second half. A cross-origin `POST` carrying `Content-Type: application/json` is *allowed*, because browsers cannot send one without a CORS preflight that our server would decline. That is true today. It also means our safety depends on a browser behaviour rather than on something we check.'
			},
			{
				type: 'why',
				title: 'Two problems, one root cause',
				text: 'Kit\'s check keys on **content type**, because it is defending against HTML forms, which can only send three content types. Our problem is not "is this a form?" — it is "is this request authenticated by a cookie?". CSRF is a cookie attack, start to finish. Key on the credential and both problems disappear at once.'
			},

			{ type: 'h3', id: 'the-replacement', text: 'The replacement' },
			{
				type: 'p',
				text: 'Turn Kit\'s check off, and write the one we actually mean.'
			},
			{
				type: 'code',
				file: 'apps/web/vite.config.ts',
				lang: 'ts',
				code: `
sveltekit({
	// …

	/*
	 * Kit's own cross-site check is turned off, and replaced by a stricter
	 * one in \`hooks.server.ts\`. Read that before deciding this is reckless.
	 * …
	 */
	csrf: { trustedOrigins: ['*'] },

	// …
})`
			},
			{
				type: 'warn',
				text: '`trustedOrigins: [\'*\']` on its own is a serious vulnerability. It is only acceptable here because the hook below runs on every request and is strictly stronger. If you copy the config line without the hook, you have removed your CSRF protection and added nothing.'
			},
			{
				type: 'code',
				file: 'apps/web/src/hooks.server.ts',
				lang: 'ts',
				code: `
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/* … */
const handleCsrf: Handle = async ({ event, resolve }) => {
	if (SAFE_METHODS.has(event.request.method)) return resolve(event);

	const authorization = event.request.headers.get('authorization');
	if (authorization?.startsWith('Bearer ')) return resolve(event);

	const origin = event.request.headers.get('origin');

	/*
	 * A missing \`Origin\` on a non-GET is refused rather than trusted.
	 *
	 * Every browser has sent \`Origin\` on cross-origin form submissions for years,
	 * so "no origin" here means a non-browser client — which should be using a
	 * token, not a cookie. Trusting the absence is the mistake that turns this
	 * check into decoration, because it is the one thing an attacker can arrange.
	 */
	if (origin !== PUBLIC_ORIGIN) {
		return new Response('Cross-site request refused.', {
			status: 403,
			headers: { 'content-type': 'text/plain' }
		});
	}

	return resolve(event);
};`
			},
			{
				type: 'p',
				text: 'The rule in one sentence: **any state-changing request authenticated by a cookie must carry a matching Origin.**'
			},
			{
				type: 'ul',
				items: [
					'`GET`, `HEAD` and `OPTIONS` pass — they must not change anything, and if one of yours does, that is the bug.',
					'A `Bearer` token passes with no origin check. There is no way for `evil.example` to make your browser attach a token it does not have, so a token-authenticated request cannot be forged this way. That fixes the `DELETE`.',
					'Everything else must match `PUBLIC_ORIGIN` exactly — including a cross-origin JSON POST, which Kit would have let through. That closes the second half.'
				]
			},
			{
				type: 'note',
				text: 'The exemption for Bearer tokens is not a convenience. It is a statement about which credential the attack applies to. CSRF works *only* because credentials travel automatically; cookies do, `Authorization` headers do not.'
			},
			{
				type: 'p',
				text: 'And the ordering, once more, because it is easy to get backwards:'
			},
			{
				type: 'code',
				file: 'apps/web/src/hooks.server.ts',
				lang: 'ts',
				code: `
export const handle: Handle = sequence(handleCsrf, handleAuth, handleHeaders);`
			},
			{
				type: 'p',
				text: 'Refuse the forged request *before* the database round trip that resolves who it claims to be. A rejected request should cost as close to nothing as possible, because rejected requests are the ones that arrive in volume.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain CSRF to somebody without using the word "token"',
					'You can explain why a body-less DELETE tripped Kit\'s content-type rule',
					'You can explain why exempting Bearer tokens is safe and exempting a missing Origin is not',
					'You know why `trustedOrigins: [\'*\']` is only acceptable alongside the hook'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'async-svelte-and-the-getter-trap',
		title: 'Async Svelte, and the getter trap',
		summary:
			'await inside $derived is wonderful, and it has one ordering rule that will cost you an afternoon if you do not know it.',
		goal: 'Use awaited deriveds confidently, and understand the server-rendering failure they can cause.',
		blocks: [
			{
				type: 'p',
				text: 'With `experimental.async` on, `$derived` can await. The terminal page reads almost like a synchronous script that happens to talk to a database:'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/terminal/+page.svelte',
				lang: 'svelte',
				code: `
const instruments = $derived(await getInstruments());

const chosen = $derived(
	page.url.searchParams.get('symbol') ?? instruments[0]?.instrumentId ?? ''
);

const instrument = $derived(instruments.find((row) => row.instrumentId === chosen));

// The live one. Everything else on this page is a plain query, because
// nothing else changes while somebody is looking at it.
const market = $derived(chosen ? await watchMarket({ instrumentId: chosen }) : null);

const orders = $derived(await getMyOrders());
const positions = $derived(await getMyPositions());`
			},
			{
				type: 'p',
				text: 'Six lines that fetch from the server, pick a default, follow the URL, subscribe to a stream, and re-run precisely the parts that depend on what changed. In Kit 2 that is a load function, a `$:` block, a store subscription and an `onDestroy`.'
			},

			{ type: 'h3', id: 'the-trap', text: 'The trap' },
			{
				type: 'p',
				text: 'Here is the error that started the afternoon:'
			},
			{
				type: 'terminal',
				code: `
TypeError: Cannot read properties of undefined (reading 'price')
    at Module.$$render (+page.svelte:257:28)`
			},
			{
				type: 'p',
				text: 'The line it points at is the `bind:value={ticket.price}` on the ticket\'s price input. `ticket` is a `$state` object declared further down the script. On the client everything worked perfectly. Only server rendering died.'
			},
			{
				type: 'why',
				title: 'What is actually happening',
				text: 'When a component binds to a **member of a `$state` object** — `ticket.side` rather than a plain `side` variable — Svelte compiles a getter for it. During server rendering, everything after the first awaited `$derived` runs in a later microtask, but that getter runs in the first pass. So if `ticket` is declared below the awaited deriveds, the getter reads a variable that has not been initialised yet, and you get `undefined.side`.'
			},
			{
				type: 'p',
				text: 'The fix is one of the most anticlimactic in this course: **move the declaration up.**'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/terminal/+page.svelte',
				lang: 'svelte',
				code: `
/*
 * Ticket state, declared ABOVE the awaited deriveds below.
 *
 * The order is load-bearing. A component that binds to a member of a $state
 * object emits a getter that runs before the part of the script following the
 * first awaited $derived — declare the state after them and it is still
 * undefined when the getter runs, and server rendering dies with "Cannot read
 * properties of undefined". Binding to a plain $state variable is unaffected,
 * which is what makes it so easy to walk into.
 */
let ticket = $state({
	side: 'buy' as 'buy' | 'sell',
	price: '',
	quantity: '100',
	timeInForce: 'gtc' as 'gtc' | 'day' | 'ioc' | 'fok'
});

let sending = $state(false);
let lastError = $state<string | null>(null);

// …only now the awaited deriveds
const instruments = $derived(await getInstruments());`
			},
			{
				type: 'warn',
				text: 'What makes this so easy to walk into is the asymmetry. `bind:value={quantity}` on a plain `$state` variable is completely fine in any order. It is only `bind:value={ticket.quantity}` — a member of a state object — that emits the getter. So you can have twenty bindings working and add the twenty-first, which happens to be a member access, and the page stops rendering on the server with an error pointing at a line you did not change.'
			},
			{
				type: 'note',
				text: 'The rule to carry: **in a component with awaited `$derived`s, declare all `$state` first.** It costs nothing, it reads better anyway — state at the top, computed below — and it makes the ordering hazard impossible rather than merely avoided.'
			},

			{ type: 'h3', id: 'effects', text: 'When to reach for $effect instead' },
			{
				type: 'p',
				text: 'One more piece of the terminal, because it draws the line between the two:'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/terminal/+page.svelte',
				lang: 'svelte',
				code: `
/*
 * Announce a phase change with the venue's one dramatic gesture.
 *
 * \`$effect\` and not a derived, because this *does something to the world*
 * rather than computing a value. A derived that fired an animation would run
 * again on every unrelated re-read, which is the difference between "when
 * this changes" and "whenever anybody looks".
 *
 * The guard on \`seenPhase\` being non-null is what stops the sweep firing on
 * first load: arriving at an open market is not the market opening.
 */
$effect(() => {
	const phase = market?.phase;
	if (!phase) return;

	if (seenPhase !== null && seenPhase !== phase) {
		sweep(phase === 'continuous' || phase === 'auction' ? 'open' : 'halt');
	}

	seenPhase = phase;
});`
			},
			{
				type: 'p',
				text: 'The test is simple. Does it produce a **value** the markup reads? `$derived`. Does it *do something* — animate, log, focus, start a timer? `$effect`. Deriveds are allowed to run more often than you expect, because they are cached and pure; effects are not, because they are neither.'
			},
			{
				type: 'p',
				text: 'The `seenPhase !== null` guard is the same class of thinking as the idempotent projectors: it separates "the state changed" from "this is the first time I am seeing state at all". Arriving at a market that is already open is not the market opening, and firing the venue\'s one dramatic animation at everybody who loads the page would make it mean nothing.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can use `await` inside `$derived` and explain what re-runs when',
					'You can state the declaration-order rule and the exact error breaking it produces',
					'You can explain why a plain `$state` binding is unaffected but a member binding is not',
					'You can decide between `$derived` and `$effect` from what the code does, not how it looks'
				]
			}
		]
	}
];
