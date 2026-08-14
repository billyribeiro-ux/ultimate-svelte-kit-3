import { describe, expect, it } from 'vitest';
import {
	SLOT_MS,
	ceilToSlot,
	floorToSlot,
	isFree,
	isSlotAligned,
	isWholeSlots,
	mergeIntervals,
	slotCount,
	slotsIn
} from './grid.ts';

/** A readable instant builder: `at('2026-08-14T09:00Z')`. */
const at = (iso: string) => new Date(iso).getTime();

describe('floorToSlot / ceilToSlot', () => {
	it('leaves an already-aligned instant alone', () => {
		const aligned = at('2026-08-14T09:05:00Z');
		expect(floorToSlot(aligned)).toBe(aligned);
		expect(ceilToSlot(aligned)).toBe(aligned);
	});

	it('rounds outwards, never towards the nearest', () => {
		const messy = at('2026-08-14T09:02:30Z');
		expect(floorToSlot(messy)).toBe(at('2026-08-14T09:00:00Z'));
		expect(ceilToSlot(messy)).toBe(at('2026-08-14T09:05:00Z'));
	});

	it('floors negative instants backwards in time, not towards zero', () => {
		// 1969, i.e. before the epoch. `Math.trunc` would round this forwards,
		// which would silently place the cell start after the instant it contains.
		const beforeEpoch = at('1969-12-31T23:58:00Z');
		expect(floorToSlot(beforeEpoch)).toBeLessThanOrEqual(beforeEpoch);
		expect(floorToSlot(beforeEpoch)).toBe(at('1969-12-31T23:55:00Z'));
	});

	it('agrees with isSlotAligned', () => {
		expect(isSlotAligned(at('2026-08-14T09:05:00Z'))).toBe(true);
		expect(isSlotAligned(at('2026-08-14T09:06:00Z'))).toBe(false);
	});
});

describe('isWholeSlots', () => {
	it('accepts multiples of five and rejects everything else', () => {
		expect(isWholeSlots(45)).toBe(true);
		expect(isWholeSlots(0)).toBe(true);
		expect(isWholeSlots(47)).toBe(false);
		expect(isWholeSlots(7.5)).toBe(false);
	});
});

describe('slotsIn', () => {
	it('covers a clean 45-minute appointment with nine cells', () => {
		const cells = slotsIn({ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T09:45Z') });
		expect(cells).toHaveLength(9);
		expect(cells[0]).toBe(at('2026-08-14T09:00Z'));
		expect(cells.at(-1)).toBe(at('2026-08-14T09:40Z'));
	});

	it('is half-open: back-to-back appointments share no cell', () => {
		const first = slotsIn({ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T09:45Z') });
		const second = slotsIn({ start: at('2026-08-14T09:45Z'), end: at('2026-08-14T10:30Z') });
		const overlap = first.filter((cell) => second.includes(cell));
		expect(overlap).toEqual([]);
	});

	it('widens a ragged interval outwards to whole cells', () => {
		// 12:22 to 13:08 — neither end is on the grid.
		const cells = slotsIn({ start: at('2026-08-14T12:22Z'), end: at('2026-08-14T13:08Z') });
		expect(cells[0]).toBe(at('2026-08-14T12:20Z'));
		expect(cells.at(-1)).toBe(at('2026-08-14T13:05Z'));
	});

	it('returns nothing for an empty or backwards interval', () => {
		const t = at('2026-08-14T09:00Z');
		expect(slotsIn({ start: t, end: t })).toEqual([]);
		expect(slotsIn({ start: t, end: t - SLOT_MS })).toEqual([]);
	});

	it('agrees with slotCount without building the array', () => {
		const interval = { start: at('2026-08-14T12:22Z'), end: at('2026-08-14T13:08Z') };
		expect(slotCount(interval)).toBe(slotsIn(interval).length);
	});
});

describe('isFree', () => {
	const occupied = new Set(
		slotsIn({ start: at('2026-08-14T10:00Z'), end: at('2026-08-14T10:30Z') })
	);

	it('is true for an interval that ends exactly where a booking begins', () => {
		expect(isFree({ start: at('2026-08-14T09:30Z'), end: at('2026-08-14T10:00Z') }, occupied)).toBe(
			true
		);
	});

	it('is true for an interval that begins exactly where a booking ends', () => {
		expect(isFree({ start: at('2026-08-14T10:30Z'), end: at('2026-08-14T11:00Z') }, occupied)).toBe(
			true
		);
	});

	it('is false for a single overlapping minute at either edge', () => {
		expect(isFree({ start: at('2026-08-14T09:30Z'), end: at('2026-08-14T10:01Z') }, occupied)).toBe(
			false
		);
		expect(isFree({ start: at('2026-08-14T10:29Z'), end: at('2026-08-14T11:00Z') }, occupied)).toBe(
			false
		);
	});

	it('is false for an interval that swallows the booking whole', () => {
		expect(isFree({ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T12:00Z') }, occupied)).toBe(
			false
		);
	});
});

describe('mergeIntervals', () => {
	it('merges overlapping windows', () => {
		const merged = mergeIntervals([
			{ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T12:00Z') },
			{ start: at('2026-08-14T11:00Z'), end: at('2026-08-14T14:00Z') }
		]);
		expect(merged).toEqual([{ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T14:00Z') }]);
	});

	it('merges windows that merely touch, so a booking can straddle the seam', () => {
		const merged = mergeIntervals([
			{ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T12:00Z') },
			{ start: at('2026-08-14T12:00Z'), end: at('2026-08-14T17:00Z') }
		]);
		expect(merged).toHaveLength(1);
	});

	it('keeps a genuine lunch break as two windows', () => {
		const merged = mergeIntervals([
			{ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T13:00Z') },
			{ start: at('2026-08-14T14:00Z'), end: at('2026-08-14T17:00Z') }
		]);
		expect(merged).toHaveLength(2);
	});

	it('does not shrink a window that fully contains another', () => {
		const merged = mergeIntervals([
			{ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T17:00Z') },
			{ start: at('2026-08-14T10:00Z'), end: at('2026-08-14T11:00Z') }
		]);
		expect(merged).toEqual([{ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T17:00Z') }]);
	});

	it('sorts input it is given out of order', () => {
		const merged = mergeIntervals([
			{ start: at('2026-08-14T14:00Z'), end: at('2026-08-14T17:00Z') },
			{ start: at('2026-08-14T09:00Z'), end: at('2026-08-14T13:00Z') }
		]);
		expect(merged[0]?.start).toBe(at('2026-08-14T09:00Z'));
	});

	it('drops empty intervals rather than emitting zero-length windows', () => {
		const t = at('2026-08-14T09:00Z');
		expect(mergeIntervals([{ start: t, end: t }])).toEqual([]);
	});
});
