/**
 * THE PARSER
 * ==========
 *
 * A Pratt parser: each operator has a *binding power*, and an expression is
 * parsed by taking a prefix — a number, a reference, a parenthesised group, a
 * function call, a unary minus — and then, while the next operator binds
 * tighter than the one we are inside, folding it in. Twenty lines of
 * mechanism carry the whole precedence table, and the table is the part a
 * person can read.
 *
 * THE TABLE, FROM LOOSEST TO TIGHTEST
 * -----------------------------------
 *   =  <>  <  >  <=  >=     comparison
 *   &                       text join
 *   +  -                    addition
 *   *  /                    multiplication
 *   ^                       power (right-associative: 2^3^2 is 2^9)
 *   -x  +x                  unary sign
 *   x%                      percent
 *   A1:B2                   range
 *
 * One thing in it is a decision rather than mathematics: unary minus binds
 * *tighter* than `^`, so `-2^2` is 4. That is what every spreadsheet does,
 * and a formula language that disagreed with the sheet it lives in would be
 * wrong in the way that matters — a person pasting `=-2^2` from somewhere
 * else expects the answer they got there.
 */

import type { BinaryOp, CellRef, Node, Span } from './ast.ts';
import { FormulaSyntaxError, tokenize, type Token } from './lexer.ts';

/** Left binding power of each infix operator. Higher binds tighter. */
const INFIX: Record<string, number> = {
	'=': 10,
	'<>': 10,
	'<': 10,
	'>': 10,
	'<=': 10,
	'>=': 10,
	'&': 20,
	'+': 30,
	'-': 30,
	'*': 40,
	'/': 40,
	'^': 60
};

const UNARY_BP = 70;
const PERCENT_BP = 80;

export function parse(source: string): Node {
	const tokens = tokenize(source);
	let index = 0;

	const peek = (): Token => tokens[index]!;
	const next = (): Token => tokens[index++]!;

	function expect(type: Token['type'], what: string): Token {
		const token = next();
		if (token.type !== type) {
			throw new FormulaSyntaxError(
				token.type === 'eof' ? `Expected ${what} but the formula ended` : `Expected ${what}`,
				token.start
			);
		}
		return token;
	}

	function expression(minBp: number): Node {
		let left = prefix();

		for (;;) {
			const token = peek();

			// Postfix percent binds tighter than anything but a range.
			if (token.type === 'op' && token.text === '%') {
				if (PERCENT_BP < minBp) break;
				next();
				left = { type: 'unary', op: '%', operand: left, span: span(left.span.start, token.end) };
				continue;
			}

			if (token.type !== 'op') break;
			const lbp = INFIX[token.text];
			if (lbp === undefined || lbp < minBp) break;

			next();
			// `^` is right-associative: parse its right side with the *same* power,
			// so `2^3^2` groups as `2^(3^2)`. Everything else is left-associative.
			const rbp = token.text === '^' ? lbp : lbp + 1;
			const right = expression(rbp);
			left = {
				type: 'binary',
				op: token.text as BinaryOp,
				left,
				right,
				span: span(left.span.start, right.span.end)
			};
		}

		return left;
	}

	function prefix(): Node {
		const token = next();

		switch (token.type) {
			case 'number':
				return { type: 'number', value: Number(token.text), span: span(token.start, token.end) };

			case 'string':
				return {
					type: 'string',
					value: token.text.slice(1, -1).replaceAll('""', '"'),
					span: token
				};

			case 'boolean':
				return {
					type: 'boolean',
					value: token.text.toUpperCase() === 'TRUE',
					span: span(token.start, token.end)
				};

			case 'error':
				return { type: 'error', code: token.text, span: span(token.start, token.end) };

			case 'ref':
				return reference(token);

			case 'name':
				return call(token);

			case 'lparen': {
				const inner = expression(0);
				const close = expect('rparen', '")"');
				return { ...inner, span: span(token.start, close.end) };
			}

			case 'op':
				if (token.text === '-' || token.text === '+') {
					const operand = expression(UNARY_BP);
					return {
						type: 'unary',
						op: token.text,
						operand,
						span: span(token.start, operand.span.end)
					};
				}
				throw new FormulaSyntaxError(`Unexpected "${token.text}"`, token.start);

			case 'eof':
				throw new FormulaSyntaxError('The formula ended early', token.start);

			default:
				throw new FormulaSyntaxError(`Unexpected "${token.text}"`, token.start);
		}
	}

	/** `A1`, or `A1:B2` when a colon follows. */
	function reference(token: Token): Node {
		const start = cellRef(token);
		if (peek().type !== 'colon')
			return { type: 'ref', ref: start, span: span(token.start, token.end) };

		next();
		const endToken = expect('ref', 'a cell reference after ":"');
		const end = cellRef(endToken);
		return {
			type: 'range',
			range: {
				start: { ...start, row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
				end: { ...end, row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) }
			},
			span: span(token.start, endToken.end)
		};
	}

	function call(token: Token): Node {
		if (peek().type !== 'lparen') {
			throw new FormulaSyntaxError(
				`Unknown name "${token.text}" — did you mean a function? Add "()"`,
				token.start
			);
		}
		next();
		const args: Node[] = [];
		if (peek().type !== 'rparen') {
			for (;;) {
				args.push(expression(0));
				if (peek().type === 'comma') {
					next();
					continue;
				}
				break;
			}
		}
		const close = expect('rparen', '")" to close the function');
		return {
			type: 'call',
			name: token.text.toUpperCase(),
			args,
			span: span(token.start, close.end)
		};
	}

	const root = expression(0);
	const trailing = peek();
	if (trailing.type !== 'eof') {
		throw new FormulaSyntaxError(`Unexpected "${trailing.text}"`, trailing.start);
	}
	return root;
}

/** `$B$3` → `{ row: 2, col: 1, absRow: true, absCol: true }`. */
export function cellRef(token: Token): CellRef {
	const match = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/.exec(token.text);
	if (!match) throw new FormulaSyntaxError('Not a cell reference', token.start);
	const [, dollarCol, letters, dollarRow, digits] = match;
	let col = 0;
	for (const ch of letters!.toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
	col -= 1;
	const row = Number(digits) - 1;
	if (col >= 16_384 || row >= 1_048_576) {
		throw new FormulaSyntaxError(`${token.text} is outside the sheet`, token.start);
	}
	return { row, col, absRow: dollarRow === '$', absCol: dollarCol === '$' };
}

function span(start: number, end: number): Span {
	return { start, end };
}
