import { describe, expect, it } from 'vitest';
import {
	addDays,
	datesBetween,
	daysBetween,
	endOfDayInstant,
	hoursInLocalDay,
	instantToIsoDate,
	instantToMinuteOfDay,
	isValidTimeZone,
	offsetLabel,
	offsetMinutesAt,
	sameWallClock,
	startOfDayInstant,
	todayIn,
	wallClockToInstant,
	weekdayOf,
	zoneAbbreviation
} from './zone.ts';

const LONDON = 'Europe/London';
const NEW_YORK = 'America/New_York';
const KATHMANDU = 'Asia/Kathmandu'; // UTC+05:45, and no DST — a useful oddity.

const iso = (instant: number) => new Date(instant).toISOString();

describe('isValidTimeZone', () => {
	it('accepts real IANA names and rejects invented ones', () => {
		expect(isValidTimeZone(LONDON)).toBe(true);
		expect(isValidTimeZone('Europe/Atlantis')).toBe(false);
		expect(isValidTimeZone('')).toBe(false);
	});
});

describe('weekdayOf', () => {
	it('numbers Sunday as 0 regardless of where the reader lives', () => {
		expect(weekdayOf('2026-08-16')).toBe(0); // Sunday
		expect(weekdayOf('2026-08-17')).toBe(1); // Monday
		expect(weekdayOf('2026-08-22')).toBe(6); // Saturday
	});
});

describe('wallClockToInstant — ordinary days', () => {
	it('converts a summer morning in London to the right instant', () => {
		// August: London is on BST, one hour ahead of UTC.
		expect(iso(wallClockToInstant('2026-08-14', 9 * 60, LONDON))).toBe('2026-08-14T08:00:00.000Z');
	});

	it('converts a winter morning in London to the right instant', () => {
		// January: London is on GMT, i.e. UTC itself.
		expect(iso(wallClockToInstant('2026-01-14', 9 * 60, LONDON))).toBe('2026-01-14T09:00:00.000Z');
	});

	it('handles a zone with a 45-minute offset', () => {
		expect(iso(wallClockToInstant('2026-08-14', 9 * 60, KATHMANDU))).toBe(
			'2026-08-14T03:15:00.000Z'
		);
	});

	it('rolls past midnight when given a minute beyond 1440', () => {
		// A bar open until 2am on Friday closes at minute 1560 of Friday, not at
		// minute 120 of Saturday. Same instant, one row instead of two.
		const lateFriday = wallClockToInstant('2026-08-14', 26 * 60, LONDON);
		expect(iso(lateFriday)).toBe('2026-08-15T01:00:00.000Z');
		expect(instantToIsoDate(lateFriday, LONDON)).toBe('2026-08-15');
	});
});

describe('wallClockToInstant — the mornings clocks move', () => {
	/*
	 * UK 2026: clocks go forward at 01:00 GMT on Sunday 29 March (01:00 becomes
	 * 02:00) and back at 02:00 BST on Sunday 25 October (02:00 becomes 01:00).
	 */

	it('reports the day clocks go forward as 23 hours long', () => {
		expect(hoursInLocalDay('2026-03-29', LONDON)).toBe(23);
	});

	it('reports the day clocks go back as 25 hours long', () => {
		expect(hoursInLocalDay('2026-10-25', LONDON)).toBe(25);
	});

	it('pushes a wall-clock time that does not exist forward to one that does', () => {
		// 01:30 never happens on 29 March: the hour is deleted. `compatible`
		// disambiguation shifts it to 02:30 BST rather than throwing at a customer.
		const skipped = wallClockToInstant('2026-03-29', 90, LONDON);
		expect(iso(skipped)).toBe('2026-03-29T01:30:00.000Z');
		expect(instantToMinuteOfDay(skipped, LONDON)).toBe(150); // 02:30 local
	});

	it('takes the first of two identical wall-clock times', () => {
		// 01:30 happens twice on 25 October. The default picks the earlier — BST.
		const ambiguous = wallClockToInstant('2026-10-25', 90, LONDON);
		expect(iso(ambiguous)).toBe('2026-10-25T00:30:00.000Z');
		expect(zoneAbbreviation(ambiguous, LONDON)).toBe('BST');
	});

	it('can be asked for the second one instead', () => {
		const later = wallClockToInstant('2026-10-25', 90, LONDON, 'later');
		expect(iso(later)).toBe('2026-10-25T01:30:00.000Z');
		expect(zoneAbbreviation(later, LONDON)).toBe('GMT');
	});

	it('can refuse an ambiguous time outright when a human must decide', () => {
		expect(() => wallClockToInstant('2026-10-25', 90, LONDON, 'reject')).toThrow();
	});

	it('measures a local day by the calendar, not by adding 24 hours', () => {
		// This is the assertion that catches the classic bug. On a 23-hour day,
		// start + 24h overshoots the next midnight by an hour.
		const start = startOfDayInstant('2026-03-29', LONDON);
		const end = endOfDayInstant('2026-03-29', LONDON);
		expect(end - start).toBe(23 * 60 * 60 * 1000);
		expect(end).not.toBe(start + 24 * 60 * 60 * 1000);
	});

	it('makes the day clocks go back 25 real hours long', () => {
		const start = startOfDayInstant('2026-10-25', LONDON);
		const end = endOfDayInstant('2026-10-25', LONDON);
		expect(end - start).toBe(25 * 60 * 60 * 1000);
	});
});

describe('offsets and labels', () => {
	it('reports the offset in force at a given instant, not a fixed one', () => {
		const summer = wallClockToInstant('2026-08-14', 12 * 60, LONDON);
		const winter = wallClockToInstant('2026-01-14', 12 * 60, LONDON);

		expect(offsetMinutesAt(summer, LONDON)).toBe(60);
		expect(offsetMinutesAt(winter, LONDON)).toBe(0);
		expect(offsetLabel(summer, LONDON)).toBe('UTC+01:00');
		expect(offsetLabel(winter, LONDON)).toBe('UTC+00:00');
	});

	it('writes a negative offset with a minus sign and two digits', () => {
		const summer = wallClockToInstant('2026-08-14', 12 * 60, NEW_YORK);
		expect(offsetLabel(summer, NEW_YORK)).toBe('UTC-04:00');
	});

	it('writes a 45-minute offset without rounding it away', () => {
		const midday = wallClockToInstant('2026-08-14', 12 * 60, KATHMANDU);
		expect(offsetLabel(midday, KATHMANDU)).toBe('UTC+05:45');
	});

	it('labels the two identical 01:30s on the fall-back morning differently', () => {
		// The only thing that makes a fall-back morning readable to a customer.
		const first = wallClockToInstant('2026-10-25', 90, LONDON, 'earlier');
		const second = wallClockToInstant('2026-10-25', 90, LONDON, 'later');

		expect(instantToMinuteOfDay(first, LONDON)).toBe(instantToMinuteOfDay(second, LONDON));
		expect(zoneAbbreviation(first, LONDON)).not.toBe(zoneAbbreviation(second, LONDON));
	});

	it('knows when two zones happen to show the same clock', () => {
		const summer = wallClockToInstant('2026-08-14', 12 * 60, LONDON);
		expect(sameWallClock(summer, LONDON, 'Europe/Dublin')).toBe(true);
		expect(sameWallClock(summer, LONDON, NEW_YORK)).toBe(false);
	});
});

describe('calendar arithmetic', () => {
	it('adds days across a month boundary', () => {
		expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
	});

	it('adds days across a leap day', () => {
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
	});

	it('adds a whole day across the day clocks change, not 24 hours', () => {
		expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
		expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
	});

	it('lists an inclusive range of dates', () => {
		expect(datesBetween('2026-08-14', '2026-08-17')).toEqual([
			'2026-08-14',
			'2026-08-15',
			'2026-08-16',
			'2026-08-17'
		]);
	});

	it('lists a single day when both ends are the same', () => {
		expect(datesBetween('2026-08-14', '2026-08-14')).toEqual(['2026-08-14']);
	});

	it('lists nothing when the range runs backwards', () => {
		expect(datesBetween('2026-08-17', '2026-08-14')).toEqual([]);
	});

	it('counts days between dates, including across a DST change', () => {
		expect(daysBetween('2026-08-14', '2026-08-17')).toBe(3);
		expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
		expect(daysBetween('2026-08-17', '2026-08-14')).toBe(-3);
	});
});

describe('instants back to local readings', () => {
	it('files an instant under the local date it falls on, per zone', () => {
		// 2026-08-14T23:30Z is still the 14th in London, but the 14th at 19:30 in
		// New York — and 05:15 on the 15th in Kathmandu.
		const instant = new Date('2026-08-14T23:30:00Z').getTime();
		expect(instantToIsoDate(instant, LONDON)).toBe('2026-08-15'); // 00:30 BST
		expect(instantToIsoDate(instant, NEW_YORK)).toBe('2026-08-14');
		expect(instantToIsoDate(instant, KATHMANDU)).toBe('2026-08-15');
	});

	it('round-trips a wall-clock reading through an instant and back', () => {
		const minute = 14 * 60 + 35;
		const instant = wallClockToInstant('2026-08-14', minute, NEW_YORK);
		expect(instantToMinuteOfDay(instant, NEW_YORK)).toBe(minute);
	});

	it('reports today in the zone asked for, not the machine s own', () => {
		// Midday UTC on the 14th is already the 15th in Auckland.
		const middayUtc = new Date('2026-08-14T12:00:00Z').getTime();
		expect(todayIn(LONDON, middayUtc)).toBe('2026-08-14');
		expect(todayIn('Pacific/Auckland', middayUtc)).toBe('2026-08-15');
	});
});
