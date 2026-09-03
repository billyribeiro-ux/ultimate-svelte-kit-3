import { describe, expect, it } from 'vitest';
import { formatTick, formatTimeTick, linear, niceTicks, timeTicks } from './scale.ts';
import { HOUR, MINUTE, STEPS } from '#lib/series/bucket.ts';

describe('linear', () => {
	it('maps the ends of the domain to the ends of the range', () => {
		const scale = linear([0, 100], [10, 210]);
		expect(scale(0)).toBe(10);
		expect(scale(100)).toBe(210);
		expect(scale(50)).toBe(110);
	});

	it('inverts', () => {
		const scale = linear([1_000, 2_000], [0, 500]);
		expect(scale.invert(scale(1_600))).toBeCloseTo(1_600, 6);
	});

	/**
	 * A flat series has a zero-width domain.
	 *
	 * Dividing by it gives NaN for every point, and canvas silently declines to
	 * draw a path full of NaN — so the failure mode is a blank chart with nothing
	 * in the console, which is the hardest kind of bug to find.
	 */
	it('does not divide by zero on a flat domain', () => {
		const scale = linear([5, 5], [0, 100]);
		expect(Number.isFinite(scale(5))).toBe(true);
	});
});

describe('niceTicks', () => {
	it('uses the 1-2-5 ladder', () => {
		expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
		expect(niceTicks(0, 1000, 4)).toEqual([0, 200, 400, 600, 800, 1000]);
	});

	/**
	 * The re-rounding stops drift *accumulating*; it does not make float exact.
	 *
	 * `3 * 0.2` is 0.6000000000000001 in IEEE 754 and no amount of rounding to the
	 * step changes that. The value is asserted here rather than hidden, because the
	 * fix is not to chase it in the tick function — it is that the label goes
	 * through `formatTick`, which is where "what a person reads" is decided.
	 */
	it('leaves float imprecision to the formatter rather than pretending to fix it', () => {
		const ticks = niceTicks(0, 1, 5);
		expect(ticks).toEqual([0, 0.2, 0.4, 0.6000000000000001, 0.8, 1]);
		expect(ticks.map(formatTick)).toEqual(['0', '0.2', '0.4', '0.6', '0.8', '1']);
	});

	/**
	 * The reason this function exists rather than dividing the range by five.
	 *
	 * Even division of an arbitrary range gives arbitrary labels, and an axis
	 * labelled 0, 3.33, 6.67, 10 is harder to read than one with more ticks and
	 * round numbers.
	 */
	it('prefers round numbers to an exact count', () => {
		const ticks = niceTicks(0, 10, 3);
		expect(ticks.every((tick) => Number.isInteger(tick / 5) || Number.isInteger(tick))).toBe(true);
	});

	it('starts at a multiple of the step, not at the minimum', () => {
		expect(niceTicks(37, 92, 4)).toEqual([40, 50, 60, 70, 80, 90]);
	});

	it('returns something for a degenerate range rather than looping forever', () => {
		expect(niceTicks(5, 5)).toEqual([5]);
		expect(niceTicks(Number.NaN, 10)).toEqual([Number.NaN]);
	});

	/**
	 * Repeated addition of a fractional step drifts.
	 *
	 * `0.1 + 0.1 + 0.1` is 0.30000000000000004, and an axis that prints it looks
	 * broken in a way that makes people doubt the data too.
	 */
	it('does not print floating-point drift on a whole-number axis', () => {
		for (const tick of niceTicks(0, 5, 5)) expect(Number.isInteger(tick)).toBe(true);
	});
});

describe('timeTicks', () => {
	it('snaps to the bucket step ladder', () => {
		const from = Date.UTC(2026, 0, 1, 9, 37);
		const ticks = timeTicks(from, from + 6 * HOUR, 5);

		expect(ticks.length).toBeGreaterThan(2);
		for (const tick of ticks) {
			expect(tick).toBeGreaterThanOrEqual(from);
			// Every tick is on a step boundary in absolute time, which is what keeps a
			// gridline aligned with the bucket edge underneath it.
			expect(STEPS.some((step) => tick % step === 0)).toBe(true);
		}
	});

	it('never puts a tick before the start of the range', () => {
		const from = Date.UTC(2026, 0, 1, 9, 37, 12);
		expect(Math.min(...timeTicks(from, from + 30 * MINUTE))).toBeGreaterThanOrEqual(from);
	});
});

describe('formatTick', () => {
	it('abbreviates the magnitudes an axis actually reaches', () => {
		expect(formatTick(0)).toBe('0');
		expect(formatTick(950)).toBe('950');
		expect(formatTick(1_500)).toBe('1.5k');
		expect(formatTick(2_400_000)).toBe('2.4M');
		expect(formatTick(3_000_000_000)).toBe('3B');
	});

	it('does not print trailing zeroes', () => {
		expect(formatTick(1_000)).toBe('1k');
		expect(formatTick(1_200)).toBe('1.2k');
	});
});

describe('formatTimeTick', () => {
	const at = Date.UTC(2026, 2, 12, 14, 30, 5);

	/**
	 * Precision follows the span, not the value.
	 *
	 * Seconds on a two-week axis are six wasted characters per label, and a label
	 * that no longer fits is dropped — so over-precision costs gridlines.
	 */
	it('drops precision as the range grows', () => {
		expect(formatTimeTick(at, 90 * 1_000)).toBe('14:30:05');
		expect(formatTimeTick(at, 6 * HOUR)).toBe('14:30');
		expect(formatTimeTick(at, 30 * 24 * HOUR)).toBe('12 Mar');
	});
});
