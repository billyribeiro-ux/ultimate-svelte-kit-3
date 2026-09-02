/**
 * MIGRATE
 * =======
 *
 * Bring the database up to the schema, by applying the SQL files in
 * `drizzle/` that have not been applied yet. Drizzle keeps a table of which
 * ones have, so running this on an up-to-date database does nothing and
 * running it twice is the same as running it once.
 *
 * Two ways to run it:
 *
 *   node scripts/migrate.ts                     before starting the server
 *   node --import ./scripts/migrate.ts build    what the Dockerfile does —
 *                                               the migration runs first, then
 *                                               the server, in one process,
 *                                               so `node` stays PID 1 and
 *                                               SIGTERM reaches it
 *
 * This is the production counterpart of `pnpm run db:push`, which compares the
 * schema with the database and alters it directly. `push` is right for a
 * development database that nobody minds losing; migrations are right for one
 * that holds somebody's budget, because every change is a file that was
 * reviewed before it ran.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createClient } from '@libsql/client';

if (!process.env.DATABASE_URL) {
	try {
		process.loadEnvFile('.env');
	} catch {
		// no .env: the variables must already be in the environment
	}
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = createClient({ url, intMode: 'number' });
const started = performance.now();
await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
console.info(`Migrations applied in ${Math.round(performance.now() - started)} ms`);
client.close();
