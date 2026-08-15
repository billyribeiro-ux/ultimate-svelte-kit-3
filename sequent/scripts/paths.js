/**
 * Where the database is, decided once for every process.
 *
 * ## The bug this exists to prevent
 *
 * `DATABASE_URL=file:sequent.db` looks fine and is a trap in a multi-process
 * system. A relative path is relative to whatever directory the process happens
 * to be started in, and the engine starts in `apps/engine` while the web server
 * starts in `apps/web`. Same environment variable, two different files, and a
 * venue where orders vanish because the engine is reading a database nobody
 * writes to.
 *
 * It fails silently, too. SQLite creates a missing file rather than
 * complaining, so the second process gets an empty database and reports no
 * errors at all — just an order book that is always empty.
 *
 * The fix is one rule: **processes exchange absolute paths.** A relative
 * `DATABASE_URL` is resolved here, against the workspace root, before any child
 * is spawned.
 */

import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The workspace root — the directory holding `pnpm-workspace.yaml`. */
export const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Turn whatever `DATABASE_URL` says into something every process reads the same
 * way.
 *
 * Remote URLs (`libsql://`, `https://`) are already unambiguous and pass
 * through untouched. Only `file:` needs the treatment, because only `file:` has
 * a relative form.
 */
export function resolveDatabaseUrl(url = process.env.DATABASE_URL ?? 'file:sequent.db') {
	if (!url.startsWith('file:')) return url;

	const path = url.slice('file:'.length);
	if (isAbsolute(path)) return url;

	return `file:${resolve(WORKSPACE_ROOT, path)}`;
}
