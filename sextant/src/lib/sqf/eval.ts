/**
 * THE EVALUATOR
 * =============
 *
 * Run a checked query over rows. This is the reference implementation: correct,
 * straightforward, and the thing the storage layer's pushed-down SQL is tested
 * *against*. Two implementations of the same language sounds like duplication
 * and is the opposite — it is the only way to know the fast path is right, and
 * `pushdown.spec.ts` runs both over the same data and compares.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * -----------------------------
 * Not vectorised, not columnar, not lazy. It walks rows and evaluates an AST per
 * row, which is roughly the slowest reasonable design. That is fine, because it
 * runs on at most a few thousand rows: the storage layer pushes `where`, `sort`
 * and `take` into SQL, and this evaluates what comes back. The moment it becomes
 * the bottleneck, the fix is to push more down rather than to make this clever —
 * and having it stay simple is what makes that comparison trustworthy.
 *
 * AGGREGATION AND THE SKETCHES
 * ----------------------------
 * `percentile` and `dcount` go through the mergeable sketches, even here where
 * an exact answer is available from the rows in hand. That is deliberate: the
 * numbers a person sees must not change depending on whether a query happened to
 * hit a rollup or the raw table. A p95 that shifts by 1.5% when the time range
 * crosses the rollup boundary is a bug report nobody can reproduce.
 */

import type { Aliased, Expr, Query, Stage } from './ast.ts';
import { functionFor } from './schema.ts';
import { DDSketch } from '#lib/sketch/ddsketch.ts';
import { HyperLogLog } from '#lib/sketch/hyperloglog.ts';
import {
	and3,
	asNumber,
	asString,
	compareValues,
	equals3,
	groupKey,
	isTrue,
	not3,
	or3,
	type Row,
	type Value
} from './value.ts';

export interface EvalOptions {
	/**
	 * A ceiling on rows produced, independent of `take`.
	 *
	 * A query with no `take` over a wide range would otherwise materialise
	 * everything. The limit is applied after `where` and before `sort`, so it
	 * truncates rather than sampling — and the caller is told, so the interface
	 * can say "showing the first N" rather than implying it is all of them.
	 */
	readonly maxRows?: number;
}

export interface EvalResult {
	readonly columns: readonly string[];
	readonly rows: readonly Row[];
	/** True when `maxRows` cut the result short. The interface must say so. */
	readonly truncated: boolean;
}

const DEFAULT_MAX_ROWS = 10_000;

export function evaluate(
	query: Query,
	input: Iterable<Row>,
	options: EvalOptions = {}
): EvalResult {
	const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

	let rows: Row[] = [];
	let truncated = false;

	for (const row of input) {
		if (rows.length >= maxRows) {
			truncated = true;
			break;
		}
		rows.push(row);
	}

	let columns: string[] | null = null;

	for (const stage of query.stages) {
		switch (stage.kind) {
			case 'where':
				rows = rows.filter((row) => isTrue(asBoolean(evalExpr(stage.predicate, row))));
				break;

			case 'summarize': {
				const result = summarize(stage, rows);
				rows = result.rows;
				columns = result.columns;
				// A summarize collapses everything: whatever was truncated before it no
				// longer describes the output, and saying so would be a lie in the
				// alarming direction.
				truncated = false;
				break;
			}

			case 'project': {
				columns = stage.columns.map((column) => column.name);
				rows = rows.map((row) => {
					const out: Row = {};
					for (const column of stage.columns) out[column.name] = evalExpr(column.expr, row);
					return out;
				});
				break;
			}

			case 'sort':
				rows = sortRows(rows, stage);
				break;

			case 'take':
				if (rows.length > stage.count) {
					rows = rows.slice(0, stage.count);
					// An explicit `take` is not truncation — it is what was asked for.
					truncated = false;
				}
				break;
		}
	}

	return {
		columns: columns ?? inferColumns(rows),
		rows,
		truncated
	};
}

/* ------------------------------------------------------------------ */
/* Expressions                                                         */
/* ------------------------------------------------------------------ */

export function evalExpr(expr: Expr, row: Row): Value {
	switch (expr.kind) {
		case 'literal':
			return expr.value;

		case 'duration':
			// A duration is milliseconds at runtime. The type distinction did its job
			// in the checker and has no representation here, which is the right place
			// for it to stop mattering.
			return expr.ms;

		case 'column':
			return row[expr.name] ?? null;

		case 'path':
			return readPath(row[expr.root] ?? null, expr.parts);

		case 'unary': {
			const operand = evalExpr(expr.operand, row);
			if (expr.op === 'not') return not3(asBoolean(operand));
			const numeric = asNumber(operand);
			return numeric === null ? null : -numeric;
		}

		case 'binary':
			return evalBinary(expr, row);

		case 'call':
			return evalScalarCall(expr, row);

		case 'list':
			// Only ever the right side of `in`, which reads the items directly.
			return null;
	}
}

function evalBinary(expr: Extract<Expr, { kind: 'binary' }>, row: Row): Value {
	// `and`/`or` short-circuit, which matters for more than speed: the right side
	// of `x != null and x > 5` must not be evaluated when the left is false — not
	// because it would throw, but because the three-valued result would be `null`
	// and `false and null` reads better as plain `false`.
	if (expr.op === 'and') {
		const left = asBoolean(evalExpr(expr.left, row));
		if (left === false) return false;
		return and3(left, asBoolean(evalExpr(expr.right, row)));
	}

	if (expr.op === 'or') {
		const left = asBoolean(evalExpr(expr.left, row));
		if (left === true) return true;
		return or3(left, asBoolean(evalExpr(expr.right, row)));
	}

	if (expr.op === 'in') {
		const left = evalExpr(expr.left, row);
		if (expr.right.kind !== 'list') return null;

		/*
		 * `in` over a list containing null follows SQL: a non-match against a list
		 * with a null in it is `null`, not `false`, because the null might have
		 * been the match. Getting this wrong is subtle and only shows up when
		 * somebody writes `in [a, b, null]`, which is rare — and being consistent
		 * with `==` costs three lines.
		 */
		let sawNull = false;
		for (const item of expr.right.items) {
			const result = equals3(left, evalExpr(item, row));
			if (result === true) return true;
			if (result === null) sawNull = true;
		}
		return sawNull ? null : false;
	}

	const left = evalExpr(expr.left, row);
	const right = evalExpr(expr.right, row);

	switch (expr.op) {
		case '==':
			return equals3(left, right);
		case '!=':
			return not3(equals3(left, right));

		case '<':
		case '<=':
		case '>':
		case '>=': {
			const order = compareValues(left, right);
			if (order === null) return null;
			return expr.op === '<'
				? order < 0
				: expr.op === '<='
					? order <= 0
					: expr.op === '>'
						? order > 0
						: order >= 0;
		}

		case '=~':
		case '!~': {
			const text = asString(left);
			const pattern = asString(right);
			if (text === null || pattern === null) return null;

			const regex = compileRegex(pattern);
			// An invalid pattern is `null` rather than a throw: a query is edited a
			// character at a time, and `=~ "("` exists for one keystroke on the way
			// to something valid. Throwing there makes the editor flash an error on
			// every partial pattern.
			if (!regex) return null;

			const matched = regex.test(text);
			return expr.op === '=~' ? matched : !matched;
		}

		case 'contains':
		case 'startswith': {
			const text = asString(left);
			const needle = asString(right);
			if (text === null || needle === null) return null;
			// Case-insensitive, because log search is. Somebody looking for "Timeout"
			// wants the lines that say "timeout", and making them type a regex for it
			// is a worse default than the occasional unwanted match.
			const haystack = text.toLowerCase();
			const lower = needle.toLowerCase();
			return expr.op === 'contains' ? haystack.includes(lower) : haystack.startsWith(lower);
		}

		case '+':
		case '-':
		case '*':
		case '/': {
			const a = asNumber(left);
			const b = asNumber(right);
			if (a === null || b === null) return null;
			if (expr.op === '+') return a + b;
			if (expr.op === '-') return a - b;
			if (expr.op === '*') return a * b;
			// Division by zero is `null`, not Infinity. An Infinity propagates through
			// every later aggregate and renders as "∞" in a table cell, which tells
			// nobody anything; a blank cell says "not available", which is true.
			return b === 0 ? null : a / b;
		}

		default:
			return null;
	}
}

function evalScalarCall(expr: Extract<Expr, { kind: 'call' }>, row: Row): Value {
	const args = expr.args.map((arg) => evalExpr(arg, row));

	switch (expr.name) {
		case 'bin': {
			const value = asNumber(args[0] ?? null);
			const size = asNumber(args[1] ?? null);
			if (value === null || size === null || size <= 0) return null;
			return Math.floor(value / size) * size;
		}

		case 'strlen': {
			const text = asString(args[0] ?? null);
			// Code points, not UTF-16 units: an emoji is one character to a person and
			// two to `String#length`, and a length that disagrees with what somebody
			// can count is worse than no length.
			return text === null ? null : [...text].length;
		}

		case 'tolower': {
			const text = asString(args[0] ?? null);
			return text === null ? null : text.toLowerCase();
		}

		case 'coalesce':
			for (const arg of args) if (arg !== null) return arg;
			return null;

		default:
			// An aggregate reached here, which the checker refuses. Returning null
			// rather than throwing keeps a partially-checked query from crashing the
			// editor's live preview.
			return null;
	}
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

/** The running state of one aggregate within one group. */
interface Accumulator {
	count: number;
	sum: number;
	/** Present only for the aggregates that need them, so a `count()` costs nothing. */
	sketch?: DDSketch;
	hll?: HyperLogLog;
	min?: Value;
	max?: Value;
}

function summarize(
	stage: Extract<Stage, { kind: 'summarize' }>,
	rows: readonly Row[]
): { rows: Row[]; columns: string[] } {
	const groups = new Map<string, { key: Row; accumulators: Accumulator[] }>();

	/*
	 * One pass over the rows, updating every aggregate for the row's group.
	 *
	 * A `Map` keyed by a joined string rather than by a tuple, because JavaScript
	 * has no value-equality for arrays or objects and a `Map` keyed by an object
	 * would create one group per row. The key is built from `groupKey`, which is
	 * type-tagged — see `value.ts` for why grouping and comparison differ here.
	 */
	for (const row of rows) {
		const keyParts: string[] = [];
		const keyRow: Row = {};

		for (const group of stage.groups) {
			const value = evalExpr(group.expr, row);
			keyRow[group.name] = value;
			keyParts.push(groupKey(value));
		}

		// A separator that cannot appear in a `groupKey` output, so ["a|b"] and
		// ["a", "b"] are different groups. Joining on a plain character that *can*
		// appear is a classic way to merge two rows that are not the same.
		const key = keyParts.join(' ');

		let group = groups.get(key);
		if (!group) {
			group = {
				key: keyRow,
				accumulators: stage.aggregations.map(() => ({ count: 0, sum: 0 }))
			};
			groups.set(key, group);
		}

		for (const [index, aggregation] of stage.aggregations.entries()) {
			accumulate(aggregation, group.accumulators[index]!, row);
		}
	}

	const columns = [...stage.groups.map((g) => g.name), ...stage.aggregations.map((a) => a.name)];

	const out: Row[] = [];
	for (const group of groups.values()) {
		const row: Row = { ...group.key };
		for (const [index, aggregation] of stage.aggregations.entries()) {
			row[aggregation.name] = finalise(aggregation, group.accumulators[index]!);
		}
		out.push(row);
	}

	return { rows: out, columns };
}

/** The aggregate call inside an aliased output, or `null` if there is not one. */
function aggregateCall(expr: Expr): Extract<Expr, { kind: 'call' }> | null {
	if (expr.kind === 'call' && functionFor(expr.name)?.aggregate) return expr;

	// Only one level deep. `sum(a) / count()` is two aggregates in one expression
	// and is not supported — the checker allows it and this would evaluate the
	// first it finds, which is wrong. It is on the list; until then, the honest
	// behaviour is to aggregate the outermost call and nothing else.
	switch (expr.kind) {
		case 'unary':
			return aggregateCall(expr.operand);
		case 'binary':
			return aggregateCall(expr.left) ?? aggregateCall(expr.right);
		default:
			return null;
	}
}

function accumulate(aggregation: Aliased, state: Accumulator, row: Row): void {
	const call = aggregateCall(aggregation.expr);
	if (!call) return;

	const first = call.args[0];

	switch (call.name) {
		case 'count':
			state.count += 1;
			break;

		case 'countif':
			if (first && isTrue(asBoolean(evalExpr(first, row)))) state.count += 1;
			break;

		case 'dcount': {
			if (!first) break;
			const value = evalExpr(first, row);
			if (value === null) break;
			state.hll ??= new HyperLogLog();
			state.hll.add(groupKey(value));
			break;
		}

		case 'sum':
		case 'avg': {
			if (!first) break;
			const value = asNumber(evalExpr(first, row));
			// Nulls are skipped rather than counted as zero, which is what makes
			// `avg` the average *of the values present* rather than an average
			// diluted by every row that did not have the field.
			if (value === null) break;
			state.sum += value;
			state.count += 1;
			break;
		}

		case 'min':
		case 'max': {
			if (!first) break;
			const value = evalExpr(first, row);
			if (value === null) break;

			const current = call.name === 'min' ? state.min : state.max;
			if (current === undefined) {
				if (call.name === 'min') state.min = value;
				else state.max = value;
				break;
			}

			const order = compareValues(value, current);
			if (order === null) break;
			if (call.name === 'min' ? order < 0 : order > 0) {
				if (call.name === 'min') state.min = value;
				else state.max = value;
			}
			break;
		}

		case 'percentile': {
			if (!first) break;
			const value = asNumber(evalExpr(first, row));
			if (value === null) break;
			state.sketch ??= new DDSketch();
			state.sketch.add(value);
			break;
		}
	}
}

function finalise(aggregation: Aliased, state: Accumulator): Value {
	const call = aggregateCall(aggregation.expr);
	if (!call) return null;

	switch (call.name) {
		case 'count':
		case 'countif':
			return state.count;

		case 'dcount':
			return state.hll?.count() ?? 0;

		case 'sum':
			// Zero rather than null: a sum over nothing is zero, and a blank cell in a
			// "total requests" column reads as missing data rather than as none.
			return state.count === 0 ? 0 : state.sum;

		case 'avg':
			// Null rather than zero: an average over nothing is not zero, it is
			// undefined, and showing 0ms latency for a service with no traffic is the
			// kind of number people page on.
			return state.count === 0 ? null : state.sum / state.count;

		case 'min':
			return state.min ?? null;

		case 'max':
			return state.max ?? null;

		case 'percentile': {
			const q = call.args[1];
			const percent = q && q.kind === 'literal' && typeof q.value === 'number' ? q.value : 95;
			if (!state.sketch || state.sketch.count === 0) return null;
			return state.sketch.quantile(Math.max(0, Math.min(100, percent)) / 100);
		}

		default:
			return null;
	}
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

function sortRows(rows: readonly Row[], stage: Extract<Stage, { kind: 'sort' }>): Row[] {
	/*
	 * Decorate-sort-undecorate: evaluate every key once per row rather than twice
	 * per comparison. For n rows that is n evaluations instead of 2n·log(n), which
	 * on ten thousand rows and three keys is the difference between imperceptible
	 * and visible.
	 */
	const decorated = rows.map((row) => ({
		row,
		keys: stage.keys.map((key) => evalExpr(key.expr, row))
	}));

	decorated.sort((a, b) => {
		for (const [index, key] of stage.keys.entries()) {
			const order = compareValues(a.keys[index]!, b.keys[index]!);

			/*
			 * Nulls sort last, in both directions.
			 *
			 * `compareValues` returns null for "not comparable", which includes any
			 * comparison with a missing value — and a sort that leaves them wherever
			 * they happened to be puts them in the middle, where they interrupt
			 * whatever the person was scanning for. Last is a convention people
			 * already know from SQL's `NULLS LAST`, and it is the same in `desc`
			 * because "sort by slowest" should not begin with rows that have no
			 * duration at all.
			 */
			if (order === null) {
				const aNull = a.keys[index] === null;
				const bNull = b.keys[index] === null;
				if (aNull !== bNull) return aNull ? 1 : -1;
				continue;
			}

			if (order !== 0) return key.direction === 'desc' ? -order : order;
		}
		return 0;
	});

	return decorated.map((entry) => entry.row);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function asBoolean(value: Value): boolean | null {
	if (value === null) return null;
	if (typeof value === 'boolean') return value;
	// A dynamic attribute holding a string or number in a condition. Truthiness
	// follows the obvious rules rather than JavaScript's, where "false" is true
	// and "0" is true — both of which arrive from real senders.
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const lower = value.toLowerCase();
		if (lower === 'true' || lower === '1' || lower === 'yes') return true;
		if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
		return null;
	}
	return null;
}

function readPath(root: Value, parts: readonly string[]): Value {
	let current: unknown = root;
	for (const part of parts) {
		if (current === null || typeof current !== 'object') return null;
		current = (current as Record<string, unknown>)[part];
	}
	return (current ?? null) as Value;
}

/**
 * A tiny cache, because a `where` compiles the same pattern once per row.
 *
 * Bounded, because the key is user input: an editor sending a query on every
 * keystroke produces a new pattern each time, and an unbounded cache keyed by
 * user input is a memory leak with a friendly name.
 */
const REGEX_CACHE = new Map<string, RegExp | null>();
const REGEX_CACHE_MAX = 256;

function compileRegex(pattern: string): RegExp | null {
	const cached = REGEX_CACHE.get(pattern);
	if (cached !== undefined) return cached;

	let compiled: RegExp | null;
	try {
		compiled = new RegExp(pattern);
	} catch {
		compiled = null;
	}

	if (REGEX_CACHE.size >= REGEX_CACHE_MAX) {
		// Evict the oldest. `Map` iterates in insertion order, so the first key is
		// the least recently added — not the least recently *used*, which would need
		// a second structure to track and is not worth it for a 256-entry cache.
		const oldest = REGEX_CACHE.keys().next();
		if (!oldest.done) REGEX_CACHE.delete(oldest.value);
	}

	REGEX_CACHE.set(pattern, compiled);
	return compiled;
}

function inferColumns(rows: readonly Row[]): string[] {
	const columns: string[] = [];
	const seen = new Set<string>();
	// Union across rows rather than just the first: attribute bags mean two rows
	// legitimately have different keys, and showing only the first row's columns
	// hides data that is right there.
	for (const row of rows.slice(0, 100)) {
		for (const key of Object.keys(row)) {
			if (seen.has(key)) continue;
			seen.add(key);
			columns.push(key);
		}
	}
	return columns;
}
