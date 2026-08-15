/**
 * Migrations, and the discipline that makes them survivable.
 *
 * ## Why the base schema was not enough
 *
 * `schema.ts` is written entirely in `CREATE TABLE IF NOT EXISTS`, which means
 * running it against an existing database is a no-op. That is exactly right for
 * *creating* a venue and useless for *changing* one: `ALTER TABLE firm ADD
 * COLUMN billable_from` has no `IF NOT EXISTS`, so it succeeds once and then
 * fails on every subsequent start with "duplicate column name".
 *
 * So changes go here, numbered, applied once, recorded.
 *
 * ## Expand, migrate, contract
 *
 * The rule that makes a deploy survivable is that **the old code and the new
 * code must both work against the database at every moment in between**. During
 * a rolling deploy they are running simultaneously; there is no instant at
 * which only one version exists.
 *
 * That forbids the two changes everybody reaches for first:
 *
 *   **Renaming a column.** Old code selects the old name and dies. Instead: add
 *   the new column, write both for a release, backfill, switch reads, and drop
 *   the old one a release later. Three deploys instead of one, and no outage.
 *
 *   **Adding a NOT NULL column without a default.** Every insert from the old
 *   code omits it and fails. Add it nullable, backfill, tighten later — if at
 *   all.
 *
 * Both are enforced by review rather than by code, which is why they are
 * written down here where the next person adding a migration will read them.
 *
 * ## What is not here
 *
 * No `down` migrations. A rollback that runs `DROP COLUMN` destroys the data
 * written since the deploy, and the moment you need a rollback is the moment
 * you can least afford that. The recovery path for a bad migration is a *new*
 * migration — forward only, like everything else in this venue.
 */

import type { Client } from '@libsql/client';
import { withTransaction } from './client.ts';

export interface Migration {
	/** Monotonic. Gaps are fine; duplicates are not. */
	readonly id: number;
	readonly name: string;
	/** Statements, applied in order inside one transaction. */
	readonly statements: readonly string[];
}

/**
 * Every migration, in order.
 *
 * Appended to, never edited. Changing a migration that has already run
 * somewhere means two databases with the same recorded version and different
 * shapes — and nothing will tell you until a query fails on one of them.
 */
export const MIGRATIONS: readonly Migration[] = [
	{
		id: 1,
		name: 'firm.billable_from',
		statements: [
			/*
			 * Nullable, with no default.
			 *
			 * A firm is created during onboarding and often starts paying later, so
			 * `created_at` is the wrong date to prorate from — and prorating from the
			 * wrong date is the most common billing complaint there is.
			 *
			 * Nullable rather than `NOT NULL DEFAULT 0`: null means "not yet
			 * billable", which is a real state, and a default of zero would mean
			 * every existing firm was billable from 1970.
			 */
			'ALTER TABLE firm ADD COLUMN billable_from INTEGER'
		]
	},
	{
		id: 2,
		name: 'feature flags',
		statements: [
			/*
			 * Two tables, and the split is the point.
			 *
			 * `feature_flag` is the current value — one row per flag, upserted. It
			 * answers "is this on".
			 *
			 * `feature_flag_change` is append-only history. It answers "why is this
			 * off", which is the question somebody actually has six weeks later, and
			 * which an upserted row destroys every time it is written.
			 */
			`CREATE TABLE IF NOT EXISTS feature_flag (
				name TEXT PRIMARY KEY,
				enabled INTEGER NOT NULL,
				changed_by TEXT NOT NULL,
				reason TEXT NOT NULL,
				changed_at INTEGER NOT NULL
			) STRICT`,

			`CREATE TABLE IF NOT EXISTS feature_flag_change (
				rowid_alias INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				enabled INTEGER NOT NULL,
				changed_by TEXT NOT NULL,
				reason TEXT NOT NULL,
				changed_at INTEGER NOT NULL
			) STRICT`,

			'CREATE INDEX IF NOT EXISTS feature_flag_change_idx ON feature_flag_change (changed_at DESC)'
		]
	}
];

/* -------------------------------------------------------------------------- */
/* Running                                                                     */
/* -------------------------------------------------------------------------- */

const LEDGER = `
	CREATE TABLE IF NOT EXISTS schema_migration (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at INTEGER NOT NULL
	) STRICT
`;

export interface MigrationResult {
	readonly applied: readonly number[];
	readonly alreadyApplied: readonly number[];
}

/**
 * Apply everything not yet applied.
 *
 * ## One transaction per migration, not one for all of them
 *
 * If migration 4 fails, migrations 1–3 stay applied and recorded. The operator
 * fixes 4 and runs again. Wrapping all of them together would mean a failure in
 * the last one silently undoes the first three — and on a large table, redoing
 * them costs an outage rather than a retry.
 *
 * ## The record moves inside the same transaction
 *
 * Same rule as every consumer checkpoint in this codebase. Recording first and
 * a crash means a migration is marked done that never ran; recording after and
 * a crash means it runs twice. Both in one `BEGIN` and neither can happen.
 */
export async function migrate(client: Client, now = Date.now()): Promise<MigrationResult> {
	await client.execute(LEDGER);

	const done = await client.execute('SELECT id FROM schema_migration');
	const seen = new Set(done.rows.map((row) => Number(row['id'])));

	assertNoDuplicateIds();

	const applied: number[] = [];
	const alreadyApplied: number[] = [];

	for (const migration of [...MIGRATIONS].sort((a, b) => a.id - b.id)) {
		if (seen.has(migration.id)) {
			alreadyApplied.push(migration.id);
			continue;
		}

		try {
			await withTransaction(client, async (tx) => {
				for (const statement of migration.statements) await tx.execute(statement);

				await tx.execute({
					sql: 'INSERT INTO schema_migration (id, name, applied_at) VALUES (?, ?, ?)',
					args: [migration.id, migration.name, now]
				});
			});

			applied.push(migration.id);
		} catch (thrown) {
			throw new Error(
				`Migration ${migration.id} (${migration.name}) failed and was rolled back: ${
					thrown instanceof Error ? thrown.message : String(thrown)
				}`,
				{ cause: thrown }
			);
		}
	}

	return { applied, alreadyApplied };
}

/**
 * Two migrations with the same id is a merge accident, and it is silent.
 *
 * Two people branch, both add "migration 7", both merge. One of them runs, the
 * id is recorded, and the other never runs on any database that saw the first —
 * so half the fleet has a column the other half does not, and the first
 * symptom is a query failing on some machines.
 *
 * Checked on every start because the cost is a `Set` over a dozen numbers and
 * the alternative is that afternoon.
 */
function assertNoDuplicateIds(): void {
	const seen = new Set<number>();

	for (const migration of MIGRATIONS) {
		if (seen.has(migration.id)) {
			throw new Error(
				`Two migrations share id ${migration.id}. This is almost always two branches ` +
					'that both took the next number. Renumber one of them.'
			);
		}
		seen.add(migration.id);
	}
}

/** What has been applied, for an ops screen or a deploy check. */
export async function migrationStatus(client: Client): Promise<{
	current: number;
	pending: readonly Migration[];
	history: Array<{ id: number; name: string; appliedAt: number }>;
}> {
	await client.execute(LEDGER);

	const done = await client.execute(
		'SELECT id, name, applied_at FROM schema_migration ORDER BY id'
	);

	const seen = new Set(done.rows.map((row) => Number(row['id'])));

	return {
		current: done.rows.length === 0 ? 0 : Number(done.rows[done.rows.length - 1]?.['id']),
		pending: MIGRATIONS.filter((migration) => !seen.has(migration.id)),
		history: done.rows.map((row) => ({
			id: Number(row['id']),
			name: String(row['name']),
			appliedAt: Number(row['applied_at'])
		}))
	};
}
