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

const client = createClient({ url: DATABASE_URL });

export const db = drizzle(client, { schema });

/** The raw client, for the two places that need `PRAGMA` or a transaction batch. */
export { client };
export * as schema from './schema.ts';
