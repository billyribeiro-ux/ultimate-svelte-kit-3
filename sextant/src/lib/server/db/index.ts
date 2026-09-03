/**
 * The database handle.
 *
 * One client for the process, created at import time. libSQL pools internally,
 * so a second client would mean a second pool competing for the same file — and
 * with SQLite, two pools writing to one file is how you meet `SQLITE_BUSY`.
 */
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema.ts';

const client = createClient({
	url: DATABASE_URL,

	/*
	 * WRITE-AHEAD LOGGING AND A BUSY TIMEOUT
	 * ======================================
	 *
	 * SQLite's default journal mode allows one writer *and blocks readers while
	 * it writes*. For a telemetry store that is exactly backwards: ingest writes
	 * continuously and every dashboard reads continuously, so the default turns
	 * every query into a queue behind whatever batch happens to be landing.
	 *
	 * WAL lets readers proceed against the last committed state while a writer
	 * appends, which is the access pattern this whole application has. It is the
	 * single highest-value line in the file.
	 *
	 * `busy_timeout` covers the case WAL does not: two *writers*. SQLite still
	 * allows only one, and without a timeout the second gets `SQLITE_BUSY`
	 * immediately rather than waiting the few milliseconds the first needs. That
	 * surfaces as an ingest request failing at random under load — and as tests
	 * failing when two spec files touch the database at once, which is how this
	 * was found.
	 */
	intMode: 'number'
});

/*
 * Pragmas, applied once at startup.
 *
 * Not in `createClient`, because libSQL takes no pragma option — they are
 * ordinary statements, and running them here means they apply to the pooled
 * connections the client hands out.
 */
await client.execute('pragma journal_mode = wal');
await client.execute('pragma busy_timeout = 5000');
/*
 * `synchronous = normal` rather than `full`.
 *
 * With WAL, `normal` means a commit is durable against a process crash but can
 * lose the last transactions in a *power* failure. That is the right trade for
 * telemetry specifically: the data is a copy of what happened elsewhere, the
 * senders retry, and paying an fsync per commit would cut ingest throughput by
 * an order of magnitude to protect against losing a few seconds of logs.
 *
 * It would be the wrong trade for the `outbox` table, which is why the
 * notification worker is idempotent rather than relying on durability.
 */
await client.execute('pragma synchronous = normal');

export const db = drizzle(client, { schema });

/** The raw client, for the two places that need a pragma or a batch. */
export { client };
export * as schema from './schema.ts';
