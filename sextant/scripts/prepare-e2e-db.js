/**
 * PREPARE THE END-TO-END DATABASE
 * ===============================
 *
 * Push the schema, then seed. Two commands, and the reason this is a script
 * rather than two entries in `package.json` is the check in the middle: running
 * the suite against a database that still has the *previous* run's rows in it
 * produces failures that look like application bugs and are not.
 *
 * A SEPARATE FILE, NOT `local.db`
 * -------------------------------
 * `DATABASE_URL` is overridden to `file:e2e.db` for both the push and the
 * server. Sharing the development database would mean a test run silently
 * deleting whatever somebody was looking at — and, worse, a test passing because
 * of data a person happened to create by hand.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const DB = 'e2e.db';

const env = {
	...process.env,
	DATABASE_URL: `file:${DB}`,
	PUBLIC_ORIGIN: 'http://localhost:4173',
	BETTER_AUTH_SECRET:
		process.env.BETTER_AUTH_SECRET ?? 'e2e-only-secret-of-at-least-thirty-two-characters',
	INGEST_MAX_BATCH: '5000',
	INGEST_RATE_PER_MINUTE: '600000',
	SERIES_CARDINALITY_LIMIT: '10000',
	RETENTION_DAYS: '14'
};

/*
 * Start from nothing, every time.
 *
 * `drizzle-kit push` is incremental, so a schema change between runs leaves the
 * old columns in place — and a test that passes against a table with a stale
 * column can fail in production against a fresh one. Deleting the file costs a
 * second and removes the whole class of "works on the machine that has run it
 * before".
 */
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

run('node', ['node_modules/drizzle-kit/bin.cjs', 'push', '--force']);
run('node', ['scripts/seed.ts']);

console.info(`\nReady: ${DB}\n`);
