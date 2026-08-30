/**
 * PART 7 — Running it (chapters 39–43)
 *
 * The work that separates a project that demos from one somebody can operate:
 * changing the schema without an outage, turning a feature off without a
 * deploy, charging for it, proving it is right, and knowing when it is not.
 */

export const part7 = [
	{
		slug: 'migrations-without-a-framework',
		title: 'Migrations without a framework',
		summary:
			'Sixty lines that apply a change once and record it — and the three rules that make a rolling deploy survivable.',
		goal: 'Change a live schema while both the old and the new code are running.',
		blocks: [
			{
				type: 'p',
				text: '`schema.ts` is written entirely in `CREATE TABLE IF NOT EXISTS`, so running it against an existing database does nothing. That is exactly right for *creating* a venue and useless for *changing* one — `ALTER TABLE firm ADD COLUMN billable_from` has no `IF NOT EXISTS`, so it succeeds once and then fails on every subsequent start with "duplicate column name".'
			},
			{
				type: 'p',
				text: 'So changes go in a numbered list, applied once, recorded.'
			},
			{
				type: 'code',
				file: 'packages/store/src/migrate.ts',
				lang: 'ts',
				code: `
export interface Migration {
	/** Monotonic. Gaps are fine; duplicates are not. */
	readonly id: number;
	readonly name: string;
	/** Statements, applied in order inside one transaction. */
	readonly statements: readonly string[];
}

/**
 * Every migration, in order.
 *
 * Appended to, never edited. Changing a migration that has already run
 * somewhere means two databases with the same recorded version and different
 * shapes — and nothing will tell you until a query fails on one of them.
 */
export const MIGRATIONS: readonly Migration[] = [
	{
		id: 1,
		name: 'firm.billable_from',
		statements: [
			// …
			'ALTER TABLE firm ADD COLUMN billable_from INTEGER'
		]
	},
	// …
];`
			},
			{
				type: 'p',
				text: 'One transaction per migration, and the version row is written **inside** it. So a migration either happened and is recorded, or neither — there is no state where the schema changed and the venue does not know.'
			},
			{
				type: 'note',
				text: '`assertNoDuplicateIds()` runs at startup. Two people branching off the same commit both write migration 3, both merge, and the second one silently never runs — the recorded version is already 3. A three-line check at boot turns a merge accident into a startup error.'
			},

			{ type: 'h3', id: 'expand-contract', text: 'Expand, migrate, contract' },
			{
				type: 'why',
				title: 'The rule that makes a deploy survivable',
				text: '**The old code and the new code must both work against the database at every moment in between.** During a rolling deploy they are running simultaneously; there is no instant at which only one version exists. Every migration rule follows from that one sentence.'
			},
			{
				type: 'p',
				text: 'It forbids the two changes everybody reaches for first.'
			},
			{
				type: 'ul',
				items: [
					'**Renaming a column.** Old code selects the old name and dies. Instead: add the new column, write both for a release, backfill, switch reads, and drop the old one a release later. Three deploys instead of one, and no outage.',
					'**Adding a `NOT NULL` column without a default.** Every insert from the old code omits it and fails. Add it nullable, backfill, tighten later — if at all.'
				]
			},
			{
				type: 'code',
				file: 'packages/store/src/migrate.ts',
				lang: 'ts',
				code: `
/*
 * Nullable, with no default.
 *
 * A firm is created during onboarding and often starts paying later, so
 * \`created_at\` is the wrong date to prorate from — and prorating from the
 * wrong date is the most common billing complaint there is.
 *
 * Nullable rather than \`NOT NULL DEFAULT 0\`: null means "not yet
 * billable", which is a real state, and a default of zero would mean
 * every existing firm was billable from 1970.
 */
'ALTER TABLE firm ADD COLUMN billable_from INTEGER'`
			},
			{
				type: 'p',
				text: 'Note the second half of that comment. `NOT NULL DEFAULT 0` would have satisfied the migration rule and produced a wrong answer: every existing firm billable from the epoch. "Nullable" was not a compromise for the deploy — null was the honest value.'
			},

			{ type: 'h3', id: 'no-down', text: 'No down migrations' },
			{
				type: 'warn',
				text: 'There are no `down` migrations in this project, and their absence is deliberate. A rollback that runs `DROP COLUMN` destroys the data written since the deploy, and the moment you need a rollback is the moment you can least afford that.'
			},
			{
				type: 'p',
				text: 'The recovery path for a bad migration is a **new migration**. Forward only, like the event log, like the ledger, like everything else in this venue. The pattern repeats because it is the same insight each time: the past is not editable, and systems that pretend otherwise lose information exactly when it matters.'
			},
			{
				type: 'p',
				text: 'The rules above are enforced by review rather than by code, which is why they are written at the top of `migrate.ts` — where the next person adding a migration will read them, rather than in a wiki they will not.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why `CREATE TABLE IF NOT EXISTS` is not a migration strategy',
					'You can state the rolling-deploy rule and derive the rename procedure from it',
					'You can explain why the version row is written inside the migration transaction',
					'You can explain why there are no down migrations'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'feature-flags-and-the-pause',
		title: 'Feature flags, and the pause',
		summary:
			'A flag may change what the venue offers. It may never change what the engine decides.',
		goal: 'Turn a feature off during an incident without a deploy — and without breaking replay.',
		blocks: [
			{
				type: 'why',
				title: 'The rule',
				text: '**A flag may change what the venue offers. It may never change what the engine decides.** That is not a style preference; it is what keeps replay meaningful. The engine is a pure function from (state, command) to events, and replaying the log reproduces history exactly. Put a flag inside it and that stops being true: the same log replayed tomorrow, with the flag in a different position, produces different events. The venue could no longer answer "what happened in March" — only "what would happen in March if the flags were as they are now".'
			},
			{
				type: 'p',
				text: 'So flags live in the layer that decides whether a *command is accepted at all*, and never inside `@sequent/core`. The dependency graph enforces it: `core` does not depend on `store`, so it cannot import the flags module even by accident.'
			},

			{ type: 'h3', id: 'declared', text: 'Declared, not free-form' },
			{
				type: 'code',
				file: 'packages/store/src/flags.ts',
				lang: 'ts',
				code: `
export const FLAGS = {
	accept_orders: {
		default: true,
		description:
			'Accept new orders at the gateway. Off is a venue-wide pause that leaves existing orders resting.'
	},
	// …
	deliver_webhooks: {
		default: true,
		description: 'Let the worker deliver webhooks. Off queues them, it does not drop them.'
	},
	// …
	new_firm_signup: {
		default: false,
		description: 'Allow a new member firm to be created. Off by default: onboarding is manual.'
	}
} as const;

export type FlagName = keyof typeof FLAGS;`
			},
			{
				type: 'p',
				text: 'A typo\'d name in `get(\'new_chekout\')` returns the default forever, silently, and the feature simply never turns on. Declaring them makes that a type error instead of a bad afternoon — and gives "the list of things that can be switched off" a single place to be read from.'
			},
			{
				type: 'note',
				text: 'Every `default` is the **safe** value, so a fresh venue behaves conservatively rather than shipping whatever the newest code does. `new_firm_signup` defaults to `false` for exactly that reason.'
			},

			{ type: 'h3', id: 'what-for', text: 'What flags are for, and what they are not' },
			{
				type: 'p',
				text: 'Turning a feature off in an incident, without a deploy. That is the entire value, and it is enormous — the difference between a five-minute fix and a forty-minute rollback with a merge conflict in the middle.'
			},
			{
				type: 'warn',
				text: 'They are not for A/B tests, gradual rollouts of engine behaviour, or "config that changes sometimes". A flag that has been on for a year is not a flag; it is a branch nobody deletes, and it doubles the number of states the venue can be in.'
			},

			{ type: 'h3', id: 'cache', text: 'Cached, and never throwing' },
			{
				type: 'code',
				file: 'packages/store/src/flags.ts',
				lang: 'ts',
				code: `
async enabled(name: FlagName, now = Date.now()): Promise<boolean> {
	const cached = this.#cache.get(name);
	if (cached && now - cached.readAt < this.#cacheMs) return cached.value;

	try {
		const result = await this.#client.execute({
			sql: 'SELECT enabled FROM feature_flag WHERE name = ?',
			args: [name]
		});

		const row = result.rows[0];
		const value = row === undefined ? FLAGS[name].default : Number(row['enabled']) === 1;

		this.#cache.set(name, { value, readAt: now });
		return value;
	} catch {
		/*
		 * Fall back to the last known value, or the declared default.
		 *
		 * Not to \`false\`. "Database unreachable" and "somebody turned this off"
		 * are different facts, and conflating them means a blip in the flag
		 * store halts trading — an outage caused entirely by the mechanism
		 * meant to prevent one.
		 */
		return cached?.value ?? FLAGS[name].default;
	}
}`
			},
			{
				type: 'p',
				text: 'Five seconds of cache. Long enough that a busy venue does one query per flag per five seconds rather than one per request; short enough that "I turned it off" and "it is off" are the same sentence in an incident.'
			},
			{
				type: 'why',
				title: 'Why that staleness is acceptable here and nowhere else',
				text: 'Nobody flips a flag and needs it within 200ms. It would be entirely the wrong trade for a **permission**, where a revoked role must take effect on the next request — which is precisely why permissions are not implemented as flags.'
			},

			{ type: 'h3', id: 'reason', text: 'The reason is mandatory' },
			{
				type: 'code',
				file: 'packages/store/src/flags.ts',
				lang: 'ts',
				code: `
if (!input.reason.trim()) {
	throw new Error('A flag change needs a reason. "Why is this off" is the question.');
}`
			},
			{
				type: 'p',
				text: 'Six weeks later, "why is `deliver_webhooks` off?" is the whole question, and a flag table that records only the value cannot answer it. Making the field mandatory is the cheapest possible way to get an answer written down at the moment somebody still knows it.'
			},

			{ type: 'h3', id: 'where', text: 'Where the check goes' },
			{
				type: 'code',
				file: 'apps/web/src/lib/server/gateway.ts',
				lang: 'ts',
				code: `
/*
 * The flag check goes **after** authorisation and before the append.
 *
 * After, because "the venue is paused" is not something to tell somebody who
 * was not allowed to send this anyway — that would leak which commands exist
 * to whoever is probing. Before the append, because a paused venue must not
 * put the command in the log at all: a log entry is a promise the engine will
 * apply it, and pausing means not making that promise.
 */
const flag = FLAG_FOR[authorised.kind];
if (flag && !(await flags.enabled(flag))) {
	// 503, not 403. The caller did nothing wrong and should retry later, which
	// is exactly what 503 means and 403 does not.
	error(503, 'The venue is not accepting new orders at the moment. Cancels still work.');
}`
			},
			{
				type: 'warn',
				text: '`cancel_order` deliberately has **no** flag. A pause that traps somebody\'s resting orders is worse than no pause at all — the entire point of pausing is to let people get out.'
			},
			{
				type: 'p',
				text: 'And this is the 503 whose API translation was missing, from Part 5. The pause worked perfectly, the gateway threw exactly the right status, and the API layer\'s hand-written `if` chain turned it into a 500 on the way out. Three correct components and one stale lookup table.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why a flag inside the engine would destroy replay',
					'You can explain why flags are declared rather than free-form strings',
					'You can explain why a failed flag read falls back to last-known rather than `false`',
					'You can explain why the check sits between authorisation and the append, and why cancels are exempt'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'billing-from-the-log',
		title: 'Billing from the log',
		summary:
			'No payment provider — because everything that goes wrong with billing goes wrong before the charge.',
		goal: 'Meter usage that cannot double count, prorate correctly, and issue invoices that never change.',
		blocks: [
			{
				type: 'p',
				text: 'There is no payment provider in this project, and adding one would be the easy part: a client library and a webhook handler. Everything that actually goes wrong with billing goes wrong **before** the charge.'
			},
			{
				type: 'ul',
				items: [
					'**Proration.** A firm adds a seat on the 12th of a 30-day month. They owe 19/30 of a seat. Get the arithmetic wrong by a rounding and you either overcharge — a support ticket, and at scale a regulator — or undercharge, which nobody reports.',
					'**Metering that cannot double count.** A counter incremented on each order drifts the first time the projector replays a batch, and projectors replay by design.',
					'**Invoices that never change.** "What did we bill them in March" must have an answer.'
				]
			},

			{ type: 'h3', id: 'plans', text: 'Plans as data' },
			{
				type: 'code',
				file: 'packages/store/src/billing.ts',
				lang: 'ts',
				code: `
export interface Plan {
	readonly id: string;
	readonly name: string;
	/** Per seat, per month, in scaled units. £250.00 is 2_500_000. */
	readonly seatPrice: Amount;
	/** Seats included before the per-seat charge starts. */
	readonly includedSeats: number;
	/** Orders included per month; beyond this, the metered rate applies. */
	readonly includedOrders: number;
	/** Per order beyond the allowance, in scaled units. */
	readonly overageRate: Amount;
	readonly maxApiKeys: number;
	readonly maxRatePerSecond: number;
}`
			},
			{
				type: 'p',
				text: 'A table rather than a chain of conditionals, for the same reason the permission matrix in Part 3 is a table: **somebody who is not a programmer has to be able to check it.** A pricing bug found by the finance team reading this table costs nothing. The same bug found by a customer costs a refund and a conversation.'
			},
			{
				type: 'note',
				text: 'Every amount is an integer in the same scaled units as everything else in the venue. Prices, fees and invoice lines share one representation, so a fee the venue earned can be compared with an invoice line without a conversion nobody would remember to write.'
			},

			{ type: 'h3', id: 'prorate', text: 'Proration, in three lines that are easy to get wrong' },
			{
				type: 'code',
				file: 'packages/store/src/billing.ts',
				lang: 'ts',
				code: `
export function prorate(amount: Amount, daysActive: number, daysInPeriod: number): Amount {
	if (daysInPeriod <= 0) return 0 as Amount;

	const days = Math.max(0, Math.min(daysActive, daysInPeriod));

	// \`amount * days\` before the division, so the integer division happens once
	// at the end. Dividing first would truncate to zero for any amount smaller
	// than the number of days.
	return Math.floor((amount * days) / daysInPeriod) as Amount;
}`
			},
			{
				type: 'p',
				text: 'Multiply before dividing. `(amount / daysInPeriod) * days` looks identical and is not: with integer arithmetic, any amount smaller than the number of days truncates to zero and the whole line is free.'
			},
			{
				type: 'p',
				text: '`Math.floor` and not `Math.round`, deliberately. Rounding sometimes charges a fraction of a penny more than the exact share; flooring never charges more than is owed. Across ten thousand invoices the difference is a few pounds and one category of complaint that never arrives.'
			},
			{
				type: 'p',
				text: 'And whole days, not milliseconds. "You were active for 18.7 days" is not a sentence anybody wants on an invoice, and a proration that depends on the hour a seat was added is a proration that changes if a clock drifts.'
			},

			{ type: 'h3', id: 'metering', text: 'Usage is counted from the log' },
			{
				type: 'code',
				file: 'packages/store/src/billing.ts',
				lang: 'ts',
				code: `
/**
 * What a firm used in a period.
 *
 * Derived by counting the log, not by a counter somebody increments. That is
 * the property that makes it safe to re-run: the same window always produces
 * the same number, however many times a projector has replayed it, and a
 * disputed invoice can be recomputed from first principles months later.
 *
 * A \`usage_counter\` table incremented on each order would be faster and would
 * drift the first time the projector re-applied a batch after a crash — by an
 * amount nobody could ever reconstruct.
 */
export async function usageFor(
	client: Client,
	firmId: string,
	from: number,
	to: number
): Promise<Usage> {
	// …
}`
			},
			{
				type: 'why',
				title: 'The same idea as projections, applied to money',
				text: 'A derived number cannot drift, because there is nothing to drift *from*. If the invoice disagrees with the log, the log wins, and re-deriving fixes it. A counter is a second source of truth about the same fact, and two sources of truth about money is the definition of an accounting problem.'
			},

			{ type: 'h3', id: 'invoices', text: 'Issued invoices are immutable' },
			{
				type: 'p',
				text: '`buildInvoice()` is pure: plan, usage, period in, invoice out, no database. `issueInvoice()` writes it once. There is no `updateInvoice`.'
			},
			{
				type: 'p',
				text: 'A correction is a **credit note** — a new document referencing the old one — for exactly the reason a ledger correction is a reversing entry rather than an edit. Both answers stay: what we billed, and what we then agreed. Editing the invoice would leave only the second, and the question people actually ask in a dispute is about the first.'
			},
			{
				type: 'p',
				text: 'The pattern for the last time: the log is append-only, the ledger is append-only, migrations are forward-only, and invoices are immutable. Four different subsystems, one idea — **the past is a record, not a variable.**'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why plans are a table rather than conditionals',
					'You can explain why proration multiplies before dividing, and floors rather than rounds',
					'You can explain why usage is derived rather than counted',
					'You can explain why a correction is a credit note rather than an edit'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'tests-that-find-real-bugs',
		title: 'Tests that find real bugs',
		summary:
			'Property-based, fault injection, load — and an honest account of which kinds actually caught something.',
		goal: 'Write tests that assert invariants rather than paths, and know which kind to reach for.',
		blocks: [
			{
				type: 'p',
				text: 'This project has a large test suite. It is worth being honest about which parts of it earned their keep, because the answer is not what a testing pyramid would predict.'
			},

			{ type: 'h3', id: 'invariants', text: 'Assert invariants, not paths' },
			{
				type: 'p',
				text: 'A path test says "given this input, expect this output". It catches the case you thought of. An **invariant** says "whatever happens, this must remain true" — and it catches the case you did not.'
			},
			{
				type: 'p',
				text: 'The venue has four, and almost every valuable test in this repository is one of them wearing a different hat:'
			},
			{
				type: 'ol',
				items: [
					'**The books balance.** Every posting sums to zero, so `trialBalance()` is always 0.',
					'**No order is overfilled.** `filled <= quantity` for every order, always.',
					'**The book is never crossed.** In continuous trading, the best bid is below the best ask.',
					'**Replay is deterministic.** Rebuilding from the log produces a state with the same fingerprint.'
				]
			},
			{
				type: 'p',
				text: 'You can assert all four after literally anything — a fuzz run, a crash, ten thousand random orders — without knowing what was supposed to happen.'
			},

			{ type: 'h3', id: 'property', text: 'Property-based testing' },
			{
				type: 'code',
				lang: 'ts',
				code: `
it('never leaves a crossed book during continuous trading', () => {
	fc.assert(
		fc.property(arbSession, (steps) => {
			const { state } = run(steps);
			const instrument = state.instruments.get(VOD)!;

			if (instrument.phase === 'continuous') {
				expect(isCrossed(instrument.book)).toBe(false);
			}
		}),
		{ numRuns: 400 }
	);
});`
			},
			{
				type: 'p',
				text: '`fast-check` generates hundreds of random sessions and checks the property after each. When it finds a failure it **shrinks** it — repeatedly simplifying the input while the failure persists — so what you get is not a 120-step session but the three orders that actually matter.'
			},
			{
				type: 'note',
				text: 'Shrinking is the feature. A random failure you cannot reduce is barely more useful than a bug report. The four-order counterexample that fits in a comment is what turns "the fuzzer found something" into a fix.'
			},

			{ type: 'h3', id: 'chaos', text: 'Fault injection' },
			{
				type: 'code',
				file: 'apps/engine/src/chaos.spec.ts',
				lang: 'ts',
				code: `
/**
 * Fault injection.
 *
 * Everything else in this suite tests the venue doing its job. This file tests
 * it being **interrupted** — killed mid-session, restarted twice at once,
 * handed a corrupt snapshot, made to replay from nothing.
 *
 * Those are the only failures that matter in production, and they are the only
 * ones a developer never sees, because a developer's machine does not lose
 * power and does not run two copies of the engine by accident during a deploy.
 */`
			},
			{
				type: 'p',
				text: 'One of these found a genuinely dangerous bug. The test handed the engine a **corrupt snapshot** — a truncated JSON body — and asserted it still recovered. It did not: `deserialise` threw `body.instruments is not iterable`, the error escaped `recover()`, and the engine refused to start. A file that exists purely as an *optimisation* had become a single point of failure for the whole venue.'
			},
			{
				type: 'code',
				file: 'apps/engine/src/snapshot.ts',
				lang: 'ts',
				code: `
/*
 * A snapshot that will not parse is treated as **absent**, not as an error.
 *
 * …
 *
 * It is logged rather than swallowed silently: a venue that quietly replays
 * from genesis every start is one whose snapshots have been broken for
 * months and whose boot time nobody has questioned.
 */
try {
	return {
		state: deserialise(JSON.parse(String(row['body'])) as SnapshotBody),
		fingerprint: String(row['fingerprint'])
	};
} catch (thrown) {
	console.error(
		\`[engine] snapshot at seq \${Number(row['seq'])} is unreadable; replaying from genesis instead.\`,
		thrown
	);
	return undefined;
}`
			},

			{ type: 'h3', id: 'load', text: 'Load, and the bug that killed the engine' },
			{
				type: 'code',
				file: 'apps/engine/src/load.spec.ts',
				lang: 'ts',
				code: `
/**
 * Load, and what a load test is actually for.
 *
 * Not to produce a number for a slide. The useful outputs are:
 *
 *   **Where it breaks first.** Every system has one bottleneck at a time, and
 *   knowing which one is the difference between optimising something that
 *   matters and optimising something that does not. Here it is the sequencer:
 *   one writer, by design, and therefore the ceiling on the whole venue.
 *
 *   **Whether correctness survives volume.** Almost every concurrency bug is
 *   invisible below some threshold. The assertions at the end of these tests
 *   are the same ones the small suites make — the books balance, no order is
 *   overfilled — and they are the point. The timing is context.
 *
 * …
 */`
			},
			{
				type: 'p',
				text: 'Ten thousand orders. The engine died partway through:'
			},
			{
				type: 'terminal',
				code: `
SQLITE_CANTOPEN: unable to open database file`
			},
			{
				type: 'p',
				text: 'An error about opening a database, from code that had the database open the entire time. Measuring `/proc/self/fd` after a thousand transactions told the story:'
			},
			{
				type: 'terminal',
				code: `
client.transaction()   2033 descriptors
client.batch()           35 descriptors
BEGIN / COMMIT           35 descriptors`
			},
			{
				type: 'p',
				text: '`@libsql/client`\'s `transaction()` opens a second connection and never releases it — not on commit, not on rollback, not on an explicit `close()`. Two descriptors per transaction, forever. The engine opens one transaction per command, so at the default file limit it died after about ten thousand orders.'
			},
			{
				type: 'code',
				file: 'packages/store/src/client.ts',
				lang: 'ts',
				code: `
export type Executor = Pick<Client, 'execute'>;
const chains = new WeakMap<Executor, Promise<unknown>>();

export async function withTransaction<T>(
	client: Executor,
	work: (tx: Executor) => Promise<T>
): Promise<T> {
	const previous = chains.get(client) ?? Promise.resolve();

	const run = previous.then(async () => {
		await client.execute('BEGIN IMMEDIATE');

		try {
			const result = await work(client);
			await client.execute('COMMIT');
			return result;
		} catch (thrown) {
			/*
			 * The rollback is itself wrapped, and its failure is swallowed.
			 *
			 * If the connection has gone, \`ROLLBACK\` throws too — and throwing *that*
			 * would replace the real error with a meaningless one, hiding the reason
			 * the transaction failed in the first place.
			 */
			try {
				await client.execute('ROLLBACK');
			} catch {
				// The original error is the one worth having.
			}

			throw thrown;
		}
	});

	// The chain must continue whether this call succeeded or not, or one failed
	// transaction would block every later one on this connection forever.
	chains.set(
		client,
		run.then(
			() => undefined,
			() => undefined
		)
	);

	return run;
}`
			},
			{
				type: 'p',
				text: 'The promise chain is what serialises callers. SQLite allows one write transaction per connection, so two overlapping `withTransaction` calls would otherwise put their statements into *one* transaction and commit them together — not a deadlock, not an error, and completely wrong.'
			},
			{
				type: 'p',
				text: 'And the regression test measures file descriptors directly, so a future refactor back to `client.transaction()` fails in two seconds instead of in production after a few minutes of real trading.'
			},

			{ type: 'h3', id: 'my-own-bugs', text: 'The tests that were wrong' },
			{
				type: 'p',
				text: 'Four of my own, because a course that only shows the tests that worked is teaching something false.'
			},
			{
				type: 'ul',
				items: [
					'**A helper used the default `batchSize: 200`,** so the first callback reported everything already applied and the test proved nothing.',
					'**The same helper hung** when the target sequence had already been passed before it started waiting.',
					'**A load test asserted 10,000 `order_record` rows** and got 2,582 — 7,418 were correctly rejected by the fat-finger collar. The right assertion was `accepted + rejected === COUNT`.',
					'**`expect(JSON.stringify(keys)).not.toContain(\':\')`** — meant to prove no secret leaked. JSON itself is full of colons. It passed nothing and failed nothing.'
				]
			},
			{
				type: 'warn',
				text: 'A vacuous test is worse than no test, because it occupies the space where a real one would go and reports green while doing it. Whenever you write an assertion, break the code deliberately and check the test actually fails.'
			},
			{
				type: 'why',
				title: 'What actually found the bugs',
				text: 'A browser at 390px found two layout bugs no unit test could see. `curl` found four API bugs in an afternoon. A load test found a file-descriptor leak. Fault injection found the corrupt-snapshot dependency. A property test found a crossed book. The single highest-value habit in this whole project was **running the thing**, repeatedly, in the shape a real user would.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the venue\'s four invariants and assert them after any operation',
					'You can explain what shrinking gives you that a random failure does not',
					'You can explain why a corrupt snapshot must not stop the engine',
					'You can explain why a vacuous test is worse than a missing one'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'running-it',
		title: 'Running it',
		summary:
			'Four numbers worth watching at 3am, a health check that knows the difference between slow and broken, and where to go next.',
		goal: 'Operate the venue, and finish the course.',
		blocks: [
			{
				type: 'p',
				text: 'There is no Prometheus client here and no OpenTelemetry SDK — not because they are wrong (in production they are right) but because installing one teaches you an API, and what is worth teaching is **which numbers matter**, which is a decision no library makes for you.'
			},
			{
				type: 'p',
				text: 'A venue with forty dashboards and no answer to "is anything stuck" is worse off than one with these four.'
			},

			{ type: 'h3', id: 'four-numbers', text: 'The four' },
			{
				type: 'ul',
				items: [
					'**Is the engine keeping up?** The gap between the highest sequenced command and the engine\'s checkpoint. Not throughput — a venue processing ten thousand commands a second while falling two thousand behind is not healthy, and a throughput graph makes it look magnificent.',
					'**Are the read models current?** The projector\'s lag. This is what makes a terminal show a stale book, and it is invisible from outside because every request succeeds.',
					'**Is anything being ignored?** The **age** of the oldest undelivered outbox message. Age, not depth: a queue of ten thousand draining fast is fine, and a queue of one that has been there twenty minutes is not.',
					'**Do the books balance?** The trial balance. Zero by construction, so a non-zero value means something wrote to the ledger outside the one function that may.'
				]
			},
			{
				type: 'why',
				title: 'Every one is derived',
				text: 'Nothing increments a counter, so nothing can drift, and a process that restarts loses no history. The same property that makes the projections safe to delete makes these numbers safe to trust — they are computed from the log, and the log is the truth.'
			},

			{ type: 'h3', id: 'verdict', text: 'Slow is not broken' },
			{
				type: 'code',
				file: 'packages/store/src/observe.ts',
				lang: 'ts',
				code: `
// Dead letters never change the level. They are a backlog for somebody to
// look at, not a reason to take a machine out of rotation — and a health
// check that goes red because one member's URL is wrong is a health check
// people learn to ignore.
if (status.outboxDead > 0) {
	problems.push(\`\${status.outboxDead} messages have been given up on.\`);
}`
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/healthz/+server.ts',
				lang: 'ts',
				code: `
export const GET: RequestHandler = async ({ url }) => {
	const status = await health(db);
	const result = verdict(status);

	const body = {
		status: result.level,
		summary: result.summary,
		lag: {
			engine: status.engineLag,
			projector: status.projectorLag,
			outboxAgeMs: status.outboxAgeMs
		},
		// A boolean, not the amount. The amount is the venue's business; whether
		// the books balance is the only part an outsider needs.
		booksBalance: status.trialBalance === 0,
		...(url.searchParams.get('verbose') === '1' ? { problems: result.problems } : {})
	};

	return Response.json(body, {
		status: result.level === 'down' ? 503 : 200,
		headers: {
			// Never cached. A health check served from a CDN is a health check that
			// reports the state of a minute ago, forever.
			'cache-control': 'no-store'
		}
	});
};`
			},
			{
				type: 'p',
				text: 'A load balancer reads the status code and nothing else, so only `down` answers **503** — which takes the instance out of rotation. A `degraded` venue answers 200: it is slow, not broken, and pulling a slow machine out of the load balancer removes capacity from a system that is already struggling to keep up, which is how a degradation becomes an outage.'
			},
			{
				type: 'p',
				text: 'Three levels, and the middle one is the important one. A health check with only "up" and "down" forces you to pick a threshold at which a slow venue gets killed, and that threshold is always wrong in one direction or the other.'
			},

			{ type: 'h3', id: 'logs', text: 'Logs somebody can grep' },
			{
				type: 'code',
				file: 'packages/store/src/observe.ts',
				lang: 'ts',
				code: `
/*
 * A last line of defence, not a security control.
 *
 * It catches the accidental \`{ ...request }\` spread. It does not catch a
 * secret in a field called \`note\`, and pretending otherwise would be
 * worse than not having it — the real control is not putting them there.
 */
if (/secret|password|token|authorization|cookie|key_hash/i.test(key)) {
	safe[key] = '[redacted]';
	continue;
}`
			},
			{
				type: 'p',
				text: 'One JSON object per line, with a redaction pass. Being honest about what a defence does *not* do is part of the defence: a team that believes the redactor is comprehensive stops thinking about what it logs.'
			},

			{ type: 'h3', id: 'processes', text: 'Three processes' },
			{
				type: 'terminal',
				code: `
$ pnpm dev

[web]       ➜ http://localhost:5173
[engine]    starting against file:venue.db
[engine]    resuming from seq 48213
[projector] resuming from seq 48210
[worker]    12 pending, 0 dead on arrival`
			},
			{
				type: 'ul',
				items: [
					'**web** — accepts commands, serves screens, never decides anything.',
					'**engine** — the only process that applies commands and writes events. One writer, by design.',
					'**worker** — drains the outbox. Can be killed at any moment; the leases sort it out.'
				]
			},
			{
				type: 'p',
				text: 'Each handles `SIGINT` and `SIGTERM` by finishing its current batch and writing its checkpoint. Nothing is lost by a restart, because the checkpoint is written in the same transaction as the work it describes — the single most important line in the whole system, and it is a one-line ordering decision.'
			},

			{ type: 'h3', id: 'what-you-built', text: 'What you built' },
			{
				type: 'p',
				text: 'A stock exchange. Not a mock: orders match by price and time, an opening auction clears everything at one price, every trade posts to a double-entry ledger that balances by construction, and the entire venue can be replayed from its log to exactly the same state.'
			},
			{
				type: 'p',
				text: 'Along the way, the ideas that transfer to whatever you build next:'
			},
			{
				type: 'ul',
				items: [
					'**Decide in a pure function.** The matching engine has no clock, no database and no randomness, which is why it can be replayed, fuzzed and reasoned about.',
					'**Write the fact, derive everything else.** Projections, positions, usage and health are all caches of the log. Anything derived cannot drift.',
					'**The past is a record, not a variable.** Append-only log, reversing ledger entries, forward-only migrations, immutable invoices.',
					'**Validate once, at the edge.** Protocol codecs, environment variables, remote-function schemas, webhook URLs — the same shape of boundary each time.',
					'**Make the wrong thing impossible rather than forbidden.** `enqueue` takes a transaction. Flags are declared. The error-code map is derived. Every one of those replaced a rule somebody had to remember.',
					'**Run the thing.** The bugs that mattered came from a browser, `curl`, a load test and a crash — not from the test suite that was written first.'
				]
			},
			{
				type: 'p',
				text: 'And the honest closing note: nearly every chapter in this course contains a bug that was genuinely in this codebase. Not hypothetical teaching examples — mistakes made while building it, found by running it, and fixed with the reasoning left in the comments so the next person does not have to rediscover it.'
			},
			{
				type: 'p',
				text: 'That is the actual skill. Not knowing the answers in advance — building something real, breaking it in the ways it will break, and writing down what you learned where somebody will read it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the four numbers and say why each is derived rather than counted',
					'You can explain why `degraded` exists and why dead letters do not trigger it',
					'You can run all three processes and explain what each one is allowed to do',
					'You have built a stock exchange'
				]
			}
		]
	}
];
