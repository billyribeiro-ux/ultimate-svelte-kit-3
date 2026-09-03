import { defineConfig } from 'drizzle-kit';

/*
 * drizzle-kit runs as its own process, outside SvelteKit, so `$app/env/private`
 * is not available to it — hence `process.env` here and nowhere else in the
 * project. drizzle-kit loads `.env` on its own, and `scripts/seed.ts` calls
 * `process.loadEnvFile('.env')` before importing anything that reads it.
 */
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: { url: process.env.DATABASE_URL },

	// Print the SQL before running it, and ask before anything destructive.
	verbose: true,
	strict: true
});
