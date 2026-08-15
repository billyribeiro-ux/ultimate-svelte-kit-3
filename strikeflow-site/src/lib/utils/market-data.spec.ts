import { describe, it, expect } from 'vitest';
import {
	generateSeries,
	mulberry32,
	nextPoint,
	formatUsd,
	formatCompactUsd
} from './market-data.ts';

describe('mulberry32', () => {
	/**
	 * The whole reason this PRNG exists instead of `Math.random()`. If it were not
	 * deterministic, the server would render different numbers than the client, and
	 * hydration would visibly patch the DOM.
	 */
	it('produces the same sequence for the same seed', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);

		const first = Array.from({ length: 20 }, () => a());
		const second = Array.from({ length: 20 }, () => b());

		expect(first).toEqual(second);
	});

	it('produces different sequences for different seeds', () => {
		const a = mulberry32(1);
		const b = mulberry32(2);
		expect(a()).not.toBe(b());
	});

	it('stays within [0, 1)', () => {
		const random = mulberry32(7);
		for (let i = 0; i < 500; i += 1) {
			const value = random();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});

describe('generateSeries', () => {
	it('is deterministic', () => {
		expect(generateSeries({ seed: 99 })).toEqual(generateSeries({ seed: 99 }));
	});

	it('produces the requested number of bars', () => {
		const series = generateSeries({ bars: 50 });
		expect(series.price).toHaveLength(50);
		expect(series.volume).toHaveLength(50);
	});

	it('produces strictly increasing, evenly spaced timestamps', () => {
		const { price } = generateSeries({ bars: 30, interval: 300 });

		for (let i = 1; i < price.length; i += 1) {
			const previous = price[i - 1];
			const current = price[i];
			expect(previous).toBeDefined();
			expect(current).toBeDefined();
			// Lightweight Charts silently misbehaves on out-of-order data, so this
			// invariant matters more than it looks.
			expect(current!.time - previous!.time).toBe(300);
		}
	});

	it('never produces a non-positive price', () => {
		// A random walk can wander below zero without the guard in generateSeries.
		for (const seed of [1, 500, 12345, 987654]) {
			for (const point of generateSeries({ seed, bars: 400 }).price) {
				expect(point.value).toBeGreaterThan(0);
			}
		}
	});

	it('reports a change consistent with the first and last points', () => {
		const series = generateSeries({ bars: 40 });
		const first = series.price[0]?.value ?? 0;
		const last = series.price[series.price.length - 1]?.value ?? 0;

		expect(series.last).toBeCloseTo(last, 2);
		expect(series.changeAbs).toBeCloseTo(last - first, 2);
	});

	it('colours volume bars by direction', () => {
		const { volume } = generateSeries({ bars: 60 });
		const colours = new Set(volume.map((bar) => bar.color));
		// Over 60 bars a random walk should produce both up and down bars.
		expect(colours.size).toBe(2);
	});
});

describe('nextPoint', () => {
	it('advances time by the interval', () => {
		const random = mulberry32(3);
		const start = generateSeries({ bars: 2 }).price[1];
		expect(start).toBeDefined();

		const next = nextPoint(start!, random, 300);
		expect(next.time - start!.time).toBe(300);
	});

	it('is deterministic given the same generator state', () => {
		const start = generateSeries({ bars: 2 }).price[1];
		expect(start).toBeDefined();

		expect(nextPoint(start!, mulberry32(5))).toEqual(nextPoint(start!, mulberry32(5)));
	});
});

describe('formatting', () => {
	it('formats US dollars', () => {
		expect(formatUsd(428.5)).toBe('$428.50');
		expect(formatUsd(1000)).toBe('$1,000.00');
	});

	it('formats large values compactly', () => {
		// This one is stable: two significant decimals, no trailing zero to argue
		// about, and every ICU version agrees.
		expect(formatCompactUsd(1_240_000)).toBe('$1.24M');
	});

	it('formats a value with a trailing zero, whichever ICU is installed', () => {
		/*
		 * DELIBERATELY A PATTERN, NOT AN EXACT STRING.
		 *
		 * `Intl` is implemented by ICU, the Unicode library Node bundles, and its
		 * output is a moving target across versions. Compact *currency* formatting
		 * used to keep the currency's minimum fraction digits — `$5.60K` — and as
		 * of ICU 78.3 it trims them: `$5.6K`. Node 22 ships 78.2, Node 24 ships
		 * 78.3, so the same code produces different text on each.
		 *
		 * A byte-exact assertion here is therefore not a test of this function. It
		 * is a test of which Node version is installed, and it fails on upgrade for
		 * a reason that has nothing to do with the code under test. This project
		 * learned that the hard way while moving from Node 22 to Node 24.
		 *
		 * What the app actually needs is the right symbol, the right magnitude
		 * suffix, and no more than two decimals. That is what this asserts.
		 */
		expect(formatCompactUsd(5_600)).toMatch(/^\$5\.60?K$/);
		expect(formatCompactUsd(1_000)).toMatch(/^\$1(\.00)?K$/);
	});
});
