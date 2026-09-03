/**
 * THE PAGE'S SIDE OF THE IMPORT
 * =============================
 *
 * `importCsv(file, onProgress)` resolves with every row of the file, parsed
 * on another thread. The worker is created per import and terminated when
 * it is done, which is cheaper than it sounds — a worker starts in a few
 * milliseconds — and means a cancelled import leaves nothing running.
 */

import type { WorkerRequest, WorkerResponse } from './protocol.ts';

export interface Progress {
	bytes: number;
	total: number;
	rows: number;
}

export interface Imported {
	rows: string[][];
	delimiter: string;
}

export function importCsv(
	file: File,
	onProgress?: (progress: Progress) => void,
	signal?: AbortSignal
): Promise<Imported> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		const rows: string[][] = [];

		const finish = () => {
			worker.terminate();
			signal?.removeEventListener('abort', abort);
		};
		const abort = () => {
			finish();
			reject(new DOMException('Import cancelled', 'AbortError'));
		};
		signal?.addEventListener('abort', abort, { once: true });

		worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			switch (message.type) {
				case 'progress':
					onProgress?.(message);
					break;
				case 'rows':
					for (const row of message.rows) rows.push(row);
					break;
				case 'done':
					finish();
					resolve({ rows, delimiter: message.delimiter });
					break;
				case 'error':
					finish();
					reject(new Error(message.message));
					break;
				default:
					message satisfies never;
			}
		});
		worker.addEventListener('error', (event) => {
			finish();
			reject(new Error(event.message || 'The import worker failed'));
		});

		const request: WorkerRequest = { type: 'parse', file };
		worker.postMessage(request);
	});
}
