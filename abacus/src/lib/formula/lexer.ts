/**
 * THE LEXER
 * =========
 *
 * Turns `SUM(A1:B2)*1.1` into tokens: a name, a paren, a reference, a colon,
 * a reference, a paren, an operator, a number. Each token remembers where it
 * started and ended, so a syntax error can point at a character and the
 * formula bar can colour a reference.
 *
 * WHAT IS A REFERENCE AND WHAT IS A NAME
 * --------------------------------------
 * `A1` is a cell; `SUM` is a function; `TRUE` is a boolean; `SUM1` is a cell
 * (column SUM, row 1 — a real column, since columns run to XFD). The rule is
 * the one spreadsheets use: letters-then-digits with at most three letters is
 * a reference, and everything else that starts with a letter is a name.
 *
 * Numbers use `.` for the decimal point and functions use `,` between
 * arguments, whatever the person's locale — the formula language is the
 * same everywhere, and it is *values typed into cells* that are localised
 * (see `src/lib/sheet/locale.ts`).
 */

export type TokenType =
	| 'number'
	| 'string'
	| 'boolean'
	| 'error'
	| 'ref'
	| 'name'
	| 'op'
	| 'lparen'
	| 'rparen'
	| 'comma'
	| 'colon'
	| 'eof';

export interface Token {
	type: TokenType;
	text: string;
	start: number;
	end: number;
}

export class FormulaSyntaxError extends Error {
	constructor(
		message: string,
		readonly position: number
	) {
		super(message);
		this.name = 'FormulaSyntaxError';
	}
}

const REF = /^\$?[A-Za-z]{1,3}\$?\d{1,7}$/;
const ERROR_LITERALS = [
	'#DIV/0!',
	'#REF!',
	'#NAME?',
	'#VALUE!',
	'#CYCLE!',
	'#N/A',
	'#NUM!',
	'#ERROR!'
];
const TWO_CHAR_OPS = ['<>', '<=', '>='];
const ONE_CHAR_OPS = '+-*/^&=<>%';

export function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	const push = (type: TokenType, start: number, end: number) =>
		tokens.push({ type, text: source.slice(start, end), start, end });

	while (i < source.length) {
		const ch = source[i]!;

		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i += 1;
			continue;
		}

		// A number: digits, an optional fraction, an optional exponent. `.5` is
		// allowed; `5.` is allowed; `1e3` is allowed. `1.2.3` is two tokens and a
		// syntax error at the parser, which is where it can say so clearly.
		if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
			const start = i;
			while (i < source.length && /[0-9]/.test(source[i]!)) i += 1;
			if (source[i] === '.') {
				i += 1;
				while (i < source.length && /[0-9]/.test(source[i]!)) i += 1;
			}
			if ((source[i] === 'e' || source[i] === 'E') && /[0-9+-]/.test(source[i + 1] ?? '')) {
				i += 1;
				if (source[i] === '+' || source[i] === '-') i += 1;
				if (!/[0-9]/.test(source[i] ?? ''))
					throw new FormulaSyntaxError('Expected digits after the exponent', i);
				while (i < source.length && /[0-9]/.test(source[i]!)) i += 1;
			}
			push('number', start, i);
			continue;
		}

		// A string: double quotes, with `""` for a literal quote.
		if (ch === '"') {
			const start = i;
			i += 1;
			for (;;) {
				if (i >= source.length) throw new FormulaSyntaxError('Unterminated string', start);
				if (source[i] === '"') {
					if (source[i + 1] === '"') {
						i += 2;
						continue;
					}
					i += 1;
					break;
				}
				i += 1;
			}
			push('string', start, i);
			continue;
		}

		// An error literal, typed as a value: `=#N/A` or `=IFERROR(#REF!, 0)`.
		if (ch === '#') {
			const literal = ERROR_LITERALS.find((e) => source.startsWith(e, i));
			if (!literal) throw new FormulaSyntaxError('Unknown error value', i);
			push('error', i, i + literal.length);
			i += literal.length;
			continue;
		}

		// A reference, a boolean or a name.
		if (ch === '$' || /[A-Za-z_]/.test(ch)) {
			const start = i;
			while (i < source.length && /[A-Za-z0-9_$.]/.test(source[i]!)) i += 1;
			const text = source.slice(start, i);
			const upper = text.toUpperCase();
			if (upper === 'TRUE' || upper === 'FALSE') push('boolean', start, i);
			else if (REF.test(text)) push('ref', start, i);
			else push('name', start, i);
			continue;
		}

		const two = source.slice(i, i + 2);
		if (TWO_CHAR_OPS.includes(two)) {
			push('op', i, i + 2);
			i += 2;
			continue;
		}
		if (ONE_CHAR_OPS.includes(ch)) {
			push('op', i, i + 1);
			i += 1;
			continue;
		}
		if (ch === '(') {
			push('lparen', i, i + 1);
			i += 1;
			continue;
		}
		if (ch === ')') {
			push('rparen', i, i + 1);
			i += 1;
			continue;
		}
		if (ch === ',') {
			push('comma', i, i + 1);
			i += 1;
			continue;
		}
		if (ch === ':') {
			push('colon', i, i + 1);
			i += 1;
			continue;
		}

		throw new FormulaSyntaxError(`Unexpected character "${ch}"`, i);
	}

	tokens.push({ type: 'eof', text: '', start: source.length, end: source.length });
	return tokens;
}
