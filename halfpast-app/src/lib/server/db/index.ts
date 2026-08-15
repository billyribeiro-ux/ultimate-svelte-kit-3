import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { DATABASE_URL, DATABASE_AUTH_TOKEN } from '$app/env/private';
import * as schema from './schema.ts';

/**
 * The one database connection for the whole server.
 *
 * This module is imported, not called, so the client is created exactly once per
 * process. That matters: libSQL keeps a connection pool, and building a new one
 * per request is a slow, quiet way to run out of file descriptors.
 *
 * `$app/env/private` is a server-only module. If a component ever imports this
 * file by mistake, the build fails with a clear message instead of shipping your
 * database URL to the browser.
 */
const client = createClient({
	url: DATABASE_URL,
	// libSQL rejects `authToken: undefined` on some versions, so only pass the key
	// when we actually have one. Spreading a conditional object is the tidiest way
	// to say "this property may not exist at all".
	...(DATABASE_AUTH_TOKEN ? { authToken: DATABASE_AUTH_TOKEN } : {})
});

/**
 * Passing `schema` is what gives us the relational query API
 * (`db.query.bookings.findMany({ with: { service: true } })`) with full types,
 * instead of hand-writing every join.
 */
export const db = drizzle(client, { schema });

/*
 * WAL — write-ahead logging.
 *
 * SQLite's default journal mode takes an exclusive lock on the whole database
 * for the duration of a write, so any reader that arrives mid-write gets
 * `SQLITE_BUSY`. For a website that means a customer loading the booking page at
 * the same moment somebody else confirms an appointment sees a 500. It is rare,
 * intermittent, and impossible to reproduce on demand — the worst combination.
 *
 * In WAL mode writers append to a side log instead, so readers never block
 * writers and writers never block readers. The only remaining contention is
 * writer-versus-writer, which `write-queue.ts` already serialises inside this
 * process. `busy_timeout` covers the leftover case of a *different* process
 * writing — a migration, or the test harness re-seeding under a running server.
 *
 * The setting is written into the database file and persists, so this is
 * idempotent; running it every boot simply guarantees no deployment is ever
 * missing it. Fire-and-forget, because nothing else can proceed without the
 * connection anyway and failing to set it is a warning, not a reason to refuse
 * to start.
 */
/*
 * One `execute` each, NOT a `batch`.
 *
 * `batch` wraps its statements in a transaction, and SQLite refuses to change
 * journal mode from inside one: `cannot change into wal mode from within a
 * transaction`. The pragma then fails, the catch below writes a warning that is
 * easy to scroll past, and the database quietly keeps its default locking — so
 * the intermittent `SQLITE_BUSY` this was meant to fix carries on happening,
 * now with a "fix" in place that looks like it should have worked.
 */
void (async () => {
	try {
		// Persisted in the database file, so this is idempotent; running it every
		// boot simply guarantees no deployment is ever missing it.
		await client.execute('PRAGMA journal_mode = WAL');
		// Per-connection, so this one genuinely must run at every startup.
		await client.execute('PRAGMA busy_timeout = 5000');
	} catch (error) {
		console.warn('[db] could not apply pragmas; continuing with defaults', error);
	}
})();

/** The exact type of `db`, for functions that take a transaction or the root. */
export type Database = typeof db;
