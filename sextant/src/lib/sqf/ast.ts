/**
 * THE SYNTAX TREE
 * ===============
 *
 * A query is a **source** followed by a pipeline of **stages**:
 *
 *   from logs
 *   | where level == "error" and duration > 200ms
 *   | summarize p95 = percentile(duration, 95), n = count() by service
 *   | sort by p95 desc
 *   | take 20
 *
 * The pipeline shape is chosen over SQL's `SELECT … FROM … WHERE … GROUP BY`
 * for one reason that matters at a keyboard: **it reads in execution order**, so
 * completion has something to offer. After `| where ` the editor knows the
 * available columns because everything before it has already been resolved. In
 * SQL, `SELECT ` comes first and the tables are named last, which is why SQL
 * completion is either wrong or has to parse ahead speculatively.
 *
 * Every node carries a `span`. That is not free — it is a field on twenty types
 * — and it is what lets the checker underline `percentile(duration, 95)` rather
 * than the whole query.
 */

import type { Span } from './token.ts';

/* ------------------------------------------------------------------ */
/* Expressions                                                         */
/* ------------------------------------------------------------------ */

export type BinaryOp =
	| '=='
	| '!='
	| '<'
	| '<='
	| '>'
	| '>='
	| '=~'
	| '!~'
	| 'contains'
	| 'startswith'
	| 'in'
	| 'and'
	| 'or'
	| '+'
	| '-'
	| '*'
	| '/';

export type Expr =
	| {
			readonly kind: 'literal';
			readonly value: string | number | boolean | null;
			readonly span: Span;
	  }
	/** A duration keeps its own node so the checker can insist on one where a window is wanted. */
	| { readonly kind: 'duration'; readonly ms: number; readonly span: Span }
	| { readonly kind: 'column'; readonly name: string; readonly span: Span }
	/** `attributes.http.status` — a path into a nested attribute bag. */
	| {
			readonly kind: 'path';
			readonly root: string;
			readonly parts: readonly string[];
			readonly span: Span;
	  }
	| {
			readonly kind: 'unary';
			readonly op: 'not' | '-';
			readonly operand: Expr;
			readonly span: Span;
	  }
	| {
			readonly kind: 'binary';
			readonly op: BinaryOp;
			readonly left: Expr;
			readonly right: Expr;
			readonly span: Span;
	  }
	| {
			readonly kind: 'call';
			readonly name: string;
			readonly args: readonly Expr[];
			readonly span: Span;
	  }
	/** `[1, 2, 3]`, only ever the right-hand side of `in`. */
	| { readonly kind: 'list'; readonly items: readonly Expr[]; readonly span: Span };

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

/** `p95 = percentile(duration, 95)` — a named output of `summarize` or `project`. */
export interface Aliased {
	readonly name: string;
	readonly expr: Expr;
	readonly span: Span;
	/**
	 * Whether the name was written or inferred.
	 *
	 * Inferred names get a worse error message on collision — "two outputs are
	 * both called `count`, name one of them" — and that is only sayable if the
	 * checker knows the person did not choose it.
	 */
	readonly explicit: boolean;
}

export interface SortKey {
	readonly expr: Expr;
	readonly direction: 'asc' | 'desc';
	readonly span: Span;
}

export type Stage =
	| { readonly kind: 'where'; readonly predicate: Expr; readonly span: Span }
	| {
			readonly kind: 'summarize';
			readonly aggregations: readonly Aliased[];
			readonly groups: readonly Aliased[];
			readonly span: Span;
	  }
	| { readonly kind: 'project'; readonly columns: readonly Aliased[]; readonly span: Span }
	| { readonly kind: 'sort'; readonly keys: readonly SortKey[]; readonly span: Span }
	| { readonly kind: 'take'; readonly count: number; readonly span: Span };

/** The three things a query can read from. */
export const SOURCES = ['logs', 'spans', 'metrics'] as const;
export type Source = (typeof SOURCES)[number];

export interface Query {
	readonly source: Source;
	readonly sourceSpan: Span;
	readonly stages: readonly Stage[];
	readonly span: Span;
}

/* ------------------------------------------------------------------ */
/* Walking                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every expression in a tree, parents before children.
 *
 * Written as a generator rather than a visitor with callbacks, so a caller can
 * `break` out of it — which the completion code does constantly, since it wants
 * the innermost node containing a cursor and nothing else. A visitor would
 * either run to completion or need an exception to stop it.
 */
export function* walkExpr(expr: Expr): Generator<Expr> {
	yield expr;

	switch (expr.kind) {
		case 'unary':
			yield* walkExpr(expr.operand);
			break;
		case 'binary':
			yield* walkExpr(expr.left);
			yield* walkExpr(expr.right);
			break;
		case 'call':
			for (const arg of expr.args) yield* walkExpr(arg);
			break;
		case 'list':
			for (const item of expr.items) yield* walkExpr(item);
			break;
		case 'literal':
		case 'duration':
		case 'column':
		case 'path':
			break;
	}
}

/** Every expression in a query, in pipeline order. */
export function* walkQuery(query: Query): Generator<Expr> {
	for (const stage of query.stages) {
		switch (stage.kind) {
			case 'where':
				yield* walkExpr(stage.predicate);
				break;
			case 'summarize':
				for (const item of stage.aggregations) yield* walkExpr(item.expr);
				for (const item of stage.groups) yield* walkExpr(item.expr);
				break;
			case 'project':
				for (const item of stage.columns) yield* walkExpr(item.expr);
				break;
			case 'sort':
				for (const key of stage.keys) yield* walkExpr(key.expr);
				break;
			case 'take':
				break;
		}
	}
}

/**
 * The innermost expression whose span contains `offset`, or `undefined`.
 *
 * `walkExpr` yields parents first, so the last match is the deepest — which is
 * what a cursor is pointing at. Doing it the other way round and taking the
 * first match returns the whole query for every position, which is technically a
 * containing node and useless for completion.
 */
export function innermostAt(query: Query, offset: number): Expr | undefined {
	let found: Expr | undefined;
	for (const expr of walkQuery(query)) {
		if (offset >= expr.span.start && offset <= expr.span.end) found = expr;
	}
	return found;
}
