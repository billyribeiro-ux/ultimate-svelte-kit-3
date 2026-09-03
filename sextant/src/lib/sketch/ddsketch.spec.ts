import { describe, expect, it } from 'vitest';
import { DDSketch, DEFAULT_ALPHA } from './ddsketch.ts';
import { exactQuantile, logNormal, relativeError, seeded } from './testing.ts';

const QUANTILES = [0.5, 0.9, 0.95, 0.99];

/**
 * The guarantee is `error <= alpha` in exact arithmetic, and a value that lands
 * exactly on a bucket edge produces `alpha` plus a couple of ulps. Asserting
 * against bare `alpha` is asserting exact float equality at the boundary, which
 * fails on the one input that exercises the bound hardest.
 */
const SLACK = 1 + 1e-9;

describe('the guarantee', () => {
	it('keeps every quantile within alpha, on latency-shaped data', () => {
		/*
		 * The property the whole class exists to provide, checked against the
		 * distribution it will actually see. A uniform sample is the easy case:
		 * it spreads evenly over buckets and every implementation looks accurate.
		 */
		for (let seed = 1; seed <= 40; seed += 1) {
			const random = seeded(seed);
			const values = Array.from({ length: 5_000 }, () => logNormal(random, 120, 1.1));

			const sketch = new DDSketch();
			for (const value of values) sketch.add(value);

			for (const q of QUANTILES) {
				const error = relativeError(sketch.quantile(q), exactQuantile(values, q));
				expect(error, `q=${q} seed=${seed}`).toBeLessThanOrEqual(DEFAULT_ALPHA * SLACK);
			}
		}
	});

	it('holds at a tighter alpha too', () => {
		const random = seeded(7);
		const values = Array.from({ length: 5_000 }, () => logNormal(random, 40, 1.6));

		const sketch = new DDSketch(0.005);
		for (const value of values) sketch.add(value);

		for (const q of QUANTILES) {
			expect(relativeError(sketch.quantile(q), exactQuantile(values, q))).toBeLessThanOrEqual(
				0.005 * SLACK
			);
		}
	});

	it('spans six orders of magnitude without losing the guarantee', () => {
		// A microsecond cache hit and a ten-second timeout in one series. This is
		// where a linear bucket mapping falls apart and a logarithmic one does not.
		const values: number[] = [];
		for (let i = 0; i < 2_000; i += 1) values.push(0.001 * Math.pow(10, i % 7));

		const sketch = new DDSketch();
		for (const value of values) sketch.add(value);

		for (const q of QUANTILES) {
			expect(relativeError(sketch.quantile(q), exactQuantile(values, q))).toBeLessThanOrEqual(
				DEFAULT_ALPHA * SLACK
			);
		}
	});
});

describe('merging — the reason this is not just a sorted array', () => {
	it('gives the same answer as sketching everything at once', () => {
		const random = seeded(99);
		const minutes = Array.from({ length: 60 }, () =>
			Array.from({ length: 200 }, () => logNormal(random, 90, 1.2))
		);

		const perMinute = minutes.map((values) => {
			const sketch = new DDSketch();
			for (const value of values) sketch.add(value);
			return sketch;
		});

		const merged = new DDSketch();
		for (const sketch of perMinute) merged.merge(sketch);

		const all = minutes.flat();
		const direct = new DDSketch();
		for (const value of all) direct.add(value);

		for (const q of QUANTILES) {
			// Identical, not merely close: merging is adding bucket counts, so the
			// two sketches hold exactly the same state.
			expect(merged.quantile(q)).toBe(direct.quantile(q));
			expect(relativeError(merged.quantile(q), exactQuantile(all, q))).toBeLessThanOrEqual(
				DEFAULT_ALPHA * SLACK
			);
		}
	});

	it('beats averaging the per-minute percentiles, in both directions', () => {
		/*
		 * THE CLAIM, CORRECTED BY THIS TEST
		 *
		 * The first version of this asserted that averaging per-minute p95s
		 * *understates* the tail, on a log-normal sample with one bad minute. It
		 * does not, reliably: on that data the average came within 0.8% of the
		 * truth and the test failed for being wrong rather than for finding a bug.
		 *
		 * The honest claim is weaker and more useful: **avg(p95) is not p95, and
		 * the error is unbounded in either direction.** Which direction depends on
		 * the shape of the data, which is exactly why you cannot correct for it —
		 * a fudge factor tuned on one service is wrong on the next.
		 *
		 * Two constructed cases, because a constructed case can be reasoned about
		 * by hand and a sampled one cannot.
		 */
		const sketchOf = (values: readonly number[]) => {
			const s = new DDSketch();
			for (const value of values) s.add(value);
			return s;
		};

		const mergedP95 = (minutes: readonly (readonly number[])[]) => {
			const merged = new DDSketch();
			for (const values of minutes) merged.merge(sketchOf(values));
			return merged.quantile(0.95);
		};

		const averagedP95 = (minutes: readonly (readonly number[])[]) =>
			minutes.reduce((total, values) => total + exactQuantile(values, 0.95), 0) / minutes.length;

		/*
		 * A spike: 59 minutes at 100ms, one at 10s.
		 *
		 * The true p95 of the hour is 100ms — the spike is only 1.7% of the samples,
		 * so it sits entirely above the 95th percentile. Averaging gives
		 * (59×100 + 10000)/60 ≈ 265ms, which OVERSTATES by 165%.
		 */
		const spike = Array.from({ length: 60 }, (_, i) =>
			Array.from({ length: 200 }, () => (i === 30 ? 10_000 : 100))
		);

		expect(relativeError(mergedP95(spike), 100)).toBeLessThanOrEqual(DEFAULT_ALPHA * SLACK);
		expect(averagedP95(spike)).toBeGreaterThan(250);

		/*
		 * A rolling outage: 56 minutes entirely fast, 4 minutes entirely slow.
		 *
		 * The slow minutes are 6.7% of the samples, so they straddle the 95th
		 * percentile and the hour's true p95 is 5000ms. But each *individual*
		 * minute is internally uniform, so 56 of the per-minute p95s are 50 and
		 * four are 5000, and the average is 380 — UNDERSTATING by a factor of
		 * thirteen. This is the direction that matters: the number people watch is
		 * the one that says everything is fine.
		 */
		const outage = Array.from({ length: 60 }, (_, i) =>
			Array.from({ length: 200 }, () => (i < 56 ? 50 : 5_000))
		);

		expect(relativeError(mergedP95(outage), 5_000)).toBeLessThanOrEqual(DEFAULT_ALPHA * SLACK);
		expect(averagedP95(outage)).toBeCloseTo(380, 6);
	});

	it('is commutative and associative', () => {
		const random = seeded(31);
		const parts = Array.from({ length: 6 }, () =>
			Array.from({ length: 300 }, () => logNormal(random, 70, 1.3))
		);

		const sketch = (values: readonly number[]) => {
			const s = new DDSketch();
			for (const value of values) s.add(value);
			return s;
		};

		const forwards = new DDSketch();
		for (const part of parts) forwards.merge(sketch(part));

		const backwards = new DDSketch();
		for (const part of [...parts].reverse()) backwards.merge(sketch(part));

		// Grouped into pairs first, then merged — a different association.
		const grouped = new DDSketch();
		for (let i = 0; i < parts.length; i += 2) {
			const pair = sketch(parts[i]!);
			pair.merge(sketch(parts[i + 1]!));
			grouped.merge(pair);
		}

		expect(backwards.toJSON()).toEqual(forwards.toJSON());
		expect(grouped.toJSON()).toEqual(forwards.toJSON());
	});

	it('refuses to merge sketches with different accuracy', () => {
		const a = new DDSketch(0.02);
		const b = new DDSketch(0.01);
		a.add(1);
		b.add(1);
		expect(() => a.merge(b)).toThrow(/different accuracy/);
	});
});

describe('the exact statistics kept alongside', () => {
	it('reports min, max, sum and avg exactly', () => {
		const values = [3, 1, 4, 1, 5, 9, 2, 6];
		const sketch = new DDSketch();
		for (const value of values) sketch.add(value);

		expect(sketch.min).toBe(1);
		expect(sketch.max).toBe(9);
		expect(sketch.sum).toBe(31);
		expect(sketch.avg).toBeCloseTo(31 / 8, 12);
		expect(sketch.count).toBe(8);
	});

	it('returns the exact ends for q=0 and q=1', () => {
		// Not a bucket edge within alpha: a max latency 2% off is the one number in
		// a latency panel people quote verbatim.
		const sketch = new DDSketch();
		for (const value of [7, 1_000_003, 55]) sketch.add(value);
		expect(sketch.quantile(0)).toBe(7);
		expect(sketch.quantile(1)).toBe(1_000_003);
	});

	it('keeps min and max exact across a merge', () => {
		const a = new DDSketch();
		const b = new DDSketch();
		a.add(10);
		b.add(3);
		b.add(900);
		a.merge(b);
		expect(a.min).toBe(3);
		expect(a.max).toBe(900);
	});
});

describe('edges', () => {
	it('is empty until something is added', () => {
		const sketch = new DDSketch();
		expect(sketch.count).toBe(0);
		expect(sketch.quantile(0.5)).toBeNaN();
		expect(sketch.min).toBeNaN();
	});

	it('handles zeroes, which a logarithmic mapping cannot represent', () => {
		const sketch = new DDSketch();
		for (let i = 0; i < 100; i += 1) sketch.add(0);
		for (let i = 0; i < 100; i += 1) sketch.add(50);

		expect(sketch.quantile(0.25)).toBe(0);
		expect(relativeError(sketch.quantile(0.75), 50)).toBeLessThanOrEqual(DEFAULT_ALPHA * SLACK);
	});

	it('drops NaN and Infinity rather than poisoning every later percentile', () => {
		const sketch = new DDSketch();
		sketch.add(10);
		sketch.add(NaN);
		sketch.add(Infinity);
		sketch.add(20);

		expect(sketch.count).toBe(2);
		expect(sketch.max).toBe(20);
		expect(Number.isFinite(sketch.quantile(0.9))).toBe(true);
	});

	it('accepts a weighted add', () => {
		const sketch = new DDSketch();
		sketch.add(100, 500);
		expect(sketch.count).toBe(500);
		expect(sketch.sum).toBe(50_000);
	});

	it('refuses an alpha outside (0, 1)', () => {
		expect(() => new DDSketch(0)).toThrow(RangeError);
		expect(() => new DDSketch(1)).toThrow(RangeError);
	});

	it('refuses a quantile outside [0, 1]', () => {
		const sketch = new DDSketch();
		sketch.add(1);
		expect(() => sketch.quantile(1.5)).toThrow(RangeError);
	});

	it('does not depend on the order values arrived in', () => {
		/*
		 * `Map` iterates in insertion order, so a quantile that walks buckets
		 * without sorting the keys gives a different answer depending on the order
		 * of the input. Intermittent, plausible, and only under real traffic.
		 */
		const random = seeded(17);
		const values = Array.from({ length: 1_000 }, () => logNormal(random, 100, 1.4));

		const forwards = new DDSketch();
		for (const value of values) forwards.add(value);

		const backwards = new DDSketch();
		for (const value of [...values].reverse()) backwards.add(value);

		for (const q of QUANTILES) expect(backwards.quantile(q)).toBe(forwards.quantile(q));
	});

	it('stays small — a few hundred buckets for real data', () => {
		const random = seeded(5);
		const sketch = new DDSketch();
		for (let i = 0; i < 100_000; i += 1) sketch.add(logNormal(random, 100, 1.2));

		// Logarithmic in the ratio of largest to smallest, not in the sample size:
		// a hundred thousand samples and a hundred fit in the same few hundred
		// buckets, which is what makes one sketch per minute per series affordable.
		expect(sketch.buckets).toBeLessThan(600);
		expect(JSON.stringify(sketch).length).toBeLessThan(8_000);
	});
});

describe('serialisation', () => {
	it('round-trips exactly', () => {
		const random = seeded(88);
		const sketch = new DDSketch();
		for (let i = 0; i < 2_000; i += 1) sketch.add(logNormal(random, 200, 1.0));

		const revived = DDSketch.fromJSON(JSON.parse(JSON.stringify(sketch)));

		expect(revived.count).toBe(sketch.count);
		expect(revived.sum).toBe(sketch.sum);
		expect(revived.min).toBe(sketch.min);
		expect(revived.max).toBe(sketch.max);
		for (const q of QUANTILES) expect(revived.quantile(q)).toBe(sketch.quantile(q));
	});

	it('produces identical bytes for identical state', () => {
		// What lets a rollup row be hashed to detect a bad merge.
		const a = new DDSketch();
		const b = new DDSketch();
		for (const value of [5, 1, 9, 3]) a.add(value);
		for (const value of [9, 3, 5, 1]) b.add(value);
		expect(JSON.stringify(b)).toBe(JSON.stringify(a));
	});

	it('round-trips an empty sketch', () => {
		const revived = DDSketch.fromJSON(JSON.parse(JSON.stringify(new DDSketch())));
		expect(revived.count).toBe(0);
		expect(revived.min).toBeNaN();
	});
});
