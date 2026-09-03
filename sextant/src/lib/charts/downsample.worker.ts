/**
 * THE DOWNSAMPLING WORKER
 * =======================
 *
 * LTTB on a big series, off the main thread.
 *
 * WHEN A WORKER IS AND IS NOT WORTH IT
 * ------------------------------------
 * LTTB is O(n). On ten thousand points it takes well under a millisecond and a
 * worker would be pure overhead — the structured clone of the input costs more
 * than the work. This is not that case: a metric query over a fortnight at
 * one-minute resolution is twenty thousand points *per series*, a comparison
 * view has eight series, and the range is re-cut on every drag of the time
 * selector. That is a few hundred thousand points recomputed several times a
 * second, and on the main thread it is exactly the kind of work that turns a
 * smooth drag into a slideshow.
 *
 * The honest rule: a worker is worth it when the work is long enough to drop a
 * frame *and* happens while something is animating. Both halves matter. Long
 * work that happens once on load is better left where it is, because a worker
 * adds a round trip to the very first paint.
 *
 * WHY THE DATA CROSSES AS TYPED ARRAYS
 * ------------------------------------
 * An array of `{x, y}` objects clones to twenty thousand JavaScript objects, and
 * the clone shows up in a profile as more time than the algorithm. Two
 * `Float64Array`s **transfer** instead: ownership moves, nothing is copied, and
 * the cost is constant regardless of length. The price is that the caller's
 * arrays are detached afterwards, which is why the wrapper always allocates
 * fresh ones.
 */

import { lttb, type Point } from '#lib/series/downsample.ts';

export interface DownsampleRequest {
	readonly id: number;
	/** Timestamps and values as parallel arrays, transferred rather than copied. */
	readonly xs: Float64Array;
	readonly ys: Float64Array;
	readonly threshold: number;
}

export interface DownsampleResponse {
	readonly id: number;
	readonly xs: Float64Array;
	readonly ys: Float64Array;
}

self.addEventListener('message', (event: MessageEvent<DownsampleRequest>) => {
	const { id, xs, ys, threshold } = event.data;

	const points: Point[] = new Array(xs.length);
	for (let i = 0; i < xs.length; i += 1) points[i] = { x: xs[i]!, y: ys[i]! };

	const kept = lttb(points, threshold);

	const outX = new Float64Array(kept.length);
	const outY = new Float64Array(kept.length);
	for (let i = 0; i < kept.length; i += 1) {
		outX[i] = kept[i]!.x;
		outY[i] = kept[i]!.y;
	}

	const response: DownsampleResponse = { id, xs: outX, ys: outY };

	/*
	 * Transferred back, for the same reason they came in that way.
	 *
	 * The transfer list is the second argument and is easy to forget — forgetting
	 * it is not an error, it just silently copies, which is why this is the kind of
	 * optimisation that quietly stops working.
	 */
	(self as unknown as Worker).postMessage(response, [outX.buffer, outY.buffer]);
});
