/**
 * One connection, one Drizzle instance, both schemas.
 *
 * `DATABASE_URL` comes from `$app/env/private`, which exists only on the
 * server: a component that imported this file by mistake would fail to
 * build rather than ship a connection string to a browser.
 */
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import * as auth from './auth.schema.ts';
import * as app from './schema.ts';

export const schema = { ...auth, ...app };

/*
 * Not while building. SvelteKit imports this module during `vite build` to
 * analyse the app, `src/env.ts` lets `DATABASE_URL` be missing then, and
 * nothing at build time reads a row — so the build gets a database in
 * memory that dies with it, and no file is created anywhere. When the
 * server starts, `building` is `false` and `src/env.ts` has already refused
 * to start without a URL; the check here says so to the type checker.
 */
function databaseUrl(): string {
	if (building) return ':memory:';
	if (!DATABASE_URL) throw new Error('DATABASE_URL is required to start the server.');
	return DATABASE_URL;
}

/*
 * `intMode: 'number'`: libSQL can hand integers back as BigInt, which is
 * correct for a 64-bit column and wrong for every timestamp and every amount
 * in this schema, all of which fit in a JavaScript number with room to spare.
 */
export const client = createClient({ url: databaseUrl(), intMode: 'number' });

/*
 * WAL lets readers proceed while a writer appends — a shared trip is many
 * readers and one writer at a time — and the busy timeout makes a second
 * writer wait a few milliseconds instead of failing at once.
 */
if (!building) {
	await client.execute('pragma journal_mode = wal');
	await client.execute('pragma busy_timeout = 5000');
}

export const db = drizzle(client, { schema });

export type Database = typeof db;
