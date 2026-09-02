/**
 * PREPARE THE END-TO-END DATABASE
 * ===============================
 *
 * Push the schema, then seed. A script rather than two `package.json` entries
 * because of the step in the middle: delete the previous run's database first.
 * A suite that runs against rows left over from last time produces failures
 * that look like application bugs and are not.
 *
 * `DATABASE_URL` is overridden to `file:e2e.db` for both the push and the
 * server, so a test run never touches `local.db` — the one with the pattern
 * somebody spent an evening on.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const DB = 'e2e.db';

const env = {
	...process.env,
	DATABASE_URL: `file:${DB}`,
	PUBLIC_ORIGIN: 'http://localhost:4173',
	SESSION_SECRET: 'e2e-only-secret-of-at-least-thirty-two-characters',
	TRACE_BUFFER: '200'
};

/*
 * Start from nothing, every time. `drizzle-kit push` is incremental, so a schema
 * change between runs leaves the old columns in place — and a test that passes
 * against a table with a stale column can fail in production against a fresh
 * one.
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
