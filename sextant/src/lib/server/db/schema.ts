/**
 * THE DATABASE
 * ============
 *
 * Four kinds of table, and the difference between them is the whole design:
 *
 *   raw        `event` and `span`. Append-only, never updated, deleted in bulk
 *              by the retention job. The source of truth.
 *   derived    `rollup`. Pre-aggregated buckets holding serialised sketches.
 *              A cache: truncate it and the numbers still come out, slower.
 *   config     tenants, members, keys, saved views, alert rules. Ordinary CRUD.
 *   state      `alert_status`, `outbox`. Small, mutable, and the only tables
 *              where a race would matter.
 *
 * That split is worth stating because it decides what needs a transaction, what
 * needs an index, and what can be thrown away under pressure. Ingest writes only
 * to `raw` and never reads; the rollup job writes only to `derived`; a query
 * reads `derived` when it can and `raw` when it must.
 *
 * WHY SQLITE FOR A TELEMETRY STORE
 * --------------------------------
 * Because this is a *teaching* system that must be honest about its limits
 * rather than pretend to be Clickhouse. libSQL gives real indexes, real
 * transactions and a real query planner, and it is genuinely the right choice up
 * to a few hundred million rows on one box — which is more telemetry than most
 * teams have. Past that, the shape here transfers: the raw tables become a
 * columnar store, the rollups become materialised views, and everything above
 * `storage.ts` is unchanged. What does *not* transfer is a design that assumed a
 * document database and stored one JSON blob per event, which is why this looks
 * like a schema rather than a bucket.
 */

import { relations, sql } from 'drizzle-orm';
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema.ts';

/*
 * The extension is required.
 *
 * Vite resolves an extensionless import; the plain Node loader that runs
 * `scripts/seed.ts` does not, and the failure is `ERR_MODULE_NOT_FOUND` pointing
 * at a path with no suffix.
 */
export * from './auth.schema.ts';

/** `(cast(unixepoch('subsecond') * 1000 as integer))`, matching Better Auth's own columns. */
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const createdAt = integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull();

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const tenant = sqliteTable('tenant', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),

	/**
	 * Per-tenant overrides for the global limits in `src/env.ts`.
	 *
	 * Null means "use the global default", which is different from zero and has to
	 * be: a tenant row created before a limit existed must not silently get a
	 * limit of nothing. This is the reason these are nullable integers rather than
	 * columns with defaults.
	 */
	ingestRatePerMinute: integer('ingest_rate_per_minute'),
	retentionDays: integer('retention_days'),
	seriesLimit: integer('series_limit'),

	createdAt
});

export const membership = sqliteTable(
	'membership',
	{
		id: text('id').primaryKey(),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').$type<Role>().notNull(),
		createdAt
	},
	(table) => [
		// One membership per person per tenant. Without this, an invitation accepted
		// twice gives somebody two roles and the permission check answers whichever
		// the query happened to return first.
		uniqueIndex('membership_tenant_user_uidx').on(table.tenantId, table.userId),
		index('membership_user_idx').on(table.userId)
	]
);

/**
 * An API key, for the machines that send telemetry.
 *
 * The key itself is never stored. `hash` is a SHA-256 of the secret, and `prefix`
 * is the first eight characters kept in clear so a person can tell two keys apart
 * in a list — which is the whole reason keys elsewhere are shown as
 * `sxt_a1b2c3d4…`. Storing the key would mean a database dump is a set of live
 * credentials.
 */
export const apiKey = sqliteTable(
	'api_key',
	{
		id: text('id').primaryKey(),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		prefix: text('prefix').notNull(),
		hash: text('hash').notNull(),

		/**
		 * What this key may do, comma-separated.
		 *
		 * `ingest` and `read` are separate because they belong to different
		 * machines: a collector needs to write and must never be able to read
		 * another team's logs, and a dashboard integration is the reverse. A single
		 * "api key" scope is how a compromised collector becomes a data breach.
		 */
		scopes: text('scopes').notNull().default('ingest'),

		lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
		createdAt
	},
	(table) => [
		// The lookup on every ingest request. Unique because two keys hashing the
		// same would be a collision worth failing on rather than resolving.
		uniqueIndex('api_key_hash_uidx').on(table.hash),
		index('api_key_tenant_idx').on(table.tenantId)
	]
);

/* ------------------------------------------------------------------ */
/* Raw telemetry                                                       */
/* ------------------------------------------------------------------ */

/**
 * Log lines.
 *
 * `timestamp` is the *sender's* clock and `receivedAt` is ours. Both are kept,
 * and the distinction matters more than it looks: a query filters on `timestamp`
 * because that is when the thing happened, while retention deletes on
 * `receivedAt` because that is when we became responsible for it. Using one
 * column for both means a sender with a wrong clock either escapes retention
 * forever or is deleted the moment it arrives.
 */
export const event = sqliteTable(
	'event',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),

		timestamp: integer('timestamp').notNull(),
		receivedAt: integer('received_at').notNull(),

		service: text('service').notNull(),
		level: text('level').notNull(),
		message: text('message').notNull(),
		host: text('host').notNull().default(''),

		/** Set when the line was emitted inside a traced request. Joins logs to traces. */
		traceId: text('trace_id'),
		spanId: text('span_id'),

		/** Everything else the sender attached, as JSON. Queried through `attributes.x.y`. */
		attributes: text('attributes').notNull().default('{}')
	},
	(table) => [
		/*
		 * THE INDEX EVERY QUERY USES
		 *
		 * `(tenant, timestamp)` and nothing before it. Every query is scoped to one
		 * tenant and one time range, so this is the access path for all of them, and
		 * putting `service` first — which looks reasonable, since most queries also
		 * filter on it — would make a query without a service filter scan the table.
		 *
		 * Descending on timestamp because every default view is "most recent first",
		 * and SQLite can walk an index backwards but pays for it.
		 */
		index('event_tenant_time_idx').on(table.tenantId, table.timestamp),

		// The two filters common enough to earn their own index. Both include the
		// tenant first for the same reason.
		index('event_tenant_service_time_idx').on(table.tenantId, table.service, table.timestamp),
		index('event_tenant_trace_idx').on(table.tenantId, table.traceId),

		// Retention deletes by arrival, not by event time. See the note above.
		index('event_received_idx').on(table.receivedAt)
	]
);

/** Spans. The same shape, plus the tree. */
export const span = sqliteTable(
	'span',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),

		traceId: text('trace_id').notNull(),
		spanId: text('span_id').notNull(),
		/** Empty rather than null for a root, so the unique index below can include it. */
		parentId: text('parent_id').notNull().default(''),

		timestamp: integer('timestamp').notNull(),
		receivedAt: integer('received_at').notNull(),
		/** Milliseconds, as a real: sub-millisecond spans are common and rounding them to zero loses them. */
		duration: real('duration').notNull(),

		service: text('service').notNull(),
		name: text('name').notNull(),
		status: text('status').notNull().default('ok'),
		attributes: text('attributes').notNull().default('{}')
	},
	(table) => [
		/*
		 * Idempotent ingest.
		 *
		 * A collector that loses its connection mid-request does not know whether
		 * the batch landed, so it sends it again. With this index that costs one
		 * conflict per span and changes nothing; without it a trace grows a
		 * duplicate of every span sent during a flaky minute, and the waterfall
		 * renders each one twice.
		 */
		uniqueIndex('span_tenant_span_uidx').on(table.tenantId, table.spanId),

		// Loading one trace: the single most common span query, and the one a trace
		// view blocks on.
		index('span_tenant_trace_idx').on(table.tenantId, table.traceId),
		index('span_tenant_time_idx').on(table.tenantId, table.timestamp),
		index('span_tenant_service_time_idx').on(table.tenantId, table.service, table.timestamp),
		index('span_received_idx').on(table.receivedAt)
	]
);

/**
 * Metric samples.
 *
 * `labels` is JSON like the other bags, and `seriesKey` is its canonical hash —
 * the same labels in a different order produce the same key. That column is what
 * makes cardinality countable: "how many distinct series does this metric have"
 * is a `count(distinct series_key)` rather than a scan that parses JSON.
 */
export const sample = sqliteTable(
	'sample',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),

		metric: text('metric').notNull(),
		seriesKey: text('series_key').notNull(),

		timestamp: integer('timestamp').notNull(),
		receivedAt: integer('received_at').notNull(),
		value: real('value').notNull(),

		service: text('service').notNull().default(''),
		labels: text('labels').notNull().default('{}')
	},
	(table) => [
		index('sample_tenant_metric_time_idx').on(table.tenantId, table.metric, table.timestamp),
		index('sample_tenant_series_time_idx').on(table.tenantId, table.seriesKey, table.timestamp),
		index('sample_received_idx').on(table.receivedAt)
	]
);

/**
 * Which series a tenant has seen, and when.
 *
 * Exists solely to enforce the cardinality limit without a `count(distinct)` on
 * the hot path. Ingest checks this table, which is small, rather than the sample
 * table, which is not.
 *
 * `firstSeen` makes "what appeared in the last hour" answerable, which is the
 * question somebody asks the moment a cardinality alarm goes off — and the
 * answer is almost always one deploy that added a label.
 */
export const series = sqliteTable(
	'series',
	{
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		metric: text('metric').notNull(),
		seriesKey: text('series_key').notNull(),
		labels: text('labels').notNull().default('{}'),
		firstSeen: integer('first_seen').notNull(),
		lastSeen: integer('last_seen').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.tenantId, table.metric, table.seriesKey] }),
		index('series_tenant_metric_idx').on(table.tenantId, table.metric)
	]
);

/* ------------------------------------------------------------------ */
/* Rollups — the derived table                                         */
/* ------------------------------------------------------------------ */

/**
 * Pre-aggregated buckets.
 *
 * One row per (tenant, metric, series, resolution, bucket), holding the counts
 * that add and the sketches that merge. A query over six hours at a one-minute
 * step reads 360 rows instead of however many samples that was.
 *
 * `sketch` is a serialised DDSketch and `hll` a serialised HyperLogLog. They are
 * stored as text rather than blobs because SQLite's JSON functions can then read
 * them for debugging, and because a text column diffs in a migration.
 *
 * **This table is a cache.** Truncating it is safe: `storage.ts` falls back to
 * the raw tables when a bucket is missing, and the rollup job refills it. That
 * property is worth protecting — the moment a rollup holds something the raw
 * data cannot reproduce, it stops being a cache and becomes a second source of
 * truth that can disagree with the first.
 */
export const rollup = sqliteTable(
	'rollup',
	{
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		metric: text('metric').notNull(),
		seriesKey: text('series_key').notNull(),
		/** Bucket width in milliseconds: one of `ROLLUPS` in `series/bucket.ts`. */
		resolution: integer('resolution').notNull(),
		/** Bucket start, always a multiple of `resolution`. */
		bucket: integer('bucket').notNull(),

		count: integer('count').notNull().default(0),
		sum: real('sum').notNull().default(0),
		min: real('min'),
		max: real('max'),
		sketch: text('sketch'),
		hll: text('hll')
	},
	(table) => [
		primaryKey({
			columns: [table.tenantId, table.metric, table.seriesKey, table.resolution, table.bucket]
		}),
		// The range scan a chart does. Resolution before bucket, because a query
		// picks one resolution and then walks a contiguous range of buckets.
		index('rollup_range_idx').on(table.tenantId, table.metric, table.resolution, table.bucket)
	]
);

/* ------------------------------------------------------------------ */
/* Saved work                                                          */
/* ------------------------------------------------------------------ */

export const view = sqliteTable(
	'view',
	{
		id: text('id').primaryKey(),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		query: text('query').notNull(),
		/** The time range as it was written — `-6h`, not two timestamps. See `range.ts`. */
		range: text('range').notNull().default('-1h'),
		authorId: text('author_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt
	},
	(table) => [index('view_tenant_idx').on(table.tenantId, table.name)]
);

export const alertRule = sqliteTable(
	'alert_rule',
	{
		id: text('id').primaryKey(),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),

		/** The SQF whose first row's first numeric column is the value under test. */
		query: text('query').notNull(),
		/** How far back each evaluation looks. */
		windowMs: integer('window_ms').notNull().default(300_000),
		/** How often it runs. Separate from the window, so a 5m window can be checked every 1m. */
		intervalMs: integer('interval_ms').notNull().default(60_000),

		threshold: real('threshold').notNull(),
		clearsAt: real('clears_at'),
		forMs: integer('for_ms').notNull().default(0),
		direction: text('direction').$type<'above' | 'below'>().notNull().default('above'),

		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt
	},
	(table) => [index('alert_rule_tenant_idx').on(table.tenantId, table.enabled)]
);

/**
 * One row per rule, holding the state machine's state between evaluations.
 *
 * Separate from `alert_rule` so that editing a rule's name does not touch the
 * row the evaluator writes on every tick — two writers on one row is a lock
 * contention problem waiting for the tenant that has three hundred rules.
 */
export const alertStatus = sqliteTable('alert_status', {
	ruleId: text('rule_id')
		.primaryKey()
		.references(() => alertRule.id, { onDelete: 'cascade' }),
	state: text('state').$type<'ok' | 'pending' | 'firing'>().notNull().default('ok'),
	since: integer('since'),
	firingSince: integer('firing_since'),
	value: real('value'),
	evaluatedAt: integer('evaluated_at').notNull().default(0)
});

/**
 * The transactional outbox.
 *
 * A notification row is written in the *same transaction* as the alert status
 * that produced it, and a separate worker sends it. That is the only way to make
 * "the alert fired" and "somebody was told" agree across a crash: writing the
 * status and then sending loses the notification if the process dies in between,
 * and sending then writing double-notifies on a retry.
 */
export const outbox = sqliteTable(
	'outbox',
	{
		id: text('id').primaryKey(),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		payload: text('payload').notNull(),

		attempts: integer('attempts').notNull().default(0),
		/** When to try next. Backoff is a timestamp rather than a sleep, so a restart resumes. */
		nextAttemptAt: integer('next_attempt_at').notNull().default(0),
		deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
		lastError: text('last_error'),
		createdAt
	},
	(table) => [
		// The worker's only query: undelivered, due, oldest first.
		index('outbox_pending_idx').on(table.deliveredAt, table.nextAttemptAt)
	]
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const tenantRelations = relations(tenant, ({ many }) => ({
	memberships: many(membership),
	keys: many(apiKey),
	views: many(view),
	rules: many(alertRule)
}));

export const membershipRelations = relations(membership, ({ one }) => ({
	tenant: one(tenant, { fields: [membership.tenantId], references: [tenant.id] }),
	user: one(user, { fields: [membership.userId], references: [user.id] })
}));

export const alertRuleRelations = relations(alertRule, ({ one }) => ({
	tenant: one(tenant, { fields: [alertRule.tenantId], references: [tenant.id] }),
	status: one(alertStatus, { fields: [alertRule.id], references: [alertStatus.ruleId] })
}));
