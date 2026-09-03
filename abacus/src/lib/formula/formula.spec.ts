import { describe, expect, it } from 'vitest';
import { key } from '#lib/sheet/address.ts';
import { references } from './ast.ts';
import { evaluate, type Context } from './evaluate.ts';
import { FUNCTION_NAMES } from './functions.ts';
import { FormulaSyntaxError, tokenize } from './lexer.ts';
import { parse } from './parser.ts';
import { ErrorValue, type Scalar } from './values.ts';

/**
 * The language, tested without a sheet. A `Map` stands in for the grid, the
 * clock is fixed at a known instant, and RAND always returns the same number,
 * so every test here is deterministic and runs in a millisecond.
 */

function context(cells: Record<string, Scalar> = {}): Context {
	const map = new Map<number, Scalar>();
	for (const [a1, value] of Object.entries(cells)) {
		const m = /^([A-Z]+)(\d+)$/.exec(a1)!;
		let col = 0;
		for (const ch of m[1]!) col = col * 26 + (ch.charCodeAt(0) - 64);
		map.set(key(Number(m[2]) - 1, col - 1), value);
	}
	return {
		cell: (row, col) => map.get(key(row, col)) ?? null,
		now: () => new Date(Date.UTC(2026, 8, 2, 12, 30)),
		random: () => 0.25,
		locale: 'en-US'
	};
}

const run = (source: string, cells?: Record<string, Scalar>) =>
	evaluate(parse(source), context(cells));

describe('the lexer', () => {
	it('tokenises a formula with spans', () => {
		const tokens = tokenize('SUM(A1:B2) * 1.5');
		expect(tokens.map((t) => t.type)).toEqual([
			'name',
			'lparen',
			'ref',
			'colon',
			'ref',
			'rparen',
			'op',
			'number',
			'eof'
		]);
		expect(tokens[2]).toMatchObject({ text: 'A1', start: 4, end: 6 });
	});

	it('tells references from names and booleans', () => {
		const types = (s: string) =>
			tokenize(s)
				.map((t) => t.type)
				.slice(0, -1);
		expect(types('A1')).toEqual(['ref']);
		expect(types('$A$1')).toEqual(['ref']);
		expect(types('SUM1')).toEqual(['ref']); // column SUM exists
		expect(types('SUM')).toEqual(['name']);
		expect(types('true')).toEqual(['boolean']);
		expect(types('AAAA1')).toEqual(['name']); // four letters is not a column
	});

	it('reads strings with doubled quotes and numbers with exponents', () => {
		expect(tokenize('"say ""hi"""')[0]!.text).toBe('"say ""hi"""');
		expect(tokenize('1.5e3')[0]!.text).toBe('1.5e3');
		expect(tokenize('.5')[0]!.text).toBe('.5');
	});

	it('refuses what it cannot read, with a position', () => {
		expect(() => tokenize('1 + "open')).toThrow(FormulaSyntaxError);
		expect(() => tokenize('1 ~ 2')).toThrow(/Unexpected character "~"/);
		try {
			tokenize('1 ~ 2');
		} catch (e) {
			expect((e as FormulaSyntaxError).position).toBe(2);
		}
	});
});

describe('the parser', () => {
	it('follows the precedence table', () => {
		expect(run('1 + 2 * 3')).toBe(7);
		expect(run('(1 + 2) * 3')).toBe(9);
		expect(run('2 ^ 3 ^ 2')).toBe(512);
		expect(run('-2 ^ 2')).toBe(4); // the spreadsheet rule, not the maths one
		expect(run('10 - 2 - 3')).toBe(5);
		expect(run('50%')).toBe(0.5);
		expect(run('200 * 10%')).toBe(20);
		expect(run('"a" & 1 & TRUE')).toBe('a1TRUE');
		expect(run('1 + 1 = 2')).toBe(true);
		expect(run('1 & 2 = "12"')).toBe(true);
	});

	it('normalises ranges given backwards', () => {
		const node = parse('B2:A1');
		expect(node.type).toBe('range');
		if (node.type === 'range') {
			expect(node.range.start).toMatchObject({ row: 0, col: 0 });
			expect(node.range.end).toMatchObject({ row: 1, col: 1 });
		}
	});

	it('lists references in source order, with spans', () => {
		const refs = references(parse('A1 + SUM(B2:C3) * $D$4'));
		expect(refs).toHaveLength(3);
		expect(refs[0]!.span).toEqual({ start: 0, end: 2 });
		expect(refs[2]!.ref).toMatchObject({ row: 3, col: 3, absRow: true, absCol: true });
	});

	it('reports syntax errors where they are', () => {
		const at = (s: string) => {
			try {
				parse(s);
			} catch (e) {
				return (e as FormulaSyntaxError).position;
			}
			return -1;
		};
		expect(at('1 +')).toBe(3);
		expect(at('SUM(1')).toBe(5);
		expect(at('1 2')).toBe(2);
		expect(at('FOO')).toBe(0);
		expect(at('A1:5')).toBe(3);
	});
});

describe('the evaluator', () => {
	it('reads cells and ranges through the context', () => {
		const cells = { A1: 1, A2: 2, A3: 'three', B1: 10 };
		expect(run('A1 + A2', cells)).toBe(3);
		expect(run('SUM(A1:A3)', cells)).toBe(3);
		expect(run('SUM(A1:B1)', cells)).toBe(11);
		expect(run('A9', cells)).toBeNull();
		expect(run('A9 + 1', cells)).toBe(1);
	});

	it('coerces the way spreadsheets do', () => {
		expect(run('"3" + 1')).toBe(4);
		expect(run('TRUE + 1')).toBe(2);
		expect(run('"3%" * 100')).toBe(3);
		expect(run('"x" + 1')).toBeInstanceOf(ErrorValue);
		expect((run('"x" + 1') as ErrorValue).code).toBe('#VALUE!');
		expect(run('1 = "1"')).toBe(false); // numbers sort before text
		expect(run('"B" > "a"')).toBe(true); // case-insensitive
		expect(run('2 < "a"')).toBe(true);
	});

	it('propagates errors and names the operator faults', () => {
		expect((run('1 / 0') as ErrorValue).code).toBe('#DIV/0!');
		expect((run('NOPE(1)') as ErrorValue).code).toBe('#NAME?');
		expect((run('SUM()') as ErrorValue).code).toBe('#VALUE!');
		expect((run('#N/A') as ErrorValue).code).toBe('#N/A');
		expect((run('1 + #REF!') as ErrorValue).code).toBe('#REF!');
		expect((run('SUM(A1:A2)', { A1: 1, A2: new ErrorValue('#DIV/0!') }) as ErrorValue).code).toBe(
			'#DIV/0!'
		);
	});

	it('evaluates IF lazily and IFERROR protectively', () => {
		expect(run('IF(TRUE, 1, 1/0)')).toBe(1);
		expect(run('IF(FALSE, 1/0, 2)')).toBe(2);
		expect(run('IF(0, 1)')).toBe(false);
		expect(run('IFERROR(1/0, "safe")')).toBe('safe');
		expect(run('IFERROR(5, "safe")')).toBe(5);
		expect(run('ISERROR(1/0)')).toBe(true);
	});

	it('covers the statistics', () => {
		const cells = { A1: 4, A2: 8, A3: 'skip', A4: null, A5: 2 };
		expect(run('AVERAGE(A1:A5)', cells)).toBeCloseTo(14 / 3);
		expect(run('MEDIAN(A1:A5)', cells)).toBe(4);
		expect(run('MIN(A1:A5)', cells)).toBe(2);
		expect(run('MAX(A1:A5)', cells)).toBe(8);
		expect(run('COUNT(A1:A5)', cells)).toBe(3);
		expect(run('COUNTA(A1:A5)', cells)).toBe(4);
		expect(run('COUNTBLANK(A1:A5)', cells)).toBe(1);
		expect(run('PRODUCT(A1, A2)', cells)).toBe(32);
		expect((run('AVERAGE(A3:A4)', cells) as ErrorValue).code).toBe('#DIV/0!');
	});

	it('understands criteria', () => {
		const cells = {
			A1: 5,
			A2: 12,
			A3: 'done',
			A4: 'Doing',
			A5: 7,
			B1: 1,
			B2: 2,
			B3: 3,
			B4: 4,
			B5: 5
		};
		expect(run('COUNTIF(A1:A5, ">6")', cells)).toBe(2);
		expect(run('COUNTIF(A1:A5, "do*")', cells)).toBe(2);
		expect(run('COUNTIF(A1:A5, "<>done")', cells)).toBe(4);
		expect(run('COUNTIF(A1:A5, 5)', cells)).toBe(1);
		expect(run('SUMIF(A1:A5, ">6")', cells)).toBe(19);
		expect(run('SUMIF(A1:A5, "d?ne", B1:B5)', cells)).toBe(3);
	});

	it('rounds like a spreadsheet, not like JavaScript', () => {
		expect(run('ROUND(2.5)')).toBe(3);
		expect(run('ROUND(-2.5)')).toBe(-3);
		expect(run('ROUND(1.005, 2)')).toBe(1.01);
		expect(run('ROUNDUP(1.001, 2)')).toBe(1.01);
		expect(run('ROUNDDOWN(-1.999, 2)')).toBe(-1.99);
		expect(run('INT(-1.5)')).toBe(-2);
		expect(run('MOD(-7, 3)')).toBe(2);
		expect(run('0.1 + 0.2 = 0.3')).toBe(false); // floats are floats…
		expect(run('TEXT(0.1 + 0.2, "0.0")')).toBe('0.3'); // …until they are shown
	});

	it('handles text', () => {
		expect(run('LEN("héllo")')).toBe(5);
		expect(run('UPPER("a") & LOWER("B")')).toBe('Ab');
		expect(run('TRIM("  a   b ")')).toBe('a b');
		expect(run('LEFT("hello", 2) & RIGHT("hello", 2) & MID("hello", 2, 3)')).toBe('heloell');
		expect(run('REPT("ab", 3)')).toBe('ababab');
		expect(run('FIND("l", "hello")')).toBe(3);
		expect((run('FIND("z", "hello")') as ErrorValue).code).toBe('#VALUE!');
		expect(run('SUBSTITUTE("a-b-c", "-", "+")')).toBe('a+b+c');
		expect(run('CONCAT(A1:A3)', { A1: 'x', A2: 1, A3: true })).toBe('x1TRUE');
		expect(run('VALUE("12.5")')).toBe(12.5);
		expect(run('TEXT(1234.5, "#,##0.00")')).toBe('1,234.50');
		expect(run('TEXT(0.256, "0%")')).toBe('26%');
		expect(run('TEXT(DATE(2026, 9, 2), "yyyy-mm-dd")')).toBe('2026-09-02');
	});

	it('does dates as serial numbers', () => {
		expect(run('DATE(2026, 9, 2)')).toBe(46267);
		expect(run('DATE(2026, 13, 1)')).toBe(run('DATE(2027, 1, 1)'));
		expect(
			run('YEAR(DATE(2026, 9, 2)) & "-" & MONTH(DATE(2026, 9, 2)) & "-" & DAY(DATE(2026, 9, 2))')
		).toBe('2026-9-2');
		expect(run('TODAY()')).toBe(46267);
		expect(run('NOW() - TODAY()')).toBeCloseTo(12.5 / 24, 6);
		expect(run('WEEKDAY(DATE(2026, 9, 2))')).toBe(4); // a Wednesday
		expect(run('DAYS(DATE(2026, 9, 9), DATE(2026, 9, 2))')).toBe(7);
	});

	it('looks things up', () => {
		const cells = {
			A1: 'apple',
			B1: 3,
			C1: 'red',
			A2: 'pear',
			B2: 5,
			C2: 'green',
			A3: 'plum',
			B3: 8,
			C3: 'purple'
		};
		expect(run('VLOOKUP("pear", A1:C3, 3)', cells)).toBe('green');
		expect(run('VLOOKUP("PEAR", A1:C3, 2)', cells)).toBe(5);
		expect((run('VLOOKUP("kiwi", A1:C3, 2)', cells) as ErrorValue).code).toBe('#N/A');
		expect((run('VLOOKUP("pear", A1:C3, 4)', cells) as ErrorValue).code).toBe('#REF!');
		expect(run('HLOOKUP(5, A2:C3, 2)', cells)).toBe(8);
		expect(run('MATCH("plum", A1:A3)', cells)).toBe(3);
		expect(run('INDEX(A1:C3, 2, 3)', cells)).toBe('green');
		expect(run('INDEX(A1:C3, MATCH("plum", A1:A3, 0), 2)', cells)).toBe(8);
		expect(run('CHOOSE(2, "a", "b", "c")')).toBe('b');
	});

	it('uses the injected clock and randomness', () => {
		expect(run('RAND()')).toBe(0.25);
		expect(run('RANDBETWEEN(1, 4)')).toBe(2);
		expect(run('RANDBETWEEN(10, 10)')).toBe(10);
	});

	it('documents every function', () => {
		expect(FUNCTION_NAMES.length).toBeGreaterThanOrEqual(50);
		expect(FUNCTION_NAMES).toContain('VLOOKUP');
	});
});
