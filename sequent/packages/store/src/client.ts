/**
 * Opening the database.
 *
 * One file, one place the pragmas are applied, one place the schema is created.
 * Every process in the venue calls `openStore` and gets a connection configured
 * identically — which matters more than it sounds, because `busy_timeout` is a
 * property of the *connection* and has to be set again every time one is
 * opened. A process that forgets is the process that fails under load.
 */

import { createClient, type Client } from '@libsql/client';
import { migrate as runMigrations } from './migrate.ts';
import { SCHEMA } from './schema.ts';

export interface StoreOptions {
	readonly url: string;
	readonly authToken?: string;
	/** Apply the schema on open. Off in production, where migrations run first. */
	readonly migrate?: boolean;
}

export async function openStore({ url, authToken, migrate = true }: StoreOptions): Promise<Client> {
	const client = createClient(authToken === undefined ? { url } : { url, authToken });

	/*
	 * Separate `execute` calls, not a batch.
	 *
	 * `batch` wraps its statements in a transaction, and SQLite refuses to change
	 * journal mode inside one — "cannot change into wal mode from within a
	 * transaction". Written as a batch this fails, the error is easy to swallow,
	 * and WAL silently never applies. The venue then works perfectly until two
	 * processes read and write at once.
	 */
	await client.execute('PRAGMA journal_mode = WAL');
	await client.execute('PRAGMA busy_timeout = 5000');
	await client.execute('PRAGMA foreign_keys = ON');
	/*
	 * `synchronous = FULL` rather than the WAL default of `NORMAL`.
	 *
	 * NORMAL lets the OS decide when to flush, which means a machine that loses
	 * power can lose the last few commits. For a cache that is a fine trade. For
	 * an append-only log that is the system of record for other people's money,
	 * it is not: the whole promise is that an acknowledged order is durable.
	 */
	await client.execute('PRAGMA synchronous = FULL');

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

/* -------------------------------------------------------------------------- */
/* Transactions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Anything that can run a statement: a `Client`, or a transaction on one.
 *
 * Every function in this package that writes takes an `Executor` rather than a
 * `Transaction`, so the same code works inside a transaction and outside one —
 * and, more importantly, so that *how* a transaction is opened can change
 * without touching every caller. It changed once already; see below.
 */
export type Executor = Pick<Client, 'execute'>;

/**
 * Serialisation, one chain per client.
 *
 * SQLite allows one write transaction per connection, so two overlapping
 * `withTransaction` calls on the same client would interleave their statements
 * into one transaction and commit them together — which is not a deadlock, not
 * an error, and completely wrong.
 *
 * A promise chain makes the second caller wait. It is a lock, and it is honest
 * about being one.
 */
const chains = new WeakMap<Executor, Promise<unknown>>();

/**
 * Run a function inside a transaction, on **this** connection.
 *
 * ## Why not `client.transaction()`
 *
 * Because it leaks. In `@libsql/client` 0.17.4 each `transaction()` opens a
 * second connection to the database, and that connection is **never released**
 * — not on `commit()`, not on `rollback()`, not on an explicit `close()`. Two
 * file descriptors per transaction, forever.
 *
 * That is survivable in a request handler and fatal in this venue, because the
 * engine opens one transaction **per command**. At the default file-descriptor
 * limit the engine dies after about ten thousand orders with
 * `SQLITE_CANTOPEN: unable to open database file` — an error that names the
 * database and has nothing to do with the database.
 *
 * It was found by a load test asking for exactly ten thousand orders, which is
 * the sort of coincidence that makes you believe in load tests. Nothing smaller
 * reaches it; a venue would have run for a few minutes of real trading.
 *
 * `BEGIN IMMEDIATE` on the existing connection has none of that. It is also
 * *more* correct for our purposes: `IMMEDIATE` takes the write lock at the
 * start rather than upgrading half way through, so a busy venue gets a clean
 * wait on `busy_timeout` instead of `SQLITE_BUSY` mid-transaction.
 */
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
			 * If the connection has gone, `ROLLBACK` throws too — and throwing *that*
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
