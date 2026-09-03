/**
 * PREPARE THE END-TO-END DATABASE
 * ===============================
 *
 * Migrate, then seed, into a database that is deleted first. A suite that
 * runs against rows left over from last time produces failures that look
 * like application bugs and are not.
 *
 * The schema arrives through the migrations in `drizzle/` — the same files
 * the Dockerfile applies — rather than `drizzle-kit push`, so a schema change
 * that was not turned into a migration fails here, before it fails in
 * production.
 *
 * `DATABASE_URL` is overridden to `file:e2e.db` for every step, so a test run
 * never touches `local.db`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const DB = 'e2e.db';

const env = {
	...process.env,
	DATABASE_URL: `file:${DB}`,
	PUBLIC_ORIGIN: 'http://localhost:4173',
	BETTER_AUTH_SECRET: 'e2e-only-secret-of-at-least-thirty-two-characters',
	STOP_LIMIT: '200'
};

for (const suffix of ['', '-shm', '-wal']) {
	const path = `${DB}${suffix}`;
	if (existsSync(path)) rmSync(path);
}

/**
 * @param {string} command
 * @param {readonly string[]} args
 */
function run(command, args) {
	execFileSync(command, args, { stdio: 'inherit', env });
}

run('node', ['scripts/migrate.ts']);
run('node', ['scripts/seed.ts']);

console.info(`\nReady: ${DB}\n`);
