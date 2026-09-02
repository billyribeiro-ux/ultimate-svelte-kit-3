/**
 * DOWNSAMPLING — LARGEST TRIANGLE THREE BUCKETS
 * ============================================
 *
 * A chart 900 pixels wide cannot usefully draw 100,000 points. Something has to
 * choose which ones survive, and the choice is not cosmetic: it decides whether
 * the spike that caused the incident is visible.
 *
 * WHAT THE OBVIOUS ANSWERS GET WRONG
 * ----------------------------------
 * **Take every nth point.** A spike lasting fewer than n samples is invisible
 * with probability (n-1)/n. On a day of one-second data at 900 pixels, n is 96,
 * so a 30-second outage disappears about 97% of the time. This is the default in
 * more dashboards than anybody would like.
 *
 * **Average each bucket.** The spike survives, divided by the bucket size — a
 * 5-second burst to 10s latency inside a 96-second bucket renders as 520ms,
 * which looks like ordinary jitter. Averaging is *lossy in the direction that
 * matters*: it always understates extremes, never overstates them.
 *
 * **Min and max per bucket.** Honest about extremes and doubles the point count,
 * and the resulting shape is a band rather than a line — which is right for a
 * range chart and wrong when somebody is trying to read one series' behaviour.
 *
 * WHAT LTTB DOES
 * --------------
 * Steinarsson's algorithm (2013). Divide into buckets, keep the first and last
 * points, and from each bucket keep the single point forming the **largest
 * triangle** with the previously kept point and the average of the next bucket.
 * Area is a proxy for "how much this point changes the shape", so points on a
 * flat stretch score near zero and a lone spike scores enormously.
 *
 * The result has exactly the requested number of points, preserves visual shape,
 * and — the property that matters here — **keeps every point that is a local
 * extreme by a wide margin**, because a spike forms a large triangle with
 * anything.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It is not an average, so the y values are *real samples that really occurred*.
 * That is a feature for reading a chart and a trap for reading a number off one:
 * the crosshair in `MetricChart.svelte` reads from the full series rather than
 * the drawn one, because otherwise the number under the pointer would be the
 * nearest surviving sample rather than the value at that time.
 */

export interface Point {
	readonly x: number;
	readonly y: number;
}

/**
 * Reduce `points` to at most `threshold` points, preserving shape.
 *
 * Points must be sorted by `x`. They are, everywhere this is called, because
 * they come from a bucketed query — and sorting here would hide a caller that
 * has lost its ordering, which is a bug worth surfacing rather than papering
 * over.
 */
export function lttb(points: readonly Point[], threshold: number): Point[] {
	if (threshold >= points.length || threshold < 3) {
		// Fewer points than asked for, or a threshold too small for the algorithm to
		// mean anything (it always keeps the first and last, so below 3 there is
		// nothing to choose). Returning a copy rather than the input keeps the
		// return type honestly mutable.
		return [...points];
	}

	const out: Point[] = [points[0]!];

	// Every bucket except the first and last point, which are always kept.
	const every = (points.length - 2) / (threshold - 2);

	let previous = 0;

	for (let i = 0; i < threshold - 2; i += 1) {
		// The average of the *next* bucket is the third triangle vertex. Using the
		// next bucket rather than the next point is what makes the choice look ahead
		// rather than only behind — and it is why LTTB keeps the leading edge of a
		// spike rather than the point just after it.
		const nextStart = Math.floor((i + 1) * every) + 1;
		const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, points.length);

		let avgX = 0;
		let avgY = 0;
		const nextCount = nextEnd - nextStart;

		for (let j = nextStart; j < nextEnd; j += 1) {
			avgX += points[j]!.x;
			avgY += points[j]!.y;
		}

		if (nextCount > 0) {
			avgX /= nextCount;
			avgY /= nextCount;
		}

		const start = Math.floor(i * every) + 1;
		const end = Math.min(Math.floor((i + 1) * every) + 1, points.length);

		const anchor = points[previous]!;
		let bestArea = -1;
		let bestIndex = start;

		for (let j = start; j < end; j += 1) {
			const point = points[j]!;

			/*
			 * Twice the triangle's area, by the cross product. The factor of two and
			 * the absolute value are both kept: dropping the `abs` makes the choice
			 * depend on which way the line happens to turn, which quietly prefers
			 * downward spikes over upward ones.
			 */
			const area = Math.abs(
				(anchor.x - avgX) * (point.y - anchor.y) - (anchor.x - point.x) * (avgY - anchor.y)
			);

			if (area > bestArea) {
				bestArea = area;
				bestIndex = j;
			}
		}

		out.push(points[bestIndex]!);
		previous = bestIndex;
	}

	out.push(points.at(-1)!);
	return out;
}

/**
 * The true extremes of a series, regardless of what downsampling kept.
 *
 * The y axis must be scaled to the real data, not to the drawn data. Scaling to
 * the downsampled points would make the axis change as the window is resized —
 * and, worse, would clip a spike that LTTB happened not to keep, so the chart
 * would show a line running off the top of its own axis.
 */
export function extent(points: readonly Point[]): { min: number; max: number } | null {
	if (points.length === 0) return null;

	let min = Infinity;
	let max = -Infinity;

	for (const point of points) {
		if (!Number.isFinite(point.y)) continue;
		if (point.y < min) min = point.y;
		if (point.y > max) max = point.y;
	}

	return Number.isFinite(min) ? { min, max } : null;
}

/**
 * A y-axis range with a sensible floor and a little headroom.
 *
 * Two decisions worth stating. The axis starts at zero for a series that is
 * always positive, because a latency chart auto-scaled to [198, 202] turns
 * millisecond noise into a mountain range and people react to it. And a series
 * that is entirely flat gets an artificial band, because a zero-height axis
 * divides by zero and renders every point on the same pixel row — which looks
 * like a broken chart rather than a stable metric.
 */
export function axisRange(points: readonly Point[]): { min: number; max: number } {
	const bounds = extent(points);
	if (!bounds) return { min: 0, max: 1 };

	const min = bounds.min >= 0 ? 0 : bounds.min;
	const max = bounds.max;

	if (max === min) return { min, max: min === 0 ? 1 : min * 1.5 };

	// 5% headroom, so a line at the maximum is not drawn on the top border where
	// it is indistinguishable from a clipped one.
	return { min, max: max + (max - min) * 0.05 };
}
