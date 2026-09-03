/**
 * Export a board as SVG or PNG.
 *
 * The SVG is produced on the main thread — it is string building, and it is
 * fast. The PNG goes to a worker, because rasterising is not.
 */

import type { EdgeView, NodeView } from '#lib/board/index.ts';
import { toSvg, type ExportOptions } from './svg.ts';
import type { RasterRequest, RasterResponse } from './raster.worker.ts';

export { toSvg } from './svg.ts';

/** How long to wait for the worker before giving up. */
const TIMEOUT_MS = 20_000;

export interface PngOptions extends ExportOptions {
	/** Defaults to the display's pixel ratio, capped so a 5K screen is not 5× the file. */
	readonly scale?: number;
}

export async function toPng(
	nodes: readonly NodeView[],
	edges: readonly EdgeView[],
	options: PngOptions = {}
): Promise<Blob> {
	const svg = toSvg(nodes, edges, options);

	// The dimensions come out of the SVG we just wrote, so the two cannot disagree.
	const size = /width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/.exec(svg);
	const width = Number(size?.[1] ?? 1024);
	const height = Number(size?.[2] ?? 768);

	/*
	 * `new Worker(new URL(...), { type: 'module' })`.
	 *
	 * The `import.meta.url` form is what Vite recognises: it bundles the worker as
	 * a separate entry point and rewrites the URL. A bare string path works in dev
	 * and produces a 404 in production, which is the most annoying category of
	 * bug — it only exists in the artefact you ship.
	 */
	const worker = new Worker(new URL('./raster.worker.ts', import.meta.url), { type: 'module' });

	try {
		return await new Promise<Blob>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('The export timed out.')), TIMEOUT_MS);

			worker.onmessage = (event: MessageEvent<RasterResponse>) => {
				clearTimeout(timer);
				if (event.data.ok && event.data.blob) resolve(event.data.blob);
				else reject(new Error(event.data.error ?? 'The export failed.'));
			};

			worker.onerror = (event) => {
				clearTimeout(timer);
				reject(new Error(event.message || 'The export worker failed to start.'));
			};

			worker.postMessage({
				svg,
				width,
				height,
				scale: Math.min(options.scale ?? globalThis.devicePixelRatio ?? 1, 2)
			} satisfies RasterRequest);
		});
	} finally {
		// Always, including on the timeout path. A worker left running holds its
		// module graph and its OffscreenCanvas for the life of the tab.
		worker.terminate();
	}
}

/** Hand a blob to the browser as a download. */
export function save(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();

	// Revoking immediately is fine — the download has already been handed off —
	// and not revoking leaks the whole blob for the life of the document.
	URL.revokeObjectURL(url);
}
