/**
 * PART 3 — The server layer (chapters 15–19)
 *
 * Configuration, identity, authorisation, and the module that actually takes a
 * booking. This is where SvelteKit 3's differences from Kit 2 show up most
 * sharply: no `svelte.config.js`, no `$env` magic modules, and hooks that get
 * told what kind of error they are looking at.
 */

export const part3 = [
	{
		slug: 'configuration-without-magic',
		title: 'Configuration without magic',
		summary:
			'SvelteKit 3 deleted `svelte.config.js` and the `$env` modules. What replaced them is better, and stricter.',
		goal: 'Every environment variable declared, validated and typed — and an app that refuses to start with a bad one.',
		blocks: [
			{
				type: 'p',
				text: 'Two things you may have muscle memory for no longer exist in SvelteKit 3.'
			},

			{ type: 'h3', id: 'no-config-file', text: 'One config file, not two' },
			{
				type: 'p',
				text: 'There is no `svelte.config.js`. Everything that used to live in it now goes inside the `sveltekit()` plugin in `vite.config.ts`.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			sveltekit({
				paths: { origin: env.PUBLIC_ORIGIN },
				compilerOptions: {
					runes: true,
					experimental: { async: true }
				},
				adapter: adapter(),
				experimental: { remoteFunctions: true },
				prerender: { handleHttpError: 'fail', handleMissingId: 'fail' }
			}),
			sveltePhosphorOptimize()
		],
		ssr: { external: ['@libsql/client', 'libsql'] }
	};
});`
			},
			{
				type: 'p',
				text: 'Three details in there are worth knowing before they cost you an evening:'
			},
			{
				type: 'ul',
				items: [
					'The config is a **function**, so it can call `loadEnv`. It has to be, because `paths.origin` needs a value from `.env` and Vite has not loaded those when a plain object literal is evaluated. Note `...process.env` last — a real environment variable must win over a checked-in `.env` file.',
					'`sveltePhosphorOptimize()` comes **after** `sveltekit()`. Icon plugins rewrite imports that SvelteKit has to see first; reverse them and you get a build that succeeds and ships every icon in the library.',
					'`ssr.external` tells Vite not to bundle the native libSQL binary. Together with keeping it in `dependencies`, this is what stops the runtime `Cannot find module` we met in chapter 10.'
				]
			},
			{
				type: 'why',
				title: 'paths.origin — new in 3.0, and not optional here',
				text: 'It is the origin SvelteKit trusts for cross-site request checks. `@sveltejs/adapter-node` v6 no longer reads an `ORIGIN` environment variable at runtime; the value is baked in at build time from this setting, and the header fallback **assumes https**. A plain-HTTP preview server therefore computes `https://localhost:4173`, the browser sends `http://localhost:4173`, they disagree, and *every* form post comes back 403 "Cross-site remote requests are forbidden". Setting `paths.origin` fixes it in one line and is genuinely hard to diagnose without knowing.'
			},

			{ type: 'h3', id: 'env', text: 'Environment variables, declared' },
			{
				type: 'p',
				text: 'The `$env/static/private` and `$env/dynamic/private` modules are gone. In their place: a file you write, listing every variable the app reads.'
			},
			{
				type: 'code',
				file: 'src/env.ts',
				lang: 'ts',
				code: `
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

/** A non-empty string, with surrounding whitespace stripped. */
const required = v.pipe(v.string(), v.trim(), v.minLength(1));

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			'libSQL connection string. \`file:local.db\` in development, a \`libsql://…\` Turso URL in production.',
		schema: required
	},

	BETTER_AUTH_SECRET: {
		description: 'Signs session cookies. Rotating it signs everybody out.',
		schema: v.pipe(required, v.minLength(32, 'Use at least 32 characters'))
	},

	PUBLIC_ORIGIN: {
		description: 'Where the app is served from. Used for canonical URLs and CSRF checks.',
		public: true,
		static: true,
		schema: origin
	}
});`
			},
			{
				type: 'ul',
				items: [
					'**Nothing is implicit.** A variable not declared here cannot be imported. That is a *type error*, not a runtime `undefined` three weeks later.',
					'**Each one carries a schema.** The app refuses to start with a bad value, rather than failing at 3am when the first request reaches that branch.',
					'**`public: true` is an explicit, reviewable act.** You cannot leak a secret to the browser by accident; you have to type the word `public` next to it.'
				]
			},
			{
				type: 'code',
				file: 'reading them',
				lang: 'ts',
				code: `
import { DATABASE_URL } from '$app/env/private';   // server only, enforced
import { PUBLIC_ORIGIN } from '$app/env/public';   // safe in the browser`
			},

			{ type: 'h3', id: 'optional', text: 'Genuinely optional variables' },
			{
				type: 'p',
				text: '`defineEnvVars` has no `optional` or `default` option. That looks like a gap until you notice the schema can do it, and can do it with a better type.'
			},
			{
				type: 'code',
				file: 'src/env.ts',
				lang: 'ts',
				code: `
DATABASE_AUTH_TOKEN: {
	description:
		'Auth token for a remote libSQL/Turso database. Leave unset when pointing at a local file.',
	// Returning \`undefined\` from a schema function is how you declare
	// "this one is genuinely allowed to be missing".
	schema: (value) => (value ? value.trim() : undefined)
},`
			},
			{
				type: 'p',
				text: 'The schema does not have to be a valibot pipe — a plain function works, and whatever it returns is what the import gives you. A schema may return something that is not a string, and **the imported type follows it**. This one produces `string | undefined`, which is the only honest type for a variable that is genuinely optional, and it collapses an empty string to `undefined` so `authToken: \'\'` never reaches the driver.'
			},

			{ type: 'h3', id: 'validate-with-runtime', text: 'Validate against the runtime, not a regex' },
			{
				type: 'code',
				file: 'src/env.ts',
				lang: 'ts',
				code: `
const timeZone = v.pipe(
	required,
	v.check((value) => {
		try {
			new Intl.DateTimeFormat('en-GB', { timeZone: value });
			return true;
		} catch {
			return false;
		}
	}, 'Must be a valid IANA time zone identifier, e.g. Europe/London')
);`
			},
			{
				type: 'p',
				text: 'A regex for time zone names would accept `Europe/Atlantis` and reject `America/Argentina/ComodRivadavia`. Asking `Intl` is the same lookup every formatted date will perform later, so a value that passes here **cannot** fail there. Validate against the thing that will actually use the value.'
			},

			{
				type: 'checkpoint',
				text: 'Deleting `DATABASE_URL` from `.env` makes the app refuse to start with a message naming the variable — not a stack trace fifty lines into a request.'
			}
		]
	},

	{
		slug: 'who-are-you',
		title: 'Who are you',
		summary:
			'Better Auth for staff, a bearer token in an email for customers, and why those are different problems.',
		goal: 'Working sign-in, sessions on `event.locals`, and a customer flow that needs no account at all.',
		blocks: [
			{
				type: 'p',
				text: 'Halfpast has two kinds of person and gives them two completely different answers.'
			},
			{
				type: 'ul',
				items: [
					'**Staff** sign in with an email and password, keep a session, and see a dashboard.',
					'**Customers** have no account, ever. They get a link in an email that lets them manage their own booking and nothing else.'
				]
			},
			{
				type: 'why',
				title: 'Why customers get no account',
				text: 'Asking somebody to invent a password to book a haircut is how you lose the booking. It is also a liability: you now store credentials for people who will never return, and you owe them a password-reset flow, a breach notification plan, and a deletion process. The booking link is simpler *and* safer.'
			},

			{ type: 'h3', id: 'better-auth', text: 'Better Auth, in minimal form' },
			{
				type: 'terminal',
				code: 'pnpm add better-auth'
			},
			{
				type: 'code',
				file: 'src/lib/server/auth.ts',
				lang: 'ts',
				code: `
import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/index.ts';

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,

	database: drizzleAdapter(db, { provider: 'sqlite' }),

	emailAndPassword: {
		enabled: true,
		// The default is 8. Length is the only password rule that reliably helps;
		// the ones about symbols mostly teach people to append "!1".
		minPasswordLength: 12,
		maxPasswordLength: 256
	},

	session: {
		expiresIn: 60 * 60 * 24 * 30, // thirty days
		// Slide the expiry forward at most once a day, so an active user is not
		// logged out mid-week but we are not writing a session row on every request.
		updateAge: 60 * 60 * 24
	}
});`
			},
			{
				type: 'p',
				text: '`better-auth/minimal` is the smaller entry point: no social providers, no plugins, no organisation features. Importing from it rather than the default keeps a large amount of code out of the server bundle that we would never call, and everything above still works.'
			},
			{
				type: 'note',
				text: 'The password rules are worth arguing about. A twelve-character minimum with no composition requirements beats an eight-character minimum that demands a symbol: length is the only rule that reliably increases the work an attacker has to do, and the symbol rules mostly teach people to append "!1".'
			},

			{ type: 'h3', id: 'hooks', text: 'Attaching the session to every request' },
			{
				type: 'code',
				file: 'src/hooks.server.ts',
				lang: 'ts',
				code: `
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit/hooks';
import { auth } from '#lib/server/auth.ts';

const handleAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	return resolve(event);
};

// One job each, composed. \`handleHeaders\` is in chapter 34.
export const handle: Handle = sequence(handleAuth, handleHeaders);`
			},
			{
				type: 'warn',
				text: 'Hook types moved. `Handle`, `HandleServerError` and `HandleClientError` are imported from `@sveltejs/kit/hooks` in SvelteKit 3, not from `@sveltejs/kit`. The old import is a type error, which is at least a loud failure.'
			},
			{
				type: 'p',
				text: 'Declare the shape once so the whole app knows it:'
			},
			{
				type: 'code',
				file: 'src/app.d.ts',
				lang: 'ts',
				code: `
declare global {
	namespace App {
		interface Locals {
			user: { id: string; name: string; email: string } | null;
			session: { id: string; expiresAt: Date } | null;
		}
	}
}

export {};`
			},

			{ type: 'h3', id: 'errors', text: 'Errors that say what kind they are' },
			{
				type: 'p',
				text: 'SvelteKit 3 changed the shape of `handleError`. It now receives a `kind`, and it is genuinely useful.'
			},
			{
				type: 'code',
				file: 'src/hooks.server.ts',
				lang: 'ts',
				code: `
export const handleError: HandleServerError = ({ kind, error, event }) => {
	/*
	 * \`kind\` is one of 'app' | 'framework' | 'validation' | 'unknown'.
	 *
	 * Only 'unknown' is a surprise. An 'app' error is our own \`error(404, …)\`, a
	 * 'validation' error is somebody sending a malformed request, and a
	 * 'framework' error already has a sensible message. Logging those at error
	 * level trains everybody to ignore the log.
	 */
	if (kind !== 'unknown') {
		// Keep the framework's status and message; just satisfy our own \`App.Error\`.
		return {};
	}

	const id = crypto.randomUUID().slice(0, 8);

	console.error(\`[\${id}] \${event.request.method} \${event.url.pathname}\`, error);

	return {
		id,
		message: 'Something went wrong at our end. Please try again.'
	};
};`
			},
			{
				type: 'p',
				text: 'Returning a short `id` and printing the same one server-side is the cheapest support tool there is: the customer reads you eight characters and you find the exact stack trace.'
			},
			{
				type: 'note',
				text: 'Write `src/hooks.client.ts` too, with the same shape and `HandleClientError`. A remote query that rejects during a client-side navigation renders the error page and writes **nothing** to the server log, because the server was never involved. Without the client hook, that is a blank 500 with no evidence anywhere. This exact tool found two real bugs in this project.'
			},

			{ type: 'h3', id: 'customer-token', text: 'The customer’s bearer token' },
			{
				type: 'code',
				file: 'src/lib/server/scheduling.ts',
				lang: 'ts',
				code: `
const tokenSchema = v.pipe(
	v.string(),
	v.trim(),
	// Crockford Base32, 26 characters. Matching the exact shape means a malformed
	// token is rejected before it reaches the database.
	v.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'That link does not look right')
);

export const getManagedBooking = query(tokenSchema, async (token): Promise<ManagedBooking> => {
	const found = await loadBookingByToken(token);
	if (!found) error(404, 'We could not find that booking.');

	return { /* … only the fields this page needs … */ };
});`
			},
			{
				type: 'ul',
				items: [
					'**Shape first, database second.** The schema rejects a malformed token before it becomes a query — so "badly formed" and "not found" cannot be told apart by timing.',
					'**130 bits of CSPRNG output**, looked up by a unique index. Not guessable, and no prefix matching to leak length through timing either.',
					'**Only the fields this page needs.** The query returns the whole booking row with four relations joined; the remote function hands back a flat object with no ids, no `manageToken`, and nothing about other customers.',
					'**404, not 403.** "That token exists but is not yours" is not a sentence we ever want to say.',
					'**`noindex` on the page.** The URL contains a credential; a search engine indexing it would be a breach delivered by Google.'
				]
			},

			{
				type: 'checkpoint',
				text: 'You can sign in as the seeded owner, `event.locals.user` is populated on every request, and opening a booking link with one character changed gives a clean 404.'
			}
		]
	},

	{
		slug: 'guards-that-throw',
		title: 'Guards that throw',
		summary:
			'Authorisation in one file, with a deliberate choice of status code for each kind of refusal.',
		goal: 'Four guard functions, and a rule for when a refusal should be 403 and when it should be 404.',
		blocks: [
			{
				type: 'p',
				text: 'Every guard in this app **throws**. None of them returns a boolean.'
			},
			{
				type: 'why',
				title: 'Why throwing, not returning',
				text: 'A function that returns `false` can be ignored by a caller who forgets to check it, and the failure mode is an unprotected page that looks completely fine in code review. A function that throws either stops the request or is not there at all. The difference is whether "I forgot the guard" and "the guard failed" look the same in the diff.'
			},
			{
				type: 'code',
				file: 'src/lib/server/guards.ts',
				lang: 'ts',
				code: `
export function requireUser() {
	const event = getRequestEvent();

	if (!event.locals.user) {
		const target = event.url.pathname + event.url.search;
		redirect(303, \`/sign-in?redirectTo=\${encodeURIComponent(target)}\`);
	}

	return event.locals.user;
}`
			},
			{
				type: 'p',
				text: 'A **redirect**, not a 401, because this guards pages a human is looking at. The `redirectTo` is what turns "you were logged out" from an annoyance into a hiccup — and chapter 34 covers why that parameter has to be sanitised before it is followed.'
			},
			{
				type: 'p',
				text: 'Notice it takes no arguments. It reads the current request through `getRequestEvent()`, so a remote function deep in the call stack can ask "who is this?" without every layer above it threading the answer down.'
			},

			{ type: 'h3', id: 'the-important-one', text: 'The guard that actually matters' },
			{
				type: 'code',
				file: 'src/lib/server/guards.ts',
				lang: 'ts',
				code: `
export async function requireStaff(businessSlug: string): Promise<StaffContext> {
	const user = requireUser();

	const found = await db.query.business.findFirst({ where: eq(business.slug, businessSlug) });
	if (!found) error(404, 'Not found');

	const membership = await db.query.staff.findFirst({
		where: and(eq(staff.businessId, found.id), eq(staff.userId, user.id))
	});

	if (!membership || !membership.isActive) error(404, 'Not found');

	return { user, staff: membership, business: found };
}`
			},
			{
				type: 'p',
				text: 'Signing in proves you are somebody. It does not prove you are somebody **here**. Without the second query, any staff member at any salon on the platform could read another salon\'s diary by editing the slug in the address bar.'
			},
			{
				type: 'warn',
				text: 'This is broken object-level authorisation — consistently the number one entry in the OWASP API top ten, and the easiest serious bug in the world to ship, because the page looks perfect while you are logged in as the right person.'
			},

			{ type: 'h3', id: 'status-codes', text: '404 or 403? A rule, not a coin toss' },
			{
				type: 'p',
				text: 'Two refusals in this file, two different codes, and the difference is not stylistic.'
			},
			{
				type: 'ul',
				items: [
					'**"You do not work here" → 404.** Telling a stranger that `/manage/willow-lane` exists but is not theirs leaks the platform\'s customer list one guess at a time. As far as they are concerned, the page is not there.',
					'**"You work here, but you are not the owner" → 403.** We have already established they belong. Hiding the page\'s existence from a colleague protects nothing and just confuses them; "only an owner can change this" is the useful answer.'
				]
			},
			{
				type: 'code',
				file: 'src/lib/server/guards.ts',
				lang: 'ts',
				code: `
export async function requireOwner(businessSlug: string): Promise<StaffContext> {
	const context = await requireStaff(businessSlug);

	if (context.staff.role !== 'owner') {
		error(403, 'Only an owner can change this.');
	}

	return context;
}`
			},

			{ type: 'h3', id: 'row-level', text: 'Row-level rules' },
			{
				type: 'p',
				text: 'One more shape: a member may edit **their own** shifts and nobody else\'s.'
			},
			{
				type: 'code',
				file: 'src/lib/server/guards.ts',
				lang: 'ts',
				code: `
export function canManageDiaryOf(context: StaffContext, staffId: string): boolean {
	return context.staff.role === 'owner' || context.staff.id === staffId;
}

export function assertCanManageDiaryOf(context: StaffContext, staffId: string): void {
	if (!canManageDiaryOf(context, staffId)) {
		error(403, 'You can only change your own hours.');
	}
}`
			},
			{
				type: 'p',
				text: 'Two functions, on purpose. The boolean drives the interface — the Remove button is not rendered next to somebody else\'s shift — and the throwing one drives the server. Hiding a button is manners; the assertion is the control.'
			},
			{
				type: 'note',
				text: 'Our end-to-end suite tests both halves separately: one test checks the button is absent, another types the URL directly and expects a 403. If only the first existed, deleting the server check would leave the suite green.'
			},

			{
				type: 'checkpoint',
				text: 'Signed in as the staff member, `/manage/willow-lane/services` returns 403 and `/manage/some-other-studio` returns 404 — and you can say why they differ.'
			}
		]
	},

	{
		slug: 'taking-a-booking',
		title: 'Taking a booking',
		summary: 'The one function that writes an appointment, and the four things it does in order.',
		goal: '`createBooking`: transactional, race-proof, and rude to nobody.',
		blocks: [
			{
				type: 'p',
				text: 'Everything so far has been preparation. This is the function that takes money-shaped actions.'
			},
			{
				type: 'code',
				file: 'src/lib/server/scheduling.ts',
				lang: 'ts',
				code: `
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
	const created = await writeQueue.run(() => createBookingNow(input));

	// Only after the transaction has committed. Announcing a change that then
	// rolls back would send every open booking page to re-read a diary that never
	// changed — and, worse, briefly show a slot as taken that is still free.
	publishDiaryChange(created.businessId);

	return created;
}

async function createBookingNow(input: CreateBookingInput): Promise<Booking> {
	const now = input.now ?? Date.now();

	return db.transaction(async (tx) => {
		/* --- 1. Re-derive availability from scratch -------------------------- */
		// … load the business, service, staff, the pairing, the rules and the
		// occupied cells, then run the same pure \`availableSlots\` from chapter 8.

		if (!offered.some((slot) => slot.start === input.start)) {
			// Distinguish the two reasons a slot might not be on offer, because the
			// remedies are different: one is "pick another time", the other is
			// "you cannot book this far out at all".
			if (input.start < now + foundBusiness.minNoticeMinutes * 60_000) {
				throw new BookingError('too_soon', 'That time is too close to now to book online.');
			}
			if (input.start > now + foundBusiness.maxAdvanceDays * 86_400_000) {
				throw new BookingError('too_far_ahead', 'The diary is not open that far ahead yet.');
			}
			throw new BookingError('slot_not_offered', 'That time is no longer available.');
		}

		/* --- 2. The customer -------------------------------------------------- */
		// Find by (business, lowercased email) or insert.

		/* --- 3. The booking row ----------------------------------------------- */
		const [created] = await tx.insert(booking).values({ /* … snapshots … */ }).returning();
		if (!created) throw new BookingError('slot_taken', 'That time was just taken.');

		/* --- 4. The claim. This is the part that cannot be raced. -------------- */
		const cells = slotsIn({ start: blockStart, end: blockEnd });

		try {
			await tx.insert(slotClaim).values(
				cells.map((cell) => ({
					staffId: chosenStaff.id,
					slotStart: new Date(cell),
					bookingId: created.id
				}))
			);
		} catch (error) {
			if (isUniqueViolation(error)) {
				// The whole transaction is about to roll back, so the booking row we
				// inserted a moment ago will vanish with it. Nothing to clean up.
				throw new BookingError('slot_taken', 'Sorry — that time was booked moments ago.');
			}
			throw error;
		}

		return created;
	});
}`
			},

			{ type: 'h3', id: 'order', text: 'Why that order' },
			{
				type: 'ol',
				items: [
					'**Re-derive availability.** The customer may have had the page open since breakfast. This catches the ordinary case and produces a specific, kind error.',
					'**Upsert the customer.** Before the booking, because the booking references it.',
					'**Insert the booking.** Now we have an ID for the claims to point at.',
					'**Claim the cells.** The step that can lose a race — and the only step that guarantees anything.'
				]
			},
			{
				type: 'p',
				text: 'Steps 1 and 4 look redundant. They are not: step 1 exists to produce a *good error message* in the common case, and step 4 exists to be *correct* in the rare one. Delete step 1 and the app still cannot double-book, it is just ruder about the ordinary case. Delete step 4 and it double-books.'
			},
			{
				type: 'p',
				text: 'Notice how carefully step 1 splits its refusal into three. "No longer available", "too close to now" and "the diary is not open that far ahead" are the same failure to the code and three different problems to the person reading them — and only one of the three is solved by picking another time.'
			},

			{ type: 'h3', id: 'after-commit', text: 'Publishing after the commit, not inside it' },
			{
				type: 'p',
				text: '`publishDiaryChange` sits **outside** the transaction — outside the write queue entirely, in the thin wrapper. If it were inside, a dashboard could be woken up, re-read the diary, and see nothing, because the transaction it was told about had not committed yet. Worse, a transaction that then rolled back would have announced a slot as taken that is still free. It is a race that reproduces about one time in fifty and reads as "the live update sometimes misses one".'
			},

			{ type: 'h3', id: 'sequential', text: 'A trap inside transactions' },
			{
				type: 'code',
				file: 'do not do this',
				lang: 'ts',
				code: `
// Inside a libSQL transaction, this fails:
const [rules, claims] = await Promise.all([
	tx.select().from(availabilityRule).where(...),
	tx.select().from(slotClaim).where(...)
]);
// → "cannot commit transaction - SQL statements in progress"`
			},
			{
				type: 'p',
				text: 'A libSQL transaction is a single connection with one statement in flight at a time. `Promise.all` starts the second query before the first has finished and the transaction can never be committed. Two `await`s on separate lines is the fix; the parallelism you lose was never real.'
			},

			{ type: 'h3', id: 'errors', text: 'Errors with codes' },
			{
				type: 'code',
				file: 'src/lib/server/scheduling.ts',
				lang: 'ts',
				code: `
export type BookingErrorCode =
	| 'slot_taken'          // somebody else claimed it in the last few milliseconds
	| 'slot_not_offered'    // it stopped being offered — hours changed, day off added
	| 'service_unavailable'
	| 'staff_unavailable'
	| 'too_soon'
	| 'too_far_ahead'
	| 'not_found'
	| 'already_cancelled'
	| 'too_late_to_cancel';

export class BookingError extends Error {
	readonly code: BookingErrorCode;

	constructor(code: BookingErrorCode, message: string) {
		super(message);
		this.name = 'BookingError';
		this.code = code;
	}
}`
			},
			{
				type: 'p',
				text: 'A code **and** a message. The message is for the person; the code is for the interface, which can decide to refresh the grid on `slot_taken`, apologise on `too_far_ahead`, and — as the customer\'s cancel command does — return **409** rather than 400 for `too_late_to_cancel`, because the request was valid and the world moved on. Matching on message text works right up until somebody improves the wording.'
			},

			{
				type: 'checkpoint',
				text: 'A booking taken through `createBooking` appears in the database with the right number of claim rows, and asking for the same slot twice produces a `BookingError` with code `slot_taken`.'
			}
		]
	},

	{
		slug: 'telling-everyone-something-changed',
		title: 'Telling everyone something changed',
		summary:
			'A tiny publish/subscribe module built on async generators — the engine behind the live diary.',
		goal: 'A `watchDiary` generator that wakes on change, coalesces bursts, and cleans up after itself.',
		blocks: [
			{
				type: 'p',
				text: 'The receptionist has the diary open all day. A booking arrives from the website and has to appear on their screen without anybody pressing anything. That needs a way for the write path to tell the read path that something moved.'
			},
			{
				type: 'p',
				text: 'It does not need Redis, or WebSockets, or a message broker. Both halves are in the same process, so an object and a `Set` will do.'
			},

			{ type: 'h3', id: 'keys', text: 'What a watcher watches' },
			{
				type: 'code',
				file: 'src/lib/server/diary-events.ts',
				lang: 'ts',
				code: `
/** One key per business per local day: \`biz_123:2026-08-14\`. */
export function diaryKey(businessId: string, when: Date | number, zone: string): string {
	return \`\${businessId}:\${instantToIsoDate(when, zone)}\`;
}`
			},
			{
				type: 'p',
				text: 'Granularity is a judgement call. Per-business would wake every screen in the salon for a booking three weeks out. Per-appointment would be precise and useless — the dashboard wants to know about appointments it has not seen yet. Per-business-per-day is the level a human actually looks at.'
			},

			{ type: 'h3', id: 'generator', text: 'The generator' },
			{
				type: 'code',
				file: 'src/lib/server/diary-events.ts',
				lang: 'ts',
				code: `
export async function* watchDiary(
	key: string,
	{ signal, intervalMs }: WatchOptions
): AsyncGenerator<void> {
	let wake: (() => void) | undefined;
	let pending = false;

	const bump = () => {
		pending = true;
		wake?.();
	};

	const onAbort = () => wake?.();
	signal.addEventListener('abort', onAbort, { once: true });

	let set = listeners.get(key);
	if (!set) listeners.set(key, (set = new Set()));
	set.add(bump);

	const timer = intervalMs ? setInterval(bump, intervalMs) : undefined;
	// Keep a periodic tick from holding the process open on shutdown.
	if (timer && typeof timer === 'object' && 'unref' in timer) timer.unref();

	try {
		while (!signal.aborted) {
			if (pending) {
				pending = false;
				yield;
				continue;
			}

			await new Promise<void>((resolve) => {
				wake = resolve;
			});
			wake = undefined;
		}
	} finally {
		if (timer) clearInterval(timer);
		set.delete(bump);
		if (set.size === 0) listeners.delete(key);
		signal.removeEventListener('abort', onAbort);
	}
}`
			},
			{
				type: 'ul',
				items: [
					'**`pending` is a flag, not a counter.** Five bookings landing in the same second wake the watcher once and it re-reads the diary once. Counting them would produce five identical re-reads. Coalescing is the correct behaviour, not a shortcut.',
					'**The sleep has no timeout of its own.** The promise resolves only when `bump` is called — by a publish, by the interval, or by the abort listener. Nothing spins.',
					'**`timer.unref()`** keeps a periodic tick from holding the Node process open at shutdown. Without it, `SIGTERM` on a server with one open diary page waits for a timer that will never be the last thing to happen.',
					'**`finally` always runs.** When the browser tab closes, the generator is disposed, the listener is removed, and the key is dropped from the map once nobody is left. Without that, every page view leaks a subscriber forever.'
				]
			},
			{
				type: 'warn',
				text: 'When we first tested this, one test asserted that two rapid publishes produced two yields. It failed — and **the test was wrong, not the code**. Coalescing is deliberate. The test now asserts the coalescing explicitly, which is a better test: it documents the design instead of accidentally contradicting it.'
			},

			{ type: 'h3', id: 'publish', text: 'Publishing' },
			{
				type: 'code',
				file: 'src/lib/server/diary-events.ts',
				lang: 'ts',
				code: `
export function publishDiaryChange(key: string): void {
	for (const listener of subscribers(key)) listener();
}

/** How many watchers a key has. Exposed for tests and health checks. */
export function watcherCount(key: string): number {
	return subscribers(key).size;
}`
			},
			{
				type: 'p',
				text: '`watcherCount` exists so a test can assert the leak does not happen: start a watcher, abort it, assert the count is back to zero. Leaks are invisible until production has been up for a week, so the only sensible time to check is now.'
			},

			{
				type: 'checkpoint',
				text: 'A test can start `watchDiary`, publish twice in quick succession, and observe exactly one yield — and after aborting, `watcherCount` is zero.'
			}
		]
	}
];
