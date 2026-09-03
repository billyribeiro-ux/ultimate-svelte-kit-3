/**
 * THE IMPORT WORKER
 * =================
 *
 * Parsing a large file on the main thread freezes the page for as long as it
 * takes; a Web Worker does the same work on another thread and the grid
 * keeps scrolling. This file *is* that thread: the page creates it with
 * `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`,
 * posts a `File`, and receives rows in batches with progress in between.
 *
 * The file is read as bytes, in chunks, from `file.stream()`, and decoded
 * with a `TextDecoder` in streaming mode — so a multi-byte character split
 * across two chunks is reassembled rather than turned into two garbage
 * characters. Byte counts are what progress is measured in, because bytes
 * are what a file is measured in.
 *
 * Type-checked by `tsconfig.worker.json` with the WebWorker library: here,
 * `self` is a `DedicatedWorkerGlobalScope` and `document` is an error.
 */

import { CsvParser } from './parse.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

const BATCH = 500;

const post = (message: WorkerResponse) => self.postMessage(message);

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	if (request.type !== 'parse') return;

	try {
		const parser = new CsvParser({ delimiter: request.delimiter });
		const decoder = new TextDecoder();
		const reader = request.file.stream().getReader();
		let bytes = 0;
		let total = 0;
		let pending: string[][] = [];

		const flush = () => {
			if (pending.length === 0) return;
			post({ type: 'rows', rows: pending });
			pending = [];
		};

		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			const rows = parser.push(decoder.decode(value, { stream: true }));
			for (const row of rows) {
				pending.push(row);
				total += 1;
				if (pending.length >= BATCH) flush();
			}
			post({ type: 'progress', bytes, total: request.file.size, rows: total });
		}

		const tail = parser.push(decoder.decode());
		const last = parser.finish();
		for (const row of [...tail, ...last]) {
			pending.push(row);
			total += 1;
		}
		flush();
		post({ type: 'done', rows: total, delimiter: parser.delimiter });
	} catch (error) {
		post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
	}
});
