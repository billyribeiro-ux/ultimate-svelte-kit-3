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

const client = createClient({ url: DATABASE_URL, intMode: 'number' });

/*
 * WAL lets readers proceed while a writer appends — a shared sheet is many
 * readers and one writer at a time — and the busy timeout makes a second
 * writer wait a few milliseconds instead of failing at once.
 */
await client.execute('pragma journal_mode = wal');
await client.execute('pragma busy_timeout = 5000');

export const db = drizzle(client, { schema });
export { client };
export * as schema from './schema.ts';
