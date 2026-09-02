import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db/index.ts';
import { alertRule, alertStatus, event, outbox, tenant } from './db/schema.ts';
import { INITIAL } from '#lib/alert/machine.ts';
import { drain, evaluateRule, tick } from './alerts.ts';

/**
 * Against the real database, for the same reason the ingest suite is.
 *
 * The two things worth proving here — that the status and the notification are
 * written in one transaction, and that a failed delivery backs off rather than
 * spinning — are both properties of the storage, and neither survives being
 * mocked.
 */
const TENANT = 'alerts-spec-tenant';
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

async function reset() {
	await db.delete(outbox).where(eq(outbox.tenantId, TENANT));
	await db.delete(event).where(eq(event.tenantId, TENANT));

	const rules = await db.select().from(alertRule).where(eq(alertRule.tenantId, TENANT));
	for (const rule of rules) await db.delete(alertStatus).where(eq(alertStatus.ruleId, rule.id));

	await db.delete(alertRule).where(eq(alertRule.tenantId, TENANT));
	await db.delete(tenant).where(eq(tenant.id, TENANT));
	await db.insert(tenant).values({ id: TENANT, name: 'Alerts spec', slug: TENANT });
}

beforeEach(reset);

async function makeRule(overrides: Partial<typeof alertRule.$inferInsert> = {}) {
	const row: typeof alertRule.$inferInsert = {
		id: crypto.randomUUID(),
		tenantId: TENANT,
		name: 'Errors',
		query: 'from logs | where level == "error" | summarize n = count()',
		threshold: 2,
		forMs: 0,
		windowMs: 300_000,
		intervalMs: 60_000,
		direction: 'above',
		enabled: true,
		...overrides
	};

	await db.insert(alertRule).values(row);
	return (await db.select().from(alertRule).where(eq(alertRule.id, row.id)))[0]!;
}

async function logError(at: number, count: number) {
	await db.insert(event).values(
		// No `id`: the column is an autoincrementing integer, and supplying a string
		// for it is `SQLITE_MISMATCH` rather than a type error — SQLite is loosely
		// typed everywhere except a rowid alias, which is the one place it is not.
		Array.from({ length: count }, () => ({
			tenantId: TENANT,
			timestamp: at,
			receivedAt: at,
			service: 'checkout',
			level: 'error',
			message: 'boom',
			traceId: '',
			spanId: '',
			host: '',
			attributes: '{}'
		}))
	);
}

describe('evaluateRule', () => {
	it('writes the status and one outbox row in the same transaction', async () => {
		const rule = await makeRule();
		await logError(NOW - 1_000, 5);

		await evaluateRule(rule, INITIAL, NOW);

		const status = (await db.select().from(alertStatus).where(eq(alertStatus.ruleId, rule.id)))[0]!;
		expect(status.state).toBe('firing');
		expect(status.value).toBe(5);

		const rows = await db.select().from(outbox).where(eq(outbox.tenantId, TENANT));
		expect(rows).toHaveLength(1);
		expect(rows[0]!.kind).toBe('alert.fired');
		expect(rows[0]!.deliveredAt).toBeNull();
	});

	it('does not write a second notification while it stays firing', async () => {
		const rule = await makeRule();
		await logError(NOW - 1_000, 5);

		await evaluateRule(rule, INITIAL, NOW);
		const first = (await db.select().from(alertStatus).where(eq(alertStatus.ruleId, rule.id)))[0]!;

		await evaluateRule(
			rule,
			{
				state: first.state,
				since: first.since,
				firingSince: first.firingSince,
				value: first.value,
				at: first.evaluatedAt
			},
			NOW + 60_000
		);

		// One notification for the transition, not one per evaluation. The difference
		// between an alerting system and a pager that rings every minute.
		expect(await db.select().from(outbox).where(eq(outbox.tenantId, TENANT))).toHaveLength(1);
	});

	/**
	 * The most important test in this file.
	 *
	 * A rule whose query returns nothing is *not* a rule whose value is zero. If it
	 * were treated as zero, an error-rate alert would resolve itself the moment the
	 * service stopped serving requests at all — which is the exact moment somebody
	 * needs to be told.
	 */
	it('holds its state when the query returns no rows', async () => {
		const rule = await makeRule();
		await logError(NOW - 1_000, 5);
		await evaluateRule(rule, INITIAL, NOW);

		const firing = (await db.select().from(alertStatus).where(eq(alertStatus.ruleId, rule.id)))[0]!;
		expect(firing.state).toBe('firing');

		// Nothing in the window at all now.
		await db.delete(event).where(eq(event.tenantId, TENANT));

		await evaluateRule(
			rule,
			{
				state: firing.state,
				since: firing.since,
				firingSince: firing.firingSince,
				value: firing.value,
				at: firing.evaluatedAt
			},
			NOW + 60_000
		);

		const after = (await db.select().from(alertStatus).where(eq(alertStatus.ruleId, rule.id)))[0]!;
		expect(after.state).toBe('firing');
	});

	it('treats an unparseable query as no data rather than as zero', async () => {
		const rule = await makeRule({ query: 'from logs | where' });
		await evaluateRule(rule, INITIAL, NOW);

		const status = (await db.select().from(alertStatus).where(eq(alertStatus.ruleId, rule.id)))[0]!;
		expect(status.state).toBe('ok');
		expect(status.value).toBeNull();
	});
});

describe('tick', () => {
	it('skips a rule whose interval has not elapsed', async () => {
		const rule = await makeRule({ intervalMs: 60_000 });
		await logError(NOW - 1_000, 5);

		await evaluateRule(rule, INITIAL, NOW);
		expect(await tick(NOW + 10_000)).toBe(0);
		expect(await tick(NOW + 61_000)).toBeGreaterThanOrEqual(1);
	});

	it('ignores disabled rules', async () => {
		await makeRule({ enabled: false });
		await logError(NOW - 1_000, 5);

		await tick(NOW);
		expect(await db.select().from(outbox).where(eq(outbox.tenantId, TENANT))).toHaveLength(0);
	});
});

describe('the outbox worker', () => {
	async function queue() {
		const rule = await makeRule();
		await logError(NOW - 1_000, 5);
		await evaluateRule(rule, INITIAL, NOW);
	}

	it('marks a delivered row and does not send it twice', async () => {
		await queue();

		let sends = 0;
		const deliver = async () => {
			sends += 1;
			await Promise.resolve();
		};

		expect(await drain(deliver, NOW)).toBe(1);
		expect(await drain(deliver, NOW + 1_000)).toBe(0);
		expect(sends).toBe(1);
	});

	/**
	 * Backoff is a *timestamp*, not a sleep.
	 *
	 * That is what makes it survive a restart: a process that crashes mid-backoff
	 * comes back and reads the same `nextAttemptAt`, rather than retrying
	 * immediately and hammering whatever was already failing.
	 */
	it('backs off after a failure and does not retry before it is due', async () => {
		await queue();

		const failing = async () => {
			await Promise.resolve();
			throw new Error('webhook refused');
		};

		expect(await drain(failing, NOW)).toBe(0);

		const [row] = await db.select().from(outbox).where(eq(outbox.tenantId, TENANT));
		expect(row!.attempts).toBe(1);
		expect(row!.lastError).toBe('webhook refused');
		expect(row!.nextAttemptAt).toBe(NOW + 20_000);

		// Not due yet: a second drain a second later must not touch it.
		let attempted = 0;
		await drain(async () => {
			attempted += 1;
			await Promise.resolve();
		}, NOW + 1_000);
		expect(attempted).toBe(0);
	});

	it('carries a stable deduplication key, because delivery is at-least-once', async () => {
		await queue();

		const [row] = await db.select().from(outbox).where(eq(outbox.tenantId, TENANT));
		const payload = JSON.parse(row!.payload) as { key: string };

		expect(payload.key).toMatch(/:fired:/);
		// The same transition produces the same key, so a receiver can collapse a
		// redelivery. A timestamp of *now* would produce a different key each time
		// and defeat the whole point.
		expect(payload.key.endsWith(String(NOW))).toBe(true);
	});
});
