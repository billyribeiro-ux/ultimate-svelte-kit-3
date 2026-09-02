/**
 * THE CHECKER
 * ===========
 *
 * Between parsing and running: resolve names, check types, and refuse the
 * queries that would otherwise run and return something wrong.
 *
 * WHAT A CHECKER IS ACTUALLY FOR
 * ------------------------------
 * Not "catching errors early" in the abstract. It is for the specific class of
 * mistake that a dynamic evaluator turns into a *plausible answer* rather than a
 * crash. Three of them, in the order they bite:
 *
 *   `duration > 200`            runs, compares against 200ms, and is off by
 *                               a factor of a thousand from what was meant
 *   `percentile(service, 95)`   runs, sorts strings, returns a service name
 *                               where a latency belongs
 *   `where count() > 5`         runs on some engines by silently ignoring the
 *                               aggregate; the rows it returns are arbitrary
 *
 * None of those throws at runtime. All three produce a number on a dashboard
 * that somebody will make a decision with. That is what this file is for.
 *
 * THE PIPELINE CHANGES THE SCHEMA
 * -------------------------------
 * A `summarize` replaces the available columns entirely; a `project` narrows
 * them. So the checker walks the stages carrying a `Scope`, and each stage
 * returns the scope the next one sees. That is the part a checker for a
 * non-pipelined language does not need, and it is what makes column completion
 * after the fourth stage correct instead of hopeful.
 */

import type { Aliased, Expr, Query, Stage } from './ast.ts';
import { nearest, SqfError } from './errors.ts';
import { functionFor, tableFor, type ColumnDef, type ParamType, type SqfType } from './schema.ts';

/** What is in scope at a point in the pipeline. */
export interface Scope {
	/** Column name to type. Ordered, because `project` output order is visible. */
	readonly columns: ReadonlyMap<string, SqfType>;
	/** Names that are dynamic bags, so `x.y.z` is legal on them. */
	readonly bags: ReadonlySet<string>;
}

export interface CheckResult {
	/** The scope the last stage produces — the shape of the result set. */
	readonly scope: Scope;
	readonly errors: readonly SqfError[];
}

export function check(query: Query): CheckResult {
	const errors: SqfError[] = [];
	const table = tableFor(query.source);

	let scope: Scope = {
		columns: new Map(table.columns.map((column) => [column.name, column.type])),
		bags: new Set(table.columns.filter((column) => column.bag).map((column) => column.name))
	};

	for (const stage of query.stages) {
		scope = checkStage(stage, scope, errors);
	}

	return { scope, errors };
}

function checkStage(stage: Stage, scope: Scope, errors: SqfError[]): Scope {
	switch (stage.kind) {
		case 'where': {
			const type = checkExpr(stage.predicate, scope, errors, { aggregates: false });

			/*
			 * A `where` must be a boolean, and `dynamic` is allowed through.
			 *
			 * The `dynamic` exemption is the price of attribute bags: the checker
			 * genuinely cannot know that `attributes.ok` is a boolean, and rejecting
			 * it would make half the useful queries impossible to write.
			 */
			if (type !== 'boolean' && type !== 'dynamic') {
				errors.push(
					new SqfError(
						`\`where\` needs a condition, not ${article(type)}`,
						stage.predicate.span,
						'Compare it against something — `== "error"`, `> 200ms`'
					)
				);
			}
			return scope;
		}

		case 'summarize': {
			for (const item of stage.aggregations) {
				checkExpr(item.expr, scope, errors, { aggregates: true });

				/*
				 * An output of `summarize` that contains no aggregate is a grouping key
				 * written in the wrong place.
				 *
				 * SQL answers this with "column must appear in the GROUP BY clause",
				 * which describes the rule rather than the mistake. Here the fix is
				 * always the same and can be said outright.
				 */
				if (!containsAggregate(item.expr)) {
					errors.push(
						new SqfError(
							`\`${item.name}\` is not an aggregate`,
							item.span,
							`Move it after \`by\`, or wrap it — \`max(${item.name})\``
						)
					);
				}
			}

			for (const item of stage.groups) {
				checkExpr(item.expr, scope, errors, { aggregates: false });
			}

			const columns = new Map<string, SqfType>();
			// Groups first: they are the identity of a row, and putting them on the
			// left is what makes a result table readable.
			for (const item of [...stage.groups, ...stage.aggregations]) {
				collide(item, columns, errors);
				columns.set(item.name, typeOf(item.expr, scope));
			}

			return { columns, bags: bagsSurviving(stage.groups, scope) };
		}

		case 'project': {
			const columns = new Map<string, SqfType>();
			for (const item of stage.columns) {
				checkExpr(item.expr, scope, errors, { aggregates: false });
				collide(item, columns, errors);
				columns.set(item.name, typeOf(item.expr, scope));
			}
			return { columns, bags: bagsSurviving(stage.columns, scope) };
		}

		case 'sort': {
			for (const key of stage.keys) {
				const type = checkExpr(key.expr, scope, errors, { aggregates: false });
				// Sorting a boolean is legal and almost never meant; sorting a bag is
				// neither, because the comparison would be between objects.
				if (type === 'dynamic' && key.expr.kind === 'column' && scope.bags.has(key.expr.name)) {
					errors.push(
						new SqfError(
							`Cannot sort by \`${key.expr.name}\`, which holds many values`,
							key.span,
							`Sort by one of them — \`${key.expr.name}.something\``
						)
					);
				}
			}
			return scope;
		}

		case 'take': {
			if (!Number.isInteger(stage.count) || stage.count < 1) {
				errors.push(
					new SqfError('`take` needs a whole number of rows', stage.span, 'Try `take 100`')
				);
			}
			return scope;
		}
	}
}

/* ------------------------------------------------------------------ */
/* Expressions                                                         */
/* ------------------------------------------------------------------ */

interface ExprContext {
	/** Whether an aggregate call is legal here. Only `summarize` says yes. */
	readonly aggregates: boolean;
}

function checkExpr(expr: Expr, scope: Scope, errors: SqfError[], context: ExprContext): SqfType {
	switch (expr.kind) {
		case 'literal':
			return expr.value === null
				? 'dynamic'
				: typeof expr.value === 'string'
					? 'string'
					: typeof expr.value === 'number'
						? 'number'
						: 'boolean';

		case 'duration':
			return 'duration';

		case 'column': {
			const type = scope.columns.get(expr.name);
			if (type === undefined) {
				errors.push(unknownColumn(expr.name, expr.span, scope));
				// Returning `dynamic` rather than bailing means one unknown column
				// produces one error, not one per comparison it appears in.
				return 'dynamic';
			}
			return type;
		}

		case 'path': {
			if (!scope.bags.has(expr.root)) {
				const known = scope.columns.get(expr.root);
				errors.push(
					known === undefined
						? unknownColumn(expr.root, expr.span, scope)
						: new SqfError(
								`\`${expr.root}\` is ${article(known)}, not a set of attributes`,
								expr.span,
								`Use it directly — \`${expr.root}\``
							)
				);
			}
			// Everything inside a bag is dynamic. That is the hole in the type system
			// and it is deliberate; see `schema.ts`.
			return 'dynamic';
		}

		case 'unary': {
			const operand = checkExpr(expr.operand, scope, errors, context);
			if (expr.op === 'not') {
				expect(operand, 'boolean', expr.operand.span, errors, '`not` needs a condition');
				return 'boolean';
			}
			expect(operand, 'number', expr.operand.span, errors, 'Negation needs a number');
			return operand === 'duration' ? 'duration' : 'number';
		}

		case 'binary':
			return checkBinary(expr, scope, errors, context);

		case 'call':
			return checkCall(expr, scope, errors, context);

		case 'list': {
			for (const item of expr.items) checkExpr(item, scope, errors, context);
			return 'dynamic';
		}
	}
}

function checkBinary(
	expr: Extract<Expr, { kind: 'binary' }>,
	scope: Scope,
	errors: SqfError[],
	context: ExprContext
): SqfType {
	const left = checkExpr(expr.left, scope, errors, context);
	const right = checkExpr(expr.right, scope, errors, context);

	switch (expr.op) {
		case 'and':
		case 'or':
			expect(left, 'boolean', expr.left.span, errors, `\`${expr.op}\` needs a condition`);
			expect(right, 'boolean', expr.right.span, errors, `\`${expr.op}\` needs a condition`);
			return 'boolean';

		case '==':
		case '!=':
		case '<':
		case '<=':
		case '>':
		case '>=': {
			/*
			 * THE UNITS CHECK
			 *
			 * `duration > 200` is the mistake this whole file exists to catch. Both
			 * sides are numbers underneath, the comparison runs, and the answer is off
			 * by whatever the person had in their head — usually a thousand.
			 *
			 * The message names the fix rather than the rule, because "type mismatch:
			 * duration vs number" leaves the reader to work out that milliseconds are
			 * spelled `ms`.
			 */
			if (comparable(left, right)) return 'boolean';

			errors.push(
				new SqfError(
					`Cannot compare ${article(left)} with ${article(right)}`,
					expr.span,
					unitsHint(left, right, expr.right)
				)
			);
			return 'boolean';
		}

		case '=~':
		case '!~':
			expect(left, 'string', expr.left.span, errors, 'A regular expression matches text');
			expect(right, 'string', expr.right.span, errors, 'The pattern must be a string');
			return 'boolean';

		case 'contains':
		case 'startswith':
			expect(left, 'string', expr.left.span, errors, `\`${expr.op}\` works on text`);
			expect(right, 'string', expr.right.span, errors, `\`${expr.op}\` needs text to look for`);
			return 'boolean';

		case 'in': {
			if (expr.right.kind !== 'list') {
				errors.push(new SqfError('`in` needs a list', expr.right.span, 'Write it as `[1, 2, 3]`'));
			}
			return 'boolean';
		}

		case '+':
		case '-':
		case '*':
		case '/': {
			expect(left, 'number', expr.left.span, errors, 'Arithmetic needs a number');
			expect(right, 'number', expr.right.span, errors, 'Arithmetic needs a number');

			/*
			 * Duration arithmetic, with the one rule that makes it useful:
			 * duration ± duration is a duration, duration × number is a duration, and
			 * duration ÷ duration is a plain number (a ratio). Anything else collapses
			 * to `number`, which loses the unit — and losing it silently is how
			 * `avg(duration) / 1000 > 200ms` gets past a checker.
			 */
			if (left === 'duration' || right === 'duration') {
				if (expr.op === '/' && left === 'duration' && right === 'duration') return 'number';
				return 'duration';
			}
			return 'number';
		}
	}
}

function checkCall(
	expr: Extract<Expr, { kind: 'call' }>,
	scope: Scope,
	errors: SqfError[],
	context: ExprContext
): SqfType {
	const fn = functionFor(expr.name);

	if (!fn) {
		const guess = nearest(
			expr.name,
			// Only aggregates are suggested inside `summarize`, and only scalars
			// outside it. Suggesting `percentile` in a `where` would be a correction
			// that leads to a second error.
			(context.aggregates ? AGGREGATE_NAMES : SCALAR_NAMES) as readonly string[]
		);
		errors.push(
			new SqfError(
				`Unknown function \`${expr.name}\``,
				expr.span,
				guess ? `Did you mean \`${guess}\`?` : undefined
			)
		);
		return 'dynamic';
	}

	if (fn.aggregate && !context.aggregates) {
		errors.push(
			new SqfError(
				`\`${fn.name}\` can only be used in \`summarize\``,
				expr.span,
				`Add a stage — \`| summarize n = ${fn.name}(…)\``
			)
		);
	}

	const argTypes = expr.args.map((arg) => checkExpr(arg, scope, errors, { aggregates: false }));

	if (argTypes.length !== fn.params.length) {
		errors.push(
			new SqfError(
				`\`${fn.name}\` takes ${plural(fn.params.length, 'argument')}, not ${argTypes.length}`,
				expr.span,
				fn.doc
			)
		);
	}

	for (const [index, param] of fn.params.entries()) {
		const actual = argTypes[index];
		if (actual === undefined) break;
		if (param === 'any') continue;
		expect(actual, param, expr.args[index]!.span, errors, `\`${fn.name}\` needs ${article(param)}`);
	}

	// A return type that follows an argument: `min(duration)` is a duration.
	if (fn.returnsArg !== undefined) return argTypes[fn.returnsArg] ?? fn.returns;
	return fn.returns;
}

/* ------------------------------------------------------------------ */
/* Type rules                                                          */
/* ------------------------------------------------------------------ */

/**
 * Is a value of type `actual` acceptable where `wanted` is required?
 *
 * `dynamic` is compatible in both directions — that is what makes attribute bags
 * usable — and `duration` satisfies `number`, so `sum(duration)` works. The
 * reverse does not hold, which is what makes `duration > 200` an error.
 */
function assignable(actual: SqfType, wanted: ParamType): boolean {
	if (wanted === 'any' || actual === 'dynamic' || wanted === 'dynamic') return true;
	if (actual === wanted) return true;
	if (wanted === 'numeric')
		return actual === 'number' || actual === 'duration' || actual === 'timestamp';
	if (wanted === 'number' && (actual === 'duration' || actual === 'timestamp')) return true;
	return false;
}

/** Can these two be compared with `<`, `==` and friends? */
function comparable(left: SqfType, right: SqfType): boolean {
	if (left === 'dynamic' || right === 'dynamic') return true;
	if (left === right) return true;

	// A timestamp against a duration is "this long ago", which reads naturally and
	// is resolved against the query's time range by the planner.
	if (left === 'timestamp' && right === 'duration') return true;

	/*
	 * A timestamp against a number is allowed, and a duration against a number is
	 * not. That looks inconsistent and is the point.
	 *
	 * A timestamp is an absolute instant in epoch milliseconds, and there is only
	 * one way to write one as a number — so `timestamp > 1764547200000` is
	 * unambiguous even if nobody types it by hand. A duration is a *quantity* with
	 * no inherent unit, so `duration > 200` is a question the reader cannot answer
	 * without knowing what was in the writer's head.
	 *
	 * The rule is not "numbers are dangerous". It is: reject the comparison whose
	 * meaning depends on an unstated convention.
	 */
	if (left === 'timestamp' && right === 'number') return true;
	if (left === 'number' && right === 'timestamp') return true;

	return false;
}

function expect(
	actual: SqfType,
	wanted: ParamType,
	span: { start: number; end: number },
	errors: SqfError[],
	message: string
): void {
	if (assignable(actual, wanted)) return;
	errors.push(new SqfError(`${message}, not ${article(actual)}`, span));
}

/** The specific, actionable half of a units error. */
function unitsHint(left: SqfType, right: SqfType, rightExpr: Expr): string | undefined {
	if (left === 'duration' && right === 'number' && rightExpr.kind === 'literal') {
		return `Durations need a unit — try \`${rightExpr.value}ms\` or \`${rightExpr.value}s\``;
	}
	if (left === 'number' && right === 'duration') {
		return 'One side is a duration and the other is a plain number';
	}
	if (left === 'string' || right === 'string') {
		return 'Quote it to compare against text, or remove the quotes to compare against a number';
	}
	return undefined;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const AGGREGATE_NAMES = ['count', 'countif', 'dcount', 'sum', 'avg', 'min', 'max', 'percentile'];
const SCALAR_NAMES = ['bin', 'strlen', 'tolower', 'coalesce'];

function containsAggregate(expr: Expr): boolean {
	if (expr.kind === 'call' && functionFor(expr.name)?.aggregate) return true;

	switch (expr.kind) {
		case 'unary':
			return containsAggregate(expr.operand);
		case 'binary':
			return containsAggregate(expr.left) || containsAggregate(expr.right);
		case 'call':
			return expr.args.some(containsAggregate);
		case 'list':
			return expr.items.some(containsAggregate);
		default:
			return false;
	}
}

/**
 * The type an already-checked expression has.
 *
 * Runs the checker again with a throwaway error list, rather than threading a
 * type back out of `checkExpr`. That is a deliberate simplification: the
 * expression has already been checked, so the second pass reports nothing new,
 * and the alternative is an annotated tree that every consumer has to thread.
 * For queries of this size the cost is unmeasurable.
 */
function typeOf(expr: Expr, scope: Scope): SqfType {
	return checkExpr(expr, scope, [], { aggregates: true });
}

/** Bags that are still bags after a projection — only if projected whole. */
function bagsSurviving(items: readonly Aliased[], scope: Scope): Set<string> {
	const bags = new Set<string>();
	for (const item of items) {
		if (item.expr.kind === 'column' && scope.bags.has(item.expr.name)) bags.add(item.name);
	}
	return bags;
}

function collide(item: Aliased, columns: Map<string, SqfType>, errors: SqfError[]): void {
	if (!columns.has(item.name)) return;

	errors.push(
		new SqfError(
			`Two outputs are both called \`${item.name}\``,
			item.span,
			item.explicit
				? 'Give one of them a different name'
				: `Name one of them — \`something = ${item.name}\``
		)
	);
}

function unknownColumn(name: string, span: { start: number; end: number }, scope: Scope): SqfError {
	const guess = nearest(name, [...scope.columns.keys()]);
	return new SqfError(
		`Unknown column \`${name}\``,
		span,
		guess ? `Did you mean \`${guess}\`?` : `Available: ${[...scope.columns.keys()].join(', ')}`
	);
}

function article(type: SqfType | ParamType): string {
	if (type === 'any') return 'anything';
	// "needs a number or a duration" rather than "needs a numeric", which is an
	// adjective standing where a noun belongs and reads like a compiler.
	if (type === 'numeric') return 'a number or a duration';
	return /^[aeiou]/.test(type) ? `an ${type}` : `a ${type}`;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Re-exported so callers can name a column type without importing the schema. */
export type { ColumnDef, SqfType };
