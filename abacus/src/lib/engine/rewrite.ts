/**
 * REWRITING REFERENCES
 * ====================
 *
 * A formula is text, and the text has to change when the sheet around it
 * changes. Insert a row above `A5` and every `A5` becomes `A6`; delete the
 * column a formula reads and the reference becomes `#REF!`; copy `=A1*2` one
 * row down and it becomes `=A2*2` — unless it said `$A$1`, in which case it
 * stays.
 *
 * Every rewrite here works the same way: parse the formula, walk its
 * references in source order, decide the new text of each one, and splice it
 * back into the original string *from the end*, so that earlier spans stay
 * valid. The rest of the formula — spacing, casing, the parts a person wrote
 * — is left exactly as it was.
 */

import {
	formatRef,
	isRangeRef,
	references,
	type CellRef,
	type RangeRef
} from '#lib/formula/ast.ts';
import { parse } from '#lib/formula/parser.ts';
import { MAX_COLS, MAX_ROWS } from '#lib/sheet/address.ts';

export type Shift =
	| { kind: 'insert-rows'; at: number; count: number }
	| { kind: 'delete-rows'; at: number; count: number }
	| { kind: 'insert-cols'; at: number; count: number }
	| { kind: 'delete-cols'; at: number; count: number };

type Mapper = (ref: CellRef | RangeRef) => CellRef | RangeRef | null;

/**
 * The formula with every reference passed through `mapper`. `null` from the
 * mapper means the reference no longer points anywhere, and `#REF!` is
 * written in its place — a value the evaluator understands, so the cell shows
 * the error rather than a parse failure.
 */
export function rewriteFormula(source: string, mapper: Mapper): string {
	let root;
	try {
		root = parse(source);
	} catch {
		// A formula that does not parse has no references to move. Leave it.
		return source;
	}

	let out = source;
	for (const { ref, span } of references(root).reverse()) {
		const next = mapper(ref);
		const text = next === null ? '#REF!' : formatRef(next);
		out = out.slice(0, span.start) + text + out.slice(span.end);
	}
	return out;
}

/** Where a row index lands after a shift, or `null` if it was deleted. */
export function shiftIndex(
	index: number,
	at: number,
	count: number,
	insert: boolean
): number | null {
	if (index < at) return index;
	if (insert) return index + count;
	if (index < at + count) return null;
	return index - count;
}

/** One cell reference after a structural change. */
export function shiftCellRef(ref: CellRef, shift: Shift): CellRef | null {
	const rows = shift.kind === 'insert-rows' || shift.kind === 'delete-rows';
	const insert = shift.kind === 'insert-rows' || shift.kind === 'insert-cols';
	const index = shiftIndex(rows ? ref.row : ref.col, shift.at, shift.count, insert);
	if (index === null) return null;
	if (rows ? index >= MAX_ROWS : index >= MAX_COLS) return null;
	return rows ? { ...ref, row: index } : { ...ref, col: index };
}

/**
 * A range after a structural change. A range shrinks when part of it is
 * deleted and vanishes only when all of it is — `SUM(A1:A10)` with row 5
 * deleted becomes `SUM(A1:A9)`, which is what a person means.
 */
export function shiftRangeRef(range: RangeRef, shift: Shift): RangeRef | null {
	const rows = shift.kind === 'insert-rows' || shift.kind === 'delete-rows';
	const insert = shift.kind === 'insert-rows' || shift.kind === 'insert-cols';
	const from = rows ? range.start.row : range.start.col;
	const to = rows ? range.end.row : range.end.col;

	let newFrom: number;
	let newTo: number;
	if (insert) {
		// An insertion inside the range grows it; at or before the start moves it.
		newFrom = from >= shift.at ? from + shift.count : from;
		newTo = to >= shift.at ? to + shift.count : to;
	} else {
		const end = shift.at + shift.count; // exclusive
		if (from >= shift.at && to < end) return null; // wholly deleted
		newFrom = from < shift.at ? from : from < end ? shift.at : from - shift.count;
		newTo = to < shift.at ? to : to < end ? shift.at - 1 : to - shift.count;
	}
	if (rows ? newTo >= MAX_ROWS : newTo >= MAX_COLS) return null;

	return rows
		? { start: { ...range.start, row: newFrom }, end: { ...range.end, row: newTo } }
		: { start: { ...range.start, col: newFrom }, end: { ...range.end, col: newTo } };
}

export function shiftFormula(source: string, shift: Shift): string {
	return rewriteFormula(source, (ref) =>
		isRangeRef(ref) ? shiftRangeRef(ref, shift) : shiftCellRef(ref, shift)
	);
}

/**
 * A reference as it reads after the formula is copied `dRow` rows and `dCol`
 * columns away. Relative parts move; absolute parts (`$`) stay. A reference
 * pushed off the top or left of the sheet becomes `#REF!` — the same thing
 * every spreadsheet shows when you paste `=A1` into row 1 from row 2.
 */
export function translateCellRef(ref: CellRef, dRow: number, dCol: number): CellRef | null {
	const row = ref.absRow ? ref.row : ref.row + dRow;
	const col = ref.absCol ? ref.col : ref.col + dCol;
	if (row < 0 || col < 0 || row >= MAX_ROWS || col >= MAX_COLS) return null;
	return { ...ref, row, col };
}

export function translateFormula(source: string, dRow: number, dCol: number): string {
	return rewriteFormula(source, (ref) => {
		if (!isRangeRef(ref)) return translateCellRef(ref, dRow, dCol);
		const start = translateCellRef(ref.start, dRow, dCol);
		const end = translateCellRef(ref.end, dRow, dCol);
		return start && end ? { start, end } : null;
	});
}
