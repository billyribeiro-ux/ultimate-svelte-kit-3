import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit runs OUTSIDE the SvelteKit app — it is a CLI, not part of the
 * server bundle — so it cannot use `$app/env/private`, which only exists inside
 * Vite. It reads `process.env` directly, which is why the `db:*` scripts source
 * `.env` first.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set — did you copy .env.example to .env?');

const authToken = process.env.DATABASE_AUTH_TOKEN;

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: { url, ...(authToken ? { authToken } : {}) },
	verbose: true,
	// Prompts before running anything destructive. Leave this on.
	strict: true
});
