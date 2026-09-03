/**
 * CELL ADDRESSES
 * ==============
 *
 * `B3` is column 1, row 2. Everything inside the app counts from zero and
 * uses numbers; the letters exist only at the edges — the formula bar, the
 * column headers, the URL of an inspected cell — and this file is the
 * translation between the two.
 *
 * THE KEY
 * -------
 * A sheet is sparse: a million-row grid with forty cells in it. Storing it as
 * a two-dimensional array would allocate the million rows. So cells live in a
 * `Map` keyed by one number, `row * MAX_COLS + col`, which fits comfortably in
 * a JavaScript number (2^34 < 2^53) and is cheaper to hash than a string.
 */

/** Columns run A…XFD, as in every spreadsheet since 2007. */
export const MAX_COLS = 16_384;
export const MAX_ROWS = 1_048_576;

export interface Address {
	row: number;
	col: number;
}

/** 0 → `A`, 25 → `Z`, 26 → `AA`, 16383 → `XFD`. */
export function colName(col: number): string {
	if (!Number.isInteger(col) || col < 0 || col >= MAX_COLS) {
		throw new RangeError(`Not a column: ${col}`);
	}
	let name = '';
	let n = col + 1;
	while (n > 0) {
		const rem = (n - 1) % 26;
		name = String.fromCharCode(65 + rem) + name;
		n = Math.floor((n - 1) / 26);
	}
	return name;
}

/** `A` → 0, `Z` → 25, `AA` → 26. Case-insensitive; `null` for anything else. */
export function colIndex(name: string): number | null {
	if (!/^[A-Za-z]{1,3}$/.test(name)) return null;
	let n = 0;
	for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
	const col = n - 1;
	return col < MAX_COLS ? col : null;
}

/** `{ row: 2, col: 1 }` → `B3`. */
export function toA1({ row, col }: Address): string {
	return `${colName(col)}${row + 1}`;
}

const A1 = /^([A-Za-z]{1,3})(\d{1,7})$/;

/** `B3` → `{ row: 2, col: 1 }`, or `null`. Dollar signs are the formula layer's business. */
export function parseA1(text: string): Address | null {
	const match = A1.exec(text);
	if (!match) return null;
	const col = colIndex(match[1]!);
	const row = Number(match[2]) - 1;
	if (col === null || row < 0 || row >= MAX_ROWS) return null;
	return { row, col };
}

/** One number per cell, for `Map` keys. */
export function key(row: number, col: number): number {
	return row * MAX_COLS + col;
}

export function unkey(k: number): Address {
	return { row: Math.floor(k / MAX_COLS), col: k % MAX_COLS };
}

export function sameAddress(a: Address, b: Address): boolean {
	return a.row === b.row && a.col === b.col;
}

/** A rectangle of cells, inclusive at both corners, corners normalised. */
export interface Rect {
	top: number;
	left: number;
	bottom: number;
	right: number;
}

export function rect(a: Address, b: Address): Rect {
	return {
		top: Math.min(a.row, b.row),
		left: Math.min(a.col, b.col),
		bottom: Math.max(a.row, b.row),
		right: Math.max(a.col, b.col)
	};
}

export function inRect(r: Rect, { row, col }: Address): boolean {
	return row >= r.top && row <= r.bottom && col >= r.left && col <= r.right;
}

export function rectSize(r: Rect): number {
	return (r.bottom - r.top + 1) * (r.right - r.left + 1);
}

/** `A1:C3`, or just `A1` for a single cell. */
export function rectToA1(r: Rect): string {
	const from = toA1({ row: r.top, col: r.left });
	if (r.top === r.bottom && r.left === r.right) return from;
	return `${from}:${toA1({ row: r.bottom, col: r.right })}`;
}

export function parseRect(text: string): Rect | null {
	const [a, b] = text.split(':');
	const from = a ? parseA1(a) : null;
	if (!from) return null;
	if (b === undefined) return rect(from, from);
	const to = parseA1(b);
	return to ? rect(from, to) : null;
}
