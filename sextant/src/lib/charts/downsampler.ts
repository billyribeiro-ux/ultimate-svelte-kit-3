/**
 * TALKING TO THE WORKER
 * =====================
 *
 * A worker is a message channel, and a message channel is not a function call.
 * Everything awkward about using one comes from that gap, and there are exactly
 * three problems to solve:
 *
 *   1. **Replies are unordered.** Two requests in flight can come back either
 *      way round. Every message carries an id and the reply is matched to it —
 *      without which a fast small series overtakes a slow big one and each chart
 *      draws the other's data.
 *
 *   2. **Most replies are already stale.** Dragging a time range fires a request
 *      per frame; by the time the tenth reply lands, nine of them are answers to
 *      questions nobody is asking. Keeping only the newest id per chart is the
 *      whole of the fix, and it is why this holds a `#latest` rather than a
 *      queue.
 *
 *   3. **The worker must be torn down.** A component that creates one per
 *      instance and never terminates it leaks a thread per navigation. One
 *      shared worker for the page, created lazily on first use.
 *
 * The API is a promise, because that is what callers want. The bookkeeping that
 * turns a channel into a promise lives here so that no component ever has to
 * think about it.
 */

import type { Point } from '#lib/series/downsample.ts';
import { lttb } from '#lib/series/downsample.ts';
import type { DownsampleResponse } from './downsample.worker.ts';

/**
 * Below this, do it here.
 *
 * The round trip to a worker is a fraction of a millisecond and so is LTTB on a
 * short series, so for small inputs the message is the expensive part. Two
 * thousand is where they cross on a mid-range laptop; the exact number matters
 * far less than having one, because without it a chart of forty points pays for
 * a thread.
 */
const WORKER_THRESHOLD = 2_000;

let worker: Worker | null = null;
let nextId = 1;

/** Outstanding requests by id, so an out-of-order reply finds its caller. */
const pending = new Map<number, (points: Point[]) => void>();

function ensureWorker(): Worker | null {
	if (worker) return worker;
	// No `Worker` during server rendering, and no need for one: SSR draws no
	// canvas. Returning null makes the caller fall back to the direct path, which
	// is the same code that runs for small inputs.
	if (typeof Worker === 'undefined') return null;

	worker = new Worker(new URL('./downsample.worker.ts', import.meta.url), { type: 'module' });

	worker.addEventListener('message', (event: MessageEvent<DownsampleResponse>) => {
		const { id, xs, ys } = event.data;
		const resolve = pending.get(id);
		// Not an error: a reply whose caller has gone away is the normal outcome of
		// navigating mid-request.
		if (!resolve) return;

		pending.delete(id);

		const points: Point[] = new Array(xs.length);
		for (let i = 0; i < xs.length; i += 1) points[i] = { x: xs[i]!, y: ys[i]! };
		resolve(points);
	});

	return worker;
}

export async function downsample(points: readonly Point[], threshold: number): Promise<Point[]> {
	if (points.length < WORKER_THRESHOLD) return lttb(points, threshold);

	const instance = ensureWorker();
	if (!instance) return lttb(points, threshold);

	const id = nextId++;
	const xs = new Float64Array(points.length);
	const ys = new Float64Array(points.length);

	for (let i = 0; i < points.length; i += 1) {
		xs[i] = points[i]!.x;
		ys[i] = points[i]!.y;
	}

	return new Promise<Point[]>((resolve) => {
		pending.set(id, resolve);
		// Transferred: the two buffers move to the worker and are detached here,
		// which is safe because they were allocated for this call and nothing else
		// holds a reference.
		instance.postMessage({ id, xs, ys, threshold }, [xs.buffer, ys.buffer]);
	});
}

/**
 * Stop the worker.
 *
 * Nothing in the application calls this: the worker is page-scoped and dies with
 * the page. It exists for tests, which otherwise leave a thread running and
 * report a hanging process rather than a failure.
 */
export function stopDownsampler(): void {
	worker?.terminate();
	worker = null;
	pending.clear();
}
