/**
 * PART 2 — The database (chapters 10–14)
 *
 * Where the app stops being a set of functions and starts being able to refuse
 * things. The chapter on the composite primary key is the most important one in
 * the course; everything else in this part exists to make sense of it.
 */

export const part2 = [
	{
		slug: 'a-database-in-a-file',
		title: 'A database in a file',
		summary:
			'SQLite through libSQL and Drizzle, and the two pragmas that decide whether it can serve a website at all.',
		goal: 'A working database connection, with WAL mode on and a type-safe query builder over it.',
		blocks: [
			{
				type: 'p',
				text: 'We are using **SQLite**, through a driver called **libSQL**, with **Drizzle** as the query builder on top. Three names, three jobs:'
			},
			{
				type: 'ul',
				items: [
					'**SQLite** is the database itself: a single file on disk, no server process, no port, no password.',
					'**libSQL** is a fork of SQLite that speaks the same SQL but can also talk to a hosted database over HTTP. Same code, local file today, managed service tomorrow.',
					'**Drizzle** is a query builder that knows your schema. You write TypeScript; it writes SQL; your editor knows the shape of every row that comes back.'
				]
			},

			{ type: 'h3', id: 'why-sqlite', text: 'Why SQLite for a real product' },
			{
				type: 'p',
				text: 'The reflex is that SQLite is a toy and a "real" app needs Postgres. For a booking platform, the reflex is wrong in an interesting way.'
			},
			{
				type: 'p',
				text: 'A salon takes perhaps forty bookings a day. The entire business fits in a few megabytes. The read pattern is "show me this week", which is one indexed range scan. There is no query in this app that SQLite handles in a meaningfully different way from Postgres — and the operational difference is enormous: no connection pool, no separate process to keep alive, no network hop, and a backup is `cp`.'
			},
			{
				type: 'note',
				text: 'The honest limit: SQLite allows exactly **one writer at a time**, across the whole file. That is a real constraint, we will hit it in chapter 14, and the fix is four lines. It is not a reason to reach for a database server on day one.'
			},

			{ type: 'h3', id: 'install', text: 'Installing' },
			{
				type: 'terminal',
				code: 'pnpm add drizzle-orm @libsql/client\npnpm add -D drizzle-kit'
			},
			{
				type: 'warn',
				text: '`@libsql/client` and `drizzle-orm` go in **dependencies**, not `devDependencies`. Vite bundles devDependencies into the server build, and `@libsql/client` loads a native binary at runtime that cannot be bundled. Get this wrong and the app builds perfectly, deploys perfectly, and dies on first request with `Cannot find module \'@libsql/linux-x64-gnu\'`. This cost real time on this project.'
			},

			{ type: 'h3', id: 'connection', text: 'The connection' },
			{
				type: 'code',
				file: 'src/lib/server/db/index.ts',
				lang: 'ts',
				code: `
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { DATABASE_URL, DATABASE_AUTH_TOKEN } from '$app/env/private';
import * as schema from './schema.ts';

const client = createClient({
	url: DATABASE_URL,
	authToken: DATABASE_AUTH_TOKEN
});

export const db = drizzle(client, { schema });`
			},
			{
				type: 'p',
				text: 'Passing `{ schema }` is what turns on the relational query builder — `db.query.booking.findMany({ with: { customer: true } })` — and gives every result its proper type. Without it you still get SQL, but you lose the part that makes Drizzle worth using.'
			},

			{ type: 'h3', id: 'pragmas', text: 'The two pragmas' },
			{
				type: 'p',
				text: 'A fresh SQLite database is configured for a command-line tool, not a website. Two settings need changing, and one of them has a trap in it.'
			},
			{
				type: 'code',
				file: 'src/lib/server/db/index.ts',
				lang: 'ts',
				code: `
void (async () => {
	try {
		await client.execute('PRAGMA journal_mode = WAL');
		await client.execute('PRAGMA busy_timeout = 5000');
	} catch (error) {
		console.warn('[db] could not apply pragmas; continuing with defaults', error);
	}
})();`
			},
			{
				type: 'ul',
				items: [
					'**`journal_mode = WAL`** — write-ahead logging. Without it, a single writer blocks every reader for the duration of its transaction. With it, readers carry on against the last committed state while a write is in progress. For a page that streams live availability to visitors, this is the difference between working and not.',
					'**`busy_timeout = 5000`** — how long a blocked connection waits before giving up. We will come back to why this alone is not the answer.'
				]
			},
			{
				type: 'warn',
				text: 'These are two separate `execute` calls, and they must be. `client.batch()` wraps its statements in a transaction, and SQLite refuses to change journal mode inside one: *"cannot change into wal mode from within a transaction"*. Written as a batch, the `catch` above swallows the error and WAL silently never applies — the app works, slowly and mysteriously, under any concurrent load. Discovering that took an afternoon.'
			},
			{
				type: 'why',
				title: 'One is permanent, one is not',
				text: '`journal_mode` is written into the database file and survives restarts. `busy_timeout` is a property of the **connection** and must be set again every time you open one. That asymmetry is why both live here, at connection time, rather than in a migration.'
			},

			{
				type: 'checkpoint',
				text: '`pnpm run dev` starts without database errors, and running `PRAGMA journal_mode;` against the file returns `wal`.'
			}
		]
	},

	{
		slug: 'the-schema',
		title: 'The schema',
		summary:
			'Nine tables, two storage conventions, and the snapshots that keep last year’s receipts honest.',
		goal: 'Write `schema.ts` and be able to justify every column type in it.',
		blocks: [
			{
				type: 'p',
				text: 'Two conventions run through the whole file. Learn them here and the rest reads itself.'
			},
			{
				type: 'ol',
				items: [
					'**Instants are stored as `timestamp_ms`** — a 64-bit integer of milliseconds since 1970 UTC, which Drizzle hands back as a `Date`. Calling `.getHours()` on one is always a bug in this codebase.',
					'**Wall-clock times are stored as minutes past local midnight** — a plain integer, 540 for nine in the morning. Storing opening hours as instants would be a category error and would break twice a year.'
				]
			},
			{
				type: 'p',
				text: 'That is chapter 5 turned into column types. Everything hard about this app is downstream of keeping those two apart.'
			},

			{ type: 'h3', id: 'helpers', text: 'Three helpers, defined once' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
/** Every table gets the same primary key shape, so define it once. */
const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => newId());

/** SQLite has no \`now()\` that Drizzle can default to, so spell it out once. */
const nowMs = sql\`(cast(unixepoch('subsecond') * 1000 as integer))\`;

const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs);

const updatedAt = () =>
	integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(nowMs)
		.$onUpdate(() => new Date());`
			},
			{
				type: 'p',
				text: 'IDs are generated in JavaScript rather than by the database. Auto-incrementing integers leak information — `/booking/1834` tells a competitor roughly how many bookings you have taken and lets anybody walk your entire table by counting — and they cannot be generated before the insert, which matters when a booking and its dozen grid claims have to reference each other.'
			},
			{
				type: 'note',
				text: '`$onUpdate` runs in JavaScript, not SQL, so it applies when Drizzle performs the update. A row changed by a migration or by `sqlite3` on the command line will not have its `updated_at` touched. That is a fair trade for not needing a trigger.'
			},

			{ type: 'h3', id: 'business', text: 'The most important column in the app' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
timeZone: text('time_zone').notNull(),`
			},
			{
				type: 'p',
				text: 'One line on the `business` table, and everything else bends around it. Opening hours are interpreted in it, the owner\'s diary is drawn in it, and a customer in another zone sees times converted from it.'
			},
			{
				type: 'warn',
				text: 'Store `Europe/London`, never `+01:00`. An **offset** is a fact about one moment; a **zone** is a set of rules about all of them. A business stored as `+01:00` is wrong for five months of the year, and the bug arrives on a Sunday morning in October with nobody around to notice.'
			},

			{ type: 'h3', id: 'snapshots', text: 'Snapshots: why a booking repeats itself' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
serviceId: text('service_id')
	.notNull()
	.references(() => service.id, { onDelete: 'restrict' }),

/* --- snapshots, frozen at booking time --- */
serviceName: text('service_name').notNull(),
durationMinutes: integer('duration_minutes').notNull(),
priceCents: integer('price_cents').notNull(),
currency: text('currency').notNull(),

/**
 * The business's zone as it was when this was booked. Snapshotted because a
 * business can move, and "your appointment was at 2pm" should not silently
 * become 3pm in the confirmation you look at a year later.
 */
timeZone: text('time_zone').notNull(),`
			},
			{
				type: 'p',
				text: 'The booking holds a foreign key to the service **and** a copy of the service\'s name, duration, price and currency. That looks like sloppy normalisation. It is the opposite.'
			},
			{
				type: 'why',
				title: 'A receipt is a historical document',
				text: 'The owner raises the price of a cut from £45 to £52 on Monday. Without the snapshot, every booking ever taken — including the ones already paid for — now displays £52, and last quarter\'s takings change retroactively. Reference data answers "what is it now". A booking has to answer "what was it then". Those are different questions and they need different storage.'
			},
			{
				type: 'p',
				text: 'The same reasoning explains `onDelete: \'restrict\'` on the service: the database refuses to delete a service that has bookings against it. Hiding a service is a flag (`isActive`); deleting one that has history is not something we let anybody do by accident.'
			},

			{ type: 'h3', id: 'two-pairs', text: 'Two pairs of times, on purpose' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
/** What the customer was told: the appointment itself. */
startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),

/**
 * What the diary actually loses: the appointment plus its buffers. Every
 * clash check works on this pair, never on \`startsAt\`/\`endsAt\`.
 */
blockStartsAt: integer('block_starts_at', { mode: 'timestamp_ms' }).notNull(),
blockEndsAt: integer('block_ends_at', { mode: 'timestamp_ms' }).notNull(),`
			},
			{
				type: 'p',
				text: 'Confirmation emails and the customer\'s "manage your booking" page read the first pair. Everything to do with clashes reads the second. Mixing them up in one direction overbooks the diary; in the other, it tells the customer to arrive ten minutes early forever.'
			},

			{ type: 'h3', id: 'token', text: 'A bearer credential, named as one' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
/**
 * The secret in the "manage your booking" link. Whoever holds it may cancel,
 * so it is a bearer credential and is never rendered anywhere except that
 * one email.
 */
manageToken: text('manage_token').notNull(),`
			},
			{
				type: 'p',
				text: 'Customers do not have accounts — asking somebody to create a password to book a haircut is how you lose the booking. So the link in their email *is* the authentication. Calling the column `manageToken` and writing that comment above it is a small thing that keeps a future contributor from rendering it on an admin page "for debugging".'
			},

			{
				type: 'checkpoint',
				text: '`schema.ts` defines business, staff, service, staffService, availabilityRule, timeOff, customer and booking, and you can explain why `priceCents` is duplicated onto the booking.'
			}
		]
	},

	{
		slug: 'the-line-that-stops-double-booking',
		title: 'The line that stops double-booking',
		summary:
			'The whole concurrency problem, solved by a primary key. This is the most important chapter in the course.',
		goal: 'Understand why no amount of checking-then-inserting is safe, and why one line of DDL is.',
		blocks: [
			{
				type: 'p',
				text: 'Back to chapter 1\'s problem. Two customers, one eleven o\'clock, requests arriving in the same millisecond. Here is the code that does not work, one more time:'
			},
			{
				type: 'code',
				file: 'still wrong',
				lang: 'ts',
				code: `
await db.transaction(async (tx) => {
	const clash = await tx.select().from(booking).where(overlaps(start, end));
	if (clash.length > 0) throw new Error('Taken');

	await tx.insert(booking).values({ start, end, customerId });
});`
			},
			{
				type: 'p',
				text: 'A transaction gives you **atomicity** — all of it happens or none of it does. It does not give you **exclusion**. Both transactions read an empty result, both decide the slot is free, both insert, both commit. Every statement succeeded. The data is wrong.'
			},
			{
				type: 'warn',
				text: 'The window is a few milliseconds wide. It will not happen while you are testing. It will happen the morning the studio posts a promotion, and the first you hear of it is two people standing in a doorway.'
			},

			{ type: 'h3', id: 'shape', text: 'Changing the shape of the question' },
			{
				type: 'p',
				text: 'The fix is not better checking. It is to stop asking a question and start making a **claim** — and to arrange things so that the database itself can only accept one.'
			},
			{
				type: 'p',
				text: 'Remember the five-minute grid. An appointment is a run of cells. So give the cells their own table, one row per cell per person, and make the pair *(person, cell)* the primary key.'
			},
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
export const slotClaim = sqliteTable(
	'slot_claim',
	{
		staffId: text('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'cascade' }),

		/** The instant this five-minute cell begins. Always a multiple of \`SLOT_MS\`. */
		slotStart: integer('slot_start', { mode: 'timestamp_ms' }).notNull(),

		bookingId: text('booking_id')
			.notNull()
			.references(() => booking.id, { onDelete: 'cascade' })
	},
	(t) => [
		// The entire concurrency story, in one line.
		primaryKey({ columns: [t.staffId, t.slotStart] }),
		index('slot_claim_booking_idx').on(t.bookingId)
	]
);`
			},
			{
				type: 'p',
				text: 'A 45-minute cut with a 10-minute tidy-up is 11 cells, so booking it inserts 11 rows. If any one of those rows collides with a row that already exists, the insert fails, the transaction rolls back, and **nothing** is written.'
			},

			{
				type: 'why',
				title: 'Why this is different in kind, not degree',
				text: 'A primary key is not a check your code performs. It is a promise the storage engine makes, enforced by the same machinery that keeps the file from corrupting. There is no interleaving of two requests that produces two rows with the same *(staffId, slotStart)* — not on a slow day, not under load, not if your process is duplicated across eight machines. You cannot write this bug once the constraint exists.'
			},

			{ type: 'h3', id: 'losing-well', text: 'Losing well' },
			{
				type: 'p',
				text: 'Which leaves one job: when the constraint fires, turn a database error into a sentence a person can act on.'
			},
			{
				type: 'code',
				file: 'src/lib/server/scheduling.ts',
				lang: 'ts',
				code: `
export function isUniqueViolation(error: unknown): boolean {
	// Bounded so a self-referencing cause cannot spin forever.
	for (let current = error, depth = 0; current instanceof Error && depth < 8; depth += 1) {
		const code = 'code' in current ? String(current.code) : '';
		const text = \`\${current.message} \${code}\`;

		if (
			text.includes('SQLITE_CONSTRAINT_PRIMARYKEY') ||
			text.includes('SQLITE_CONSTRAINT_UNIQUE') ||
			text.includes('UNIQUE constraint failed')
		) {
			return true;
		}

		current = current.cause;
	}

	return false;
}`
			},
			{
				type: 'p',
				text: 'Two things make that fiddlier than it looks, and both were learned the hard way.'
			},
			{
				type: 'p',
				text: '**The cause chain.** Drizzle wraps the driver\'s error in its own `Failed query: …`, and libSQL wraps the native SQLite error the same way, so the text we need is two or three links down `.cause`. Reading only the top-level message misses it — and the symptom is subtle: the claim is still refused by the database, so the booking stays safe, but the loser of the race sees a 500 instead of "sorry, just taken".'
			},
			{
				type: 'p',
				text: '**The spelling.** SQLite reports this as `SQLITE_CONSTRAINT_PRIMARYKEY` for a composite primary key, `SQLITE_CONSTRAINT_UNIQUE` for a unique index, and older builds only say `UNIQUE constraint failed`. All three mean "somebody got there first".'
			},
			{
				type: 'p',
				text: 'Matching on message text is uncomfortable, and it is worth being honest that it is a compromise. The alternative — checking first and inserting after — is the exact race this code exists to prevent. So the knowledge has to live somewhere, and it lives in one tested function rather than scattered through the call sites.'
			},
			{
				type: 'p',
				text: 'With it, the handler reads:'
			},
			{
				type: 'code',
				file: 'src/lib/server/scheduling.ts',
				lang: 'ts',
				code: `
try {
	await tx.insert(slotClaim).values(cells);
} catch (error) {
	if (isUniqueViolation(error)) {
		// The whole transaction is about to roll back, so the booking row we
		// inserted a moment ago will vanish with it. Nothing to clean up.
		throw new BookingError('slot_taken', 'Sorry — that time was booked moments ago.');
	}
	throw error;
}`
			},

			{ type: 'h3', id: 'three-layers', text: 'Three layers, one guarantee' },
			{
				type: 'p',
				text: 'The finished booking path has three defences, and it is worth being precise about which one is load-bearing.'
			},
			{
				type: 'ol',
				items: [
					'**Re-derive availability before writing.** Catches the ordinary case — someone left the tab open for an hour — and produces a good error. *Not a guarantee.*',
					'**A write queue.** Keeps two writes in the same process from colliding on SQLite\'s single-writer lock. Politeness, and it evaporates across two servers. *Not a guarantee.*',
					'**The composite primary key.** *This is the guarantee.* Nothing above it can be removed safely, and nothing below it is needed.'
				]
			},
			{
				type: 'note',
				text: 'Being able to say which layer is the guarantee is the difference between a system you trust and one you hope about. If somebody deletes layers 1 and 2, the app gets ruder. If somebody deletes layer 3, the app silently starts double-booking.'
			},

			{ type: 'h3', id: 'cost', text: 'What it costs' },
			{
				type: 'ul',
				items: [
					'**Rows.** A busy salon with two staff generates a few hundred claim rows a day. At 24 bytes a row that is single-digit megabytes a year.',
					'**Cancellation is free.** `onDelete: \'cascade\'` means deleting the booking removes its claims. There is no cleanup job.',
					'**Availability queries get faster.** "Which cells are taken between these two instants" is one indexed range scan returning integers — no overlap arithmetic anywhere.'
				]
			},

			{
				type: 'checkpoint',
				text: 'You can explain to somebody else, without notes, why a transaction does not prevent double-booking and why a composite primary key does.'
			}
		]
	},

	{
		slug: 'migrations-and-seed-data',
		title: 'Migrations and seed data',
		summary:
			'Turning the schema into actual tables, and building a demo studio you can throw away and rebuild in a second.',
		goal: 'A migration you can run repeatedly and a seed script that leaves the database in a known state every time.',
		blocks: [
			{
				type: 'p',
				text: 'The schema file is TypeScript. The database needs SQL. **drizzle-kit** compares the two and writes the difference.'
			},
			{
				type: 'code',
				file: 'drizzle.config.ts',
				lang: 'ts',
				code: `
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit runs OUTSIDE the SvelteKit app — it is a CLI, not part of the
 * server bundle — so it cannot use \`$app/env/private\`, which only exists inside
 * Vite. It reads \`process.env\` directly, which is why the \`db:*\` scripts source
 * \`.env\` first.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set — did you copy .env.example to .env?');

const authToken = process.env.DATABASE_AUTH_TOKEN;

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: { url, ...(authToken ? { authToken } : {}) },
	verbose: true,
	// Prompts before running anything destructive. Leave this on.
	strict: true
});`
			},
			{
				type: 'terminal',
				code: 'pnpm exec drizzle-kit generate   # write the SQL\npnpm exec drizzle-kit migrate    # apply it'
			},
			{
				type: 'p',
				text: 'Read the comment at the top before copying it. Drizzle Kit is a **command-line tool**, not part of the server bundle, so `$app/env/private` — which only exists inside Vite — is unavailable to it. It reads `process.env` directly, which is why the `db:*` scripts source `.env` first. Getting this wrong produces an import error that looks like a bug in Drizzle.'
			},
			{
				type: 'p',
				text: 'Generated migrations are checked into git and never edited afterwards. If a migration is wrong, the fix is another migration — editing an applied one means your database and your history disagree, and every colleague\'s machine drifts a little further from yours.'
			},
			{
				type: 'note',
				text: '`strict: true` makes drizzle-kit ask before doing anything destructive. On a project where a wrong answer drops a table of real appointments, being asked is a feature.'
			},

			{ type: 'h3', id: 'seed', text: 'The seed script' },
			{
				type: 'p',
				text: 'A seed script is not a nicety. Ours is run automatically before **every single end-to-end test**, which is what makes those tests independent of each other and of the order they run in.'
			},
			{
				type: 'code',
				file: 'scripts/seed.ts',
				lang: 'ts',
				code: `
console.log('· clearing');

// Order matters: children before parents, or the foreign keys refuse.
await db.delete(slotClaim);
await db.delete(booking);
await db.delete(timeOff);
await db.delete(availabilityRule);
await db.delete(staffService);
// ...and so on up the tree.`
			},
			{
				type: 'p',
				text: 'One decision in there is worth calling out: the seed **keeps the same business row** rather than dropping and recreating it. Dropping it produced an intermittent 500 in whichever test happened to run next — a live query still streaming to a page the previous test had only just closed would suddenly find its business missing. The failure pointed nowhere near the cause.'
			},

			{ type: 'h3', id: 'relative', text: 'Everything relative to today' },
			{
				type: 'code',
				file: 'scripts/seed.ts',
				lang: 'ts',
				code: `
const today = todayIn(TIME_ZONE);

await seedBooking({
	staffId: ada.id,
	serviceSlug: 'cut-and-finish',
	customerIndex: 0,
	dayOffset: 1,                     // tomorrow, whenever "today" is
	startMinute: 10 * 60,
	note: 'Growing out a bob — please keep the length.'
});`
			},
			{
				type: 'p',
				text: 'Not a single hard-coded date. A seed with `2026-08-14` in it works beautifully until 15 August, at which point the demo diary is empty and every screenshot in your documentation shows a past appointment.'
			},
			{
				type: 'p',
				text: '`seedBooking` inserts the booking **and** its grid claims, exactly as the real code path does. A seed that writes bookings without claims produces a demo where the diary looks full and every slot appears bookable — a very confusing ten minutes.'
			},

			{ type: 'h3', id: 'signposts', text: 'Ending with the directions' },
			{
				type: 'terminal',
				code: `  Seeded Willow Lane Studio.

  Booking page   /book/willow-lane
  Owner sign-in  ada@willowlane.test  halfpast-demo-2026
  Staff sign-in  ben@willowlane.test  halfpast-demo-2026

  Manage a booking as the customer would:
    /booking/QV8XD0E265QH1SW2VH7NN2ZP67`
			},
			{
				type: 'p',
				text: 'Thirty seconds of `console.log` that saves everybody who ever touches this project from hunting through the seed file for a password. Print the manage token too — it is the only way to reach the customer-facing cancel page without an inbox.'
			},

			{
				type: 'checkpoint',
				text: '`pnpm run db:seed` twice in a row leaves the database in exactly the same state, and the printed links all work.'
			}
		]
	},

	{
		slug: 'one-writer-at-a-time',
		title: 'One writer at a time',
		summary:
			'The SQLITE_BUSY error, why the obvious fix deadlocks in Node, and a nine-line queue that does not.',
		goal: 'Ten simultaneous bookings for the same slot produce exactly one winner and nine polite refusals — no lock errors.',
		blocks: [
			{
				type: 'p',
				text: 'Everything works. Then you write the test that fires ten booking requests at the same slot simultaneously, and instead of one winner and nine "just taken" messages, you get one winner, a few refusals, and a handful of these:'
			},
			{
				type: 'terminal',
				code: 'SQLITE_BUSY: database is locked'
			},
			{
				type: 'p',
				text: 'SQLite allows exactly one writer at a time across the whole file. Two write transactions in the same process collide, and the second is told to go away.'
			},

			{ type: 'h3', id: 'the-trap', text: 'The obvious fix, and why it is worse' },
			{
				type: 'p',
				text: 'Every search result says: raise `PRAGMA busy_timeout`. A blocked writer then waits instead of failing.'
			},
			{
				type: 'warn',
				text: 'In Node this is actively dangerous. The local SQLite driver is **synchronous** underneath its promises. A waiting writer blocks the one and only thread — including the thread the *first* transaction needs in order to finish and release the lock. The two wait for each other until the timeout expires. A deadlock with a stopwatch on it is still a deadlock, and it fails five seconds later instead of instantly, which is worse for everyone.'
			},

			{ type: 'h3', id: 'the-queue', text: 'Queue in JavaScript instead' },
			{
				type: 'p',
				text: 'Writers should wait at an `await`, where the event loop is free to run the work that releases the lock.'
			},
			{
				type: 'code',
				file: 'src/lib/server/write-queue.ts',
				lang: 'ts',
				code: `
export class WriteQueue {
	/**
	 * The end of the chain. \`catch\` is attached immediately so that a rejected
	 * task does not poison the queue for everyone behind it — the rejection is
	 * still delivered to that task's own caller, which is where it belongs.
	 */
	#tail: Promise<unknown> = Promise.resolve();

	#depth = 0;

	get depth(): number {
		return this.#depth;
	}

	async run<T>(task: () => Promise<T>): Promise<T> {
		this.#depth += 1;

		const result = this.#tail.then(task, task);

		// The chain must continue whether this task resolved or threw, so the next
		// waiter runs either way. The swallowed rejection here is not lost: it is
		// the same promise \`result\` returns to the caller.
		this.#tail = result.then(
			() => undefined,
			() => undefined
		);

		try {
			return await result;
		} finally {
			this.#depth -= 1;
		}
	}
}

export const writeQueue = new WriteQueue();`
			},
			{
				type: 'p',
				text: 'Read `this.#tail.then(task, task)` — the same function passed as both handlers. That is deliberate: the next task must run whether its predecessor resolved or threw. Passing it only as the success handler builds a queue that stops forever the first time anything fails.'
			},
			{
				type: 'p',
				text: 'The double `.then(() => undefined, () => undefined)` on the next line is what keeps a rejection from propagating down the chain and taking out every waiter behind it. The caller still gets the rejection, because `result` is the promise they are awaiting.'
			},
			{
				type: 'why',
				title: 'A promise chain, not a list of waiters',
				text: 'There is no array, no `shift()`, no timers, and no way to lose a waiter or leak one. The queue *is* the promise chain. Nine lines of logic that need no maintenance is a better shape than forty lines that need care.'
			},

			{ type: 'h3', id: 'not-the-guarantee', text: 'What this is not' },
			{
				type: 'warn',
				text: 'The queue is **one process\'s politeness**. It evaporates the moment the app runs on two instances or moves to a hosted libSQL. It exists so that the normal case is a clean error instead of a lock timeout. The guarantee that two customers cannot take the same slot lives in the primary key on `slot_claim` and nowhere else.'
			},
			{
				type: 'p',
				text: 'Writing that paragraph as a comment at the top of the file is not documentation for its own sake. It is what stops a future maintainer — quite reasonably — deleting a queue that "isn\'t doing anything" or, worse, trusting it as the safety net.'
			},

			{ type: 'h3', id: 'the-test', text: 'Proving it' },
			{
				type: 'code',
				file: 'src/lib/server/scheduling.spec.ts',
				lang: 'ts',
				code: `
it('lets exactly one of ten simultaneous requests win', async () => {
	const attempts = Array.from({ length: 10 }, (_, index) =>
		createBooking({ ...base, customerName: \`Racer \${index}\` })
	);

	const results = await Promise.allSettled(attempts);

	const won = results.filter((r) => r.status === 'fulfilled');
	const lost = results.filter((r) => r.status === 'rejected');

	expect(won).toHaveLength(1);
	expect(lost).toHaveLength(9);

	// Every loser got the right refusal, not a lock error or a stack trace.
	for (const failure of lost) {
		expect((failure.reason as BookingError).code).toBe('slot_taken');
	}

	// And nothing half-written survived: one booking, and claims only for it.
	const bookings = await db.select().from(booking);
	const claims = await db.select().from(slotClaim);

	expect(bookings).toHaveLength(1);
	expect(new Set(claims.map((c) => c.bookingId))).toEqual(new Set([bookings[0]!.id]));
});`
			},
			{
				type: 'p',
				text: 'The last two assertions are the ones people leave out. "Exactly one winner" can be true while the database is full of orphaned claim rows from the nine rolled-back transactions. Checking that every claim belongs to the surviving booking is what proves the rollback actually rolled back.'
			},

			{
				type: 'checkpoint',
				text: 'The ten-way race test passes, and passes again on the twentieth run. No `SQLITE_BUSY` appears anywhere in the output.'
			}
		]
	}
];
