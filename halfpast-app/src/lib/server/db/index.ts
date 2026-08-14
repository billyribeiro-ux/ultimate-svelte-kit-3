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

/** The exact type of `db`, for functions that take a transaction or the root. */
export type Database = typeof db;
