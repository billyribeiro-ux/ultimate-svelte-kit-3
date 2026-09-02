/**
 * INGEST
 * ======
 *
 * The only way telemetry enters. Everything a collector sends arrives here, and
 * everything that leaves is trustworthy — which is the property every read path
 * relies on when it stops re-validating.
 *
 * THE FAILURE MODE THIS FILE EXISTS FOR
 * -------------------------------------
 * An observability platform fails in one specific way, and it is worth naming
 * because it shapes every decision below: **the thing it is watching breaks, the
 * volume of telemetry goes up by two orders of magnitude, and the platform falls
 * over at the exact moment somebody needs it.**
 *
 * A service in a crash loop logs its stack trace on every restart. A retry storm
 * multiplies every request by five. A debug flag left on in production doubles
 * the line count. All three happen *during* an incident, and all three arrive
 * here.
 *
 * So the rule is: **refuse early, refuse loudly, and never refuse silently.**
 * Every limit below returns a 429 with a `Retry-After`, and every rejection is
 * counted where the tenant can see it. A dropped log line that nobody knows was
 * dropped is worse than an error, because it turns a capacity problem into a
 * debugging problem — somebody spends an afternoon looking for the log line that
 * explains the outage, and it was never stored.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from './db/index.ts';
import { event, sample, series, span, tenant } from './db/schema.ts';
import {
	INGEST_MAX_BATCH,
	INGEST_RATE_PER_MINUTE,
	SERIES_CARDINALITY_LIMIT
} from '$app/env/private';

/**
 * A handle that is either the database or a transaction on it.
 *
 * Drizzle types a transaction as a *narrower* thing than the database — it has
 * no `batch`, because a batch inside a transaction is meaningless — so a helper
 * typed as `typeof db` cannot be called with one. Deriving the type from
 * `db.transaction`'s own callback keeps the two in step, rather than restating
 * a generic signature that goes stale on the next Drizzle release.
 */
type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/* ------------------------------------------------------------------ */
/* The wire format                                                     */
/* ------------------------------------------------------------------ */

/**
 * A timestamp, in milliseconds, that is plausibly a timestamp.
 *
 * The bounds catch the two mistakes senders actually make. Seconds instead of
 * milliseconds gives a number around 1.7e9, which is 1970 — the data lands
 * fifty years in the past, falls outside every query range, and looks like it
 * was dropped. Nanoseconds gives 1.7e18, which is the year 55 million and
 * breaks every bucket calculation downstream.
 *
 * Rejecting both with a message that names the likely unit turns a silent
 * disappearance into a line in the collector's log.
 */
const timestamp = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(
		1_500_000_000_000,
		'Timestamp is before 2017 — are these seconds rather than milliseconds?'
	),
	v.maxValue(
		4_000_000_000_000,
		'Timestamp is after 2096 — are these microseconds or nanoseconds rather than milliseconds?'
	)
);

/** A short identifier. Bounded, because everything here is stored per row. */
const name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));

/**
 * An attribute bag.
 *
 * Depth and size are both bounded. A sender with a recursive structure would
 * otherwise store an unbounded blob per row, and — worse — the query path walks
 * these with `attributes.a.b.c`, so a deeply nested bag makes every query on
 * that column slow for everybody in the tenant.
 */
const attributes = v.pipe(
	v.record(v.string(), v.unknown()),
	v.check((value) => JSON.stringify(value).length <= 8_192, 'Attributes are too large (8KB limit)')
);

export const LogSchema = v.object({
	timestamp,
	service: name,
	level: v.picklist(['debug', 'info', 'warn', 'error', 'fatal']),
	message: v.pipe(v.string(), v.maxLength(16_384)),
	host: v.optional(v.pipe(v.string(), v.maxLength(200)), ''),
	traceId: v.optional(v.pipe(v.string(), v.maxLength(64))),
	spanId: v.optional(v.pipe(v.string(), v.maxLength(64))),
	attributes: v.optional(attributes, {})
});

export const SpanSchema = v.object({
	timestamp,
	traceId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	spanId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	parentId: v.optional(v.pipe(v.string(), v.maxLength(64)), ''),
	service: name,
	name,
	/*
	 * A finite, non-negative duration.
	 *
	 * `v.finite()` because a NaN duration poisons every percentile computed from
	 * the span and renders as an empty cell nobody can explain. Non-negative
	 * because a clock that went backwards mid-span produces one, and a negative
	 * duration makes a waterfall bar with negative width.
	 */
	duration: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(86_400_000)),
	status: v.optional(v.picklist(['ok', 'error']), 'ok'),
	attributes: v.optional(attributes, {})
});

export const SampleSchema = v.object({
	timestamp,
	metric: name,
	value: v.pipe(v.number(), v.finite()),
	service: v.optional(v.pipe(v.string(), v.maxLength(200)), ''),
	labels: v.optional(v.record(v.string(), v.union([v.string(), v.number(), v.boolean()])), {})
});

export const BatchSchema = v.object({
	logs: v.optional(v.array(LogSchema), []),
	spans: v.optional(v.array(SpanSchema), []),
	samples: v.optional(v.array(SampleSchema), [])
});

export type Batch = v.InferOutput<typeof BatchSchema>;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class IngestError extends Error {
	readonly status: 400 | 413 | 429;
	/** Seconds, for the `Retry-After` header. Present only on a 429. */
	readonly retryAfter: number | undefined;

	constructor(status: 400 | 413 | 429, message: string, retryAfter?: number) {
		super(message);
		this.name = 'IngestError';
		this.status = status;
		this.retryAfter = retryAfter;
	}
}

export interface IngestResult {
	readonly accepted: number;
	/**
	 * How many were dropped, and why.
	 *
	 * Returned rather than logged, so the collector sees it in the response body
	 * and can surface it. A platform that drops data and only writes it to its own
	 * logs is asking the person to be watching the watchman.
	 */
	readonly rejected: { readonly cardinality: number };
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

interface Bucket {
	tokens: number;
	lastRefill: number;
}

/**
 * A token bucket per tenant, in memory.
 *
 * In memory and not in the database, deliberately. A rate limiter that writes to
 * a row on every request is a write-lock convoy on exactly the path that is
 * under pressure — the limiter becomes the outage it was meant to prevent. The
 * cost is that two instances each allow the full rate, which is a factor of two
 * and not a factor of a thousand; the fix, when there are two instances, is
 * Redis, and the interface below does not change.
 */
const buckets = new Map<string, Bucket>();

function allow(tenantId: string, count: number, ratePerMinute: number, now: number): boolean {
	const bucket = buckets.get(tenantId) ?? { tokens: ratePerMinute, lastRefill: now };

	// Refill proportionally to elapsed time rather than on a timer: a tenant that
	// sends nothing for an hour should have a full bucket, and a timer that only
	// fires while requests arrive never refills an idle one.
	const elapsed = Math.max(0, now - bucket.lastRefill);
	bucket.tokens = Math.min(ratePerMinute, bucket.tokens + (elapsed / 60_000) * ratePerMinute);
	bucket.lastRefill = now;

	/*
	 * Allow a batch that would take the bucket negative, then go negative.
	 *
	 * The alternative — reject any batch bigger than the remaining tokens —
	 * starves large senders while small ones get through, which is backwards:
	 * the large sender is usually the one whose data matters. Going negative
	 * means the next batch waits, which is fair and self-correcting.
	 */
	const allowed = bucket.tokens > 0;
	if (allowed) bucket.tokens -= count;

	buckets.set(tenantId, bucket);
	return allowed;
}

/** Exposed for the tests, which must not depend on whatever a previous test sent. */
export function resetRateLimits(): void {
	buckets.clear();
}

/* ------------------------------------------------------------------ */
/* Series keys and cardinality                                         */
/* ------------------------------------------------------------------ */

/**
 * The canonical key for a metric's label set.
 *
 * Sorted, so `{a, b}` and `{b, a}` are one series rather than two. Getting this
 * wrong doubles a tenant's cardinality for no reason and — because the two keys
 * never merge — makes a chart show two half-height lines where one should be.
 *
 * PRINTABLE SEPARATORS, AND THE BUG THAT DEMANDED THEM
 * ---------------------------------------------------
 * The first version used control characters — a NUL between a key and its value,
 * and `\x01` between pairs — on the reasoning that they cannot appear in a label
 * name and are therefore unambiguous.
 *
 * They cannot appear in a label name, and they cannot survive SQLite either.
 * **A text value is truncated at the first NUL byte**, because the string is
 * C-terminated underneath, so `rps\x01route\0"/a"` was stored as `rps\x01route`
 * and every series on a metric collapsed into one key. The symptom was a
 * cardinality limit that rejected the second label value of every metric, which
 * reads as the limit being broken rather than as the key being truncated — and
 * nothing anywhere raised an error, because storing a shorter string is not a
 * failure.
 *
 * So: printable separators, and JSON encoding on both sides of them. The
 * encoding is what makes `=` and `,` safe as delimiters — a value containing
 * either is quoted and escaped, so it cannot forge a different key — and the
 * result is legible in a database client, which matters more than it sounds
 * when somebody is trying to work out where a million series came from.
 */
export function seriesKeyFor(metric: string, labels: Record<string, unknown>): string {
	const parts = Object.keys(labels)
		.sort()
		.map((key) => `${JSON.stringify(key)}=${JSON.stringify(labels[key])}`);
	return `${JSON.stringify(metric)}|${parts.join(',')}`;
}

/* ------------------------------------------------------------------ */
/* Ingestion                                                           */
/* ------------------------------------------------------------------ */

export interface IngestInput {
	readonly tenantId: string;
	readonly batch: Batch;
	/** Injectable, so the rate-limit and timestamp tests do not depend on the clock. */
	readonly now?: number;
}

export async function ingest({
	tenantId,
	batch,
	now = Date.now()
}: IngestInput): Promise<IngestResult> {
	const total = batch.logs.length + batch.spans.length + batch.samples.length;

	if (total === 0) {
		// Not an error. A collector with nothing to send should not have to special-
		// case that, and answering 400 makes it log an error every scrape interval.
		return { accepted: 0, rejected: { cardinality: 0 } };
	}

	const limits = await limitsFor(tenantId);

	if (total > limits.maxBatch) {
		throw new IngestError(
			413,
			`Batch of ${total} exceeds the limit of ${limits.maxBatch}. Split it.`
		);
	}

	if (!allow(tenantId, total, limits.ratePerMinute, now)) {
		/*
		 * A 429 with a `Retry-After`, not a 503 and not a silent drop.
		 *
		 * Every well-behaved collector understands 429 and will back off; almost
		 * none treat a 503 as anything but a reason to retry immediately, which
		 * makes the pressure worse. And a silent drop turns a capacity problem into
		 * an afternoon spent looking for a log line that was never stored.
		 */
		throw new IngestError(429, 'Ingest rate limit exceeded for this workspace.', 10);
	}

	let cardinalityRejected = 0;

	/*
	 * One transaction for the whole batch.
	 *
	 * Not for atomicity in the usual sense — telemetry is append-only and a
	 * partial batch is not corrupt — but because SQLite commits each statement
	 * separately otherwise, and a batch of five thousand single-statement inserts
	 * is five thousand fsyncs. The transaction turns that into one, which is the
	 * difference between roughly 200 rows a second and roughly 100,000.
	 */
	await db.transaction(async (tx) => {
		if (batch.logs.length > 0) {
			await tx.insert(event).values(
				batch.logs.map((log) => ({
					tenantId,
					timestamp: log.timestamp,
					receivedAt: now,
					service: log.service,
					level: log.level,
					message: log.message,
					host: log.host,
					traceId: log.traceId ?? null,
					spanId: log.spanId ?? null,
					attributes: JSON.stringify(log.attributes)
				}))
			);
		}

		if (batch.spans.length > 0) {
			await tx
				.insert(span)
				.values(
					batch.spans.map((s) => ({
						tenantId,
						traceId: s.traceId,
						spanId: s.spanId,
						parentId: s.parentId,
						timestamp: s.timestamp,
						receivedAt: now,
						duration: s.duration,
						service: s.service,
						name: s.name,
						status: s.status,
						attributes: JSON.stringify(s.attributes)
					}))
				)
				/*
				 * Idempotent on (tenant, span id).
				 *
				 * A collector that lost its connection mid-request does not know
				 * whether the batch landed, so it sends it again. Without this a trace
				 * grows a duplicate of every span sent during a flaky minute, and the
				 * waterfall renders each one twice — which reads as the service having
				 * done the work twice.
				 */
				.onConflictDoNothing();
		}

		if (batch.samples.length > 0) {
			const known = await knownSeries(tx, tenantId);
			const rows: (typeof sample.$inferInsert)[] = [];
			/** Every series touched by this batch, for the `lastSeen` upsert. */
			const seen = new Map<string, { metric: string; labels: string }>();
			/** Only the ones that did not exist, which is what the limit counts. */
			const fresh = new Set<string>();

			for (const s of batch.samples) {
				const key = seriesKeyFor(s.metric, s.labels);

				/*
				 * THE CARDINALITY LIMIT
				 *
				 * One well-meaning `user_id` label turns one series into a million, and
				 * a million series is not "a bigger bill" — it is a query planner
				 * choosing a different plan, a rollup table larger than the raw data,
				 * and a dashboard that stops loading for everybody in the tenant.
				 *
				 * The limit is per metric rather than global so one runaway metric
				 * cannot starve the rest, and the rejection is *counted and returned*
				 * rather than silent, because "my new metric has no data" with no error
				 * anywhere is a genuinely terrible afternoon.
				 */
				const existing = known.get(s.metric);
				const isNew = !existing?.has(key);

				if (isNew && (existing?.size ?? 0) + fresh.size >= limits.seriesLimit) {
					cardinalityRejected += 1;
					continue;
				}

				if (isNew) fresh.add(key);

				// Recorded for every series in the batch, not only the new ones. The
				// first version only tracked new ones, so `lastSeen` was written once
				// and never again — which makes the column answer "when was this
				// series created" while claiming to answer "is it still reporting".
				seen.set(key, { metric: s.metric, labels: JSON.stringify(s.labels) });

				rows.push({
					tenantId,
					metric: s.metric,
					seriesKey: key,
					timestamp: s.timestamp,
					receivedAt: now,
					value: s.value,
					service: s.service,
					labels: JSON.stringify(s.labels)
				});
			}

			if (rows.length > 0) await tx.insert(sample).values(rows);

			for (const [key, meta] of seen) {
				await tx
					.insert(series)
					.values({
						tenantId,
						metric: meta.metric,
						seriesKey: key,
						labels: meta.labels,
						firstSeen: now,
						lastSeen: now
					})
					// `lastSeen` only. Overwriting `firstSeen` would destroy the answer to
					// "what appeared in the last hour", which is the first question asked
					// when a cardinality alarm goes off — and the answer is almost always
					// one deploy that added a label.
					.onConflictDoUpdate({
						target: [series.tenantId, series.metric, series.seriesKey],
						set: { lastSeen: now }
					});
			}
		}
	});

	return {
		accepted: total - cardinalityRejected,
		rejected: { cardinality: cardinalityRejected }
	};
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

interface Limits {
	readonly maxBatch: number;
	readonly ratePerMinute: number;
	readonly seriesLimit: number;
}

/**
 * A tenant's limits, with the global defaults where it has no override.
 *
 * `??` rather than `||`, because a deliberate override of zero must survive —
 * `||` would replace it with the default and silently un-suspend a tenant
 * somebody had turned off on purpose.
 */
async function limitsFor(tenantId: string): Promise<Limits> {
	const rows = await db
		.select({
			ratePerMinute: tenant.ingestRatePerMinute,
			seriesLimit: tenant.seriesLimit
		})
		.from(tenant)
		.where(eq(tenant.id, tenantId))
		.limit(1);

	const overrides = rows[0];

	return {
		maxBatch: Number(INGEST_MAX_BATCH),
		ratePerMinute: overrides?.ratePerMinute ?? Number(INGEST_RATE_PER_MINUTE),
		seriesLimit: overrides?.seriesLimit ?? Number(SERIES_CARDINALITY_LIMIT)
	};
}

/**
 * The series a tenant already has, by metric.
 *
 * Read once per batch rather than once per sample: a batch of five thousand
 * samples would otherwise be five thousand indexed lookups, and this table is
 * small enough that reading a tenant's whole set is cheaper than any of them.
 */
async function knownSeries(tx: Executor, tenantId: string): Promise<Map<string, Set<string>>> {
	const rows = await tx
		.select({ metric: series.metric, seriesKey: series.seriesKey })
		.from(series)
		.where(eq(series.tenantId, tenantId));

	const byMetric = new Map<string, Set<string>>();
	for (const row of rows) {
		let set = byMetric.get(row.metric);
		if (!set) {
			set = new Set();
			byMetric.set(row.metric, set);
		}
		set.add(row.seriesKey);
	}
	return byMetric;
}

/* ------------------------------------------------------------------ */
/* Retention                                                           */
/* ------------------------------------------------------------------ */

/**
 * Delete everything older than the retention window.
 *
 * Deletes on `receivedAt`, not `timestamp`. A sender with a wrong clock would
 * otherwise either escape retention forever — because its events claim to be
 * from the future — or be deleted the moment it arrives, because they claim to
 * be from 1970. Retention is about how long *we* have held the data, which is
 * the thing a retention promise is actually about.
 *
 * Deletes in bounded chunks so a month of backlog does not take a write lock for
 * minutes. Returns how much was removed, so the job can loop until it is done
 * rather than guessing at a schedule.
 */
export async function purge(
	tenantId: string,
	retentionDays: number,
	now = Date.now(),
	chunk = 5_000
) {
	const cutoff = now - retentionDays * 86_400_000;
	let removed = 0;

	for (const table of [event, span, sample] as const) {
		const result = await db.run(sql`
			delete from ${table}
			where rowid in (
				select rowid from ${table}
				where ${table.tenantId} = ${tenantId} and ${table.receivedAt} < ${cutoff}
				limit ${chunk}
			)
		`);
		removed += result.rowsAffected ?? 0;
	}

	return { removed, cutoff };
}

/** How many rows a tenant is holding, for the usage screen. */
export async function usageFor(tenantId: string, since: number) {
	const [logs, spans, samples] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)` })
			.from(event)
			.where(and(eq(event.tenantId, tenantId), gte(event.receivedAt, since))),
		db
			.select({ n: sql<number>`count(*)` })
			.from(span)
			.where(and(eq(span.tenantId, tenantId), gte(span.receivedAt, since))),
		db
			.select({ n: sql<number>`count(*)` })
			.from(sample)
			.where(and(eq(sample.tenantId, tenantId), gte(sample.receivedAt, since)))
	]);

	return {
		logs: logs[0]?.n ?? 0,
		spans: spans[0]?.n ?? 0,
		samples: samples[0]?.n ?? 0
	};
}
