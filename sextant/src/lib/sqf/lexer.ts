/**
 * THE LEXER
 * =========
 *
 * Source text to tokens. A hand-written scanner rather than a regular expression
 * per token kind, for two reasons that both come down to error messages.
 *
 * A regex-based lexer that fails to match anything can only say "unexpected
 * character" and point at one position. A scanner that knows it is halfway
 * through a string literal can say "unterminated string, opened here" and point
 * at the quote — which is the difference between a message that helps and one
 * that makes you count characters.
 *
 * The second reason is that two of SQF's token kinds are context-sensitive in a
 * way regexes handle badly. `5m` is a duration and `5` followed by the column
 * `m` is not; `1.5` is a number and `svc.name` is two idents around a dot. Both
 * are one lookahead in a scanner and a mess of negative lookbehind in a regex.
 *
 * The lexer NEVER throws for an unknown character. It emits nothing for it and
 * records an error, then keeps going — so a query with three mistakes reports
 * three, not the first one and then silence. Recovery is the whole reason a
 * language front end is pleasant to use rather than merely correct.
 */

import { SqfError } from './errors.ts';
import { KEYWORDS, type Span, type Token, type TokenKind } from './token.ts';

/** Milliseconds per duration suffix. Longest suffix first — see `readDuration`. */
const DURATION_UNITS: readonly (readonly [suffix: string, ms: number])[] = [
	['ms', 1],
	['s', 1_000],
	['m', 60_000],
	['h', 3_600_000],
	['d', 86_400_000],
	['w', 604_800_000]
];

export interface LexResult {
	readonly tokens: readonly Token[];
	/** Everything the scanner could not make sense of. Empty on a clean lex. */
	readonly errors: readonly SqfError[];
}

export function lex(source: string): LexResult {
	const tokens: Token[] = [];
	const errors: SqfError[] = [];

	let at = 0;

	const peek = (offset = 0): string => source[at + offset] ?? '';
	const span = (start: number): Span => ({ start, end: at });

	const push = (kind: TokenKind, start: number, value?: string | number): void => {
		tokens.push({ kind, text: source.slice(start, at), value, span: span(start) });
	};

	while (at < source.length) {
		const start = at;
		const char = peek();

		/* ---- whitespace and comments ---------------------------------- */

		if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
			at += 1;
			continue;
		}

		// `// to end of line`. No block comments: they need nesting rules to be
		// useful and a query is rarely long enough to want one.
		if (char === '/' && peek(1) === '/') {
			while (at < source.length && peek() !== '\n') at += 1;
			continue;
		}

		/* ---- numbers and durations ------------------------------------ */

		if (isDigit(char)) {
			at = readNumberBody(source, at);
			const digits = source.slice(start, at);

			const unit = readDurationUnit(source, at);
			if (unit) {
				at += unit.suffix.length;
				push('duration', start, Number(digits) * unit.ms);
			} else {
				push('number', start, Number(digits));
			}
			continue;
		}

		/* ---- strings --------------------------------------------------- */

		if (char === '"' || char === "'") {
			const quote = char;
			at += 1;
			let value = '';
			let terminated = false;

			while (at < source.length) {
				const current = peek();

				if (current === '\\') {
					const escape = peek(1);
					const decoded = ESCAPES[escape];
					if (decoded === undefined) {
						errors.push(
							new SqfError(
								`Unknown escape \\${escape}`,
								{ start: at, end: at + 2 },
								`Valid escapes are ${Object.keys(ESCAPES)
									.map((e) => '\\' + e)
									.join(', ')}`
							)
						);
						// Keep the character as itself and carry on, so one bad escape does
						// not turn the rest of the query into string contents.
						value += escape;
					} else {
						value += decoded;
					}
					at += 2;
					continue;
				}

				if (current === quote) {
					at += 1;
					terminated = true;
					break;
				}

				/*
				 * A newline inside a string is almost always a missing closing quote
				 * rather than a deliberate multi-line literal.
				 *
				 * Stopping here means the error points at the quote that was never
				 * closed, and the next line lexes normally. Consuming to the end of the
				 * file instead — which is what a naive loop does — swallows the rest of
				 * the query and reports one error at the very end, which tells you
				 * nothing about where the mistake is.
				 */
				if (current === '\n') break;

				value += current;
				at += 1;
			}

			if (!terminated) {
				errors.push(
					new SqfError('Unterminated string', { start, end: at }, `Add a closing ${quote}`)
				);
			}

			push('string', start, value);
			continue;
		}

		/* ---- identifiers and keywords ---------------------------------- */

		if (isIdentStart(char)) {
			while (at < source.length && isIdentPart(peek())) at += 1;
			const text = source.slice(start, at);
			push(KEYWORDS[text] ?? 'ident', start, text);
			continue;
		}

		/* ---- operators and punctuation --------------------------------- */

		const two = source.slice(at, at + 2);
		if (TWO_CHAR.has(two)) {
			at += 2;
			push(two as TokenKind, start);
			continue;
		}

		if (ONE_CHAR.has(char)) {
			at += 1;
			push(char as TokenKind, start);
			continue;
		}

		/*
		 * Unknown character.
		 *
		 * Recorded, skipped, and lexing continues. A single stray `$` should not
		 * cost you the eleven other errors in the query.
		 */
		at += 1;
		errors.push(new SqfError(`Unexpected character ${JSON.stringify(char)}`, span(start)));
	}

	tokens.push({ kind: 'eof', text: '', span: { start: source.length, end: source.length } });
	return { tokens, errors };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ESCAPES: Readonly<Record<string, string>> = {
	n: '\n',
	t: '\t',
	r: '\r',
	'\\': '\\',
	'"': '"',
	"'": "'"
};

const TWO_CHAR = new Set(['==', '!=', '<=', '>=', '=~', '!~']);
/*
 * `=` is in here and `==` is in `TWO_CHAR`, and the two-character set is tested
 * first. Reverse that order and `==` lexes as two assignments, every comparison
 * in the language becomes a syntax error, and the message points at the second
 * `=` rather than at anything a person did wrong.
 */
const ONE_CHAR = new Set(['=', '<', '>', '+', '-', '*', '/', '(', ')', '[', ']', ',', '.', '|']);

function isDigit(char: string): boolean {
	return char >= '0' && char <= '9';
}

function isIdentStart(char: string): boolean {
	return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
}

function isIdentPart(char: string): boolean {
	return isIdentStart(char) || isDigit(char);
}

/**
 * Consume digits, and at most one decimal point that is followed by a digit.
 *
 * The lookahead on the point is what makes `svc.name` two identifiers around a
 * dot while `1.5` is one number — and, less obviously, what makes `count.` at
 * the end of a line lex as a number and a dot rather than as an invalid number
 * whose error mentions a decimal point the person never typed.
 */
function readNumberBody(source: string, from: number): number {
	let at = from;
	while (at < source.length && isDigit(source[at]!)) at += 1;

	if (source[at] === '.' && isDigit(source[at + 1] ?? '')) {
		at += 1;
		while (at < source.length && isDigit(source[at]!)) at += 1;
	}

	return at;
}

/**
 * The duration suffix immediately after a number, if there is one.
 *
 * Order matters in `DURATION_UNITS`: `ms` must be tested before `m`, or `5ms`
 * lexes as five minutes followed by the identifier `s`. That is a real bug, it
 * is off by a factor of sixty thousand, and it produces a query that runs
 * perfectly and returns the wrong window.
 *
 * The suffix must not be followed by another identifier character, so `5min` is
 * a number and the identifier `min` rather than five minutes and a stray `in`
 * keyword — which would otherwise parse, because `in` is an operator.
 */
function readDurationUnit(source: string, at: number): { suffix: string; ms: number } | null {
	for (const [suffix, ms] of DURATION_UNITS) {
		if (!source.startsWith(suffix, at)) continue;
		if (isIdentPart(source[at + suffix.length] ?? '')) continue;
		return { suffix, ms };
	}
	return null;
}
