/// <reference lib="webworker" />

/**
 * SVG TO PNG, OFF THE MAIN THREAD
 * ===============================
 *
 * Rasterising a large diagram is tens of milliseconds of decode and draw. On the
 * main thread that is several dropped frames at the exact moment somebody has
 * pressed a button and is watching for a response — the worst possible time to
 * be busy.
 *
 * `OffscreenCanvas` is what makes this possible at all: a `<canvas>` element
 * cannot exist in a worker, and without one there is nothing to draw into.
 *
 * The worker is deliberately tiny and knows nothing about boards. It takes a
 * string of SVG and gives back PNG bytes, which makes it testable by hand and
 * means a change to how a diagram looks never touches this file.
 */

export interface RasterRequest {
	readonly svg: string;
	readonly width: number;
	readonly height: number;
	/** Device pixel ratio, so an export looks right on a high-density screen. */
	readonly scale: number;
}

export interface RasterResponse {
	readonly ok: boolean;
	readonly blob?: Blob;
	readonly error?: string;
}

self.onmessage = async (event: MessageEvent<RasterRequest>) => {
	const { svg, width, height, scale } = event.data;

	try {
		/*
		 * `createImageBitmap` on an SVG blob, rather than an `Image` with a data URL.
		 *
		 * `Image` does not exist in a worker. `createImageBitmap` does, it is
		 * asynchronous rather than event-based, and it decodes off the thread that
		 * called it — so even this work does not block the worker's own message
		 * queue.
		 */
		const bitmap = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml' }));

		const canvas = new OffscreenCanvas(Math.ceil(width * scale), Math.ceil(height * scale));
		const context = canvas.getContext('2d');
		if (!context) throw new Error('No 2D context in this worker');

		context.scale(scale, scale);
		context.drawImage(bitmap, 0, 0, width, height);
		bitmap.close();

		const blob = await canvas.convertToBlob({ type: 'image/png' });
		self.postMessage({ ok: true, blob } satisfies RasterResponse);
	} catch (thrown) {
		/*
		 * Failures are reported, not thrown.
		 *
		 * An uncaught throw in a worker fires `onerror` on the other side with an
		 * `ErrorEvent` whose message is usually "Script error." — no stack, no
		 * cause. Sending the message back as data keeps it legible.
		 */
		self.postMessage({
			ok: false,
			error: thrown instanceof Error ? thrown.message : String(thrown)
		} satisfies RasterResponse);
	}
};
