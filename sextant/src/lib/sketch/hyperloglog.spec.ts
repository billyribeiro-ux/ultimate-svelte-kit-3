import { describe, expect, it } from 'vitest';
import { HyperLogLog, hash64 } from './hyperloglog.ts';
import { relativeError, seeded } from './testing.ts';

/** A sketch of `n` distinct values, named the way real ids are. */
function sketchOf(n: number, prefix = 'user-'): HyperLogLog {
	const sketch = new HyperLogLog();
	for (let i = 0; i < n; i += 1) sketch.add(`${prefix}${i}`);
	return sketch;
}

/**
 * The published standard error for P=11 is about 2.3%. Assertions allow three
 * times that, because a *standard* error is one sigma: roughly a third of
 * honest runs exceed it, and a test that fails a third of the time is worse
 * than no test. Three sigma is the line between "noisy" and "broken".
 */
const THREE_SIGMA = 0.07;

describe('accuracy', () => {
	it('estimates across five orders of magnitude', () => {
		for (const n of [100, 1_000, 10_000, 100_000, 1_000_000]) {
			const estimate = sketchOf(n).count();
			expect(relativeError(estimate, n), `n=${n} got ${estimate}`).toBeLessThan(THREE_SIGMA);
		}
	});

	it('is exact at zero', () => {
		/*
		 * The correction this pins. Without linear counting, an *empty* sketch with
		 * 2048 registers estimates about 1478 — so a service nobody has used reports
		 * "~1.5k distinct users", and the number is never trusted again.
		 */
		expect(new HyperLogLog().count()).toBe(0);
	});

	it('is close to exact for very small counts', () => {
		/*
		 * The range where linear counting does the work.
		 *
		 * Note "close to" rather than "exactly": linear counting estimates from the
		 * number of *empty registers*, so two values that hash to the same register
		 * cost one from the estimate. At n=50 into 2,048 registers a collision is
		 * likely — the birthday bound — and the honest assertion is within a value
		 * or two, not equality. Asserting equality here passes for four of the five
		 * cases and fails on the fifth, which is exactly the kind of test that gets
		 * "fixed" by loosening it until it means nothing.
		 */
		for (const n of [1, 2, 5, 17, 50]) {
			expect(Math.abs(sketchOf(n).count() - n), `n=${n}`).toBeLessThanOrEqual(2);
		}
	});

	it('handles structured ids, which is where a weak hash fails', () => {
		/*
		 * `user-1`, `user-2`, `user-3` differ in their low bits and barely at all in
		 * their high ones — and the high bits choose the register. A sketch built on
		 * raw FNV-1a without the avalanche finaliser puts most of these into a
		 * handful of registers and under-counts by an order of magnitude.
		 */
		for (const prefix of ['user-', 'pod-nginx-', '10.0.0.', 'trace:0000']) {
			const estimate = sketchOf(50_000, prefix).count();
			expect(relativeError(estimate, 50_000), prefix).toBeLessThan(THREE_SIGMA);
		}
	});

	it('handles random ids too', () => {
		const random = seeded(3);
		const sketch = new HyperLogLog();
		for (let i = 0; i < 100_000; i += 1) sketch.add(random().toString(36));
		expect(relativeError(sketch.count(), 100_000)).toBeLessThan(THREE_SIGMA);
	});
});

describe('idempotence and order', () => {
	it('is unchanged by adding the same value twice', () => {
		// A register only ever moves up, so this is true by construction — which is
		// what makes ingest safe to retry without deduplicating.
		const once = sketchOf(1_000);
		const twice = sketchOf(1_000);
		for (let i = 0; i < 1_000; i += 1) twice.add(`user-${i}`);
		expect(twice.count()).toBe(once.count());
	});

	it('does not depend on insertion order', () => {
		const forwards = new HyperLogLog();
		const backwards = new HyperLogLog();
		for (let i = 0; i < 5_000; i += 1) forwards.add(`user-${i}`);
		for (let i = 4_999; i >= 0; i -= 1) backwards.add(`user-${i}`);
		expect(backwards.toJSON()).toEqual(forwards.toJSON());
	});
});

describe('merging', () => {
	it('counts the union, not the sum', () => {
		/*
		 * The property `count` alone cannot give you. Two overlapping sets summed
		 * would double-count the overlap; merged sketches do not.
		 */
		const a = new HyperLogLog();
		const b = new HyperLogLog();
		for (let i = 0; i < 60_000; i += 1) a.add(`user-${i}`);
		for (let i = 40_000; i < 100_000; i += 1) b.add(`user-${i}`);

		a.merge(b);
		expect(relativeError(a.count(), 100_000)).toBeLessThan(THREE_SIGMA);
	});

	it('matches sketching everything at once', () => {
		const minutes = Array.from({ length: 60 }, (_, m) => {
			const sketch = new HyperLogLog();
			for (let i = 0; i < 500; i += 1) sketch.add(`user-${m * 500 + i}`);
			return sketch;
		});

		const merged = new HyperLogLog();
		for (const sketch of minutes) merged.merge(sketch);

		// Identical, not merely close: a merge is a register-wise max over the same
		// registers the direct sketch would have set.
		expect(merged.toJSON()).toEqual(sketchOf(30_000).toJSON());
	});

	it('is commutative, associative and idempotent', () => {
		const parts = Array.from({ length: 5 }, (_, p) => {
			const sketch = new HyperLogLog();
			for (let i = 0; i < 2_000; i += 1) sketch.add(`u-${p}-${i}`);
			return sketch;
		});

		const forwards = new HyperLogLog();
		for (const part of parts) forwards.merge(part);

		const backwards = new HyperLogLog();
		for (const part of [...parts].reverse()) backwards.merge(part);

		// Merging the same sketch again changes nothing — max is idempotent.
		const twice = HyperLogLog.fromJSON(forwards.toJSON());
		for (const part of parts) twice.merge(part);

		expect(backwards.toJSON()).toEqual(forwards.toJSON());
		expect(twice.toJSON()).toEqual(forwards.toJSON());
	});
});

describe('size', () => {
	it('stays the same regardless of cardinality', () => {
		// The whole reason to use this rather than a Set.
		const small = JSON.stringify(sketchOf(10)).length;
		const large = JSON.stringify(sketchOf(1_000_000)).length;
		expect(large).toBe(small);
		expect(large).toBeLessThan(3_200);
	});
});

describe('serialisation', () => {
	it('round-trips exactly', () => {
		const sketch = sketchOf(25_000);
		const revived = HyperLogLog.fromJSON(JSON.parse(JSON.stringify(sketch)));
		expect(revived.count()).toBe(sketch.count());
		expect(revived.toJSON()).toEqual(sketch.toJSON());
	});

	it('refuses registers from a different precision', () => {
		// The index bits mean something else; reading them would silently produce a
		// wrong number rather than an error.
		expect(() => HyperLogLog.fromJSON({ p: 14, r: '' })).toThrow(/precision changed/);
	});
});

describe('the hash', () => {
	it('is deterministic', () => {
		expect(hash64('checkout')).toBe(hash64('checkout'));
	});

	it('fills the top bits, which is what the register index reads', () => {
		/*
		 * The failure the avalanche finaliser exists to prevent, asserted directly:
		 * the top 11 bits of the hash must spread over all 2048 register indices for
		 * inputs that differ only in their last character.
		 */
		const indices = new Set<number>();
		for (let i = 0; i < 20_000; i += 1) {
			indices.add(Number(hash64(`user-${i}`) >> 53n));
		}
		// With 20,000 draws into 2,048 buckets, all but a vanishing fraction should
		// be hit. Raw FNV-1a manages a few dozen.
		expect(indices.size).toBeGreaterThan(2_000);
	});

	it('stays inside 64 bits', () => {
		for (const value of ['', 'a', 'a'.repeat(1_000), '🙂']) {
			expect(hash64(value)).toBeLessThan(1n << 64n);
			expect(hash64(value)).toBeGreaterThanOrEqual(0n);
		}
	});
});
