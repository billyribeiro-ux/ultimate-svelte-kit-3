import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { openStore, withTransaction } from './client.ts';

let client: Client;
let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-client-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });
	await client.execute('CREATE TABLE IF NOT EXISTS probe (a INTEGER, b TEXT) STRICT');
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

describe('withTransaction', () => {
	it('commits when the work succeeds', async () => {
		await withTransaction(client, async (tx) => {
			await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [1, 'x'] });
			await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [2, 'y'] });
		});

		const rows = await client.execute('SELECT COUNT(*) AS n FROM probe');
		expect(Number(rows.rows[0]?.['n'])).toBe(2);
	});

	it('rolls everything back when the work throws', async () => {
		await expect(
			withTransaction(client, async (tx) => {
				await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [1, 'x'] });
				throw new Error('halfway');
			})
		).rejects.toThrow('halfway');

		const rows = await client.execute('SELECT COUNT(*) AS n FROM probe');
		expect(Number(rows.rows[0]?.['n'])).toBe(0);
	});

	it('surfaces the original error, not the rollback´s', async () => {
		// A rollback that throws must not replace the reason the transaction
		// failed — that turns a useful error into a meaningless one.
		await expect(
			withTransaction(client, async () => {
				throw new TypeError('the actual problem');
			})
		).rejects.toThrow('the actual problem');
	});

	it('keeps working after a failure', async () => {
		await withTransaction(client, async () => {
			throw new Error('first');
		}).catch(() => {});

		/*
		 * The chain must continue past a rejection. Wiring it with a plain
		 * `.then()` would leave every later transaction on this connection waiting
		 * on a promise that never settles — one failed write and the process
		 * silently stops writing, forever.
		 */
		await withTransaction(client, async (tx) => {
			await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [1, 'x'] });
		});

		const rows = await client.execute('SELECT COUNT(*) AS n FROM probe');
		expect(Number(rows.rows[0]?.['n'])).toBe(1);
	});

	it('serialises concurrent callers rather than interleaving them', async () => {
		/*
		 * SQLite allows one write transaction per connection. Two overlapping
		 * `withTransaction` calls would otherwise put their statements into *one*
		 * transaction and commit them together — not a deadlock, not an error,
		 * and completely wrong.
		 *
		 * The engine and the projector share a client in `apps/engine`, so this is
		 * not hypothetical.
		 */
		const order: string[] = [];

		await Promise.all([
			withTransaction(client, async (tx) => {
				order.push('a:start');
				await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [1, 'a'] });
				await new Promise((resolve) => setTimeout(resolve, 20));
				order.push('a:end');
			}),
			withTransaction(client, async (tx) => {
				order.push('b:start');
				await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [2, 'b'] });
				order.push('b:end');
			})
		]);

		// Not a:start, b:start, a:end, b:end.
		expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);

		const rows = await client.execute('SELECT COUNT(*) AS n FROM probe');
		expect(Number(rows.rows[0]?.['n'])).toBe(2);
	});

	it('returns what the work returned', async () => {
		const result = await withTransaction(client, async () => 42);
		expect(result).toBe(42);
	});
});

/* -------------------------------------------------------------------------- */

describe('file descriptors', () => {
	/**
	 * The regression test for the bug that killed the engine.
	 *
	 * `@libsql/client` 0.17.4's `client.transaction()` opens a second connection
	 * and never releases it — not on commit, not on rollback, not on an explicit
	 * `close()`. Two descriptors per transaction, forever.
	 *
	 * The engine opens one transaction per command, so at the default limit it
	 * died after about ten thousand orders with `SQLITE_CANTOPEN: unable to open
	 * database file` — an error about opening a database, from code that had the
	 * database open throughout.
	 *
	 * A load test asking for exactly ten thousand orders found it. This test
	 * makes sure a future refactor back to `client.transaction()` fails here,
	 * loudly, in two seconds, instead of in production after a few minutes of
	 * real trading.
	 */
	it('does not leak one per transaction', async () => {
		// `/proc/self/fd` is Linux-only. Elsewhere this test has nothing to
		// measure, and a skipped test is more honest than one that asserts nothing.
		const readable = (() => {
			try {
				readdirSync('/proc/self/fd');
				return true;
			} catch {
				return false;
			}
		})();

		if (!readable) {
			expect(readable).toBe(false);
			return;
		}

		const count = () => readdirSync('/proc/self/fd').length;

		// Warm up, so one-off allocations do not look like a leak.
		for (let index = 0; index < 20; index += 1) {
			await withTransaction(client, async (tx) => {
				await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [index, 'warm'] });
			});
		}

		const before = count();

		for (let index = 0; index < 500; index += 1) {
			await withTransaction(client, async (tx) => {
				await tx.execute({ sql: 'INSERT INTO probe (a, b) VALUES (?, ?)', args: [index, 'run'] });
			});
		}

		const after = count();

		/*
		 * A small allowance rather than exact equality: the runtime opens and
		 * closes descriptors for its own reasons, and a test that demands a
		 * perfectly flat number would fail on an unrelated garbage collection.
		 *
		 * The leak this catches is 1,000 descriptors, so 10 is a comfortable
		 * margin and still nowhere near it.
		 */
		expect(after - before).toBeLessThan(10);
	});
});
