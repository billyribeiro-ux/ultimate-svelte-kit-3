/**
 * WHAT THE COLUMNS ARE
 * ====================
 *
 * The checker needs to know that `duration` is a number and `service` is a
 * string. This file is where that lives, and it is deliberately *data* rather
 * than a set of interfaces — because the same table drives three things:
 *
 *   - the checker, which rejects `service > 5`
 *   - the completion list, which offers `service` after `where `
 *   - the storage layer, which knows which physical column to read
 *
 * Deriving the completion list from TypeScript types is possible and needs a
 * build step; deriving the storage mapping from them is not possible at all.
 * One table, three consumers, no code generation.
 *
 * ATTRIBUTES ARE NOT COLUMNS
 * --------------------------
 * Telemetry carries arbitrary key/value pairs — `attributes.http.status_code`,
 * `resource.k8s.pod` — and those cannot be enumerated ahead of time. They are
 * modelled as a `bag`: a column whose *paths* are dynamic and whose values are
 * `dynamic`, which is a type the checker treats as compatible with anything and
 * the evaluator coerces at the point of comparison.
 *
 * That is a deliberate hole in the type system, and it is the right one. The
 * alternative is either rejecting every attribute query or maintaining a schema
 * registry that is out of date the moment somebody deploys.
 */

import type { Source } from './ast.ts';

/**
 * The value types SQF distinguishes.
 *
 * `duration` is separate from `number` on purpose. They are both milliseconds
 * underneath, and keeping them apart means `duration > 200` is an error that
 * says "compare a duration with a duration — did you mean `200ms`?" rather than
 * silently comparing against two hundred milliseconds when somebody meant two
 * hundred *seconds*. That distinction is the entire reason a units bug is a
 * class of bug rather than an occasional mistake.
 */
export type SqfType = 'string' | 'number' | 'duration' | 'timestamp' | 'boolean' | 'dynamic';

export interface ColumnDef {
	readonly name: string;
	readonly type: SqfType;
	readonly doc: string;
	/** A dynamic key/value bag rather than a scalar — `attributes.http.method`. */
	readonly bag?: boolean;
	/** Shown in completion above the rest. The columns people actually filter on. */
	readonly common?: boolean;
}

export interface TableDef {
	readonly name: Source;
	readonly doc: string;
	readonly columns: readonly ColumnDef[];
}

const TIMESTAMP: ColumnDef = {
	name: 'timestamp',
	type: 'timestamp',
	doc: 'When the event happened, as reported by the sender.',
	common: true
};

/**
 * Every table's columns.
 *
 * Note what is *not* here: an `id` on logs. A log line has no identity anybody
 * queries by, and offering one in completion invites `where id == …`, which can
 * never be typed correctly by a human. A schema is a suggestion about what to
 * ask, and every column in it is an invitation.
 */
export const TABLES: readonly TableDef[] = [
	{
		name: 'logs',
		doc: 'Log lines. The widest and cheapest of the three.',
		columns: [
			TIMESTAMP,
			{ name: 'service', type: 'string', doc: 'The service that emitted the line.', common: true },
			{
				name: 'level',
				type: 'string',
				doc: 'debug | info | warn | error | fatal.',
				common: true
			},
			{ name: 'message', type: 'string', doc: 'The line itself.', common: true },
			{ name: 'trace_id', type: 'string', doc: 'The trace this line belongs to, if any.' },
			{ name: 'span_id', type: 'string', doc: 'The span this line was emitted inside.' },
			{ name: 'host', type: 'string', doc: 'The machine it came from.' },
			{
				name: 'attributes',
				type: 'dynamic',
				doc: 'Everything else the sender attached.',
				bag: true,
				common: true
			}
		]
	},
	{
		name: 'spans',
		doc: 'Units of work inside a trace.',
		columns: [
			TIMESTAMP,
			{ name: 'trace_id', type: 'string', doc: 'The trace this span belongs to.', common: true },
			{ name: 'span_id', type: 'string', doc: 'This span.' },
			{ name: 'parent_id', type: 'string', doc: 'The span that caused this one, or empty.' },
			{ name: 'service', type: 'string', doc: 'The service that ran it.', common: true },
			{ name: 'name', type: 'string', doc: 'What it was doing.', common: true },
			{
				name: 'duration',
				type: 'duration',
				doc: 'How long it took. Compare against a duration: `> 200ms`.',
				common: true
			},
			{ name: 'status', type: 'string', doc: 'ok | error.', common: true },
			{ name: 'attributes', type: 'dynamic', doc: 'Span attributes.', bag: true }
		]
	},
	{
		name: 'metrics',
		doc: 'Numeric samples on a named series.',
		columns: [
			TIMESTAMP,
			{ name: 'metric', type: 'string', doc: 'The series name.', common: true },
			{ name: 'value', type: 'number', doc: 'The sample.', common: true },
			{ name: 'service', type: 'string', doc: 'The service that reported it.', common: true },
			{ name: 'labels', type: 'dynamic', doc: 'Series labels.', bag: true, common: true }
		]
	}
];

export function tableFor(source: Source): TableDef {
	// Total by construction: `Source` is the union of the names above, and the
	// parser only ever produces one of them.
	return TABLES.find((table) => table.name === source)!;
}

export function columnFor(source: Source, name: string): ColumnDef | undefined {
	return tableFor(source).columns.find((column) => column.name === name);
}

/* ------------------------------------------------------------------ */
/* Functions                                                           */
/* ------------------------------------------------------------------ */

/**
 * A parameter's type, plus two that only make sense on a parameter.
 *
 * `'any'` means the function does not look at the value: `dcount` hashes it,
 * `min` orders it, and both are meaningful for a string.
 *
 * `'numeric'` means number-or-duration-or-timestamp, and it exists because
 * `'any'` and `'number'` are both wrong for `percentile`. `'any'` allows
 * `percentile(service, 95)`, which runs, sorts strings, and returns a service
 * name where a latency belongs. `'number'` would work — a duration is assignable
 * to a number — but it makes the error message for the string case say "needs a
 * number", which sends people towards `toint(service)` rather than towards
 * realising the question is wrong.
 *
 * That distinction is the whole reason this is a separate type rather than a
 * comment: the checker's job is to produce the message that leads somewhere.
 */
export type ParamType = SqfType | 'any' | 'numeric';

export interface FunctionDef {
	readonly name: string;
	/** Aggregations may only appear in `summarize`; scalars may appear anywhere. */
	readonly aggregate: boolean;
	readonly params: readonly ParamType[];
	readonly returns: SqfType;
	readonly doc: string;
	/**
	 * A return type that depends on the arguments.
	 *
	 * `min(duration)` is a duration and `min(value)` is a number. Without this the
	 * aggregate would have to return `dynamic`, and every unit check downstream of
	 * a `summarize` would be lost — which is exactly where people compare a p95
	 * against a threshold.
	 */
	readonly returnsArg?: number;
}

export const FUNCTIONS: readonly FunctionDef[] = [
	{ name: 'count', aggregate: true, params: [], returns: 'number', doc: 'How many rows.' },
	{
		name: 'countif',
		aggregate: true,
		params: ['boolean'],
		returns: 'number',
		doc: 'How many rows match a predicate.'
	},
	{
		name: 'dcount',
		aggregate: true,
		params: ['any'],
		returns: 'number',
		doc: 'Distinct values, estimated with HyperLogLog. Approximate by design.'
	},
	{
		name: 'sum',
		aggregate: true,
		params: ['numeric'],
		returns: 'number',
		returnsArg: 0,
		doc: 'The total.'
	},
	{
		name: 'avg',
		aggregate: true,
		params: ['numeric'],
		returns: 'number',
		returnsArg: 0,
		doc: 'The mean. Consider a percentile instead — an average latency hides the tail.'
	},
	{
		name: 'min',
		aggregate: true,
		params: ['any'],
		returns: 'dynamic',
		returnsArg: 0,
		doc: 'The smallest value.'
	},
	{
		name: 'max',
		aggregate: true,
		params: ['any'],
		returns: 'dynamic',
		returnsArg: 0,
		doc: 'The largest value.'
	},
	{
		name: 'percentile',
		aggregate: true,
		params: ['numeric', 'number'],
		returns: 'dynamic',
		returnsArg: 0,
		doc: 'An estimated percentile, from a mergeable sketch. `percentile(duration, 95)`.'
	},

	/* Scalars. */
	{
		name: 'bin',
		aggregate: false,
		params: ['timestamp', 'duration'],
		returns: 'timestamp',
		doc: 'Round a timestamp down to a bucket. `bin(timestamp, 1m)`.'
	},
	{
		name: 'strlen',
		aggregate: false,
		params: ['string'],
		returns: 'number',
		doc: 'Length in code points, not UTF-16 units.'
	},
	{
		name: 'tolower',
		aggregate: false,
		params: ['string'],
		returns: 'string',
		doc: 'Lower case.'
	},
	{
		name: 'coalesce',
		aggregate: false,
		params: ['any', 'any'],
		returns: 'dynamic',
		returnsArg: 0,
		doc: 'The first argument that is not null.'
	}
];

export function functionFor(name: string): FunctionDef | undefined {
	return FUNCTIONS.find((fn) => fn.name === name);
}
