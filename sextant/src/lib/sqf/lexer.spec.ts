import { describe, expect, it } from 'vitest';
import { lex } from './lexer.ts';
import type { TokenKind } from './token.ts';

/** Kinds only, without the trailing eof, for terse structural assertions. */
function kinds(source: string): TokenKind[] {
	return lex(source)
		.tokens.slice(0, -1)
		.map((token) => token.kind);
}

function values(source: string): unknown[] {
	return lex(source)
		.tokens.slice(0, -1)
		.map((token) => token.value);
}

describe('the shape of a query', () => {
	it('lexes a realistic pipeline', () => {
		expect(kinds('from logs | where level == "error" | take 100')).toEqual([
			'from',
			'ident',
			'|',
			'where',
			'ident',
			'==',
			'string',
			'|',
			'take',
			'number'
		]);
	});

	it('always ends with eof, even for an empty query', () => {
		expect(lex('').tokens.map((t) => t.kind)).toEqual(['eof']);
		expect(lex('   \n  ').tokens.map((t) => t.kind)).toEqual(['eof']);
	});
});

describe('durations', () => {
	it('decodes every unit to milliseconds', () => {
		expect(values('1ms 1s 1m 1h 1d 1w')).toEqual([
			1, 1_000, 60_000, 3_600_000, 86_400_000, 604_800_000
		]);
	});

	it('reads ms before m', () => {
		/*
		 * The bug this pins: with the units tested in the wrong order, `5ms` lexes
		 * as five *minutes* followed by the identifier `s`. It parses, it runs, and
		 * the answer is off by a factor of sixty thousand.
		 */
		expect(kinds('5ms')).toEqual(['duration']);
		expect(values('5ms')).toEqual([5]);
	});

	it('does not treat a longer word as a unit', () => {
		// `5min` is a number and an identifier, not five minutes and a stray `in`.
		expect(kinds('5min')).toEqual(['number', 'ident']);
	});
});

describe('numbers against the dot operator', () => {
	it('reads a decimal point only when a digit follows it', () => {
		expect(kinds('1.5')).toEqual(['number']);
		expect(values('1.5')).toEqual([1.5]);
	});

	it('leaves a member access alone', () => {
		expect(kinds('svc.name')).toEqual(['ident', '.', 'ident']);
	});

	it('leaves a trailing dot as a dot', () => {
		// What you have typed halfway through `count.`; it must not become an error
		// about a malformed decimal.
		expect(kinds('1.')).toEqual(['number', '.']);
	});
});

describe('strings', () => {
	it('decodes escapes', () => {
		expect(values(String.raw`"a\nb\tc\\d\"e"`)).toEqual(['a\nb\tc\\d"e']);
	});

	it('accepts both quote styles', () => {
		expect(values(`"double" 'single'`)).toEqual(['double', 'single']);
	});

	it('reports an unterminated string at the opening quote', () => {
		const { errors } = lex('where msg == "oops');
		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toBe('Unterminated string');
		// The caret points at the quote that was never closed, not at end-of-input.
		expect(errors[0]!.span.start).toBe(13);
	});

	it('stops an unterminated string at the newline', () => {
		/*
		 * Without this, one missing quote swallows the rest of the query and the
		 * only error is reported at the very end — which says nothing about where
		 * the mistake actually is.
		 */
		const { tokens, errors } = lex('where a == "oops\n| take 10');
		expect(errors).toHaveLength(1);
		expect(tokens.map((t) => t.kind)).toContain('take');
	});

	it('keeps going after a bad escape', () => {
		const { tokens, errors } = lex(String.raw`"a\qb" | take 1`);
		expect(errors[0]!.message).toBe('Unknown escape \\q');
		expect(tokens[0]!.value).toBe('aqb');
		expect(tokens.map((t) => t.kind)).toContain('take');
	});
});

describe('recovery', () => {
	it('reports every unknown character rather than stopping at the first', () => {
		const { errors } = lex('a $ b £ c');
		expect(errors).toHaveLength(2);
	});

	it('still produces the tokens either side of the damage', () => {
		expect(kinds('a $ b')).toEqual(['ident', 'ident']);
	});
});

describe('positions', () => {
	it('spans the exact source text of every token', () => {
		const source = 'where level == "error"';
		for (const token of lex(source).tokens.slice(0, -1)) {
			expect(source.slice(token.span.start, token.span.end)).toBe(token.text);
		}
	});

	it('puts eof at the end of the input', () => {
		const source = 'take 5';
		const eof = lex(source).tokens.at(-1)!;
		expect(eof.span).toEqual({ start: source.length, end: source.length });
	});
});

describe('comments', () => {
	it('ignores a line comment', () => {
		expect(kinds('take 5 // everything after this')).toEqual(['take', 'number']);
	});

	it('does not eat the next line', () => {
		expect(kinds('// note\ntake 5')).toEqual(['take', 'number']);
	});
});
