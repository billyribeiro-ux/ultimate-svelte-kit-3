/**
 * SCALES AND TICKS
 * ================
 *
 * The arithmetic behind a chart, with no canvas in sight.
 *
 * Everything here is a pure function of numbers, which is not tidiness for its
 * own sake: axis tick selection is the part of charting that is genuinely easy
 * to get wrong, and it is impossible to test through a canvas. A chart that
 * labels its axis `0, 3.333, 6.667, 10` is not broken in any way a screenshot
 * test would catch — it is just worse than one labelled `0, 2.5, 5, 7.5, 10`,
 * and the difference is a function that can be tested in a line.
 */

import { DAY, HOUR, MINUTE, SECOND, STEPS, floorTo } from '#lib/series/bucket.ts';

/** A linear mapping from a data range onto a pixel range. */
export interface Scale {
	(value: number): number;
	/** The inverse, for turning a pointer position back into a value. */
	readonly invert: (pixel: number) => number;
}

export function linear(domain: readonly [number, number], range: readonly [number, number]): Scale {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	/*
	 * A zero-width domain would divide by zero and put every point at NaN, which
	 * canvas silently declines to draw — producing a blank chart with no error.
	 * One is the width of a single unit, so a flat series draws as a flat line at
	 * the bottom rather than as nothing.
	 */
	const span = d1 - d0 === 0 ? 1 : d1 - d0;

	const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as {
		(value: number): number;
		invert: (pixel: number) => number;
	};

	scale.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span;

	return scale as Scale;
}

/**
 * Round tick values covering `[min, max]`.
 *
 * The classic 1-2-5 ladder: every step is 1, 2 or 5 times a power of ten, so
 * every label is a number people read without thinking. `count` is a *target*,
 * not a promise — insisting on exactly five ticks is what produces the
 * `0, 3.333, 6.667` axis, because five even divisions of an arbitrary range are
 * arbitrary numbers.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];

	const rough = (max - min) / Math.max(1, count);
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	const normalised = rough / magnitude;

	/*
	 * The ladder: 1, 2, 5, 10 — and 10 is 1 at the next magnitude, which is why the
	 * list ends there rather than going on.
	 *
	 * The rung is chosen by *nearest*, not by "the first one at least this big".
	 * The difference sounds academic and is not: rounding up always overshoots, so
	 * asking for five ticks across [0, 10] gives a step of 5 and an axis with two
	 * of them. Rounding to the nearest rung gives a step of 2 and the five that
	 * were asked for. The boundaries below (1.5, 3, 7) are the geometric midpoints
	 * of the rungs, which is what "nearest" means on a log scale.
	 */
	const step = (normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10) * magnitude;

	const ticks: number[] = [];
	// `Math.ceil(min / step)` rather than `min` itself: the first tick must be a
	// multiple of the step, or the axis is a round ladder starting at an odd rung.
	for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
		// Re-rounded, because repeated addition of 0.1 arrives at 0.30000000000000004
		// and prints it.
		ticks.push(Math.round(value / step) * step);
	}

	return ticks;
}

/**
 * Time ticks, snapped to the same step ladder the data is bucketed on.
 *
 * Reusing `STEPS` rather than inventing a second ladder is what keeps the
 * gridlines aligned with the buckets. A chart whose gridline sits at 10:00:00
 * while its bars start at 09:59:30 is subtly, permanently confusing, and the
 * cause is always two pieces of code that each chose their own round number.
 */
export function timeTicks(from: number, to: number, count = 5): number[] {
	const target = (to - from) / Math.max(1, count);

	/*
	 * The nearest rung, for the same reason as above.
	 *
	 * `STEPS.find(candidate >= target)` is the obvious line and it always rounds
	 * up: a six-hour range asking for five ticks has a target of 1.2 hours, finds
	 * the 3-hour step, and draws two gridlines. Nearest finds the 1-hour step and
	 * draws six.
	 */
	const step = STEPS.reduce((best, candidate) =>
		Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best
	);

	const ticks: number[] = [];
	for (let at = floorTo(from, step); at <= to; at += step) {
		if (at >= from) ticks.push(at);
	}

	return ticks;
}

/**
 * A tick label, short enough to fit under a gridline.
 *
 * `1.2k` rather than `1200`, because an axis of five-digit numbers takes more
 * horizontal room than the chart it labels — and nobody reads an axis to four
 * significant figures. The exact value is in the crosshair.
 */
export function formatTick(value: number): string {
	const magnitude = Math.abs(value);

	if (magnitude >= 1_000_000_000) return `${trim(value / 1_000_000_000)}B`;
	if (magnitude >= 1_000_000) return `${trim(value / 1_000_000)}M`;
	if (magnitude >= 1_000) return `${trim(value / 1_000)}k`;
	if (magnitude === 0) return '0';
	if (magnitude < 0.01) return value.toExponential(1);

	return trim(value);
}

function trim(value: number): string {
	// Two decimals at most, and no trailing zeroes: `1.5k`, not `1.50k`.
	return String(Math.round(value * 100) / 100);
}

/**
 * A time-axis label, at the precision the range calls for.
 *
 * A six-hour range wants `14:30`; a two-week range wants `12 Mar`; a
 * ninety-second range wants `14:30:05`. Showing seconds on a two-week axis is
 * six wasted characters per label and a row that no longer fits.
 */
export function formatTimeTick(at: number, span: number, locale = 'en-GB'): string {
	const options: Intl.DateTimeFormatOptions =
		span >= 7 * DAY
			? { day: '2-digit', month: 'short' }
			: span >= DAY
				? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
				: span >= 10 * MINUTE
					? { hour: '2-digit', minute: '2-digit', hour12: false }
					: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

	return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(at);
}

/** Exported so the tests and the chart agree on what the ladder contains. */
export const TICK_UNITS = { SECOND, MINUTE, HOUR, DAY } as const;
