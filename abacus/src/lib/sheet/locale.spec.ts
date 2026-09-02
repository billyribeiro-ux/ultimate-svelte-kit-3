import { describe, expect, it } from 'vitest';
import { formatScalar } from './format.ts';
import { dateOrder, parseDate, parseInput, parseNumber, separators } from './locale.ts';

describe('separators come from Intl', () => {
	it('knows the usual suspects', () => {
		expect(separators('en-US')).toEqual({ decimal: '.', group: ',' });
		expect(separators('de-DE')).toEqual({ decimal: ',', group: '.' });
		expect(separators('fr-FR').decimal).toBe(',');
		expect(separators('de-CH').decimal).toBe('.');
	});

	it('knows which way round a date goes', () => {
		expect(dateOrder('en-US')).toBe('mdy');
		expect(dateOrder('en-GB')).toBe('dmy');
		expect(dateOrder('de-DE')).toBe('dmy');
		expect(dateOrder('ja-JP')).toBe('ymd');
	});
});

describe('parsing numbers', () => {
	it('reads the same number in two notations', () => {
		expect(parseNumber('1,234.56', 'en-US')).toBe(1234.56);
		expect(parseNumber('1.234,56', 'de-DE')).toBe(1234.56);
		expect(parseNumber('1234.56', 'en-US')).toBe(1234.56);
		expect(parseNumber('-0.5', 'en-US')).toBe(-0.5);
		expect(parseNumber('(42)', 'en-US')).toBe(-42);
		expect(parseNumber('1 234,5', 'fr-FR')).toBe(1234.5);
	});

	it('refuses inconsistent grouping and the other locale', () => {
		expect(parseNumber('1,2,3', 'en-US')).toBeNull();
		expect(parseNumber('12,34', 'en-US')).toBeNull();
		expect(parseNumber('1.234.5', 'de-DE')).toBeNull();
		expect(parseNumber('abc', 'en-US')).toBeNull();
		expect(parseNumber('', 'en-US')).toBeNull();
	});

	it('round-trips through the formatter', () => {
		for (const locale of ['en-US', 'de-DE', 'fr-FR', 'pt-BR']) {
			const text = formatScalar(
				9876543.21,
				{ kind: 'number', decimals: 2, grouping: true },
				locale
			);
			expect(parseNumber(text, locale)).toBe(9876543.21);
		}
	});
});

describe('parsing dates', () => {
	it('reads ISO everywhere and short dates by locale', () => {
		expect(parseDate('2026-09-02', 'en-US')).toBe(46267);
		expect(parseDate('9/2/2026', 'en-US')).toBe(46267);
		expect(parseDate('2/9/2026', 'en-GB')).toBe(46267);
		expect(parseDate('02.09.2026', 'de-DE')).toBe(46267);
		expect(parseDate('2026/9/2', 'ja-JP')).toBe(46267);
		expect(parseDate('9/2/26', 'en-US')).toBe(46267);
	});

	it('refuses dates that do not exist', () => {
		expect(parseDate('2026-02-31', 'en-US')).toBeNull();
		expect(parseDate('13/13/2026', 'en-US')).toBeNull();
		expect(parseDate('hello', 'en-US')).toBeNull();
	});
});

describe('what a typed value means', () => {
	it('numbers, booleans, text and quoted text', () => {
		expect(parseInput('12', 'en-US')).toEqual({ value: 12 });
		expect(parseInput('true', 'en-US')).toEqual({ value: true });
		expect(parseInput('hello', 'en-US')).toEqual({ value: 'hello' });
		expect(parseInput("'0123", 'en-US')).toEqual({ value: '0123', format: { kind: 'text' } });
		expect(parseInput('', 'en-US')).toEqual({ value: null });
	});

	it('implies a format when the text says so', () => {
		expect(parseInput('12%', 'en-US')).toEqual({
			value: 0.12,
			format: { kind: 'percent', decimals: 0 }
		});
		expect(parseInput('12,5%', 'de-DE')).toEqual({
			value: 0.125,
			format: { kind: 'percent', decimals: 0 }
		});
		expect(parseInput('$1,200', 'en-US')).toEqual({
			value: 1200,
			format: { kind: 'currency', currency: 'USD', decimals: 2 }
		});
		expect(parseInput('1.200 €', 'de-DE')).toEqual({
			value: 1200,
			format: { kind: 'currency', currency: 'EUR', decimals: 2 }
		});
		expect(parseInput('2026-09-02', 'en-US')).toEqual({
			value: 46267,
			format: { kind: 'date', style: 'short' }
		});
	});

	it('shows a date back the way the locale writes it', () => {
		const serial = parseInput('2026-09-02', 'en-US').value as number;
		expect(formatScalar(serial, { kind: 'date', style: 'short' }, 'en-US')).toBe('9/2/26');
		expect(formatScalar(serial, { kind: 'date', style: 'short' }, 'en-GB')).toBe('02/09/2026');
		expect(formatScalar(serial, { kind: 'date', style: 'iso' }, 'de-DE')).toBe('2026-09-02');
	});
});
