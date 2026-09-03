import { describe, expect, it } from 'vitest';
import { CsvParser, detectDelimiter, escapeField, parseCsv, rowToCsv } from './parse.ts';

describe('parsing', () => {
	it('reads plain rows, quoted fields, and doubled quotes', () => {
		expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
			['a', 'b', 'c'],
			['1', '2', '3']
		]);
		expect(parseCsv('"hello, world","say ""hi""",plain')).toEqual([
			['hello, world', 'say "hi"', 'plain']
		]);
		expect(parseCsv('"multi\nline",x')).toEqual([['multi\nline', 'x']]);
	});

	it('accepts CRLF, a missing final newline, and empty fields', () => {
		expect(parseCsv('a,b\r\n1,\r\n,2')).toEqual([
			['a', 'b'],
			['1', ''],
			['', '2']
		]);
		expect(parseCsv('')).toEqual([]);
		expect(parseCsv('\n')).toEqual([['']]);
	});

	it('detects the delimiter from the first line', () => {
		expect(detectDelimiter('a;b;c')).toBe(';');
		expect(detectDelimiter('a\tb\tc')).toBe('\t');
		expect(detectDelimiter('"a;b",c')).toBe(',');
		expect(detectDelimiter('just one column')).toBe(',');
		expect(parseCsv('x;y\n1;2')).toEqual([
			['x', 'y'],
			['1', '2']
		]);
	});

	it('produces the same rows however the input is chunked', () => {
		const text = 'name,quote,n\r\n"Ada, L.","she said ""hello""\nand left",1\r\nBob,"",2\n"end"';
		const whole = parseCsv(text);
		expect(whole).toEqual([
			['name', 'quote', 'n'],
			['Ada, L.', 'she said "hello"\nand left', '1'],
			['Bob', '', '2'],
			['end']
		]);

		// Every chunk size from one character up: the streaming state must be
		// right at every possible boundary, including inside `""` and after `\r`.
		for (let size = 1; size <= text.length; size += 1) {
			const parser = new CsvParser();
			const rows: string[][] = [];
			for (let i = 0; i < text.length; i += size)
				rows.push(...parser.push(text.slice(i, i + size)));
			rows.push(...parser.finish());
			expect(rows, `chunk size ${size}`).toEqual(whole);
		}
	});

	it('keeps multi-byte text intact', () => {
		expect(parseCsv('café,naïve,日本語')).toEqual([['café', 'naïve', '日本語']]);
	});
});

describe('writing', () => {
	it('quotes only what needs quoting, and round-trips', () => {
		expect(escapeField('plain')).toBe('plain');
		expect(escapeField('a,b')).toBe('"a,b"');
		expect(escapeField('say "hi"')).toBe('"say ""hi"""');
		expect(escapeField(' padded ')).toBe('" padded "');
		expect(escapeField('a;b', ';')).toBe('"a;b"');

		const row = ['x', 'a,b', 'say "hi"', 'multi\nline', ''];
		expect(parseCsv(rowToCsv(row))).toEqual([row]);
	});
});
