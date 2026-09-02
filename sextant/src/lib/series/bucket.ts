/**
 * TIME BUCKETS
 * ============
 *
 * Turning "the last six hours" and "a chart 900 pixels wide" into a step, and
 * aligning a range to it.
 *
 * THE RULE THAT MATTERS: BUCKETS ARE ABSOLUTE, NOT RELATIVE
 * --------------------------------------------------------
 * A five-minute bucket starts at :00, :05, :10 — never at "five minutes before
 * now". Aligning to the query time would give every request a different set of
 * bucket boundaries, which means:
 *
 *   - no two dashboards agree, because they loaded a second apart
 *   - nothing can be cached, because the key includes the current millisecond
 *   - a rollup table is useless, because its rows are on absolute boundaries
 *   - a chart appears to shimmer as it refreshes, because every point moves
 *
 * All four are consequences of one line: `Math.floor(t / step) * step`. Getting
 * it wrong is easy — `now - i * step` reads naturally — and every one of those
 * symptoms is investigated separately before somebody finds the cause.
 *
 * THE STEPS ARE A FIXED LADDER
 * ----------------------------
 * Not `range / pixels` rounded to something tidy. A fixed ladder means the step
 * changes in visible jumps as you zoom, which is what makes a rollup table
 * possible at all: pre-aggregating at 1m, 5m, 1h and 1d covers every step a
 * query can ask for, and an arbitrary step would need a rollup per width.
 */

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * The steps a chart may use, ascending.
 *
 * Every one divides the next one that is a multiple of it, so a coarser series
 * can always be built by merging finer buckets — which is what lets a 1h rollup
 * answer a 6h query without touching raw data. `10s` into `30s` into `1m` into
 * `5m` and so on: check the ladder against that property when adding a step, or
 * the rollup merge silently produces buckets that straddle boundaries.
 */
export const STEPS: readonly number[] = [
	SECOND,
	5 * SECOND,
	10 * SECOND,
	30 * SECOND,
	MINUTE,
	5 * MINUTE,
	10 * MINUTE,
	30 * MINUTE,
	HOUR,
	3 * HOUR,
	6 * HOUR,
	12 * HOUR,
	DAY
];

/** The rollup resolutions actually stored. A query picks the finest that divides its step. */
export const ROLLUPS: readonly number[] = [MINUTE, 5 * MINUTE, HOUR, DAY];

export interface Range {
	/** Inclusive. */
	readonly from: number;
	/** Exclusive, so adjacent ranges tile without double-counting the boundary. */
	readonly to: number;
}

/**
 * The finest step that keeps the number of buckets under `maxBuckets`.
 *
 * `maxBuckets` is the chart's pixel width, near enough: drawing more buckets
 * than there are pixels is work whose result is thrown away by the rasteriser,
 * and it is the single most common reason a metrics UI is slow.
 */
export function stepFor(range: Range, maxBuckets: number): number {
	const span = Math.max(0, range.to - range.from);
	if (span === 0) return STEPS[0]!;

	for (const step of STEPS) {
		if (span / step <= maxBuckets) return step;
	}

	// Past the ladder: a range of years. Use the coarsest and accept more buckets
	// rather than inventing a step no rollup can serve.
	return STEPS.at(-1)!;
}

/** Round a timestamp down to the start of its bucket. Absolute, not relative. */
export function floorTo(timestamp: number, step: number): number {
	return Math.floor(timestamp / step) * step;
}

/** Round up. Used for the exclusive end of an aligned range. */
export function ceilTo(timestamp: number, step: number): number {
	return Math.ceil(timestamp / step) * step;
}

/**
 * Widen a range to whole buckets.
 *
 * Widen rather than narrow: a chart that drops the partial bucket at each end
 * loses up to two steps of data, and at a one-day step that is two days. The
 * partial buckets are honest — they contain what happened in the part of the
 * bucket that falls inside the range — and the alternative is a chart that
 * disagrees with a table computed over the same range.
 */
export function alignRange(range: Range, step: number): Range {
	return { from: floorTo(range.from, step), to: ceilTo(range.to, step) };
}

/** Every bucket start in an aligned range. */
export function buckets(range: Range, step: number): number[] {
	const aligned = alignRange(range, step);
	const out: number[] = [];
	for (let at = aligned.from; at < aligned.to; at += step) out.push(at);
	return out;
}

/**
 * The coarsest stored rollup that can be merged up to `step`.
 *
 * A 15-minute step is served by the 5-minute rollup (three buckets merged), not
 * by the 1-minute one — but a 10-minute step is served by the 1-minute rollup,
 * because 5 does not divide 10... it does. The point of the check is the case it
 * rejects: an hour does not divide a day-and-a-half, and merging anyway produces
 * buckets that straddle boundaries and are wrong in a way no test of totals
 * catches, because the totals still add up.
 */
export function rollupFor(step: number): number | null {
	let best: number | null = null;
	for (const rollup of ROLLUPS) {
		if (rollup <= step && step % rollup === 0) best = rollup;
	}
	return best;
}

/**
 * Fill in the buckets a series does not have.
 *
 * A metric that reported nothing for ten minutes has no rows for those buckets,
 * and a chart drawn from the rows alone connects the two sides of the gap with a
 * straight line — which reads as "it was fine the whole time" rather than "we
 * have no idea". Explicit nulls are what let the renderer break the line.
 *
 * The distinction matters most for exactly the series people watch during an
 * incident, because an agent that has stopped reporting is a symptom.
 */
export function densify<T>(
	points: readonly { readonly at: number; readonly value: T }[],
	range: Range,
	step: number
): { at: number; value: T | null }[] {
	const byBucket = new Map<number, T>();
	for (const point of points) byBucket.set(floorTo(point.at, step), point.value);

	return buckets(range, step).map((at) => ({ at, value: byBucket.get(at) ?? null }));
}

/**
 * A step, as a person would say it.
 *
 * Used in the chart's axis label and in "one point per —". Reads the ladder
 * rather than doing division chains, so a new step gets a name automatically
 * instead of falling through to something like "0.5h".
 */
export function describeStep(step: number): string {
	if (step % DAY === 0) return plural(step / DAY, 'day');
	if (step % HOUR === 0) return plural(step / HOUR, 'hour');
	if (step % MINUTE === 0) return plural(step / MINUTE, 'minute');
	return plural(step / SECOND, 'second');
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
