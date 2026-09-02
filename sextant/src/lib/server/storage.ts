/**
 * PUSHDOWN
 * ========
 *
 * Turning a checked SQF query into SQL that the database can answer, and letting
 * the reference evaluator finish whatever could not be pushed.
 *
 * WHY BOTH, AND NOT ONE OR THE OTHER
 * ----------------------------------
 * Evaluating everything in JavaScript means loading a day of logs into memory to
 * count them. Compiling everything to SQL means reimplementing three-valued
 * logic, attribute paths, percentile sketches and every scalar function in a
 * dialect where a mistake is silent — and then having no way to tell whether the
 * two agree, because there is only one of them.
 *
 * So: push down the parts that are both *cheap to translate* and *expensive to
 * skip* — the time range, simple column predicates, sort, limit — and hand the
 * rest to `eval.ts`, which is already correct. The two are compared directly in
 * `storage.spec.ts`: the same query, over the same rows, once through SQL and
 * once through the evaluator, asserting the same answer.
 *
 * THE RULE FOR WHAT PUSHES DOWN
 * -----------------------------
 * **A predicate is pushed down only if SQL's answer is identical to the
 * evaluator's, including for nulls.** That is a much stronger bar than "SQLite
 * has a similar operator", and it rules out things that look obviously safe:
 *
 *   - `attributes.x == 1` is not pushed. SQLite's `json_extract` returns the
 *     JSON null for a missing key, and comparing it produces NULL — which
 *     matches — but a *numeric string* attribute compares as text in SQL and
 *     numerically in the evaluator, which does not.
 *   - `contains` is not pushed. `LIKE` is case-insensitive only for ASCII in
 *     SQLite, and the evaluator lowercases with full Unicode rules.
 *   - Anything involving a function is not pushed, because `strlen` counts code
 *     points and `length()` counts UTF-16 units.
 *
 * Each of those could be pushed with enough care. None of them is worth being
 * subtly wrong about, and the cost of not pushing them is a few thousand extra
 * rows through a filter that runs in microseconds.
 */

import { type Column, type SQL, and, asc, desc, eq, gt, gte, lt, lte, ne, sql } from 'drizzle-orm';
import type { Query, Expr } from '#lib/sqf/ast.ts';
import { evaluate, type EvalResult } from '#lib/sqf/eval.ts';
import type { Row } from '#lib/sqf/value.ts';
import { db } from './db/index.ts';
import { event, sample, span } from './db/schema.ts';

/** The physical table for each SQF source. */
const TABLES = { logs: event, spans: span, metrics: sample } as const;

/**
 * The columns a predicate may be pushed down to, per source.
 *
 * An explicit allowlist rather than "whatever property the table object has".
 * Reading the property off the Drizzle table would work and would quietly make
 * every internal of that object a candidate — and, more importantly, it would
 * hide the *decision*. This list is the pushdown surface, and it is short enough
 * to check by eye: every entry has to satisfy the rule at the top of the file,
 * which is that SQL's answer is identical to the evaluator's including for
 * nulls.
 *
 * Note what is absent. `message` is not here, because the only useful predicates
 * on it are `contains` and `=~`, and neither pushes. `attributes` is not here
 * for the same reason its paths are not: `json_extract` compares as text.
 */
const PUSHABLE: { [S in keyof typeof TABLES]: Readonly<Record<string, Column>> } = {
	logs: {
		timestamp: event.timestamp,
		service: event.service,
		level: event.level,
		host: event.host,
		trace_id: event.traceId,
		span_id: event.spanId
	},
	spans: {
		timestamp: span.timestamp,
		trace_id: span.traceId,
		span_id: span.spanId,
		parent_id: span.parentId,
		service: span.service,
		name: span.name,
		status: span.status,
		duration: span.duration
	},
	metrics: {
		timestamp: sample.timestamp,
		metric: sample.metric,
		service: sample.service,
		value: sample.value
	}
};

export interface ReadOptions {
	readonly tenantId: string;
	readonly from: number;
	readonly to: number;
	/**
	 * The ceiling on rows read from the database.
	 *
	 * Separate from a query's own `take`, and always applied: a query with no
	 * `take` over a wide range would otherwise stream a day of logs into memory.
	 * The evaluator is told when this bit, so the interface can say "showing the
	 * first N" rather than implying it is all of them.
	 */
	readonly maxRows?: number;
	/** Cancels the read when the range moves under it. See `getAbortSignal` in the routes. */
	readonly signal?: AbortSignal;
}

const DEFAULT_MAX_ROWS = 20_000;

export interface ReadResult extends EvalResult {
	/** How many rows the database returned, before the evaluator filtered them. */
	readonly scanned: number;
	/** Which parts of the query the database answered. Shown in the query inspector. */
	readonly pushed: readonly string[];
}

export async function run(query: Query, options: ReadOptions): Promise<ReadResult> {
	const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
	const table = TABLES[query.source];

	const conditions: SQL[] = [
		eq(table.tenantId, options.tenantId),
		/*
		 * The time range, always, as the first condition.
		 *
		 * This is the one predicate that must never be forgotten: without it a
		 * query scans a tenant's entire history, and the composite index
		 * `(tenant, timestamp)` is useless because its second column is unbounded.
		 * It is applied here rather than being expected in the query text, so that
		 * a person cannot write a query that scans everything by leaving out a
		 * clause they did not know about.
		 */
		gte(table.timestamp, options.from),
		lt(table.timestamp, options.to)
	];

	const pushed: string[] = ['time range'];

	/*
	 * Only the leading `where` stages, and only until one cannot be pushed.
	 *
	 * Stopping at the first failure rather than skipping it is deliberate. A
	 * `summarize` in the middle changes what the columns *mean*, so a predicate
	 * after it refers to computed columns that do not exist in the table — pushing
	 * a later `where` because an earlier one was pushable would silently apply it
	 * to the wrong thing.
	 */
	for (const stage of query.stages) {
		if (stage.kind !== 'where') break;

		const compiled = compile(stage.predicate, query.source);
		if (!compiled) break;

		conditions.push(compiled);
		pushed.push('filter');
	}

	/*
	 * Sort and limit push down only when nothing before them needed the evaluator.
	 *
	 * If the evaluator still has filtering to do, the database's idea of "the
	 * first 100" is the first 100 of a *larger* set, and taking them here would
	 * return the wrong hundred. That is the classic pushdown bug: a `LIMIT` moved
	 * above a filter, producing a page of results that is stable, plausible and
	 * missing rows.
	 */
	const fullyPushed = pushed.length - 1 === countLeadingWheres(query);
	const ordering = fullyPushed ? orderingFor(query) : null;
	const limit = fullyPushed ? limitFor(query) : null;

	if (ordering) pushed.push('sort');
	if (limit !== null) pushed.push('limit');

	let statement = db
		.select()
		.from(table)
		.where(and(...conditions))
		.$dynamic();

	if (ordering) statement = statement.orderBy(...ordering);

	/*
	 * Read one more row than the ceiling.
	 *
	 * Without the `+ 1`, a query that fills the ceiling exactly is
	 * indistinguishable from one that stopped there — SQL returns `maxRows` rows
	 * and the evaluator, which detects truncation by being handed more rows than
	 * it will keep, sees none. The result silently claimed to be complete, which
	 * is the one thing a truncated result must never do.
	 *
	 * The extra row is discarded by the evaluator. It exists only to be counted.
	 */
	const ceiling = limit !== null ? Math.min(limit, maxRows) : maxRows + 1;
	statement = statement.limit(ceiling);

	options.signal?.throwIfAborted();
	const rows = await statement;

	const evaluated = evaluate(query, rows.map(toRow), { maxRows });

	return { ...evaluated, scanned: rows.length, pushed };
}

/* ------------------------------------------------------------------ */
/* Compiling predicates                                                */
/* ------------------------------------------------------------------ */

/**
 * A predicate as SQL, or `null` when it cannot be translated exactly.
 *
 * `null` is not a failure. It means "the evaluator will do this one", which is
 * always correct and sometimes slower. Returning something approximate instead
 * would be faster and wrong, and wrong in the way that is hardest to notice: a
 * filter that returns *nearly* the right rows.
 */
function compile(expr: Expr, source: keyof typeof TABLES): SQL | null {
	if (expr.kind !== 'binary') return null;

	if (expr.op === 'and') {
		const left = compile(expr.left, source);
		const right = compile(expr.right, source);
		// Both halves or neither. Pushing one half of an `and` is safe — it only
		// over-selects, and the evaluator applies the whole predicate again — but
		// pushing one half of an `or` is not, and keeping the rule uniform is worth
		// more than the occasional half-optimisation.
		return left && right ? and(left, right)! : null;
	}

	const column = physicalColumn(expr.left, source);
	if (!column) return null;

	// Literal right-hand sides only. A column-to-column comparison is rare in
	// practice and its null semantics need thought that has not been given.
	if (expr.right.kind !== 'literal' && expr.right.kind !== 'duration') return null;
	const value = expr.right.kind === 'duration' ? expr.right.ms : expr.right.value;
	if (value === null) return null;

	switch (expr.op) {
		case '==':
			return eq(column, value);
		case '!=':
			/*
			 * `<>` in SQL excludes NULLs, and so does the evaluator's three-valued
			 * `!=`: a row where the column is absent is neither equal nor unequal.
			 * The two agree, which is the only reason this is pushable.
			 */
			return ne(column, value);
		case '<':
			return lt(column, value);
		case '<=':
			return lte(column, value);
		case '>':
			return gt(column, value);
		case '>=':
			return gte(column, value);
		default:
			// `=~`, `contains`, `startswith`, `in` and arithmetic all differ from
			// SQLite's equivalents in at least one case. See the note at the top.
			return null;
	}
}

/**
 * The physical column an expression names, or `null`.
 *
 * Only a bare column on a real table. An attribute path is deliberately excluded
 * even though `json_extract` exists: SQLite compares an extracted value as text,
 * and the evaluator compares a numeric string numerically — so
 * `attributes.status >= 500` would silently return different rows in the two
 * implementations, which is exactly the class of difference the whole design is
 * arranged to avoid.
 */
function physicalColumn(expr: Expr, source: keyof typeof TABLES): Column | null {
	if (expr.kind !== 'column') return null;
	return PUSHABLE[source][expr.name] ?? null;
}

function countLeadingWheres(query: Query): number {
	let count = 0;
	for (const stage of query.stages) {
		if (stage.kind !== 'where') break;
		count += 1;
	}
	return count;
}

/** A `sort` stage as SQL ordering, if every key is a pushable column. */
function orderingFor(query: Query) {
	const stage = query.stages.find((s) => s.kind === 'sort');
	if (!stage || stage.kind !== 'sort') return null;

	// A `summarize` before the sort means the keys are computed columns.
	const summarised = query.stages.some((s) => s.kind === 'summarize');
	if (summarised) return null;

	const source = query.source;
	const keys: SQL[] = [];

	for (const key of stage.keys) {
		const column = physicalColumn(key.expr, source);
		if (!column) return null;
		keys.push(key.direction === 'desc' ? desc(column) : asc(column));
	}

	return keys.length > 0 ? keys : null;
}

function limitFor(query: Query): number | null {
	// Only when nothing after the `take` changes the row count. A `summarize`
	// after a `take` is legal and means "aggregate the first N", so the limit
	// still applies; a `where` after it would not.
	const index = query.stages.findIndex((s) => s.kind === 'take');
	if (index === -1) return null;

	const later = query.stages.slice(index + 1);
	if (later.some((s) => s.kind === 'where')) return null;

	const stage = query.stages[index];
	return stage?.kind === 'take' ? stage.count : null;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/**
 * A database row as an evaluator row.
 *
 * The only real work is parsing the JSON bags, and it is done here rather than
 * lazily inside the evaluator so that a malformed bag fails once, on read,
 * rather than once per predicate that touches it.
 *
 * A bag that will not parse becomes `{}` rather than throwing. It should be
 * impossible — ingest validates — but "impossible" data does arrive from a
 * migration or a manual insert, and one bad row must not fail the query that
 * would have shown it.
 */
function toRow(row: Record<string, unknown>): Row {
	const out: Row = {};

	for (const [key, value] of Object.entries(row)) {
		if (key === 'attributes' || key === 'labels') {
			out[key] = parseBag(value);
			continue;
		}
		out[key] = value as Row[string];
	}

	return out;
}

function parseBag(value: unknown): Record<string, unknown> {
	if (typeof value !== 'string') return {};
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/* ------------------------------------------------------------------ */
/* Traces                                                              */
/* ------------------------------------------------------------------ */

/** Every span in one trace. The one query a trace view blocks on. */
export async function spansFor(tenantId: string, traceId: string) {
	return db
		.select()
		.from(span)
		.where(and(eq(span.tenantId, tenantId), eq(span.traceId, traceId)))
		.orderBy(asc(span.timestamp))
		.limit(10_000);
}

/**
 * The services a tenant has seen recently, for completion and filters.
 *
 * Bounded by time rather than by row count: a service that stopped existing six
 * months ago should not be offered, and one that started this morning should.
 */
export async function servicesFor(tenantId: string, since: number): Promise<string[]> {
	const rows = await db
		.select({ service: event.service })
		.from(event)
		.where(and(eq(event.tenantId, tenantId), gte(event.timestamp, since)))
		.groupBy(event.service)
		.orderBy(sql`count(*) desc`)
		.limit(200);

	return rows.map((row) => row.service);
}
