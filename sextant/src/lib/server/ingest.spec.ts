import { beforeEach, describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { eq, sql } from 'drizzle-orm';
import { db } from './db/index.ts';
import { event, sample, series, span, tenant } from './db/schema.ts';
import {
	BatchSchema,
	IngestError,
	ingest,
	purge,
	resetRateLimits,
	seriesKeyFor,
	usageFor
} from './ingest.ts';

/**
 * These run against the real database rather than a mock.
 *
 * The three things most worth testing here — the unique index that makes a
 * retry free, the transaction that makes a batch one fsync, and the cardinality
 * count — are all properties of the *schema*, and a mock has none of them. A
 * mocked ingest test asserts that the code calls the functions it calls, which
 * is a restatement rather than a test.
 */
const TENANT = 'ingest-spec-tenant';
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

beforeEach(async () => {
	resetRateLimits();

	await db.delete(event).where(eq(event.tenantId, TENANT));
	await db.delete(span).where(eq(span.tenantId, TENANT));
	await db.delete(sample).where(eq(sample.tenantId, TENANT));
	await db.delete(series).where(eq(series.tenantId, TENANT));
	await db.delete(tenant).where(eq(tenant.id, TENANT));

	await db.insert(tenant).values({ id: TENANT, name: 'Spec', slug: TENANT });
});

/**
 * Build a batch the way a collector would: with the optional fields left out.
 *
 * Typed against `InferInput` rather than `InferOutput`. The two differ wherever
 * a schema has a default — `host`, `attributes`, `status` — and using the output
 * type here would force every test to spell out fields that exist precisely so
 * that senders do not have to.
 */
function batch(partial: v.InferInput<typeof BatchSchema>) {
	return v.parse(BatchSchema, partial);
}

const LOG = {
	timestamp: NOW,
	service: 'api',
	level: 'error' as const,
	message: 'boom'
};

async function countOf(table: typeof event | typeof span | typeof sample): Promise<number> {
	const rows = await db
		.select({ n: sql<number>`count(*)` })
		.from(table)
		.where(eq(table.tenantId, TENANT));
	return rows[0]?.n ?? 0;
}

describe('the wire format catches the mistakes senders actually make', () => {
	it('rejects seconds where milliseconds belong', () => {
		/*
		 * A number around 1.7e9 is 1970. The data lands fifty years in the past,
		 * falls outside every query range, and looks like it was dropped — so the
		 * message names the likely unit rather than saying "too small".
		 */
		const result = v.safeParse(BatchSchema, { logs: [{ ...LOG, timestamp: 1_764_547_200 }] });
		expect(result.success).toBe(false);
		expect(v.flatten(result.issues!).nested?.['logs.0.timestamp']?.[0]).toContain(
			'seconds rather than milliseconds'
		);
	});

	it('rejects nanoseconds', () => {
		const result = v.safeParse(BatchSchema, {
			logs: [{ ...LOG, timestamp: 1_764_547_200_000_000_000 }]
		});
		expect(result.success).toBe(false);
	});

	it('rejects a NaN duration, which would poison every percentile', () => {
		const result = v.safeParse(BatchSchema, {
			spans: [
				{
					timestamp: NOW,
					traceId: 't',
					spanId: 's',
					service: 'api',
					name: 'GET /',
					duration: Number.NaN
				}
			]
		});
		expect(result.success).toBe(false);
	});

	it('rejects a negative duration, which would make a bar with negative width', () => {
		const result = v.safeParse(BatchSchema, {
			spans: [
				{ timestamp: NOW, traceId: 't', spanId: 's', service: 'api', name: 'x', duration: -1 }
			]
		});
		expect(result.success).toBe(false);
	});

	it('rejects an oversized attribute bag', () => {
		// Unbounded, a sender stores an unbounded blob per row — and every query
		// that walks `attributes.a.b` gets slower for everybody in the tenant.
		const huge = { logs: [{ ...LOG, attributes: { blob: 'x'.repeat(9_000) } }] };
		expect(v.safeParse(BatchSchema, huge).success).toBe(false);
	});

	it('accepts a batch with only one kind of signal', () => {
		expect(v.safeParse(BatchSchema, { logs: [LOG] }).success).toBe(true);
		expect(v.safeParse(BatchSchema, {}).success).toBe(true);
	});
});

describe('writing', () => {
	it('stores logs, spans and samples in one call', async () => {
		const result = await ingest({
			tenantId: TENANT,
			now: NOW,
			batch: batch({
				logs: [LOG],
				spans: [
					{
						timestamp: NOW,
						traceId: 't1',
						spanId: 's1',
						service: 'api',
						name: 'GET /',
						duration: 12.5
					}
				],
				samples: [{ timestamp: NOW, metric: 'rps', value: 3 }]
			})
		});

		expect(result.accepted).toBe(3);
		expect(await countOf(event)).toBe(1);
		expect(await countOf(span)).toBe(1);
		expect(await countOf(sample)).toBe(1);
	});

	it('keeps the sender clock and ours apart', async () => {
		/*
		 * A query filters on `timestamp` because that is when the thing happened;
		 * retention deletes on `receivedAt` because that is when we became
		 * responsible for it. One column for both means a sender with a wrong clock
		 * either escapes retention forever or is deleted the moment it arrives.
		 */
		const sent = NOW - 30_000;
		await ingest({
			tenantId: TENANT,
			now: NOW,
			batch: batch({ logs: [{ ...LOG, timestamp: sent }] })
		});

		const [row] = await db
			.select({ timestamp: event.timestamp, receivedAt: event.receivedAt })
			.from(event)
			.where(eq(event.tenantId, TENANT));

		expect(row).toEqual({ timestamp: sent, receivedAt: NOW });
	});

	it('makes a re-sent batch of spans free', async () => {
		/*
		 * A collector that lost its connection mid-request does not know whether the
		 * batch landed, so it sends it again. Without the unique index a trace grows
		 * a duplicate of every span sent during a flaky minute, and the waterfall
		 * renders each one twice — which reads as the service doing the work twice.
		 */
		const spans = batch({
			spans: [
				{ timestamp: NOW, traceId: 't1', spanId: 's1', service: 'api', name: 'a', duration: 1 },
				{ timestamp: NOW, traceId: 't1', spanId: 's2', service: 'api', name: 'b', duration: 2 }
			]
		});

		await ingest({ tenantId: TENANT, now: NOW, batch: spans });
		await ingest({ tenantId: TENANT, now: NOW, batch: spans });

		expect(await countOf(span)).toBe(2);
	});

	it('accepts an empty batch without complaining', async () => {
		// A collector with nothing to send should not have to special-case that;
		// answering 400 makes it log an error every scrape interval.
		const result = await ingest({ tenantId: TENANT, now: NOW, batch: batch({}) });
		expect(result.accepted).toBe(0);
	});
});

describe('series keys', () => {
	it('does not care about label order', () => {
		/*
		 * Getting this wrong doubles a tenant's cardinality for no reason, and —
		 * because the two keys never merge — makes a chart show two half-height
		 * lines where one should be.
		 */
		expect(seriesKeyFor('rps', { a: '1', b: '2' })).toBe(seriesKeyFor('rps', { b: '2', a: '1' }));
	});

	it('distinguishes different values, including lookalikes', () => {
		expect(seriesKeyFor('rps', { a: '1' })).not.toBe(seriesKeyFor('rps', { a: 1 }));
		expect(seriesKeyFor('rps', { a: 'x' })).not.toBe(seriesKeyFor('rps', { b: 'x' }));
	});

	it('cannot be forged by a label value containing the separator', () => {
		// JSON-encoding the value is what stops `{a: 'xby'}` colliding
		// with `{a: 'x', b: 'y'}`.
		expect(seriesKeyFor('m', { a: 'xby' })).not.toBe(seriesKeyFor('m', { a: 'x', b: 'y' }));
	});
});

describe('cardinality', () => {
	it('refuses new series past the limit and says how many', async () => {
		/*
		 * One well-meaning `user_id` label turns one series into a million, which is
		 * not "a bigger bill" — it is a query planner choosing a different plan and a
		 * dashboard that stops loading for everybody in the tenant.
		 */
		await db.update(tenant).set({ seriesLimit: 3 }).where(eq(tenant.id, TENANT));

		const result = await ingest({
			tenantId: TENANT,
			now: NOW,
			batch: batch({
				samples: Array.from({ length: 10 }, (_, i) => ({
					timestamp: NOW,
					metric: 'rps',
					value: 1,
					labels: { user: `u${i}` }
				}))
			})
		});

		expect(result.rejected.cardinality).toBe(7);
		expect(result.accepted).toBe(3);
		expect(await countOf(sample)).toBe(3);
	});

	it('keeps accepting samples on series it already has', async () => {
		// The limit is on distinct series, not on volume. A tenant at its limit must
		// keep receiving data for the series it already reports.
		await db.update(tenant).set({ seriesLimit: 2 }).where(eq(tenant.id, TENANT));

		const first = batch({
			samples: [
				{ timestamp: NOW, metric: 'rps', value: 1, labels: { route: '/a' } },
				{ timestamp: NOW, metric: 'rps', value: 1, labels: { route: '/b' } }
			]
		});

		await ingest({ tenantId: TENANT, now: NOW, batch: first });
		const again = await ingest({ tenantId: TENANT, now: NOW + 1_000, batch: first });

		expect(again.rejected.cardinality).toBe(0);
		expect(await countOf(sample)).toBe(4);
	});

	it('limits each metric separately, so one runaway cannot starve the rest', async () => {
		await db.update(tenant).set({ seriesLimit: 2 }).where(eq(tenant.id, TENANT));

		await ingest({
			tenantId: TENANT,
			now: NOW,
			batch: batch({
				samples: [
					{ timestamp: NOW, metric: 'runaway', value: 1, labels: { id: '1' } },
					{ timestamp: NOW, metric: 'runaway', value: 1, labels: { id: '2' } }
				]
			})
		});

		const other = await ingest({
			tenantId: TENANT,
			now: NOW,
			batch: batch({ samples: [{ timestamp: NOW, metric: 'healthy', value: 1 }] })
		});

		expect(other.rejected.cardinality).toBe(0);
	});

	it('keeps firstSeen, which is what answers "what appeared in the last hour"', async () => {
		/*
		 * The first question asked when a cardinality alarm goes off, and the answer
		 * is almost always one deploy that added a label. Overwriting `firstSeen` on
		 * conflict destroys it.
		 */
		const one = batch({ samples: [{ timestamp: NOW, metric: 'rps', value: 1 }] });

		await ingest({ tenantId: TENANT, now: NOW, batch: one });
		await ingest({ tenantId: TENANT, now: NOW + 3_600_000, batch: one });

		const [row] = await db
			.select({ firstSeen: series.firstSeen, lastSeen: series.lastSeen })
			.from(series)
			.where(eq(series.tenantId, TENANT));

		expect(row!.firstSeen).toBe(NOW);
		expect(row!.lastSeen).toBe(NOW + 3_600_000);
	});
});

describe('limits refuse loudly', () => {
	it('refuses an oversized batch with a 413', async () => {
		await expect(
			ingest({
				tenantId: TENANT,
				now: NOW,
				batch: batch({ logs: Array.from({ length: 6_000 }, () => LOG) })
			})
		).rejects.toMatchObject({ status: 413 });
	});

	it('refuses past the rate limit with a 429 and a Retry-After', async () => {
		/*
		 * A 429, not a 503 and not a silent drop. Every well-behaved collector backs
		 * off on 429; almost none treat a 503 as anything but a reason to retry
		 * immediately, which makes the pressure worse.
		 */
		await db.update(tenant).set({ ingestRatePerMinute: 100 }).where(eq(tenant.id, TENANT));

		const hundred = batch({ logs: Array.from({ length: 100 }, () => LOG) });
		await ingest({ tenantId: TENANT, now: NOW, batch: hundred });

		const refused = await ingest({ tenantId: TENANT, now: NOW, batch: hundred }).catch((e) => e);
		expect(refused).toBeInstanceOf(IngestError);
		expect(refused).toMatchObject({ status: 429, retryAfter: 10 });
	});

	it('refills the bucket as time passes', async () => {
		// Proportional to elapsed time rather than on a timer: a tenant that sends
		// nothing for an hour should have a full bucket, and a timer that only fires
		// while requests arrive never refills an idle one.
		await db.update(tenant).set({ ingestRatePerMinute: 100 }).where(eq(tenant.id, TENANT));

		const hundred = batch({ logs: Array.from({ length: 100 }, () => LOG) });
		await ingest({ tenantId: TENANT, now: NOW, batch: hundred });

		await expect(
			ingest({ tenantId: TENANT, now: NOW + 60_000, batch: hundred })
		).resolves.toMatchObject({ accepted: 100 });
	});

	it('respects a per-tenant override of zero', async () => {
		// `??` rather than `||`: a deliberate override of zero must survive, or a
		// tenant somebody suspended on purpose is silently un-suspended.
		await db.update(tenant).set({ ingestRatePerMinute: 0 }).where(eq(tenant.id, TENANT));

		await expect(
			ingest({ tenantId: TENANT, now: NOW, batch: batch({ logs: [LOG] }) })
		).rejects.toMatchObject({ status: 429 });
	});
});

describe('retention', () => {
	it('deletes on arrival time, not event time', async () => {
		/*
		 * A sender with a wrong clock would otherwise escape retention forever —
		 * its events claim to be from the future — or be deleted the moment it
		 * arrives, because they claim to be from 1970. Retention is about how long
		 * *we* have held the data.
		 */
		const old = NOW - 40 * 86_400_000;

		// Received long ago, but claiming to be recent.
		await ingest({
			tenantId: TENANT,
			now: old,
			batch: batch({ logs: [{ ...LOG, timestamp: NOW }] })
		});
		// Received now, but claiming to be old.
		await ingest({
			tenantId: TENANT,
			now: NOW,
			batch: batch({ logs: [{ ...LOG, timestamp: NOW - 40 * 86_400_000 }] })
		});

		expect(await countOf(event)).toBe(2);

		await purge(TENANT, 14, NOW);

		// The one received long ago is gone; the one received now survives, however
		// old it claims to be.
		const rows = await db
			.select({ receivedAt: event.receivedAt })
			.from(event)
			.where(eq(event.tenantId, TENANT));
		expect(rows).toEqual([{ receivedAt: NOW }]);
	});

	it('deletes in bounded chunks so a backlog does not hold a write lock', async () => {
		await ingest({
			tenantId: TENANT,
			now: NOW - 40 * 86_400_000,
			batch: batch({ logs: Array.from({ length: 50 }, () => LOG) })
		});

		const first = await purge(TENANT, 14, NOW, 20);
		expect(first.removed).toBe(20);
		expect(await countOf(event)).toBe(30);

		// The caller loops until it is done rather than guessing at a schedule.
		while ((await purge(TENANT, 14, NOW, 20)).removed > 0);
		expect(await countOf(event)).toBe(0);
	});
});

describe('usage', () => {
	it('counts what a tenant is holding, by signal', async () => {
		await ingest({
			tenantId: TENANT,
			now: NOW,
			batch: batch({
				logs: [LOG, LOG],
				samples: [{ timestamp: NOW, metric: 'rps', value: 1 }]
			})
		});

		expect(await usageFor(TENANT, NOW - 3_600_000)).toEqual({ logs: 2, spans: 0, samples: 1 });
	});

	it('does not count another tenant', async () => {
		// The check that would catch a missing `where tenantId` — which is the one
		// bug in a multi-tenant system that must never ship.
		await db.insert(tenant).values({ id: 'other-tenant', name: 'Other', slug: 'other-tenant' });
		await ingest({ tenantId: 'other-tenant', now: NOW, batch: batch({ logs: [LOG] }) });

		expect((await usageFor(TENANT, 0)).logs).toBe(0);

		await db.delete(event).where(eq(event.tenantId, 'other-tenant'));
		await db.delete(tenant).where(eq(tenant.id, 'other-tenant'));
	});
});
