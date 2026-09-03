import { describe, expect, it } from 'vitest';
/**
 * `Intl` separates "10 – 17" with thin and narrow no-break spaces (U+2009, U+202F) and puts a
 * no-break space before a currency sign. They are correct typography and
 * invisible in a test failure, so the assertions compare with plain spaces.
 */
const plain = (s: string) => s.replace(/[\u00a0\u2009\u200a\u202f]/g, ' ');

import {
	compareIso,
	dayCount,
	eachDay,
	formatDate,
	formatRange,
	fromIso,
	isIsoDate,
	isWithin,
	toIso
} from './dates.ts';

describe('iso dates', () => {
	it('accepts real dates and rejects the rest', () => {
		expect(isIsoDate('2026-05-10')).toBe(true);
		expect(isIsoDate('2026-02-29')).toBe(false);
		expect(isIsoDate('2024-02-29')).toBe(true);
		expect(isIsoDate('10/05/2026')).toBe(false);
		expect(isIsoDate('2026-13-01')).toBe(false);
	});

	it('round-trips through CalendarDate', () => {
		expect(toIso(fromIso('2026-05-10'))).toBe('2026-05-10');
		expect(toIso(fromIso('2026-05-10').add({ days: 22 }))).toBe('2026-06-01');
	});

	it('counts days inclusively and lists them', () => {
		expect(dayCount('2026-05-10', '2026-05-10')).toBe(1);
		expect(dayCount('2026-05-10', '2026-05-17')).toBe(8);
		expect(dayCount('2026-05-17', '2026-05-10')).toBe(0);
		expect(eachDay('2026-12-30', '2027-01-02')).toEqual([
			'2026-12-30',
			'2026-12-31',
			'2027-01-01',
			'2027-01-02'
		]);
	});

	it('knows what is within a range and sorts as strings', () => {
		expect(isWithin('2026-05-12', '2026-05-10', '2026-05-17')).toBe(true);
		expect(isWithin('2026-05-18', '2026-05-10', '2026-05-17')).toBe(false);
		expect(['2026-05-12', '2025-12-01', '2026-01-09'].sort(compareIso)).toEqual([
			'2025-12-01',
			'2026-01-09',
			'2026-05-12'
		]);
	});
});

describe('formatting', () => {
	it('shows the same date in every zone', () => {
		expect(formatDate('2026-05-10', 'en', 'long')).toBe('Sunday, May 10, 2026');
		expect(formatDate('2026-05-10', 'en-GB', 'short')).toBe('10 May');
		expect(formatDate('2026-05-10', 'de', 'day')).toBe('So., 10.');
		expect(formatDate('2026-05-10', 'pt-BR', 'short')).toBe('10 de mai.');
	});

	it('collapses a range', () => {
		expect(plain(formatRange('2026-05-10', '2026-05-17', 'en-GB'))).toBe('10 – 17 May 2026');
		expect(plain(formatRange('2026-05-28', '2026-06-02', 'en-GB'))).toBe('28 May – 2 Jun 2026');
	});
});
