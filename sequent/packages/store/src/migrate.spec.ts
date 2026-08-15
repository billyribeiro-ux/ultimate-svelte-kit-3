import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { openStore } from './client.ts';
import { migrate, migrationStatus, MIGRATIONS } from './migrate.ts';

/**
 * Migrations.
 *
 * The tests worth reading are the ones about *running twice* and *failing
 * halfway*, because those are the only two things that happen during a real
 * deploy that do not happen on a developer's machine.
 */

let directory: string;
let file: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-migrate-'));
	file = `file:${join(directory, 'test.db')}`;
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('running', () => {
	it('applies everything on a fresh database', async () => {
		const client = await openStore({ url: file });
		const status = await migrationStatus(client);

		expect(status.pending).toEqual([]);
		expect(status.current).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.id);
		client.close();
	});

	it('is a no-op the second time', async () => {
		const first = await openStore({ url: file });
		first.close();

		/*
		 * The reason this file exists. `schema.ts` is all `CREATE TABLE IF NOT
		 * EXISTS`, so re-running it is free — but `ALTER TABLE ADD COLUMN` has no
		 * such guard, and a venue that cannot be restarted twice is not a venue.
		 */
		const second = await openStore({ url: file });
		const result = await migrate(second);

		expect(result.applied).toEqual([]);
		expect(result.alreadyApplied.length).toBe(MIGRATIONS.length);
		second.close();
	});

	it('actually changed the shape', async () => {
		const client = await openStore({ url: file });

		await client.execute({
			sql: 'INSERT INTO firm (firm_id, name, created_at, billable_from) VALUES (?, ?, ?, ?)',
			args: ['firm-a', 'Northgate', 0, 12_345]
		});

		const row = await client.execute('SELECT billable_from FROM firm');
		expect(Number(row.rows[0]?.['billable_from'])).toBe(12_345);
		client.close();
	});

	it('records when each one ran', async () => {
		const client = await openStore({ url: file });
		const status = await migrationStatus(client);

		expect(status.history).toHaveLength(MIGRATIONS.length);
		expect(status.history[0]?.name).toBe(MIGRATIONS[0]!.name);
		client.close();
	});
});

describe('when one fails', () => {
	it('rolls back and leaves the version untouched', async () => {
		const client = await openStore({ url: file });
		const before = (await migrationStatus(client)).current;

		/*
		 * A migration is one transaction, so a failure halfway leaves nothing
		 * behind — not the partial change, and not the record saying it ran.
		 *
		 * Getting this wrong is the failure that ruins a night: the version says
		 * 7, the shape is halfway between 6 and 7, and re-running does nothing
		 * because 7 is already recorded.
		 */
		const broken = [
			{
				id: 9_999,
				name: 'broken',
				statements: [
					'ALTER TABLE firm ADD COLUMN scratch_ok INTEGER',
					'ALTER TABLE nonexistent_table ADD COLUMN nope INTEGER'
				]
			}
		];

		// Temporarily splice it in, as if somebody had shipped it.
		const original = [...MIGRATIONS];
		(MIGRATIONS as unknown as typeof broken).push(...broken);

		await expect(migrate(client)).rejects.toThrow(/Migration 9999.*rolled back/s);

		// The version did not move.
		expect((await migrationStatus(client)).current).toBe(before);

		// And the first statement's change was rolled back with it.
		const columns = await client.execute('PRAGMA table_info(firm)');
		expect(columns.rows.some((row) => String(row['name']) === 'scratch_ok')).toBe(false);

		(MIGRATIONS as unknown as typeof broken).length = original.length;
		client.close();
	});
});

describe('duplicate ids', () => {
	it('are caught before anything runs', async () => {
		const client = await openStore({ url: file });

		const duplicate = { id: MIGRATIONS[0]!.id, name: 'from another branch', statements: [] };
		const original = MIGRATIONS.length;
		(MIGRATIONS as unknown as Array<typeof duplicate>).push(duplicate);

		/*
		 * Two branches both taking "the next number" is silent otherwise: one runs,
		 * the id is recorded, the other never runs on any database that saw the
		 * first, and half the fleet ends up with a column the other half lacks.
		 */
		await expect(migrate(client)).rejects.toThrow(/share id/);

		(MIGRATIONS as unknown as Array<typeof duplicate>).length = original;
		client.close();
	});
});

describe('the base schema', () => {
	it('creates nothing when the tables already exist', async () => {
		const first = await openStore({ url: file });
		await first.execute({
			sql: 'INSERT INTO firm (firm_id, name, created_at) VALUES (?, ?, ?)',
			args: ['firm-a', 'Northgate', 0]
		});
		first.close();

		// Opening again must not wipe anything — every statement is IF NOT EXISTS.
		const second = await openStore({ url: file });
		const rows = await second.execute('SELECT COUNT(*) AS n FROM firm');

		expect(Number(rows.rows[0]?.['n'])).toBe(1);
		second.close();
	});

	it('can be skipped, for a process that must not migrate', async () => {
		const seeded = await openStore({ url: file });
		seeded.close();

		/*
		 * `migrate: false` exists for the deploy order that actually works: run
		 * migrations once, from one place, then start N application processes that
		 * assume the shape. Ten processes racing to ALTER the same table is a
		 * lock convoy at best.
		 */
		const client = await openStore({ url: file, migrate: false });
		const rows = await client.execute('SELECT COUNT(*) AS n FROM schema_migration');

		expect(Number(rows.rows[0]?.['n'])).toBe(MIGRATIONS.length);
		client.close();
	});
});

describe('expand-migrate-contract', () => {
	it('adds columns nullable, so old code keeps working', () => {
		/*
		 * Not a runtime test — a review gate written as an assertion.
		 *
		 * During a rolling deploy the old and new code run simultaneously. A
		 * `NOT NULL` column with no default breaks every insert the old code makes,
		 * and the deploy fails halfway with half the fleet on each version.
		 *
		 * Adding it here means somebody who writes one has to read the reason.
		 */
		for (const migration of MIGRATIONS) {
			for (const statement of migration.statements) {
				if (!/ALTER TABLE .* ADD COLUMN/i.test(statement)) continue;

				const unsafe = /NOT NULL/i.test(statement) && !/DEFAULT/i.test(statement);
				expect(unsafe, `${migration.id} ${migration.name}: ${statement}`).toBe(false);
			}
		}
	});

	it('never renames or drops a column', () => {
		// Both break the old code that is still running mid-deploy. A rename is
		// three deploys: add, dual-write, backfill, switch, drop — never one.
		for (const migration of MIGRATIONS) {
			for (const statement of migration.statements) {
				expect(/RENAME COLUMN|DROP COLUMN/i.test(statement), statement).toBe(false);
			}
		}
	});
});

/** Sanity: the raw client sees nothing until `openStore` has run. */
describe('a database nobody migrated', () => {
	it('has no tables at all', async () => {
		const raw = createClient({ url: file });
		const tables = await raw.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
		);

		expect(tables.rows).toHaveLength(0);
		raw.close();
	});
});

/* Keep a reference so the import is not elided by the type checker. */
export type { Client };
