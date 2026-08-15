/**
 * Seed the venue, against the same database every process uses.
 *
 * A one-line wrapper, and it earns its keep: without it, `pnpm seed` from the
 * workspace root runs the seed with pnpm's working directory set to
 * `apps/web`, and `file:sequent.db` lands there rather than at the root — while
 * the engine, started from `apps/engine`, looks somewhere else again.
 *
 * Resolving the path once, here, is what makes "seed it, then run it" work
 * without anybody having to know which directory each process starts in.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { resolveDatabaseUrl, WORKSPACE_ROOT } from './paths.js';

const DATABASE_URL = resolveDatabaseUrl();

console.log(`Seeding ${DATABASE_URL}\n`);

const child = spawn('node', ['scripts/seed.ts'], {
	cwd: resolve(WORKSPACE_ROOT, 'apps/web'),
	env: { ...process.env, DATABASE_URL },
	stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code ?? 1));
