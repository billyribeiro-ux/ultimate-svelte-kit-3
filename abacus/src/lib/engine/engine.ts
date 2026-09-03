/**
 * THE ENGINE
 * ==========
 *
 * A spreadsheet is a dependency graph that recalculates itself. This class is
 * that graph: cells, the formulas in them, which cells each formula reads,
 * and the procedure that — when one cell changes — recomputes exactly the
 * cells that depended on it, in an order that never reads a stale value.
 *
 * It is plain TypeScript with no Svelte in it, on purpose. Chapter 12 builds
 * the same thing out of `$derived` and shows that Svelte's runtime *is* one
 * of these; the reason to write it by hand first is that the algorithm is
 * the lesson, and a lesson hidden inside a framework is a lesson missed.
 *
 * HOW A RECALCULATION WORKS
 * -------------------------
 *   1. Start from the cells that were edited, plus every volatile cell
 *      (`RAND()`, `NOW()`), and collect everything that depends on them,
 *      transitively. That is the *dirty set*; nothing outside it is touched.
 *   2. Count, for each dirty formula, how many *dirty* cells it reads. That is
 *      its in-degree within the dirty set.
 *   3. Evaluate every formula whose in-degree is zero, then decrement the
 *      in-degree of the formulas that read it, and repeat. This is Kahn's
 *      topological sort, and it guarantees that a formula is evaluated only
 *      after everything it reads has been.
 *   4. Anything still unevaluated when the queue empties is in a cycle, or
 *      downstream of one. It is marked `#CYCLE!`.
 *
 * A change notifies dependents through two indexes: single-cell references
 * are a `Map` from cell to the formulas that read it, and range references
 * are a list of rectangles scanned per changed cell. The scan is linear in
 * the number of range formulas, which is the honest trade for a sheet of the
 * size a browser holds; an interval tree is the upgrade, and the tests in
 * `engine.spec.ts` are what would let you make it safely.
 */

import { isRangeRef, references, type Node } from '#lib/formula/ast.ts';
import { evaluate, type Context } from '#lib/formula/evaluate.ts';
import { FUNCTIONS } from '#lib/formula/functions.ts';
import { FormulaSyntaxError } from '#lib/formula/lexer.ts';
import { parse } from '#lib/formula/parser.ts';
import { CYCLE, ErrorValue, RangeValue, type Scalar, type Value } from '#lib/formula/values.ts';
import {
	inRect,
	key,
	MAX_COLS,
	MAX_ROWS,
	unkey,
	type Address,
	type Rect
} from '#lib/sheet/address.ts';
import { GENERAL, type CellFormat } from '#lib/sheet/format.ts';
import { shiftFormula, shiftIndex, type Shift } from './rewrite.ts';

export interface Cell {
	/** What the person typed: `=SUM(A1:A3)`, `12`, `hello`. The truth; everything else is derived. */
	input: string;
	format: CellFormat;
	/** The parsed formula, or `null` for a literal. */
	formula: Node | null;
	/** Why the formula did not parse, if it did not. */
	error: string | null;
	/** The current value. */
	value: Scalar;
	/** The rectangles this formula reads. Empty for a literal. */
	precedents: Rect[];
	volatile: boolean;
}

export interface Edit {
	row: number;
	col: number;
	/** `undefined` leaves the input alone; `''` or `null` clears it. */
	input?: string | null;
	format?: CellFormat;
}

export interface Recalc {
	/** Cells whose value changed, including cleared ones. */
	changed: number[];
	/** Cells marked #CYCLE! in this pass. */
	cycles: number[];
	/** How many formulas were evaluated — the number that proves the engine is incremental. */
	evaluated: number;
}

export interface EngineOptions {
	/** How a typed literal becomes a value. The locale layer provides this; the default is canonical. */
	parseLiteral?: (text: string) => Scalar;
	now?: () => Date;
	random?: () => number;
	locale?: string;
}

/** The canonical literal parser: numbers with `.`, TRUE/FALSE, a leading `'` for text. */
export function parseCanonical(text: string): Scalar {
	if (text === '') return null;
	if (text.startsWith("'")) return text.slice(1);
	const trimmed = text.trim();
	if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) return Number(trimmed);
	const upper = trimmed.toUpperCase();
	if (upper === 'TRUE') return true;
	if (upper === 'FALSE') return false;
	return text;
}

export class Engine {
	readonly cells = new Map<number, Cell>();

	/** Cell → formulas that read it by a single reference. */
	#direct = new Map<number, Set<number>>();
	/** Formula → the rectangles it reads by range. Scanned, see the header. */
	#ranges = new Map<number, Rect[]>();
	#volatile = new Set<number>();

	/** Goes up by one per recalculation. The grid watches this, and nothing else. */
	version = 0;

	readonly #parseLiteral: (text: string) => Scalar;
	readonly #context: Context;

	constructor(options: EngineOptions = {}) {
		this.#parseLiteral = options.parseLiteral ?? parseCanonical;
		this.#context = {
			cell: (row, col) => this.value(row, col),
			now: options.now ?? (() => new Date()),
			random: options.random ?? Math.random,
			locale: options.locale ?? 'en-US'
		};
	}

	/* ---------------------------------------------------------------- */
	/* Reading                                                           */
	/* ---------------------------------------------------------------- */

	get(row: number, col: number): Cell | undefined {
		return this.cells.get(key(row, col));
	}

	value(row: number, col: number): Scalar {
		return this.cells.get(key(row, col))?.value ?? null;
	}

	get size(): number {
		return this.cells.size;
	}

	/** The cells a formula reads, as keys. Ranges are expanded, so ask for a small one. */
	precedentsOf(row: number, col: number): number[] {
		const cell = this.get(row, col);
		if (!cell) return [];
		const out: number[] = [];
		for (const rect of cell.precedents) {
			for (let r = rect.top; r <= rect.bottom; r += 1) {
				for (let c = rect.left; c <= rect.right; c += 1) out.push(key(r, c));
			}
		}
		return out;
	}

	/** The formulas that read a cell, directly or through a range. */
	dependentsOf(row: number, col: number): number[] {
		return [...this.#dependents(key(row, col))];
	}

	/** The extent of the sheet: the furthest row and column with a cell in it, or `null` if empty. */
	extent(): Address | null {
		let row = -1;
		let col = -1;
		for (const k of this.cells.keys()) {
			const a = unkey(k);
			if (a.row > row) row = a.row;
			if (a.col > col) col = a.col;
		}
		return row === -1 ? null : { row, col };
	}

	/* ---------------------------------------------------------------- */
	/* Editing                                                           */
	/* ---------------------------------------------------------------- */

	/** One edit. `apply` is the general form and the one the sheet model uses. */
	set(row: number, col: number, input: string | null, format?: CellFormat): Recalc {
		return this.apply([{ row, col, input, format }]);
	}

	/**
	 * Many edits, one recalculation. A paste of a hundred cells is one batch,
	 * one topological sort and one version bump, rather than a hundred.
	 */
	apply(edits: Edit[]): Recalc {
		const seeds = new Set<number>();

		for (const edit of edits) {
			if (edit.row < 0 || edit.col < 0 || edit.row >= MAX_ROWS || edit.col >= MAX_COLS) {
				throw new RangeError(`Cell (${edit.row}, ${edit.col}) is outside the sheet`);
			}
			const k = key(edit.row, edit.col);
			const existing = this.cells.get(k);
			const input = edit.input === undefined ? (existing?.input ?? '') : (edit.input ?? '');
			const format = edit.format ?? existing?.format ?? GENERAL;

			if (input === '' && format.kind === 'general') {
				// Nothing left to store. Empty is the absence of an entry.
				if (existing) {
					this.#unindex(k);
					this.cells.delete(k);
					seeds.add(k);
				}
				continue;
			}

			if (existing && existing.input === input) {
				existing.format = format;
				continue;
			}

			if (existing) this.#unindex(k);
			const cell = this.#compile(input, format);
			this.cells.set(k, cell);
			this.#index(k, cell);
			seeds.add(k);
		}

		return this.#recalculate(seeds);
	}

	/** Forget every cell. Loading a document starts here. */
	reset(): void {
		this.cells.clear();
		this.#direct.clear();
		this.#ranges.clear();
		this.#volatile.clear();
		this.version += 1;
	}

	/** Re-evaluate everything: after a structural change, or to refresh the volatile cells. */
	recalculateAll(): Recalc {
		return this.#recalculate(new Set(this.cells.keys()));
	}

	/** Every cell in a rectangle cleared. */
	clear(rect: Rect): Recalc {
		const edits: Edit[] = [];
		for (const k of this.cells.keys()) {
			const a = unkey(k);
			if (inRect(rect, a)) edits.push({ row: a.row, col: a.col, input: null, format: GENERAL });
		}
		return this.apply(edits);
	}

	/* ---------------------------------------------------------------- */
	/* Structure                                                         */
	/* ---------------------------------------------------------------- */

	/**
	 * Insert or delete rows or columns. Every cell moves, every formula in
	 * the sheet is rewritten (see `rewrite.ts`), and everything is
	 * recalculated. Rare enough that a full pass is the right price for a
	 * procedure with no special cases.
	 */
	shift(change: Shift): Recalc {
		const rows = change.kind === 'insert-rows' || change.kind === 'delete-rows';
		const insert = change.kind === 'insert-rows' || change.kind === 'insert-cols';
		const moved = new Map<number, Cell>();

		for (const [k, cell] of this.cells) {
			const a = unkey(k);
			const index = shiftIndex(rows ? a.row : a.col, change.at, change.count, insert);
			if (index === null) continue; // deleted with its row or column
			if (rows ? index >= MAX_ROWS : index >= MAX_COLS) continue; // pushed off the edge
			const target = rows ? key(index, a.col) : key(a.row, index);
			const input = cell.formula ? `=${shiftFormula(cell.input.slice(1), change)}` : cell.input;
			moved.set(target, input === cell.input ? cell : this.#compile(input, cell.format));
		}

		this.cells.clear();
		this.#direct.clear();
		this.#ranges.clear();
		this.#volatile.clear();
		for (const [k, cell] of moved) {
			this.cells.set(k, cell);
			this.#index(k, cell);
		}

		return this.recalculateAll();
	}

	/* ---------------------------------------------------------------- */
	/* Internals                                                         */
	/* ---------------------------------------------------------------- */

	#compile(input: string, format: CellFormat): Cell {
		if (!input.startsWith('=')) {
			return {
				input,
				format,
				formula: null,
				error: null,
				value: this.#parseLiteral(input),
				precedents: [],
				volatile: false
			};
		}

		try {
			const formula = parse(input.slice(1));
			const precedents: Rect[] = references(formula).map(({ ref }) =>
				isRangeRef(ref)
					? { top: ref.start.row, left: ref.start.col, bottom: ref.end.row, right: ref.end.col }
					: { top: ref.row, left: ref.col, bottom: ref.row, right: ref.col }
			);
			return {
				input,
				format,
				formula,
				error: null,
				value: null,
				precedents,
				volatile: isVolatile(formula)
			};
		} catch (e) {
			const message =
				e instanceof FormulaSyntaxError
					? `${e.message} (at character ${e.position + 1})`
					: String(e);
			return {
				input,
				format,
				formula: null,
				error: message,
				value: new ErrorValue('#ERROR!', message),
				precedents: [],
				volatile: false
			};
		}
	}

	#index(k: number, cell: Cell): void {
		if (cell.volatile) this.#volatile.add(k);
		const rects: Rect[] = [];
		for (const rect of cell.precedents) {
			if (rect.top === rect.bottom && rect.left === rect.right) {
				const target = key(rect.top, rect.left);
				let set = this.#direct.get(target);
				if (!set) {
					set = new Set();
					this.#direct.set(target, set);
				}
				set.add(k);
			} else {
				rects.push(rect);
			}
		}
		if (rects.length > 0) this.#ranges.set(k, rects);
	}

	#unindex(k: number): void {
		const cell = this.cells.get(k);
		if (!cell) return;
		this.#volatile.delete(k);
		this.#ranges.delete(k);
		for (const rect of cell.precedents) {
			if (rect.top === rect.bottom && rect.left === rect.right) {
				const set = this.#direct.get(key(rect.top, rect.left));
				set?.delete(k);
				if (set?.size === 0) this.#direct.delete(key(rect.top, rect.left));
			}
		}
	}

	#dependents(k: number): Set<number> {
		const out = new Set(this.#direct.get(k) ?? []);
		if (this.#ranges.size > 0) {
			const a = unkey(k);
			for (const [formula, rects] of this.#ranges) {
				if (rects.some((rect) => inRect(rect, a))) out.add(formula);
			}
		}
		return out;
	}

	#recalculate(seeds: Set<number>): Recalc {
		// 1. The dirty set: seeds, volatile cells, and everything downstream.
		const dirty = new Set<number>();
		const stack = [...seeds, ...this.#volatile];
		while (stack.length > 0) {
			const k = stack.pop()!;
			if (dirty.has(k)) continue;
			dirty.add(k);
			for (const f of this.#dependents(k)) stack.push(f);
		}

		// 2. In-degree of each dirty formula: how many dirty *formulas* it reads.
		//    A dirty literal is already final — it was just typed — so it does not
		//    hold anything back; only a formula that has yet to be evaluated does.
		const indegree = new Map<number, number>();
		for (const k of dirty) if (this.cells.get(k)?.formula) indegree.set(k, 0);
		for (const k of indegree.keys()) {
			for (const f of this.#dependents(k)) {
				const n = indegree.get(f);
				if (n !== undefined) indegree.set(f, n + 1);
			}
		}

		// 3. Kahn's algorithm: evaluate whatever has no unevaluated precedents,
		//    then release its dependents.
		const changed: number[] = [...seeds].filter((k) => !this.cells.get(k)?.formula);
		const queue = [...indegree].filter(([, n]) => n === 0).map(([k]) => k);
		const done = new Set<number>();
		let evaluated = 0;

		const release = (k: number) => {
			for (const f of this.#dependents(k)) {
				const n = indegree.get(f);
				if (n === undefined || done.has(f)) continue;
				indegree.set(f, n - 1);
				if (n - 1 === 0) queue.push(f);
			}
		};

		const drain = () => {
			while (queue.length > 0) {
				const k = queue.shift()!;
				if (done.has(k)) continue;
				done.add(k);
				const cell = this.cells.get(k)!;
				const before = cell.value;
				cell.value = toScalar(evaluate(cell.formula!, this.#context));
				evaluated += 1;
				if (!same(before, cell.value)) changed.push(k);
				release(k);
			}
		};

		drain();

		// 4. Whatever is left is in a cycle, or downstream of one. The members of
		//    each cycle — the strongly connected components of what remains — are
		//    marked #CYCLE!; everything downstream is then evaluated normally and
		//    sees that error as a value, exactly as it would see #DIV/0!.
		const cycles: number[] = [];
		const remaining = new Set([...indegree.keys()].filter((k) => !done.has(k)));
		if (remaining.size > 0) {
			const members = cyclicMembers(remaining, (k) =>
				[...this.#dependents(k)].filter((f) => remaining.has(f))
			);
			for (const k of members) {
				const cell = this.cells.get(k)!;
				if (!(cell.value instanceof ErrorValue && cell.value.code === '#CYCLE!')) changed.push(k);
				cell.value = CYCLE();
				cycles.push(k);
				done.add(k);
			}
			for (const k of members) release(k);
			drain();
		}

		this.version += 1;
		return { changed, cycles, evaluated };
	}
}

/**
 * The nodes that lie on a cycle: every member of a strongly connected
 * component with more than one node, plus any node that points at itself.
 * Tarjan's algorithm, which finds the components in one depth-first pass.
 */
export function cyclicMembers(nodes: Set<number>, edges: (k: number) => number[]): Set<number> {
	const index = new Map<number, number>();
	const low = new Map<number, number>();
	const onStack = new Set<number>();
	const stack: number[] = [];
	const members = new Set<number>();
	let counter = 0;

	const visit = (v: number) => {
		index.set(v, counter);
		low.set(v, counter);
		counter += 1;
		stack.push(v);
		onStack.add(v);

		for (const w of edges(v)) {
			if (!index.has(w)) {
				visit(w);
				low.set(v, Math.min(low.get(v)!, low.get(w)!));
			} else if (onStack.has(w)) {
				low.set(v, Math.min(low.get(v)!, index.get(w)!));
			}
		}

		if (low.get(v) === index.get(v)) {
			const component: number[] = [];
			let w: number;
			do {
				w = stack.pop()!;
				onStack.delete(w);
				component.push(w);
			} while (w !== v);
			if (component.length > 1 || edges(v).includes(v)) {
				for (const m of component) members.add(m);
			}
		}
	};

	for (const v of nodes) if (!index.has(v)) visit(v);
	return members;
}

function isVolatile(node: Node): boolean {
	switch (node.type) {
		case 'call':
			return Boolean(FUNCTIONS.get(node.name)?.volatile) || node.args.some(isVolatile);
		case 'unary':
			return isVolatile(node.operand);
		case 'binary':
			return isVolatile(node.left) || isVolatile(node.right);
		default:
			return false;
	}
}

/**
 * A cell holds a scalar. A formula that *is* a range — `=A1:B2` — has no
 * single value to show; a one-cell range is its cell, and anything larger is
 * an error, because this engine does not spill.
 */
function toScalar(v: Value): Scalar {
	if (v instanceof RangeValue) {
		return v.size === 1
			? v.get(0, 0)
			: new ErrorValue('#VALUE!', 'A range cannot be shown in one cell');
	}
	return v;
}

/** Value equality that treats two errors with the same code as the same. */
export function same(a: Scalar, b: Scalar): boolean {
	if (a instanceof ErrorValue || b instanceof ErrorValue) {
		return a instanceof ErrorValue && b instanceof ErrorValue && a.code === b.code;
	}
	return Object.is(a, b);
}
