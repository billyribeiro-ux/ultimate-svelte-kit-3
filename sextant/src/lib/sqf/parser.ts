/**
 * THE PARSER
 * ==========
 *
 * Recursive descent for the pipeline, **Pratt** for expressions.
 *
 * WHY PRATT
 * ---------
 * The textbook alternative is one function per precedence level — `parseOr`
 * calls `parseAnd` calls `parseComparison` calls `parseAdditive` — which works
 * and produces one function per level, each nearly identical to the last. SQF
 * has six levels, so that is six near-duplicate functions, and adding an
 * operator means inserting a seventh in the right place and rewiring its
 * neighbours.
 *
 * Pratt parsing replaces all of them with one loop and a table. `parseExpr(0)`
 * parses a prefix, then keeps absorbing infix operators while their binding
 * power exceeds the caller's. Adding an operator is a row in `INFIX`. That is
 * not merely tidier — it is the difference between precedence being *data* you
 * can print and read, and precedence being an emergent property of a call graph.
 *
 * ERROR RECOVERY
 * --------------
 * The parser never throws on the first mistake. Each stage is parsed inside a
 * try, and a failure records the error and **skips to the next `|`**, so a
 * four-stage query with a broken second stage still reports the error in the
 * fourth. That single decision is most of what makes an editor pleasant: an
 * error list that shrinks as you type beats one that reveals mistakes one at a
 * time.
 */

import {
	type Aliased,
	type BinaryOp,
	type Expr,
	type Query,
	type SortKey,
	type Source,
	type Stage,
	SOURCES
} from './ast.ts';
import { nearest, SqfError } from './errors.ts';
import { lex } from './lexer.ts';
import { joinSpans, type Span, type Token, type TokenKind } from './token.ts';

/**
 * Infix operators and their binding power.
 *
 * The whole precedence table of the language, readable top to bottom. Higher
 * binds tighter, so `a or b and c` parses as `a or (b and c)`.
 *
 * Comparison sits at 30, above `and`, so `a == 1 and b == 2` needs no
 * parentheses — which is the single most common thing anybody writes and the
 * place a language that gets precedence "technically right" (C's `&` below
 * `==`) annoys people forever.
 */
const INFIX: Readonly<Partial<Record<TokenKind, { op: BinaryOp; power: number }>>> = {
	or: { op: 'or', power: 10 },
	and: { op: 'and', power: 20 },

	'==': { op: '==', power: 30 },
	'!=': { op: '!=', power: 30 },
	'<': { op: '<', power: 30 },
	'<=': { op: '<=', power: 30 },
	'>': { op: '>', power: 30 },
	'>=': { op: '>=', power: 30 },
	'=~': { op: '=~', power: 30 },
	'!~': { op: '!~', power: 30 },
	contains: { op: 'contains', power: 30 },
	startswith: { op: 'startswith', power: 30 },
	in: { op: 'in', power: 30 },

	'+': { op: '+', power: 40 },
	'-': { op: '-', power: 40 },
	'*': { op: '*', power: 50 },
	'/': { op: '/', power: 50 }
};

/** Unary `not` binds looser than comparison, so `not a == b` is `not (a == b)`. */
const NOT_POWER = 25;
/** Unary minus binds tighter than multiplication, so `-a * b` is `(-a) * b`. */
const NEGATE_POWER = 60;

export interface ParseResult {
	/** `undefined` only when the query is so broken there is no source to name. */
	readonly query: Query | undefined;
	readonly errors: readonly SqfError[];
}

export function parse(source: string): ParseResult {
	const { tokens, errors: lexErrors } = lex(source);
	const parser = new Parser(tokens, [...lexErrors]);
	const query = parser.parseQuery();
	return { query, errors: parser.errors };
}

class Parser {
	readonly errors: SqfError[];
	readonly #tokens: readonly Token[];
	#at = 0;

	constructor(tokens: readonly Token[], errors: SqfError[]) {
		this.#tokens = tokens;
		this.errors = errors;
	}

	/* ---- token access --------------------------------------------- */

	#peek(offset = 0): Token {
		// The token array always ends with `eof`, so this is total — clamping rather
		// than returning `undefined` removes a null check from every caller.
		return this.#tokens[Math.min(this.#at + offset, this.#tokens.length - 1)]!;
	}

	#at_(kind: TokenKind): boolean {
		return this.#peek().kind === kind;
	}

	#next(): Token {
		const token = this.#peek();
		if (token.kind !== 'eof') this.#at += 1;
		return token;
	}

	#eat(kind: TokenKind): Token | null {
		return this.#at_(kind) ? this.#next() : null;
	}

	#expect(kind: TokenKind, what: string): Token {
		const token = this.#peek();
		if (token.kind === kind) return this.#next();
		throw new SqfError(`Expected ${what}`, token.span, describeFound(token));
	}

	/* ---- the query ------------------------------------------------- */

	parseQuery(): Query | undefined {
		const start = this.#peek().span;

		if (!this.#eat('from')) {
			this.errors.push(
				new SqfError('A query starts with `from`', this.#peek().span, `Try \`from logs\``)
			);
			return undefined;
		}

		const sourceToken = this.#peek();
		let source: Source = 'logs';

		if (sourceToken.kind === 'ident' && (SOURCES as readonly string[]).includes(sourceToken.text)) {
			source = sourceToken.text as Source;
			this.#next();
		} else {
			this.errors.push(
				new SqfError(
					`Unknown source ${sourceToken.text ? `\`${sourceToken.text}\`` : ''}`.trim(),
					sourceToken.span,
					`Sources are ${SOURCES.map((s) => `\`${s}\``).join(', ')}`
				)
			);
			// Carry on with `logs` so the rest of the pipeline is still checked. A
			// wrong source produces one error, not one per stage that follows it.
			if (sourceToken.kind === 'ident') this.#next();
		}

		const stages: Stage[] = [];

		while (this.#eat('|')) {
			try {
				stages.push(this.#parseStage());
			} catch (thrown) {
				if (!(thrown instanceof SqfError)) throw thrown;
				this.errors.push(thrown);
				this.#recover();
			}
		}

		if (!this.#at_('eof')) {
			const token = this.#peek();
			this.errors.push(
				new SqfError('Expected `|` before the next stage', token.span, describeFound(token))
			);
		}

		return {
			source,
			sourceSpan: sourceToken.span,
			stages,
			span: joinSpans(start, this.#peek().span)
		};
	}

	/**
	 * Skip to the start of the next stage.
	 *
	 * The recovery point is `|` and nothing else. Trying to be cleverer — resuming
	 * at the next keyword, say — produces cascading nonsense, because the token
	 * that follows a mistake is usually part of the mistake. One unambiguous
	 * synchronisation point is worth more than a clever one.
	 */
	#recover(): void {
		while (!this.#at_('|') && !this.#at_('eof')) this.#next();
	}

	/* ---- stages ---------------------------------------------------- */

	#parseStage(): Stage {
		const token = this.#peek();

		switch (token.kind) {
			case 'where': {
				this.#next();
				const predicate = this.#parseExpr(0);
				return { kind: 'where', predicate, span: joinSpans(token.span, predicate.span) };
			}

			case 'summarize':
				return this.#parseSummarize(token.span);

			case 'project': {
				this.#next();
				const columns = this.#parseAliasedList();
				return {
					kind: 'project',
					columns,
					span: joinSpans(token.span, columns.at(-1)?.span ?? token.span)
				};
			}

			case 'sort':
				return this.#parseSort(token.span);

			case 'take': {
				this.#next();
				const count = this.#expect('number', 'a row count');
				return {
					kind: 'take',
					count: Number(count.value),
					span: joinSpans(token.span, count.span)
				};
			}

			default:
				throw new SqfError(
					'Expected a stage',
					token.span,
					suggestStage(token.text) ?? 'Stages are `where`, `summarize`, `project`, `sort`, `take`'
				);
		}
	}

	#parseSummarize(start: Span): Stage {
		this.#next();

		const aggregations = this.#parseAliasedList();
		let groups: Aliased[] = [];
		let end = aggregations.at(-1)?.span ?? start;

		if (this.#eat('by')) {
			groups = this.#parseAliasedList();
			end = groups.at(-1)?.span ?? end;
		}

		return { kind: 'summarize', aggregations, groups, span: joinSpans(start, end) };
	}

	#parseSort(start: Span): Stage {
		this.#next();

		// `sort by x desc` and `sort x desc` both work. The `by` is noise that reads
		// well, and rejecting it would be pedantry aimed at people who write SQL.
		this.#eat('by');

		const keys: SortKey[] = [];
		do {
			const expr = this.#parseExpr(0);
			const direction = this.#eat('asc') ? 'asc' : this.#eat('desc') ? 'desc' : 'asc';
			keys.push({ expr, direction, span: expr.span });
		} while (this.#eat(','));

		return { kind: 'sort', keys, span: joinSpans(start, keys.at(-1)?.span ?? start) };
	}

	/**
	 * `name = expr, expr, other = expr` — a comma-separated list where the name is
	 * optional.
	 *
	 * Two tokens of lookahead: an identifier followed by `=`. That is enough
	 * because an alias is always exactly `ident =`, and nothing else in the
	 * language begins that way — `a == b` has a different second token, and a bare
	 * `a` is a column reference.
	 */
	#parseAliasedList(): Aliased[] {
		const items: Aliased[] = [];

		do {
			const start = this.#peek();

			if (start.kind === 'ident' && this.#peek(1).kind === '=') {
				const name = this.#next().text;
				this.#next();
				const expr = this.#parseExpr(0);
				items.push({ name, expr, span: joinSpans(start.span, expr.span), explicit: true });
				continue;
			}

			const expr = this.#parseExpr(0);
			items.push({ name: inferName(expr), expr, span: expr.span, explicit: false });
		} while (this.#eat(','));

		return items;
	}

	/* ---- expressions: the Pratt loop -------------------------------- */

	/**
	 * Parse an expression whose operators bind at least as tightly as `minPower`.
	 *
	 * The whole of precedence, in eight lines. Read it once and the six functions
	 * it replaces stop being tempting.
	 */
	#parseExpr(minPower: number): Expr {
		let left = this.#parsePrefix();

		for (;;) {
			/*
			 * `=` in operator position.
			 *
			 * This case belongs *here*, not in `#parsePrefix`, and getting that wrong
			 * is instructive: `where level = "error"` never reaches the prefix parser
			 * with a `=`, because `level` is consumed first and the `=` is then in
			 * infix position. A guard in the prefix parser looks right, compiles, and
			 * never fires — the query instead fails much later with "Expected `|`
			 * before the next stage", which points at the wrong thing entirely.
			 *
			 * The rule: put the error where the token actually appears.
			 */
			if (this.#at_('=')) {
				throw new SqfError(
					'`=` assigns a name; it does not compare',
					this.#peek().span,
					'Use `==` to compare, or write this in `summarize`/`project` where a name is allowed'
				);
			}

			const entry = INFIX[this.#peek().kind];
			if (!entry || entry.power < minPower) return left;

			this.#next();

			// Left-associative: the right operand must bind *strictly* tighter, so
			// `a - b - c` is `(a - b) - c` and not `a - (b - c)`. Passing `power`
			// rather than `power + 1` makes subtraction right-associative and the
			// arithmetic wrong, which is a one-character bug with a wrong answer.
			const right = this.#parseExpr(entry.power + 1);
			left = { kind: 'binary', op: entry.op, left, right, span: joinSpans(left.span, right.span) };
		}
	}

	#parsePrefix(): Expr {
		const token = this.#peek();

		switch (token.kind) {
			case 'not': {
				this.#next();
				const operand = this.#parseExpr(NOT_POWER);
				return { kind: 'unary', op: 'not', operand, span: joinSpans(token.span, operand.span) };
			}

			case '-': {
				this.#next();
				const operand = this.#parseExpr(NEGATE_POWER);
				return { kind: 'unary', op: '-', operand, span: joinSpans(token.span, operand.span) };
			}

			case 'number':
				this.#next();
				return { kind: 'literal', value: Number(token.value), span: token.span };

			case 'duration':
				this.#next();
				return { kind: 'duration', ms: Number(token.value), span: token.span };

			case 'string':
				this.#next();
				return { kind: 'literal', value: String(token.value), span: token.span };

			case 'true':
			case 'false':
				this.#next();
				return { kind: 'literal', value: token.kind === 'true', span: token.span };

			case 'null':
				this.#next();
				return { kind: 'literal', value: null, span: token.span };

			case '(': {
				this.#next();
				const inner = this.#parseExpr(0);
				this.#expect(')', 'a closing `)`');
				return inner;
			}

			case '[': {
				this.#next();
				const items: Expr[] = [];
				if (!this.#at_(']')) {
					do {
						items.push(this.#parseExpr(0));
					} while (this.#eat(','));
				}
				const close = this.#expect(']', 'a closing `]`');
				return { kind: 'list', items, span: joinSpans(token.span, close.span) };
			}

			case 'ident':
				return this.#parseIdent();

			/*
			 * `=` where a value belongs is almost always `==` typed with one hand.
			 *
			 * Falling through to "Expected a value, found `=`" is technically correct
			 * and makes the reader work out what a value would have been. Naming the
			 * likely mistake costs one case and is the difference between an error
			 * that helps and one that is merely accurate.
			 */
			case '=':
				throw new SqfError(
					'`=` assigns a name; it does not compare',
					token.span,
					'Use `==` to compare, or write this in `summarize`/`project` where a name is allowed'
				);

			default:
				throw new SqfError('Expected a value', token.span, describeFound(token));
		}
	}

	/** An identifier: a call, a dotted path, or a bare column. */
	#parseIdent(): Expr {
		const first = this.#next();

		if (this.#at_('(')) {
			this.#next();
			const args: Expr[] = [];
			if (!this.#at_(')')) {
				do {
					args.push(this.#parseExpr(0));
				} while (this.#eat(','));
			}
			const close = this.#expect(')', 'a closing `)`');
			return { kind: 'call', name: first.text, args, span: joinSpans(first.span, close.span) };
		}

		if (this.#at_('.')) {
			const parts: string[] = [];
			let end = first.span;
			while (this.#eat('.')) {
				const part = this.#expect('ident', 'an attribute name');
				parts.push(part.text);
				end = part.span;
			}
			return { kind: 'path', root: first.text, parts, span: joinSpans(first.span, end) };
		}

		return { kind: 'column', name: first.text, span: first.span };
	}
}

/* ------------------------------------------------------------------ */
/* Naming and messages                                                 */
/* ------------------------------------------------------------------ */

/**
 * The name an unaliased output gets.
 *
 * `count()` becomes `count`, `service` stays `service`, `attributes.http.status`
 * becomes `status` — the last segment, which is what a person would have called
 * it. Anything else gets a positional name, and the checker's collision message
 * tells them to name it.
 */
function inferName(expr: Expr): string {
	switch (expr.kind) {
		case 'column':
			return expr.name;
		case 'path':
			return expr.parts.at(-1) ?? expr.root;
		case 'call':
			return expr.name;
		default:
			return 'value';
	}
}

const STAGE_NAMES = ['where', 'summarize', 'project', 'sort', 'take'];

function suggestStage(text: string): string | undefined {
	const guess = nearest(text, STAGE_NAMES);
	return guess ? `Did you mean \`${guess}\`?` : undefined;
}

/** "found `foo`" / "found end of query" — the second half of every parse error. */
function describeFound(token: Token): string {
	return token.kind === 'eof' ? 'The query ends here' : `Found \`${token.text}\``;
}
