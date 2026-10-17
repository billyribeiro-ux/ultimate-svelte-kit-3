/**
 * Opening the database.
 *
 * One file, one place the pragmas are applied, one place the schema is created.
 * Every process in the venue calls `openStore` and gets a client configured
 * identically — which matters more than it sounds, because `busy_timeout`,
 * `foreign_keys` and `synchronous` are properties of a *connection* and have to
 * be set again on every connection that is opened. A process that forgets is
 * the process that fails under load.
 *
 * Since `@libsql/client` 0.18 a client is not one connection but a small pool
 * of them, so "every connection" stopped being a figure of speech. See
 * `configurePool` below for what that costs and how it is paid.
 */

import { createClient, type Client, type Transaction } from '@libsql/client';
import { migrate as runMigrations } from './migrate.ts';
import { SCHEMA } from './schema.ts';

export interface StoreOptions {
	readonly url: string;
	readonly authToken?: string;
	/** Apply the schema on open. Off in production, where migrations run first. */
	readonly migrate?: boolean;
	/**
	 * More per-connection pragmas, applied after the venue's own on every
	 * connection in the pool.
	 *
	 * Nothing in the venue passes any. It is the handle the pool test holds: the
	 * venue's own two match what libSQL compiles in, so reading them back gives
	 * the same answer whether or not they were ever applied. A pragma whose
	 * default differs is the only way to see that every connection was reached.
	 */
	readonly connectionPragmas?: readonly string[];
}

/** How long a statement waits on another connection's lock before `SQLITE_BUSY`. */
const BUSY_TIMEOUT_MS = 5_000;

/**
 * Connections per client.
 *
 * Two is the floor. A transaction holds a connection for its whole life, and
 * the pool *refuses* rather than queues when transactions hold every connection
 * — so with one, every read that landed while a write was in flight would throw
 * `TRANSACTION_ACTIVE`. In the web process that is a live query polling while
 * an order is appended, which is to say constantly.
 *
 * Four rather than two so that a stray direct `client.transaction()` somewhere
 * cannot starve the readers either. Beyond that there is nothing to buy: a
 * statement outside a transaction borrows a connection, runs synchronously and
 * returns it before anything else can run, so reads never actually overlap in
 * one Node process. Each connection is two file descriptors; eight is cheap.
 */
export const POOL_SIZE = 4;

/**
 * The settings every connection must carry.
 *
 * `journal_mode` is deliberately not here: it is a property of the *file*, set
 * once and remembered. These two are properties of the connection, and SQLite
 * forgets them the moment it is closed.
 *
 * `foreign_keys = ON` — the log's `caused_by` and the ledger's postings point at
 * other rows, and an event whose command does not exist must fail to commit. A
 * test in `log.spec.ts` depends on exactly that.
 *
 * `synchronous = FULL` rather than `NORMAL` — NORMAL lets the OS decide when to
 * flush, which means a machine that loses power can lose the last few commits.
 * For a cache that is a fine trade. For an append-only log that is the system
 * of record for other people's money, it is not: the whole promise is that an
 * acknowledged order is durable.
 *
 * libSQL happens to compile both of these in as its defaults. Relying on that
 * would let a build flag somebody else controls decide whether the books
 * balance after a power cut, so they are set explicitly. The same coincidence
 * means reading them back proves nothing, so the test that every connection is
 * configured uses a pragma of its own — see `connectionPragmas`.
 */
const CONNECTION_PRAGMAS = ['PRAGMA foreign_keys = ON', 'PRAGMA synchronous = FULL'];

export async function openStore({
	url,
	authToken,
	migrate = true,
	connectionPragmas = []
}: StoreOptions): Promise<Client> {
	const client = createClient({
		url,
		...(authToken === undefined ? {} : { authToken }),
		/*
		 * `busy_timeout`, as the client option rather than the pragma.
		 *
		 * The option is applied by the client to every connection it opens,
		 * including the ones it opens later for transactions. The pragma reaches
		 * only whichever connection happened to run it, and a venue where three
		 * connections wait politely and the fourth fails instantly with
		 * `SQLITE_BUSY` is a venue with a bug that reproduces one time in four.
		 */
		timeout: BUSY_TIMEOUT_MS,
		concurrency: POOL_SIZE
	});

	/*
	 * A plain `execute`, not a batch.
	 *
	 * `batch` wraps its statements in a transaction, and SQLite refuses to change
	 * journal mode inside one — "cannot change into wal mode from within a
	 * transaction". Written as a batch this fails, the error is easy to swallow,
	 * and WAL silently never applies. The venue then works perfectly until two
	 * processes read and write at once.
	 *
	 * Once is enough: WAL is recorded in the database file, and every connection
	 * to it, from any process, inherits it.
	 */
	await client.execute('PRAGMA journal_mode = WAL');

	await configurePool(client, url, [...CONNECTION_PRAGMAS, ...connectionPragmas]);

	if (migrate) {
		// The base schema first — it is idempotent, so this is a no-op on an
		// existing venue — then the numbered changes on top.
		for (const statement of splitStatements(SCHEMA)) {
			await client.execute(statement);
		}

		await runMigrations(client);
	}

	return client;
}

/**
 * Apply the per-connection pragmas to **every** connection in the pool.
 *
 * ## Why this is not a loop of `client.execute`
 *
 * `client.execute` borrows a connection, runs the statement, and returns the
 * connection before its promise resolves. Four executes in a row therefore all
 * run on the *same* connection — the one that was just handed back — and the
 * other three are never created, never configured, and turn up later carrying
 * the compile-time defaults. The venue would then work on three connections out
 * of four, which is the worst kind of working.
 *
 * The only thing that holds a connection across an `await` is a transaction. So
 * the pool is filled by opening `POOL_SIZE` transactions at once, which forces
 * `POOL_SIZE` distinct connections into existence, and each is configured
 * through the transaction that holds it.
 *
 * ## Why each transaction ends itself first
 *
 * `PRAGMA foreign_keys` is a documented no-op inside a transaction. So each
 * connection runs `ROLLBACK` — there is nothing to roll back — and *then* the
 * pragmas, in one multi-statement call: the one method on a transaction that
 * does not check the transaction is still open between statements. `close()`
 * then hands the configured connection back to the pool, where it is reused
 * ahead of any new one.
 *
 * ## What it does not reach
 *
 * An in-memory database or an embedded replica has exactly one connection, and
 * a remote libSQL server has none we can configure. For those the pragmas run
 * once, as they always did. And a pooled connection whose rollback fails on
 * release is dropped and replaced with a fresh one carrying the defaults —
 * which are the values we want, so the venue stays correct, but it is the one
 * path where "set explicitly" is not literally true.
 */
async function configurePool(
	client: Client,
	url: string,
	pragmas: readonly string[]
): Promise<void> {
	const pooled = url.startsWith('file:') && !url.includes(':memory:');

	if (!pooled) {
		for (const pragma of pragmas) await client.execute(pragma);
		return;
	}

	const held: Transaction[] = [];
	for (let index = 0; index < POOL_SIZE; index += 1) {
		held.push(await client.transaction('deferred'));
	}

	for (const transaction of held) {
		await transaction.executeMultiple(['ROLLBACK', ...pragmas].join(';\n') + ';');
		transaction.close();
	}
}

/* -------------------------------------------------------------------------- */
/* Transactions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Anything that can run a statement: a `Client`, or a transaction on one.
 *
 * Every function in this package that writes takes an `Executor` rather than a
 * `Transaction`, so the same code works inside a transaction and outside one —
 * and, more importantly, so that *how* a transaction is opened can change
 * without touching every caller. It has changed twice already; see below.
 *
 * Shaped after `Transaction.execute` rather than `Client.execute`, because a
 * transaction is the narrower of the two and a client satisfies it anyway.
 */
export type Executor = Pick<Transaction, 'execute'>;

/**
 * Serialisation, one chain per client.
 *
 * Two overlapping `withTransaction` calls on the same client must not overlap
 * on the database, and the chain is what makes the second one wait. It is a
 * lock, and it is honest about being one. Why it is needed changed with the
 * library — see `withTransaction` — but that it is needed did not.
 */
const chains = new WeakMap<Client, Promise<unknown>>();

/**
 * Run a function inside a transaction, serialised with every other one on this
 * client.
 *
 * ## The history, because the course tells it
 *
 * In `@libsql/client` 0.17.4 each `client.transaction()` opened a second
 * connection to the database and never released it — not on `commit()`, not on
 * `rollback()`, not on an explicit `close()`. Two file descriptors per
 * transaction, forever. The engine opens one transaction **per command**, so at
 * the default descriptor limit it died after about ten thousand orders with
 * `SQLITE_CANTOPEN: unable to open database file` — an error that names the
 * database and has nothing to do with the database. A load test asking for
 * exactly ten thousand orders found it, which is the sort of coincidence that
 * makes you believe in load tests.
 *
 * This function was written to avoid `transaction()` altogether: `BEGIN
 * IMMEDIATE` and `COMMIT` as plain statements on the one connection a client
 * then had.
 *
 * 0.18 fixed the leak properly — a client is now a pool, a transaction borrows a
 * connection and gives it back when it settles — and in doing so made the
 * workaround impossible. A plain statement borrows a connection too, and the
 * pool rolls back anything left open on it before the next borrower can
 * inherit it. So a `BEGIN` on one statement is undone before the `COMMIT` on
 * the next arrives: "cannot commit - no transaction is active", on every
 * write, in every test. The library's fix broke our fix for the library.
 *
 * So this is `client.transaction('write')` again, which is `BEGIN IMMEDIATE`:
 * the write lock is taken at the start rather than upgraded half way through,
 * so a busy venue gets a clean wait on `busy_timeout` instead of `SQLITE_BUSY`
 * mid-transaction. The regression test that counts `/proc/self/fd` is still in
 * `client.spec.ts`; it is now a test of the library rather than of us, and it
 * stays because the library has been wrong about this once.
 *
 * ## Why the queue matters *more* with a pool, not less
 *
 * Two overlapping transactions on one connection used to interleave into a
 * single transaction and commit together — not a deadlock, not an error, and
 * completely wrong. Two overlapping transactions on a pool each get their own
 * connection, and the second `BEGIN IMMEDIATE` waits for the first's write lock
 * — inside a synchronous native call, which blocks the event loop, which is the
 * only thing that could have let the first transaction finish. That is a
 * deadlock with a five-second timeout on it. The chain means the second caller
 * waits in JavaScript, where waiting is free, and only ever contends for the
 * lock with *other processes*.
 */
export async function withTransaction<T>(
	client: Client,
	work: (tx: Executor) => Promise<T>
): Promise<T> {
	const previous = chains.get(client) ?? Promise.resolve();

	const run = previous.then(async () => {
		const transaction = await client.transaction('write');

		try {
			const result = await work(transaction);
			await transaction.commit();
			return result;
		} catch (thrown) {
			/*
			 * The rollback is itself wrapped, and its failure is swallowed.
			 *
			 * If the connection has gone, `ROLLBACK` throws too — and throwing *that*
			 * would replace the real error with a meaningless one, hiding the reason
			 * the transaction failed in the first place. Either way the connection
			 * goes back to the pool: `rollback()` releases it even when it throws.
			 */
			try {
				await transaction.rollback();
			} catch {
				// The original error is the one worth having.
			}

			throw thrown;
		}
	});

	// The chain must continue whether this call succeeded or not, or one failed
	// transaction would block every later one on this client forever.
	chains.set(
		client,
		run.then(
			() => undefined,
			() => undefined
		)
	);

	return run;
}

/**
 * Split a schema file into statements.
 *
 * Naive splitting on `;` breaks on the triggers, whose bodies contain
 * semicolons of their own. Tracking `BEGIN ... END` is enough for this file and
 * the check is written so that a future statement it cannot handle fails loudly
 * rather than being silently truncated.
 */
function splitStatements(sql: string): string[] {
	const withoutComments = sql.replace(/^\s*--.*$/gm, '');
	const statements: string[] = [];

	let current = '';
	let depth = 0;

	for (const line of withoutComments.split('\n')) {
		current += line + '\n';

		if (/\bBEGIN\b/i.test(line)) depth += 1;
		if (/\bEND\s*;/i.test(line)) depth -= 1;

		if (depth === 0 && /;\s*$/.test(line.trim())) {
			const trimmed = current.trim();
			if (trimmed) statements.push(trimmed);
			current = '';
		}
	}

	if (current.trim()) {
		throw new Error(`Unterminated SQL statement in schema:\n${current.slice(0, 120)}`);
	}

	return statements;
}
