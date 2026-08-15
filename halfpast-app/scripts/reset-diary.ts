/**
 * Empty the diary, leaving the studio itself alone.
 *
 * Used between end-to-end tests so each one starts from a known, empty week.
 *
 * Deliberately narrower than a full re-seed. Wiping `business` and `staff` while
 * the server is running pulls the rug out from under any live query that is
 * still streaming — the availability generator wakes up, finds no such business,
 * and throws inside a connection belonging to a page the previous test has only
 * just closed. The result is an intermittent 500 in whichever test happens to be
 * running next, with no stack trace pointing anywhere near the real cause.
 *
 * Bookings, their slot claims and their customers are all the tests create, so
 * they are all that needs clearing. Everything a live query depends on stays
 * exactly where it was.
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { booking, customer, slotClaim } from '#lib/server/db/schema.ts';

if (!process.env.DATABASE_URL) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = createClient({ url });
const db = drizzle(client);

// Safe to block this thread: it is a short-lived script with nothing else to do,
// and waiting for a running server to finish a write beats failing on SQLITE_BUSY.
await client.execute('PRAGMA busy_timeout = 10000');

// Children first, so no foreign key is ever briefly dangling.
await db.delete(slotClaim);
await db.delete(booking);
await db.delete(customer);

client.close();
