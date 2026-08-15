/**
 * Opening the database.
 *
 * One file, one place the pragmas are applied, one place the schema is created.
 * Every process in the venue calls `openStore` and gets a connection configured
 * identically — which matters more than it sounds, because `busy_timeout` is a
 * property of the *connection* and has to be set again every time one is
 * opened. A process that forgets is the process that fails under load.
 */

import { createClient, type Client } from '@libsql/client';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export interface StoreOptions {
	readonly url: string;
	readonly authToken?: string;
	/** Apply the schema on open. Off in production, where migrations run first. */
	readonly migrate?: boolean;
}

export async function openStore({ url, authToken, migrate = true }: StoreOptions): Promise<Client> {
	const client = createClient(authToken === undefined ? { url } : { url, authToken });

	/*
	 * Separate `execute` calls, not a batch.
	 *
	 * `batch` wraps its statements in a transaction, and SQLite refuses to change
	 * journal mode inside one — "cannot change into wal mode from within a
	 * transaction". Written as a batch this fails, the error is easy to swallow,
	 * and WAL silently never applies. The venue then works perfectly until two
	 * processes read and write at once.
	 */
	await client.execute('PRAGMA journal_mode = WAL');
	await client.execute('PRAGMA busy_timeout = 5000');
	await client.execute('PRAGMA foreign_keys = ON');
	/*
	 * `synchronous = FULL` rather than the WAL default of `NORMAL`.
	 *
	 * NORMAL lets the OS decide when to flush, which means a machine that loses
	 * power can lose the last few commits. For a cache that is a fine trade. For
	 * an append-only log that is the system of record for other people's money,
	 * it is not: the whole promise is that an acknowledged order is durable.
	 */
	await client.execute('PRAGMA synchronous = FULL');

	if (migrate) {
		const schema = await readFile(join(here, 'schema.sql'), 'utf8');
		for (const statement of splitStatements(schema)) {
			await client.execute(statement);
		}
	}

	return client;
}

/**
 * Split a schema file into statements.
 *
 * Naive splitting on `;` breaks on the triggers, whose bodies contain
 * semicolons of their own. Tracking `BEGIN ... END` is enough for this file and
 * the check is written so that a future statement it cannot handle fails loudly
 * rather than being silently truncated.
 */
function splitStatements(sql: string): string[] {
	const withoutComments = sql.replace(/^\s*--.*$/gm, '');
	const statements: string[] = [];

	let current = '';
	let depth = 0;

	for (const line of withoutComments.split('\n')) {
		current += line + '\n';

		if (/\bBEGIN\b/i.test(line)) depth += 1;
		if (/\bEND\s*;/i.test(line)) depth -= 1;

		if (depth === 0 && /;\s*$/.test(line.trim())) {
			const trimmed = current.trim();
			if (trimmed) statements.push(trimmed);
			current = '';
		}
	}

	if (current.trim()) {
		throw new Error(`Unterminated SQL statement in schema:\n${current.slice(0, 120)}`);
	}

	return statements;
}
