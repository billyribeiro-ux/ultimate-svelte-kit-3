/**
 * THE EVALUATOR
 * =============
 *
 * Walks a tree and produces a value. It does not know what a sheet is: the
 * cells it needs come through a `Context`, which the engine provides — and a
 * test provides a `Map`. That separation is what makes the language testable
 * in a millisecond, and what lets the same evaluator run in the engine, in
 * the `$derived` demonstration of chapter 12, and on the server for a
 * published sheet.
 */

import type { CellRef, Node, RangeRef } from './ast.ts';
import { FUNCTIONS } from './functions.ts';
import {
	compare,
	DIV0,
	ErrorValue,
	isError,
	isRange,
	NAME,
	RangeValue,
	REF,
	toNumber,
	toText,
	VALUE,
	type Scalar,
	type Value
} from './values.ts';

export interface Context {
	/** The evaluated value of another cell. */
	cell(row: number, col: number): Scalar;
	/** The clock, for TODAY and NOW. Injected so that tests are deterministic. */
	now(): Date;
	/** A random number in [0, 1), for RAND. Injected for the same reason. */
	random(): number;
	/** The locale TEXT() formats in — the person's, not the server's. */
	locale: string;
}

/** A range larger than this is refused with #NUM! rather than allocated. */
export const MAX_RANGE_CELLS = 1_000_000;

export function evaluate(node: Node, ctx: Context): Value {
	switch (node.type) {
		case 'number':
			return node.value;
		case 'string':
			return node.value;
		case 'boolean':
			return node.value;
		case 'error':
			return new ErrorValue(node.code as ErrorValue['code']);

		case 'ref':
			return ctx.cell(node.ref.row, node.ref.col);

		case 'range':
			return rangeValue(node.range, ctx);

		case 'unary': {
			const inner = evaluate(node.operand, ctx);
			if (node.op === '+') return inner;
			const n = toNumber(inner);
			if (isError(n)) return n;
			return node.op === '-' ? -n : n / 100;
		}

		case 'binary':
			return binary(node.op, evaluate(node.left, ctx), evaluate(node.right, ctx));

		case 'call': {
			const fn = FUNCTIONS.get(node.name);
			if (!fn) return NAME(node.name);
			if (node.args.length < fn.minArgs || node.args.length > fn.maxArgs) {
				return VALUE(
					`${node.name} takes ${fn.minArgs === fn.maxArgs ? fn.minArgs : `${fn.minArgs} to ${fn.maxArgs === Infinity ? 'any number of' : fn.maxArgs}`} argument${fn.maxArgs === 1 ? '' : 's'}`
				);
			}
			// Arguments are evaluated lazily by the function — IF must not evaluate
			// the branch it does not take, and IFERROR must swallow an error rather
			// than propagate it — so a function receives thunks.
			return fn.call(
				node.args.map((arg) => () => evaluate(arg, ctx)),
				ctx
			);
		}

		default:
			node satisfies never;
			return VALUE();
	}
}

function rangeValue(range: RangeRef, ctx: Context): Value {
	const rows = range.end.row - range.start.row + 1;
	const cols = range.end.col - range.start.col + 1;
	if (rows * cols > MAX_RANGE_CELLS) return new ErrorValue('#NUM!', 'That range is too large');
	const cells: Scalar[] = new Array(rows * cols);
	for (let r = 0; r < rows; r += 1) {
		for (let c = 0; c < cols; c += 1) {
			cells[r * cols + c] = ctx.cell(range.start.row + r, range.start.col + c);
		}
	}
	return new RangeValue(rows, cols, cells);
}

function binary(op: string, left: Value, right: Value): Value {
	if (isError(left)) return left;
	if (isError(right)) return right;

	switch (op) {
		case '&': {
			const a = toText(left);
			if (isError(a)) return a;
			const b = toText(right);
			if (isError(b)) return b;
			return a + b;
		}
		case '=':
		case '<>':
		case '<':
		case '>':
		case '<=':
		case '>=': {
			if (isRange(left) || isRange(right)) return VALUE('Cannot compare a range');
			const c = compare(left, right);
			if (isError(c)) return c;
			switch (op) {
				case '=':
					return c === 0;
				case '<>':
					return c !== 0;
				case '<':
					return c < 0;
				case '>':
					return c > 0;
				case '<=':
					return c <= 0;
				default:
					return c >= 0;
			}
		}
		default: {
			const a = toNumber(left);
			if (isError(a)) return a;
			const b = toNumber(right);
			if (isError(b)) return b;
			switch (op) {
				case '+':
					return a + b;
				case '-':
					return a - b;
				case '*':
					return a * b;
				case '/':
					return b === 0 ? DIV0() : a / b;
				case '^': {
					const result = a ** b;
					return Number.isFinite(result) ? result : new ErrorValue('#NUM!', 'Not a real number');
				}
				default:
					return VALUE(`Unknown operator ${op}`);
			}
		}
	}
}

/** A reference that points outside the sheet — after a row was deleted, say. */
export function refError(ref: CellRef): ErrorValue {
	return REF(`The cell at row ${ref.row + 1}, column ${ref.col + 1} no longer exists`);
}
