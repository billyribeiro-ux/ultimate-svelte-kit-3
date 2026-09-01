/**
 * Build a fresh database for the end-to-end suite.
 *
 * A separate file from `local.db` on purpose. Sharing one would mean running the
 * tests wipes whatever board you were poking at by hand, and the first time that
 * happens mid-demonstration you will not enjoy it.
 */

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const DATABASE_URL = 'file:e2e.db';

// SQLite writes sidecar files in WAL mode; remove them too, or the new database
// starts life with a journal describing a database that no longer exists.
for (const suffix of ['', '-wal', '-shm']) {
	rmSync(`e2e.db${suffix}`, { force: true });
}

const env = { ...process.env, DATABASE_URL };

/**
 * @param {string} command
 * @param {string[]} args
 */
const run = (command, args) =>
	execFileSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });

console.log('[e2e] migrating');
run('node', ['node_modules/drizzle-kit/bin.cjs', 'migrate']);

console.log('[e2e] seeding');
run('node', ['scripts/seed.ts']);

console.log('[e2e] database ready');
