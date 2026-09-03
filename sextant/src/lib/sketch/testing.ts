/**
 * Deterministic helpers for the sketch specs.
 *
 * A property test that cannot be replayed is not a test — it is a rumour. Every
 * random choice here comes from a seeded generator, so a failure prints a seed
 * and that seed reproduces it exactly, on any machine, in a year.
 */

/** mulberry32 — 32 bits of state, uniform enough, short enough to read. */
export function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A log-normal sample, which is what latency actually looks like.
 *
 * Testing a percentile sketch against a uniform distribution is testing the easy
 * case: uniform data spreads evenly over buckets and every implementation looks
 * accurate. Real latency is log-normal with a long tail, most mass in a narrow
 * band and the interesting values three orders of magnitude away — which is
 * precisely where a bucket mapping is under strain.
 */
export function logNormal(random: () => number, median: number, sigma: number): number {
	// Box-Muller. `1 - random()` because `random()` can return exactly 0 and
	// `log(0)` is -Infinity, which would produce a NaN sample once every four
	// billion draws — rare enough to pass every test and fail in production.
	const u = 1 - random();
	const v = random();
	const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	return median * Math.exp(sigma * normal);
}

/** The exact quantile of a sample, by sorting. The reference every test compares against. */
export function exactQuantile(values: readonly number[], q: number): number {
	if (values.length === 0) return NaN;
	const sorted = [...values].sort((a, b) => a - b);
	// The same rank convention the sketch uses: `q * (n - 1)`, floored. Comparing
	// against a different convention makes every assertion off by one element and
	// sends you looking for a bug in the mapping.
	return sorted[Math.floor(q * (sorted.length - 1))]!;
}

/** Relative error between an estimate and the truth, safe at zero. */
export function relativeError(estimate: number, truth: number): number {
	if (truth === 0) return estimate === 0 ? 0 : Infinity;
	return Math.abs(estimate - truth) / Math.abs(truth);
}
