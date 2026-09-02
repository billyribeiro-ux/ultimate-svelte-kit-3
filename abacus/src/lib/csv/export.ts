/**
 * A sheet as CSV, in the browser. The server streams the same thing for
 * stored sheets (`/api/sheets/[id]/export.csv`); this is for the local sheet,
 * which the server has never seen.
 */

import type { Sheet } from '#lib/sheet/sheet.svelte.ts';
import { rowToCsv } from './parse.ts';

export function sheetToCsv(sheet: Sheet): string {
	const extent = sheet.engine.extent();
	if (!extent) return '';
	const lines: string[] = [];
	for (let r = 0; r <= extent.row; r += 1) {
		const row: string[] = [];
		for (let c = 0; c <= extent.col; c += 1) row.push(sheet.display(r, c));
		lines.push(rowToCsv(row));
	}
	return `${lines.join('\r\n')}\r\n`;
}

/** Hand the person a file. The link is created, clicked and removed; nothing is left in the DOM. */
export function downloadText(
	text: string,
	filename: string,
	type = 'text/csv;charset=utf-8'
): void {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
