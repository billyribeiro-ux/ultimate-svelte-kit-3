import { describe, expect, it } from 'vitest';
import {
	availableSlots,
	groupByLocalDay,
	occupiedCellsFrom,
	windowsForDay,
	type AvailabilityQuery,
	type ServiceShape,
	type WeeklyRule
} from './availability.ts';
import { formatTime } from './format.ts';
import { wallClockToInstant, type Weekday } from './zone.ts';

const LONDON = 'Europe/London';
const NEW_YORK = 'America/New_York';

/** Monday to Friday, nine to five. */
const nineToFive: WeeklyRule[] = ([1, 2, 3, 4, 5] as Weekday[]).map((weekday) => ({
	weekday,
	startMinute: 9 * 60,
	endMinute: 17 * 60
}));

const cutAndFinish: ServiceShape = {
	durationMinutes: 45,
	bufferBeforeMinutes: 0,
	bufferAfterMinutes: 15,
	slotIntervalMinutes: 15
};

/**
 * A query with sensible defaults, so each test only states what it is about.
 * `now` is fixed early enough that the notice period never interferes unless a
 * test deliberately moves it.
 */
function query(overrides: Partial<AvailabilityQuery> = {}): AvailabilityQuery {
	return {
		timeZone: LONDON,
		from: '2026-08-17', // a Monday
		to: '2026-08-17',
		rules: nineToFive,
		service: cutAndFinish,
		occupied: new Set(),
		now: new Date('2026-08-10T09:00:00Z').getTime(),
		minNoticeMinutes: 120,
		maxAdvanceDays: 60,
		...overrides
	};
}

/** Slot start times as local clock readings, which is how a human checks them. */
const asLocalTimes = (slots: readonly { start: number }[], zone = LONDON) =>
	slots.map((slot) => formatTime(slot.start, zone));

describe('windowsForDay', () => {
	it('turns a weekly rule into a real window on a matching day', () => {
		const [window] = windowsForDay('2026-08-17', nineToFive, LONDON);
		expect(window).toBeDefined();
		expect(new Date(window!.start).toISOString()).toBe('2026-08-17T08:00:00.000Z');
		expect(new Date(window!.end).toISOString()).toBe('2026-08-17T16:00:00.000Z');
	});

	it('produces nothing on a day with no rule', () => {
		// 2026-08-16 is a Sunday.
		expect(windowsForDay('2026-08-16', nineToFive, LONDON)).toEqual([]);
	});

	it('keeps a lunch break as two separate windows', () => {
		const withLunch: WeeklyRule[] = [
			{ weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
			{ weekday: 1, startMinute: 14 * 60, endMinute: 17 * 60 }
		];
		expect(windowsForDay('2026-08-17', withLunch, LONDON)).toHaveLength(2);
	});

	it('respects a rule s effective dates', () => {
		const fromSeptember: WeeklyRule[] = [
			{ weekday: 1, startMinute: 540, endMinute: 1020, effectiveFrom: '2026-09-01' }
		];
		expect(windowsForDay('2026-08-17', fromSeptember, LONDON)).toEqual([]);
		expect(windowsForDay('2026-09-07', fromSeptember, LONDON)).toHaveLength(1);
	});

	it('is eight real hours on an ordinary day', () => {
		const [window] = windowsForDay('2026-08-17', nineToFive, LONDON);
		expect(window!.end - window!.start).toBe(8 * 60 * 60 * 1000);
	});
});

describe('availableSlots — the basics', () => {
	it('offers start times on the interval grid, from the window s own start', () => {
		const slots = availableSlots(query());
		expect(asLocalTimes(slots).slice(0, 4)).toEqual(['09:00', '09:15', '09:30', '09:45']);
	});

	it('stops early enough that the buffer still fits before closing', () => {
		// 45 minutes of chair time plus 15 minutes of tidying must end by 17:00,
		// so the last bookable start is 16:00 — not 16:15.
		const slots = availableSlots(query());
		expect(asLocalTimes(slots).at(-1)).toBe('16:00');
	});

	it('reserves the buffer in the block but not in the appointment', () => {
		const [first] = availableSlots(query());
		expect(first!.end - first!.start).toBe(45 * 60 * 1000);
		expect(first!.blockEnd - first!.blockStart).toBe(60 * 60 * 1000);
	});

	it('refuses to offer a start whose before-buffer would precede opening', () => {
		const withSetup = availableSlots(
			query({ service: { ...cutAndFinish, bufferBeforeMinutes: 15 } })
		);
		// 09:00 is impossible: the 15 minutes of setup would begin at 08:45.
		expect(asLocalTimes(withSetup)[0]).toBe('09:15');
	});

	it('returns nothing on a closed day', () => {
		expect(availableSlots(query({ from: '2026-08-16', to: '2026-08-16' }))).toEqual([]);
	});

	it('throws rather than quietly rounding a service off the grid', () => {
		expect(() =>
			availableSlots(query({ service: { ...cutAndFinish, durationMinutes: 47 } }))
		).toThrow(/5-minute grid/);
	});
});

describe('availableSlots — existing bookings', () => {
	it('removes every start whose block would touch a taken cell', () => {
		// Somebody already has 10:00–11:00 (appointment plus buffer).
		const occupied = occupiedCellsFrom([
			{
				start: wallClockToInstant('2026-08-17', 10 * 60, LONDON),
				end: wallClockToInstant('2026-08-17', 11 * 60, LONDON)
			}
		]);

		const times = asLocalTimes(availableSlots(query({ occupied })));

		// 09:15 would run 09:15–10:15 including tidy-up. Gone.
		expect(times).not.toContain('09:15');
		expect(times).not.toContain('10:00');
		expect(times).not.toContain('10:45');
		// 09:00 finishes tidying at exactly 10:00, which is fine.
		expect(times).toContain('09:00');
		// 11:00 starts exactly as the other block ends, which is also fine.
		expect(times).toContain('11:00');
	});

	it('widens ragged time off outwards so a partial cell is never sold', () => {
		const occupied = occupiedCellsFrom([
			{
				start: wallClockToInstant('2026-08-17', 12 * 60 + 22, LONDON),
				end: wallClockToInstant('2026-08-17', 13 * 60 + 8, LONDON)
			}
		]);

		const times = asLocalTimes(availableSlots(query({ occupied })));
		// A 12:15 start would tidy up until 13:15 and collide. 13:15 is clear.
		expect(times).not.toContain('12:15');
		expect(times).toContain('13:15');
	});
});

describe('availableSlots — the notice and advance limits', () => {
	it('hides slots inside the notice period', () => {
		// It is 09:10 on the day, and the salon wants two hours notice.
		const slots = availableSlots(
			query({ now: wallClockToInstant('2026-08-17', 9 * 60 + 10, LONDON) })
		);
		expect(asLocalTimes(slots)[0]).toBe('11:15');
	});

	it('hides slots beyond the advance limit', () => {
		const slots = availableSlots(
			query({ from: '2026-08-17', to: '2026-12-17', maxAdvanceDays: 14 })
		);
		const lastStart = slots.at(-1)!.start;
		const limit = new Date('2026-08-10T09:00:00Z').getTime() + 14 * 24 * 60 * 60 * 1000;
		expect(lastStart).toBeLessThanOrEqual(limit);
	});

	it('comes back empty rather than throwing when nothing is bookable', () => {
		expect(availableSlots(query({ maxAdvanceDays: 0 }))).toEqual([]);
	});
});

describe('availableSlots — the mornings clocks move', () => {
	/*
	 * The interesting case is a business whose hours straddle the change. A
	 * 24-hour clinic on 29 March 2026 loses an hour of real time; on 25 October
	 * it gains one. Both facts should show up in the diary rather than being
	 * quietly smoothed over.
	 */
	const allDay: WeeklyRule[] = [{ weekday: 0, startMinute: 0, endMinute: 24 * 60 }];

	const hourly: ServiceShape = {
		durationMinutes: 60,
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
		slotIntervalMinutes: 60
	};

	it('offers 23 hourly slots on the day clocks go forward', () => {
		const slots = availableSlots(
			query({
				from: '2026-03-29',
				to: '2026-03-29',
				rules: allDay,
				service: hourly,
				now: new Date('2026-03-01T00:00:00Z').getTime(),
				minNoticeMinutes: 0
			})
		);
		expect(slots).toHaveLength(23);
	});

	it('skips the hour that does not exist rather than offering it', () => {
		const times = asLocalTimes(
			availableSlots(
				query({
					from: '2026-03-29',
					to: '2026-03-29',
					rules: allDay,
					service: hourly,
					now: new Date('2026-03-01T00:00:00Z').getTime(),
					minNoticeMinutes: 0
				})
			)
		);
		expect(times.slice(0, 4)).toEqual(['00:00', '02:00', '03:00', '04:00']);
		expect(times).not.toContain('01:00');
	});

	it('offers 25 hourly slots on the day clocks go back', () => {
		const slots = availableSlots(
			query({
				from: '2026-10-25',
				to: '2026-10-25',
				rules: allDay,
				service: hourly,
				now: new Date('2026-10-01T00:00:00Z').getTime(),
				minNoticeMinutes: 0
			})
		);
		expect(slots).toHaveLength(25);
	});

	it('offers the repeated hour twice, as two distinct instants', () => {
		const slots = availableSlots(
			query({
				from: '2026-10-25',
				to: '2026-10-25',
				rules: allDay,
				service: hourly,
				now: new Date('2026-10-01T00:00:00Z').getTime(),
				minNoticeMinutes: 0
			})
		);

		const oneAmSlots = slots.filter((slot) => formatTime(slot.start, LONDON) === '01:00');
		expect(oneAmSlots).toHaveLength(2);
		// Same clock reading, different moments, one hour apart.
		expect(oneAmSlots[1]!.start - oneAmSlots[0]!.start).toBe(60 * 60 * 1000);
		// And they are distinguishable to a customer.
		const labelled = oneAmSlots.map((slot) => formatTime(slot.start, LONDON, { withZone: true }));
		expect(new Set(labelled).size).toBe(2);
	});

	it('keeps ordinary opening hours unaffected when the change happens overnight', () => {
		// A nine-to-five salon on 29 March opens after the transition, so nothing
		// about its day is unusual. This is the regression test for over-thinking it.
		const sundayNineToFive: WeeklyRule[] = [{ weekday: 0, startMinute: 540, endMinute: 1020 }];
		const slots = availableSlots(
			query({
				from: '2026-03-29',
				to: '2026-03-29',
				rules: sundayNineToFive,
				now: new Date('2026-03-01T00:00:00Z').getTime()
			})
		);
		expect(asLocalTimes(slots)[0]).toBe('09:00');
		expect(asLocalTimes(slots).at(-1)).toBe('16:00');
	});
});

describe('groupByLocalDay', () => {
	it('files slots under the day they fall on for the person looking', () => {
		// A late-evening London salon, seen from New York five hours behind.
		const evening: WeeklyRule[] = [{ weekday: 1, startMinute: 20 * 60, endMinute: 23 * 60 }];
		const slots = availableSlots(query({ rules: evening }));

		const inLondon = groupByLocalDay(slots, LONDON);
		const inNewYork = groupByLocalDay(slots, NEW_YORK);

		expect([...inLondon.keys()]).toEqual(['2026-08-17']);
		// Same slots, still the 17th in New York — it is only 15:00 there.
		expect([...inNewYork.keys()]).toEqual(['2026-08-17']);
		expect(asLocalTimes(inNewYork.get('2026-08-17')!, NEW_YORK)[0]).toBe('15:00');
	});

	it('splits a run of slots across the viewer s midnight', () => {
		// London 23:00–01:00 on Tuesday morning is still Monday evening in New York,
		// but a viewer in Tokyo is already well into Tuesday.
		const lateNight: WeeklyRule[] = [{ weekday: 1, startMinute: 22 * 60, endMinute: 26 * 60 }];
		const slots = availableSlots(query({ rules: lateNight }));

		const inLondon = groupByLocalDay(slots, LONDON);
		expect([...inLondon.keys()]).toEqual(['2026-08-17', '2026-08-18']);
	});
});
