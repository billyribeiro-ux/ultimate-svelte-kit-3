import { describe, expect, it } from 'vitest';
import {
	DAY,
	HOUR,
	MINUTE,
	SECOND,
	STEPS,
	alignRange,
	buckets,
	ceilTo,
	densify,
	describeStep,
	floorTo,
	rollupFor,
	stepFor
} from './bucket.ts';
import { axisRange, extent, lttb, type Point } from './downsample.ts';
import { seeded } from '#lib/sketch/testing.ts';

describe('buckets are absolute, not relative to now', () => {
	it('floors to a wall-clock boundary', () => {
		// 2026-03-01T12:07:33.500Z
		const at = Date.UTC(2026, 2, 1, 12, 7, 33, 500);
		expect(new Date(floorTo(at, 5 * MINUTE)).toISOString()).toBe('2026-03-01T12:05:00.000Z');
		expect(new Date(floorTo(at, HOUR)).toISOString()).toBe('2026-03-01T12:00:00.000Z');
		expect(new Date(floorTo(at, DAY)).toISOString()).toBe('2026-03-01T00:00:00.000Z');
	});

	it('gives two queries a second apart the same boundaries', () => {
		/*
		 * The property four separate symptoms come from: dashboards that disagree,
		 * a cache that never hits, a rollup table that cannot be used, and a chart
		 * that shimmers on refresh. All four are `now - i * step` instead of
		 * `floor(t / step) * step`.
		 */
		const now = Date.UTC(2026, 2, 1, 12, 7, 33);
		const later = now + 1_100;
		const range = { from: now - HOUR, to: now };

		expect(buckets({ from: floorTo(range.from, MINUTE), to: later }, MINUTE)[0]).toBe(
			buckets({ from: floorTo(range.from, MINUTE), to: now }, MINUTE)[0]
		);
	});

	it('widens a range rather than narrowing it', () => {
		// Narrowing loses up to two steps of data at each end, which at a one-day
		// step is two days.
		const range = { from: 61_000, to: 119_000 };
		expect(alignRange(range, MINUTE)).toEqual({ from: 60_000, to: 120_000 });
	});

	it('produces tiling, non-overlapping buckets', () => {
		const range = { from: 0, to: 10 * MINUTE };
		const list = buckets(range, MINUTE);
		expect(list).toHaveLength(10);
		for (let i = 1; i < list.length; i += 1) {
			expect(list[i]! - list[i - 1]!).toBe(MINUTE);
		}
	});

	it('ceils exactly on a boundary without adding a bucket', () => {
		// `ceilTo(120_000, 60_000)` must be 120_000, not 180_000 — otherwise every
		// aligned range gains a trailing empty bucket.
		expect(ceilTo(2 * MINUTE, MINUTE)).toBe(2 * MINUTE);
		expect(floorTo(2 * MINUTE, MINUTE)).toBe(2 * MINUTE);
	});
});

describe('choosing a step', () => {
	it('keeps the bucket count under the pixel width', () => {
		for (const span of [MINUTE, HOUR, 6 * HOUR, DAY, 30 * DAY]) {
			const step = stepFor({ from: 0, to: span }, 900);
			expect(span / step, `span=${span}`).toBeLessThanOrEqual(900);
		}
	});

	it('picks the finest step that fits', () => {
		// Not merely *a* step that fits — the finest, or a chart is coarser than the
		// screen can show for no reason.
		const step = stepFor({ from: 0, to: HOUR }, 900);
		const finer = STEPS[STEPS.indexOf(step) - 1];
		expect(finer === undefined || HOUR / finer > 900).toBe(true);
	});

	it('coarsens as the range widens', () => {
		const narrow = stepFor({ from: 0, to: HOUR }, 900);
		const wide = stepFor({ from: 0, to: 30 * DAY }, 900);
		expect(wide).toBeGreaterThan(narrow);
	});

	it('does not divide by zero on an empty range', () => {
		expect(stepFor({ from: 5, to: 5 }, 900)).toBe(SECOND);
	});
});

describe('the step ladder supports the rollups', () => {
	it('every step is served by a stored rollup or is finer than all of them', () => {
		/*
		 * The invariant that makes pre-aggregation possible. A step no rollup
		 * divides has to be answered from raw data, which is correct but slow — and
		 * a step that a rollup *nearly* divides would produce buckets straddling
		 * boundaries, which is wrong in a way no test of totals catches because the
		 * totals still add up.
		 */
		for (const step of STEPS) {
			const rollup = rollupFor(step);
			if (rollup === null) {
				expect(step, `${describeStep(step)} has no rollup and is not sub-minute`).toBeLessThan(
					MINUTE
				);
			} else {
				expect(step % rollup, `${describeStep(step)} / ${describeStep(rollup)}`).toBe(0);
			}
		}
	});

	it('picks the coarsest rollup that divides the step', () => {
		// Fewer, bigger rows to merge.
		expect(rollupFor(HOUR)).toBe(HOUR);
		expect(rollupFor(30 * MINUTE)).toBe(5 * MINUTE);
		expect(rollupFor(MINUTE)).toBe(MINUTE);
		expect(rollupFor(30 * SECOND)).toBeNull();
	});
});

describe('gaps are explicit', () => {
	it('fills missing buckets with null', () => {
		/*
		 * A metric that reported nothing for ten minutes has no rows for those
		 * buckets, and a chart drawn from rows alone connects both sides of the gap
		 * with a straight line — which reads as "it was fine" rather than "we have
		 * no idea". That distinction matters most for the series people watch during
		 * an incident, because an agent that has stopped reporting is a symptom.
		 */
		const points = [
			{ at: 0, value: 1 },
			{ at: 3 * MINUTE, value: 4 }
		];
		expect(densify(points, { from: 0, to: 4 * MINUTE }, MINUTE)).toEqual([
			{ at: 0, value: 1 },
			{ at: MINUTE, value: null },
			{ at: 2 * MINUTE, value: null },
			{ at: 3 * MINUTE, value: 4 }
		]);
	});

	it('floors a point that is not exactly on a boundary', () => {
		expect(densify([{ at: 90_000, value: 7 }], { from: 60_000, to: 120_000 }, MINUTE)).toEqual([
			{ at: 60_000, value: 7 }
		]);
	});
});

describe('naming a step', () => {
	it('reads as a person would say it', () => {
		expect(describeStep(SECOND)).toBe('1 second');
		expect(describeStep(30 * SECOND)).toBe('30 seconds');
		expect(describeStep(5 * MINUTE)).toBe('5 minutes');
		expect(describeStep(HOUR)).toBe('1 hour');
		expect(describeStep(DAY)).toBe('1 day');
	});

	it('names every step on the ladder', () => {
		// A new step must not fall through to something like "0.5h".
		for (const step of STEPS) {
			expect(describeStep(step), String(step)).toMatch(/^\d+ (second|minute|hour|day)s?$/);
		}
	});
});

/* ------------------------------------------------------------------ */
/* Downsampling                                                        */
/* ------------------------------------------------------------------ */

/** A flat series with one spike, which is the case the whole algorithm is for. */
function withSpike(length: number, spikeAt: number, height: number): Point[] {
	return Array.from({ length }, (_, i) => ({ x: i, y: i === spikeAt ? height : 100 }));
}

describe('LTTB keeps the shape', () => {
	it('returns exactly the requested number of points', () => {
		const points = Array.from({ length: 10_000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) }));
		for (const threshold of [3, 10, 100, 900]) {
			expect(lttb(points, threshold), `threshold=${threshold}`).toHaveLength(threshold);
		}
	});

	it('always keeps the first and last point', () => {
		const points = Array.from({ length: 5_000 }, (_, i) => ({ x: i, y: i % 7 }));
		const reduced = lttb(points, 200);
		expect(reduced[0]).toEqual(points[0]);
		expect(reduced.at(-1)).toEqual(points.at(-1));
	});

	it('keeps a one-sample spike that every-nth would lose', () => {
		/*
		 * The number that matters. On a day of one-second data at 900 pixels, taking
		 * every nth point loses a 30-second outage about 97% of the time — and that
		 * is the default in more dashboards than anybody would like.
		 */
		const points = withSpike(10_000, 4_321, 9_999);
		const reduced = lttb(points, 500);
		expect(reduced.some((point) => point.y === 9_999)).toBe(true);

		const everyNth = points.filter((_, i) => i % 20 === 0);
		expect(everyNth.some((point) => point.y === 9_999)).toBe(false);
	});

	it('keeps spikes wherever they are', () => {
		for (const at of [1, 500, 2_500, 7_777, 9_998]) {
			const reduced = lttb(withSpike(10_000, at, 5_000), 400);
			expect(
				reduced.some((point) => point.y === 5_000),
				`spike at ${at}`
			).toBe(true);
		}
	});

	it('keeps a downward spike as readily as an upward one', () => {
		/*
		 * Dropping the `abs` in the area calculation makes the choice depend on
		 * which way the line turns, which quietly prefers one direction. A latency
		 * chart that hides recoveries is as misleading as one that hides outages.
		 */
		const points = Array.from({ length: 5_000 }, (_, i) => ({ x: i, y: i === 2_500 ? 1 : 100 }));
		expect(lttb(points, 300).some((point) => point.y === 1)).toBe(true);
	});

	it('preserves the true extremes far better than bucket averaging', () => {
		const points = withSpike(10_000, 3_000, 10_000);

		const reducedMax = Math.max(...lttb(points, 500).map((p) => p.y));

		// Averaging every 20 points: the spike is divided by the bucket size and
		// renders as ordinary jitter.
		const averaged: number[] = [];
		for (let i = 0; i < points.length; i += 20) {
			const bucket = points.slice(i, i + 20);
			averaged.push(bucket.reduce((total, p) => total + p.y, 0) / bucket.length);
		}

		expect(reducedMax).toBe(10_000);
		expect(Math.max(...averaged)).toBeLessThan(700);
	});

	it('keeps x strictly increasing', () => {
		// A chart drawn from points that go backwards produces a line that folds
		// over itself, which looks like corrupted data.
		const random = seeded(11);
		const points = Array.from({ length: 8_000 }, (_, i) => ({ x: i, y: random() * 100 }));
		const reduced = lttb(points, 700);
		for (let i = 1; i < reduced.length; i += 1) {
			expect(reduced[i]!.x).toBeGreaterThan(reduced[i - 1]!.x);
		}
	});

	it('returns every point when there is nothing to drop', () => {
		const points = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i }));
		expect(lttb(points, 900)).toEqual(points);
		expect(lttb(points, 2)).toEqual(points);
	});

	it('handles an empty series', () => {
		expect(lttb([], 100)).toEqual([]);
	});

	it('only ever returns points that were in the input', () => {
		/*
		 * Not an average — the y values are real samples that really occurred. That
		 * is a feature for reading a chart and a trap for reading a *number* off
		 * one, which is why the crosshair reads from the full series.
		 */
		const random = seeded(4);
		const points = Array.from({ length: 3_000 }, (_, i) => ({ x: i, y: random() }));
		const original = new Set(points.map((p) => `${p.x}:${p.y}`));
		for (const point of lttb(points, 250)) {
			expect(original.has(`${point.x}:${point.y}`)).toBe(true);
		}
	});
});

describe('the y axis', () => {
	it('scales to the real data, not the drawn data', () => {
		// Scaling to the downsampled points would clip a spike LTTB happened not to
		// keep, so the line would run off the top of its own axis.
		const points = withSpike(10_000, 1_234, 9_999);
		expect(extent(points)).toEqual({ min: 100, max: 9_999 });
	});

	it('starts at zero for a positive series', () => {
		// A latency chart auto-scaled to [198, 202] turns millisecond noise into a
		// mountain range, and people react to it.
		expect(
			axisRange([
				{ x: 0, y: 198 },
				{ x: 1, y: 202 }
			]).min
		).toBe(0);
	});

	it('allows a negative floor when the data goes below zero', () => {
		expect(
			axisRange([
				{ x: 0, y: -5 },
				{ x: 1, y: 5 }
			]).min
		).toBe(-5);
	});

	it('gives a flat series a band rather than dividing by zero', () => {
		// A zero-height axis renders every point on the same pixel row, which looks
		// like a broken chart rather than a stable metric.
		const range = axisRange([
			{ x: 0, y: 7 },
			{ x: 1, y: 7 }
		]);
		expect(range.max).toBeGreaterThan(range.min);
	});

	it('handles an empty series', () => {
		expect(axisRange([])).toEqual({ min: 0, max: 1 });
		expect(extent([])).toBeNull();
	});

	it('ignores non-finite values', () => {
		expect(
			extent([
				{ x: 0, y: NaN },
				{ x: 1, y: 5 }
			])
		).toEqual({ min: 5, max: 5 });
	});
});
