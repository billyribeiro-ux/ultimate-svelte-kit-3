import { describe, expect, it } from 'vitest';
import { groupByDay, nextPosition, place } from './itinerary.ts';

const stops = [
	{ id: 'a', date: '2026-05-10', position: 0 },
	{ id: 'b', date: '2026-05-10', position: 1 },
	{ id: 'c', date: '2026-05-11', position: 0 },
	{ id: 'd', date: null, position: 0 },
	{ id: 'e', date: '2026-04-01', position: 0 }
];
const days = ['2026-05-10', '2026-05-11', '2026-05-12'];

describe('groupByDay', () => {
	it('makes a group per day, empty ones too, and an ideas bucket last', () => {
		const groups = groupByDay(stops, days);
		expect(groups.map((g) => g.date)).toEqual([...days, null]);
		expect(groups[0]!.stops.map((s) => s.id)).toEqual(['a', 'b']);
		expect(groups[2]!.stops).toEqual([]);
	});

	it('keeps a stop dated outside the trip with the ideas', () => {
		const ideas = groupByDay(stops, days).at(-1)!;
		expect(ideas.stops.map((s) => s.id)).toEqual(['d', 'e']);
	});
});

describe('place', () => {
	it('reorders within a day and reports only what changed', () => {
		expect(place(stops, 'b', '2026-05-10', 0)).toEqual([
			{ id: 'b', date: '2026-05-10', position: 0 },
			{ id: 'a', date: '2026-05-10', position: 1 }
		]);
	});

	it('moves between days and renumbers both', () => {
		const changes = place(stops, 'a', '2026-05-11', 0);
		expect(changes).toEqual([
			{ id: 'a', date: '2026-05-11', position: 0 },
			{ id: 'c', date: '2026-05-11', position: 1 },
			{ id: 'b', date: '2026-05-10', position: 0 }
		]);
	});

	it('schedules an idea and unschedules a stop', () => {
		expect(place(stops, 'd', '2026-05-12', 0)).toEqual([
			{ id: 'd', date: '2026-05-12', position: 0 }
		]);
		expect(place(stops, 'c', null, 1)).toEqual([{ id: 'c', date: null, position: 1 }]);
	});

	it('clamps the index and is a no-op for the same spot', () => {
		expect(place(stops, 'a', '2026-05-10', 99)).toEqual([
			{ id: 'b', date: '2026-05-10', position: 0 },
			{ id: 'a', date: '2026-05-10', position: 1 }
		]);
		expect(place(stops, 'a', '2026-05-10', 0)).toEqual([]);
	});

	it('throws for an unknown stop', () => {
		expect(() => place(stops, 'zz', null, 0)).toThrow(RangeError);
	});
});

describe('nextPosition', () => {
	it('is one past the last stop of the day', () => {
		expect(nextPosition(stops, '2026-05-10')).toBe(2);
		expect(nextPosition(stops, '2026-05-12')).toBe(0);
		expect(nextPosition(stops, null)).toBe(1);
	});
});
