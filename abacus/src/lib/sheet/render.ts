/**
 * A DOCUMENT AS ROWS OF TEXT
 * ==========================
 *
 * For the pages that show a sheet without the grid: the published view, the
 * embed, the template previews, the CSV export. The engine runs — on the
 * server, in these cases, which is fine: it is plain TypeScript — and every
 * cell up to the sheet's extent becomes the text a person would see.
 */

import { Engine } from '#lib/engine/engine.ts';
import { ErrorValue } from '#lib/formula/values.ts';
import type { Document } from './document.ts';
import { formatScalar, GENERAL } from './format.ts';
import { parseInput } from './locale.ts';

export interface RenderedCell {
	text: string;
	numeric: boolean;
	error: boolean;
	formula: string | null;
}

export interface Rendered {
	rows: RenderedCell[][];
	columns: number;
}

export function tabulate(doc: Document, locale: string, limit = { rows: 500, cols: 50 }): Rendered {
	const engine = new Engine({ parseLiteral: (text) => parseInput(text, locale).value, locale });
	engine.apply(doc.cells.map((c) => ({ row: c.r, col: c.c, input: c.i, format: c.f })));
	const extent = engine.extent();
	if (!extent) return { rows: [], columns: 0 };

	const rowCount = Math.min(extent.row + 1, limit.rows);
	const columns = Math.min(extent.col + 1, limit.cols);
	const rows: RenderedCell[][] = [];
	for (let r = 0; r < rowCount; r += 1) {
		const row: RenderedCell[] = [];
		for (let c = 0; c < columns; c += 1) {
			const cell = engine.get(r, c);
			const value = cell?.value ?? null;
			row.push({
				text: cell ? formatScalar(value, cell.format ?? GENERAL, locale) : '',
				numeric: typeof value === 'number',
				error: value instanceof ErrorValue,
				formula: cell?.formula ? cell.input : null
			});
		}
		rows.push(row);
	}
	return { rows, columns };
}

/** Lines of CSV, one row at a time, for a streamed response. */
export function* csvLines(doc: Document, locale: string): Generator<string> {
	const { rows } = tabulate(doc, locale, { rows: 1_048_576, cols: 16_384 });
	for (const row of rows) {
		yield `${row
			.map((cell) => {
				const v = cell.text;
				return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replaceAll('"', '""')}"` : v;
			})
			.join(',')}\r\n`;
	}
}
