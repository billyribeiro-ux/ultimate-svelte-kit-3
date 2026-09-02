/**
 * WHAT A CELL CAN HOLD
 * ====================
 *
 * A number, a string, a boolean, nothing, or an error — and, while a formula
 * is being evaluated, a range of those. Numbers, strings and booleans are the
 * JavaScript primitives, because there is no reason to wrap them. Empty is
 * `null`. Errors and ranges are classes, so `instanceof` tells them apart
 * from a string that happens to say `#REF!`, and so the `transport` hook in
 * `src/hooks.ts` can carry an error across the wire as itself.
 *
 * DATES ARE NUMBERS
 * -----------------
 * As in every spreadsheet: a date is the number of days since an epoch, with
 * the time of day as the fraction. `DATE(2026, 9, 2)` is 46267, and
 * `DATE(2026, 9, 2) + 7` is a week later without a date library. Which epoch
 * — and what a person sees — is `src/lib/sheet/dates.ts` and `format.ts`.
 */

export type ErrorCode =
	'#DIV/0!' | '#REF!' | '#NAME?' | '#VALUE!' | '#CYCLE!' | '#N/A' | '#NUM!' | '#ERROR!';

export class ErrorValue {
	constructor(
		readonly code: ErrorCode,
		readonly message = ''
	) {}

	toString(): string {
		return this.code;
	}

	toJSON(): { code: ErrorCode; message: string } {
		return { code: this.code, message: this.message };
	}
}

/** A scalar: what a cell holds after evaluation. */
export type Scalar = number | string | boolean | null | ErrorValue;

/**
 * A rectangle of scalars, row-major, produced only while evaluating a
 * formula. `SUM(A1:B2)` receives one of these; a cell never stores one.
 */
export class RangeValue {
	constructor(
		readonly rows: number,
		readonly cols: number,
		readonly cells: readonly Scalar[]
	) {
		if (cells.length !== rows * cols) {
			throw new RangeError(
				`A ${rows}×${cols} range needs ${rows * cols} cells, not ${cells.length}`
			);
		}
	}

	get(row: number, col: number): Scalar {
		return this.cells[row * this.cols + col] ?? null;
	}

	get size(): number {
		return this.cells.length;
	}
}

export type Value = Scalar | RangeValue;

export const isError = (v: unknown): v is ErrorValue => v instanceof ErrorValue;
export const isRange = (v: Value): v is RangeValue => v instanceof RangeValue;

export const DIV0 = () => new ErrorValue('#DIV/0!', 'Division by zero');
export const REF = (message = 'A reference is not valid') => new ErrorValue('#REF!', message);
export const NAME = (name: string) => new ErrorValue('#NAME?', `Unknown function ${name}`);
export const VALUE = (message = 'Wrong type of value') => new ErrorValue('#VALUE!', message);
export const CYCLE = () => new ErrorValue('#CYCLE!', 'This cell depends on itself');
export const NA = (message = 'Not available') => new ErrorValue('#N/A', message);
export const NUM = (message = 'Not a valid number') => new ErrorValue('#NUM!', message);

/* ------------------------------------------------------------------ */
/* Coercion                                                            */
/* ------------------------------------------------------------------ */

/**
 * The rules every spreadsheet shares: in arithmetic, empty is zero, a boolean
 * is one or zero, and a string is a number if it *looks* like one and an
 * error if it does not. A range where a scalar was expected is an error —
 * there is no implicit intersection here, because nobody can explain it.
 */
export function toNumber(v: Value): number | ErrorValue {
	if (typeof v === 'number') return Number.isFinite(v) ? v : NUM();
	if (v === null) return 0;
	if (typeof v === 'boolean') return v ? 1 : 0;
	if (v instanceof ErrorValue) return v;
	if (v instanceof RangeValue) return VALUE('A range was used where one value was expected');
	const text = v.trim();
	if (text === '') return VALUE(`"${v}" is not a number`);
	const n = Number(text.endsWith('%') ? text.slice(0, -1) : text);
	if (!Number.isFinite(n)) return VALUE(`"${v}" is not a number`);
	return text.endsWith('%') ? n / 100 : n;
}

/**
 * Text. Numbers print with fifteen significant digits, which is what turns
 * `0.1 + 0.2` into `0.3` rather than `0.30000000000000004` — the same
 * rounding every spreadsheet applies at the edge.
 */
export function toText(v: Value): string | ErrorValue {
	if (typeof v === 'string') return v;
	if (typeof v === 'number') return plainNumber(v);
	if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
	if (v === null) return '';
	if (v instanceof ErrorValue) return v;
	return VALUE('A range was used where text was expected');
}

export function plainNumber(n: number): string {
	if (!Number.isFinite(n)) return String(n);
	const fixed = Number(n.toPrecision(15));
	return Object.is(fixed, -0) ? '0' : String(fixed);
}

export function toBoolean(v: Value): boolean | ErrorValue {
	if (typeof v === 'boolean') return v;
	if (typeof v === 'number') return v !== 0;
	if (v === null) return false;
	if (v instanceof ErrorValue) return v;
	if (v instanceof RangeValue) return VALUE('A range was used where a condition was expected');
	const upper = v.trim().toUpperCase();
	if (upper === 'TRUE') return true;
	if (upper === 'FALSE') return false;
	return VALUE(`"${v}" is not TRUE or FALSE`);
}

/** Every scalar in a value, in row-major order: a range's cells, or the one scalar. */
export function flatten(v: Value): Scalar[] {
	return v instanceof RangeValue ? [...v.cells] : [v];
}

/**
 * Ordering for comparisons and sorting, as spreadsheets do it: numbers first,
 * then text (case-insensitive), then booleans. Empty compares as zero against
 * a number and as the empty string against text.
 */
export function compare(a: Scalar, b: Scalar): number | ErrorValue {
	if (a instanceof ErrorValue) return a;
	if (b instanceof ErrorValue) return b;
	const ra = rank(a, b);
	const rb = rank(b, a);
	if (ra !== rb) return ra - rb;
	if (typeof a === 'number' || a === null) {
		return (a ?? 0) - ((b as number | null) ?? 0);
	}
	if (typeof a === 'string') {
		const x = a.toLowerCase();
		const y = String(b ?? '').toLowerCase();
		return x < y ? -1 : x > y ? 1 : 0;
	}
	return Number(a) - Number(b);
}

/** Empty takes the rank of whatever it is compared against. */
function rank(v: Scalar, other: Scalar): number {
	if (v === null) return other === null ? 0 : rank(other, null);
	if (typeof v === 'number') return 0;
	if (typeof v === 'string') return 1;
	return 2;
}
