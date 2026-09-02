import { beforeAll, describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { check } from '#lib/sqf/check.ts';
import { evaluate } from '#lib/sqf/eval.ts';
import { parse } from '#lib/sqf/parser.ts';
import type { Row } from '#lib/sqf/value.ts';
import { seeded } from '#lib/sketch/testing.ts';
import { db } from './db/index.ts';
import { event, span, tenant } from './db/schema.ts';
import { BatchSchema, ingest, resetRateLimits } from './ingest.ts';
import { run } from './storage.ts';

/**
 * THE DIFFERENTIAL TEST
 * =====================
 *
 * Two implementations of one query language, run over the same rows, asserting
 * the same answer. That is the entire reason `eval.ts` stays simple: it is the
 * oracle, and an oracle that has been optimised is not one.
 *
 * The queries below are generated rather than chosen, because the interesting
 * disagreements are the ones nobody would think to write — a `!=` against a
 * column that is null on some rows, a `take` after a filter that could not be
 * pushed, a sort on a column with ties.
 */

const TENANT = 'storage-spec-tenant';
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const WINDOW = { from: NOW - 3_600_000, to: NOW + 3_600_000 };

const SERVICES = ['api', 'web', 'worker'];
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

beforeAll(async () => {
	resetRateLimits();

	await db.delete(event).where(eq(event.tenantId, TENANT));
	await db.delete(span).where(eq(span.tenantId, TENANT));
	await db.delete(tenant).where(eq(tenant.id, TENANT));
	await db.delete(tenant).where(eq(tenant.slug, TENANT));
	await db.insert(tenant).values({ id: TENANT, name: 'Storage', slug: TENANT });

	const random = seeded(1234);

	await ingest({
		tenantId: TENANT,
		now: NOW,
		batch: v.parse(BatchSchema, {
			logs: Array.from({ length: 400 }, (_, i) => ({
				timestamp: NOW - 1_800_000 + i * 9_000,
				service: SERVICES[Math.floor(random() * SERVICES.length)]!,
				level: LEVELS[Math.floor(random() * LEVELS.length)]!,
				message: `line ${i}`,
				// Absent on some rows on purpose: nulls are where the two
				// implementations are most likely to disagree.
				host: random() < 0.3 ? '' : `host-${Math.floor(random() * 4)}`,
				traceId: random() < 0.5 ? `trace-${Math.floor(random() * 20)}` : undefined,
				attributes: { status: random() < 0.5 ? 200 : '500', size: Math.floor(random() * 1000) }
			})),
			spans: Array.from({ length: 200 }, (_, i) => ({
				timestamp: NOW - 1_800_000 + i * 18_000,
				traceId: `trace-${i % 20}`,
				spanId: `span-${i}`,
				parentId: i % 5 === 0 ? '' : `span-${i - (i % 5)}`,
				service: SERVICES[Math.floor(random() * SERVICES.length)]!,
				name: `op-${i % 7}`,
				duration: Math.round(random() * 900 * 100) / 100,
				status: random() < 0.2 ? ('error' as const) : ('ok' as const)
			}))
		})
	});
});

/** Every row in the window, as the evaluator would see it. The oracle's input. */
async function allRows(source: 'logs' | 'spans'): Promise<Row[]> {
	const { rows } = await run(parse(`from ${source}`).query!, {
		tenantId: TENANT,
		...WINDOW,
		maxRows: 100_000
	});
	return rows as Row[];
}

/**
 * Run a query both ways and assert they agree.
 *
 * The pushed-down path goes through SQL and then the evaluator; the oracle path
 * loads every row in the window and runs only the evaluator. A disagreement is
 * always a pushdown bug, because the oracle has nothing to be wrong about.
 */
async function bothWays(source: 'logs' | 'spans', text: string) {
	const { query, errors } = parse(text);
	expect(
		errors.map((e) => e.message),
		text
	).toEqual([]);
	expect(
		check(query!).errors.map((e) => e.message),
		text
	).toEqual([]);

	const pushed = await run(query!, { tenantId: TENANT, ...WINDOW, maxRows: 100_000 });
	const oracle = evaluate(query!, await allRows(source), { maxRows: 100_000 });

	return { pushed, oracle };
}

async function agree(source: 'logs' | 'spans', text: string) {
	const { pushed, oracle } = await bothWays(source, text);
	expect(pushed.rows, text).toEqual(oracle.rows);
}

describe('the two implementations agree', () => {
	it('on filters that push down', async () => {
		for (const text of [
			'from logs | where service == "api"',
			'from logs | where service != "api"',
			'from logs | where level == "error" and service == "web"',
			'from logs | where timestamp > ' + (NOW - 900_000),
			// `500ms`, not `500` — the checker refuses a duration against a bare
			// number, which is the units rule from `check.ts` doing its job on the
			// test rather than on a person.
			'from spans | where duration > 500ms',
			'from spans | where duration <= 100ms',
			'from spans | where status == "error" and service == "api"'
		]) {
			await agree(text.startsWith('from spans') ? 'spans' : 'logs', text);
		}
	});

	it('on filters that do not', async () => {
		/*
		 * These are the ones the pushdown deliberately declines, and the assertion
		 * is that declining is *invisible* — the answer is identical, only the work
		 * happened somewhere else.
		 */
		for (const text of [
			'from logs | where message contains "line 1"',
			'from logs | where message =~ "line [0-9]$"',
			'from logs | where attributes.status >= 500',
			'from logs | where level in ["warn", "error"]',
			'from logs | where strlen(message) > 7'
		]) {
			await agree('logs', text);
		}
	});

	it('on a mix of pushable and unpushable, in either order', async () => {
		// The order matters to the pushdown and must not matter to the answer.
		await agree('logs', 'from logs | where service == "api" | where message contains "1"');
		await agree('logs', 'from logs | where message contains "1" | where service == "api"');
	});

	it('on sort and take', async () => {
		await agree('logs', 'from logs | sort by timestamp desc | take 20');
		await agree('spans', 'from spans | sort by duration desc | take 10');
		await agree('spans', 'from spans | sort by service asc, duration desc | take 15');
	});

	it('on aggregation', async () => {
		await agree('logs', 'from logs | summarize n = count() by service');
		await agree(
			'logs',
			'from logs | summarize n = count(), e = countif(level == "error") by service'
		);
		await agree('spans', 'from spans | summarize p95 = percentile(duration, 95) by service');
		await agree(
			'spans',
			'from spans | summarize slowest = max(duration) by name | sort by slowest desc'
		);
	});

	it('on randomly generated queries', async () => {
		const random = seeded(77);

		for (let i = 0; i < 60; i += 1) {
			const service = SERVICES[Math.floor(random() * SERVICES.length)]!;
			const level = LEVELS[Math.floor(random() * LEVELS.length)]!;
			const op = random() < 0.5 ? '==' : '!=';
			const limit = 1 + Math.floor(random() * 30);
			const direction = random() < 0.5 ? 'asc' : 'desc';

			const clauses = [`service ${op} "${service}"`];
			if (random() < 0.5) clauses.push(`level == "${level}"`);
			if (random() < 0.3) clauses.push(`message contains "1"`);

			await agree(
				'logs',
				`from logs | where ${clauses.join(' and ')} | sort by timestamp ${direction} | take ${limit}`
			);
		}
	});
});

describe('what actually got pushed', () => {
	it('always pushes the time range', async () => {
		/*
		 * The one predicate that must never be forgotten. Without it a query scans
		 * a tenant's whole history, and the composite index is useless because its
		 * second column is unbounded.
		 */
		const { pushed } = await bothWays('logs', 'from logs');
		expect(pushed.pushed).toContain('time range');
	});

	it('pushes a simple column filter', async () => {
		const { pushed } = await bothWays('logs', 'from logs | where service == "api"');
		expect(pushed.pushed).toContain('filter');
		// And it read fewer rows than exist, which is the point of pushing.
		expect(pushed.scanned).toBeLessThan(400);
	});

	it('does not push a filter it cannot translate exactly', async () => {
		const { pushed } = await bothWays('logs', 'from logs | where message contains "line"');
		expect(pushed.pushed).not.toContain('filter');
		expect(pushed.scanned).toBe(400);
	});

	it('does not push a limit above a filter it could not push', async () => {
		/*
		 * THE CLASSIC PUSHDOWN BUG
		 *
		 * A `LIMIT` moved above a filter returns the first N of a *larger* set —
		 * a page of results that is stable, plausible and missing rows. Here the
		 * `contains` cannot be pushed, so the limit must not be either.
		 */
		const { pushed, oracle } = await bothWays(
			'logs',
			'from logs | where message contains "1" | sort by timestamp desc | take 5'
		);

		expect(pushed.pushed).not.toContain('limit');
		expect(pushed.rows).toEqual(oracle.rows);
		expect(pushed.rows.length).toBeGreaterThan(0);
	});

	it('does push a limit when everything before it pushed', async () => {
		const { pushed } = await bothWays(
			'logs',
			'from logs | where service == "api" | sort by timestamp desc | take 5'
		);
		expect(pushed.pushed).toEqual(expect.arrayContaining(['filter', 'sort', 'limit']));
		expect(pushed.scanned).toBe(5);
	});

	it('does not push a sort over computed columns', async () => {
		// After a `summarize` the sort keys are columns that exist in no table.
		const { pushed } = await bothWays(
			'logs',
			'from logs | summarize n = count() by service | sort by n desc'
		);
		expect(pushed.pushed).not.toContain('sort');
	});
});

describe('isolation', () => {
	it('never returns another tenant a row', async () => {
		/*
		 * The one bug in a multi-tenant system that must never ship. Asserted here
		 * rather than trusted, because the tenant predicate is added in one place
		 * and a refactor that moves it is a data breach.
		 */
		// Deleted first: a previous run that failed part way through leaves this
		// behind, and the next run then fails on a unique slug rather than on
		// whatever it was actually testing.
		await db.delete(tenant).where(eq(tenant.id, 'other-storage'));
		await db.insert(tenant).values({ id: 'other-storage', name: 'Other', slug: 'other-storage' });
		await ingest({
			tenantId: 'other-storage',
			now: NOW,
			batch: v.parse(BatchSchema, {
				logs: [{ timestamp: NOW, service: 'secret', level: 'error', message: 'not yours' }]
			})
		});

		const { rows } = await run(parse('from logs').query!, {
			tenantId: TENANT,
			...WINDOW,
			maxRows: 100_000
		});

		expect(rows.some((row) => row.service === 'secret')).toBe(false);

		await db.delete(event).where(eq(event.tenantId, 'other-storage'));
		await db.delete(tenant).where(eq(tenant.id, 'other-storage'));
	});

	it('respects the time range', async () => {
		const narrow = await run(parse('from logs').query!, {
			tenantId: TENANT,
			from: NOW - 600_000,
			to: NOW,
			maxRows: 100_000
		});

		for (const row of narrow.rows) {
			expect(Number(row.timestamp)).toBeGreaterThanOrEqual(NOW - 600_000);
			expect(Number(row.timestamp)).toBeLessThan(NOW);
		}
	});
});

describe('bags', () => {
	it('parses JSON once, on read', async () => {
		// Parsed here rather than lazily in the evaluator so a malformed bag fails
		// once per row rather than once per predicate that touches it.
		const { rows } = await run(parse('from logs | take 1').query!, {
			tenantId: TENANT,
			...WINDOW
		});
		expect(typeof rows[0]!.attributes).toBe('object');
	});

	it('survives a bag that will not parse', async () => {
		/*
		 * Should be impossible — ingest validates — but "impossible" data arrives
		 * from a migration or a manual insert, and one bad row must not fail the
		 * query that would have shown it.
		 */
		await db.insert(event).values({
			tenantId: TENANT,
			timestamp: NOW,
			receivedAt: NOW,
			service: 'broken',
			level: 'error',
			message: 'bad bag',
			attributes: 'not json at all'
		});

		const { rows } = await run(parse('from logs | where service == "broken"').query!, {
			tenantId: TENANT,
			...WINDOW
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]!.attributes).toEqual({});

		await db.delete(event).where(eq(event.service, 'broken'));
	});
});

describe('truncation', () => {
	it('reports a result cut short by the row ceiling', async () => {
		const result = await run(parse('from logs').query!, {
			tenantId: TENANT,
			...WINDOW,
			maxRows: 50
		});

		expect(result.rows).toHaveLength(50);
		expect(result.truncated).toBe(true);
	});
});

describe('the projection', () => {
	/**
	 * Internal columns must never reach a result.
	 *
	 * `db.select()` with no projection returns `id`, `tenant_id` and `received_at`
	 * as well, and the consequence was not merely untidy: the chart view picks the
	 * first numeric column, found `id`, and drew a beautiful straight line of
	 * primary keys.
	 */
	it('returns only the columns the schema documents', async () => {
		const { pushed: result } = await bothWays('logs', 'from logs | take 5');

		expect(result.columns).toEqual([
			'timestamp',
			'service',
			'level',
			'message',
			'trace_id',
			'span_id',
			'host',
			'attributes'
		]);

		for (const forbidden of ['id', 'tenantId', 'tenant_id', 'receivedAt', 'received_at']) {
			expect(result.columns).not.toContain(forbidden);
		}
	});

	/**
	 * The same query must give the same answer whether or not it was pushed.
	 *
	 * Drizzle keys a row by its JavaScript name — `traceId` — while SQF calls the
	 * column `trace_id`. Before the projection, a predicate on `trace_id` that
	 * reached SQL worked and one that fell back to the evaluator silently matched
	 * nothing, so the answer depended on whether the planner happened to push it.
	 * That is the worst possible kind of difference, and this is the test that
	 * would have caught it.
	 */
	it('agrees with itself whether a predicate is pushed or not', async () => {
		const viaSql = (await bothWays('logs', 'from logs | where trace_id != ""')).pushed;

		// `strlen` is not pushable, so this one is evaluated in memory over the same
		// rows — and must select exactly the same set.
		const viaEvaluator = (await bothWays('logs', 'from logs | where strlen(trace_id) > 0')).pushed;

		expect(viaSql.pushed).toContain('filter');
		expect(viaEvaluator.pushed).not.toContain('filter');
		expect(viaEvaluator.rows).toEqual(viaSql.rows);
	});
});
