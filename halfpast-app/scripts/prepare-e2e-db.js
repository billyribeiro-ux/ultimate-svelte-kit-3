/**
 * Build a fresh database for the end-to-end suite.
 *
 * Runs before Playwright starts the server, so every run begins from exactly the
 * same diary. Tests that book appointments mutate that diary, which is fine —
 * they mutate a file that is deleted and rebuilt next time.
 *
 * A separate file from `local.db` on purpose. Sharing one would mean running the
 * tests wipes whatever you were poking at by hand, and the first time that
 * happens mid-demo you will not enjoy it.
 */

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const DATABASE_URL = 'file:e2e.db';

// SQLite writes sidecar files in WAL mode; remove them too or the new database
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

/*
 * `node scripts/seed.ts` — no transpiler, no build step.
 *
 * Node 22 strips TypeScript types on the fly. Types are erased, not checked
 * (that is `svelte-check`'s job), and syntax that *emits* rather than erases —
 * `enum`, namespaces, parameter properties — is unavailable. Neither costs us
 * anything here, and it removes a dependency that existed only to run one file.
 */
console.log('[e2e] seeding');
run('node', ['scripts/seed.ts']);

console.log('[e2e] database ready');
