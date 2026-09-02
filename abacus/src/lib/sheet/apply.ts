/**
 * OPERATIONS APPLIED TO A DOCUMENT AT REST
 * ========================================
 *
 * The server does not run the engine — values are never stored, so it has
 * nothing to calculate — but it does keep the document current as
 * operations arrive, so that a browser opening the sheet later loads the
 * truth rather than replaying a log. This is the pure function that does
 * it: a document in, operations in, a new document out. The same function
 * runs in the browser's tests to prove it agrees with `Sheet.applyRemote`.
 */

import { shiftFormula, shiftIndex } from '#lib/engine/rewrite.ts';
import { key, unkey } from './address.ts';
import type { CellEntry, Document } from './document.ts';
import type { Op } from './ops.ts';

export function applyOps(doc: Document, ops: readonly Op[]): Document {
	const cells = new Map<number, CellEntry>();
	for (const cell of doc.cells) cells.set(key(cell.r, cell.c), cell);
	let title = doc.title;
	const columns = { ...doc.columns };
	const rows = { ...doc.rows };

	for (const op of ops) {
		switch (op.type) {
			case 'cells':
				for (const edit of op.cells) {
					const k = key(edit.r, edit.c);
					const existing = cells.get(k);
					const input = edit.i === null ? '' : edit.i;
					const format = edit.f ?? existing?.f;
					if (input === '' && (!format || format.kind === 'general')) cells.delete(k);
					else
						cells.set(k, {
							r: edit.r,
							c: edit.c,
							i: input,
							...(format && format.kind !== 'general' ? { f: format } : {})
						});
				}
				break;

			case 'shift': {
				const byRows = op.kind === 'insert-rows' || op.kind === 'delete-rows';
				const insert = op.kind === 'insert-rows' || op.kind === 'insert-cols';
				const moved = new Map<number, CellEntry>();
				for (const [k, cell] of cells) {
					const a = unkey(k);
					const index = shiftIndex(byRows ? a.row : a.col, op.at, op.count, insert);
					if (index === null) continue;
					const r = byRows ? index : a.row;
					const c = byRows ? a.col : index;
					const i = cell.i.startsWith('=')
						? `=${shiftFormula(cell.i.slice(1), { kind: op.kind, at: op.at, count: op.count })}`
						: cell.i;
					moved.set(key(r, c), { ...cell, r, c, i });
				}
				cells.clear();
				for (const [k, cell] of moved) cells.set(k, cell);
				shiftSizes(byRows ? rows : columns, op.at, op.count, insert);
				break;
			}

			case 'title':
				title = op.title;
				break;

			case 'size':
				(op.axis === 'column' ? columns : rows)[String(op.index)] = op.size;
				break;

			default:
				op satisfies never;
		}
	}

	return {
		version: 1,
		title,
		columns,
		rows,
		frozen: { ...doc.frozen },
		cells: [...cells.values()].sort((a, b) => a.r - b.r || a.c - b.c)
	};
}

function shiftSizes(
	sizes: Record<string, number>,
	at: number,
	count: number,
	insert: boolean
): void {
	const entries = Object.entries(sizes).map(([index, size]) => [Number(index), size] as const);
	for (const k of Object.keys(sizes)) delete sizes[k];
	for (const [index, size] of entries) {
		const moved = shiftIndex(index, at, count, insert);
		if (moved !== null) sizes[String(moved)] = size;
	}
}
