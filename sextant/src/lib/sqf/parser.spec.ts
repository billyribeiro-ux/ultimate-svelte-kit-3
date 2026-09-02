import { describe, expect, it } from 'vitest';
import { parse } from './parser.ts';
import type { Expr, Query } from './ast.ts';

function ok(source: string): Query {
	const { query, errors } = parse(source);
	expect(errors.map((e) => e.format(source)).join('\n')).toBe('');
	expect(query).toBeDefined();
	return query!;
}

/** A compact s-expression, so precedence assertions read as precedence. */
function sexpr(expr: Expr): string {
	switch (expr.kind) {
		case 'literal':
			return JSON.stringify(expr.value);
		case 'duration':
			return `${expr.ms}ms`;
		case 'column':
			return expr.name;
		case 'path':
			return [expr.root, ...expr.parts].join('.');
		case 'unary':
			return `(${expr.op} ${sexpr(expr.operand)})`;
		case 'binary':
			return `(${expr.op} ${sexpr(expr.left)} ${sexpr(expr.right)})`;
		case 'call':
			return `(${[expr.name, ...expr.args.map(sexpr)].join(' ')})`;
		case 'list':
			return `[${expr.items.map(sexpr).join(' ')}]`;
	}
}

function predicate(source: string): string {
	const stage = ok(source).stages[0]!;
	if (stage.kind !== 'where') throw new Error('expected a where stage');
	return sexpr(stage.predicate);
}

describe('the pipeline', () => {
	it('parses a realistic query', () => {
		const query = ok(
			'from spans | where service == "checkout" and duration > 200ms | summarize p95 = percentile(duration, 95) by route | sort by p95 desc | take 20'
		);
		expect(query.source).toBe('spans');
		expect(query.stages.map((s) => s.kind)).toEqual(['where', 'summarize', 'sort', 'take']);
	});

	it('accepts a bare source', () => {
		expect(ok('from logs').stages).toEqual([]);
	});

	it('accepts `sort by x` and `sort x` alike', () => {
		/*
		 * Compared by structure, not by object identity: the two queries have
		 * different source text, so their spans differ by the width of `by ` and
		 * `toEqual` on the whole tree fails on a difference that is the point.
		 */
		const withBy = ok('from logs | sort by ts desc').stages[0]!;
		const without = ok('from logs | sort ts desc').stages[0]!;
		expect(withBy.kind === 'sort' && withBy.keys.map((k) => [sexpr(k.expr), k.direction])).toEqual(
			without.kind === 'sort' && without.keys.map((k) => [sexpr(k.expr), k.direction])
		);
	});

	it('defaults a sort direction to ascending', () => {
		const stage = ok('from logs | sort ts').stages[0]!;
		expect(stage.kind === 'sort' && stage.keys[0]!.direction).toBe('asc');
	});
});

describe('precedence', () => {
	it('binds `and` tighter than `or`', () => {
		expect(predicate('from logs | where a or b and c')).toBe('(or a (and b c))');
	});

	it('binds comparison tighter than `and`', () => {
		// The one everybody writes. If this needed parentheses the language would
		// be wrong regardless of what a precedence table says.
		expect(predicate('from logs | where a == 1 and b == 2')).toBe('(and (== a 1) (== b 2))');
	});

	it('binds `not` looser than comparison', () => {
		expect(predicate('from logs | where not a == b')).toBe('(not (== a b))');
	});

	it('binds unary minus tighter than multiplication', () => {
		expect(predicate('from logs | where -a * b > 0')).toBe('(> (* (- a) b) 0)');
	});

	it('binds multiplication tighter than addition', () => {
		expect(predicate('from logs | where a + b * c > 0')).toBe('(> (+ a (* b c)) 0)');
	});

	it('keeps subtraction left-associative', () => {
		/*
		 * The one-character bug: passing `power` instead of `power + 1` to the
		 * recursive call makes this `(- a (- b c))`, which is a different number.
		 */
		expect(predicate('from logs | where a - b - c > 0')).toBe('(> (- (- a b) c) 0)');
	});

	it('respects parentheses', () => {
		expect(predicate('from logs | where (a or b) and c')).toBe('(and (or a b) c)');
	});
});

describe('expressions', () => {
	it('parses calls, paths, lists and durations', () => {
		expect(predicate('from logs | where attributes.http.status in [500, 503]')).toBe(
			'(in attributes.http.status [500 503])'
		);
		expect(predicate('from logs | where duration > 1s')).toBe('(> duration 1000ms)');
		expect(predicate('from logs | where count() > 0')).toBe('(> (count) 0)');
	});

	it('parses an empty list', () => {
		expect(predicate('from logs | where a in []')).toBe('(in a [])');
	});
});

describe('names', () => {
	it('takes an explicit alias', () => {
		const stage = ok('from logs | summarize n = count()').stages[0]!;
		expect(stage.kind === 'summarize' && stage.aggregations[0]).toMatchObject({
			name: 'n',
			explicit: true
		});
	});

	it('infers a name from a call, a column and a path', () => {
		const stage = ok('from logs | project count(), service, attributes.http.status').stages[0]!;
		expect(stage.kind === 'project' && stage.columns.map((c) => c.name)).toEqual([
			'count',
			'service',
			'status'
		]);
	});
});

describe('errors', () => {
	it('insists on `from`', () => {
		const { errors, query } = parse('where a == 1');
		expect(query).toBeUndefined();
		expect(errors[0]!.message).toBe('A query starts with `from`');
	});

	it('names the valid sources', () => {
		const { errors } = parse('from lgos');
		expect(errors[0]!.message).toBe('Unknown source `lgos`');
		expect(errors[0]!.hint).toContain('`logs`');
	});

	it('suggests a stage by edit distance', () => {
		const { errors } = parse('from logs | wher a == 1');
		expect(errors[0]!.hint).toBe('Did you mean `where`?');
	});

	it('reports errors in later stages after one earlier fails', () => {
		/*
		 * The whole point of recovering at `|`. Without it, this reports one error
		 * and the reader fixes it only to find another — three times.
		 */
		const { errors } = parse('from logs | where ( | take x | sort');
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});

	it('points at the token that was actually wrong', () => {
		const source = 'from logs | take x';
		const { errors } = parse(source);
		expect(source.slice(errors[0]!.span.start, errors[0]!.span.end)).toBe('x');
	});

	it('says the query ended rather than naming an empty token', () => {
		const { errors } = parse('from logs | where a ==');
		expect(errors[0]!.hint).toBe('The query ends here');
	});

	it('names the likely mistake when `=` is used to compare', () => {
		/*
		 * The single most common typo in a language that has both. "Expected a
		 * value, found `=`" is accurate and makes the reader work out what a value
		 * would have been; this says what they probably meant.
		 */
		const { errors } = parse('from logs | where level = "error"');
		expect(errors[0]!.message).toBe('`=` assigns a name; it does not compare');
		expect(errors[0]!.hint).toContain('Use `==`');
	});

	it('lexes `==` as one token rather than two assignments', () => {
		// Reverse the two-char/one-char order in the lexer and every comparison in
		// the language becomes a syntax error pointing at the second `=`.
		expect(predicate('from logs | where a == b')).toBe('(== a b)');
	});

	it('formats an error with a caret under the problem', () => {
		const source = 'from logs | take x';
		const { errors } = parse(source);
		expect(errors[0]!.format(source)).toContain('                 ^');
	});
});

describe('spans', () => {
	it('covers the whole of a binary expression', () => {
		const source = 'from logs | where a == 1';
		const stage = ok(source).stages[0]!;
		if (stage.kind !== 'where') throw new Error('expected where');
		expect(source.slice(stage.predicate.span.start, stage.predicate.span.end)).toBe('a == 1');
	});

	it('covers a call including its closing paren', () => {
		const source = 'from logs | summarize percentile(duration, 95)';
		const stage = ok(source).stages[0]!;
		if (stage.kind !== 'summarize') throw new Error('expected summarize');
		const expr = stage.aggregations[0]!.expr;
		expect(source.slice(expr.span.start, expr.span.end)).toBe('percentile(duration, 95)');
	});
});
