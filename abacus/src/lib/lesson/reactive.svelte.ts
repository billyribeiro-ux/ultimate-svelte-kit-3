/**
 * THE SAME ENGINE, OUT OF RUNES
 * =============================
 *
 * The hand-written engine built a dependency graph: cells, edges, a dirty
 * set, a topological sort. Svelte's runtime *is* one of those. This file
 * proves it by building a small sheet where every cell's value is a
 * `$derived` that reads other cells — and nothing else. No edges are
 * recorded, no order is computed; Svelte tracks what each cell read and
 * recomputes, in dependency order, exactly the cells that need it.
 *
 * WHAT IT SHOWS
 * -------------
 *   - A `$derived` is a formula cell. Its dependencies are whatever it read.
 *   - Change an input and only the deriveds downstream re-run — Svelte's
 *     "push-pull" scheduling is the engine's incremental recalculation.
 *   - Diamonds are fine: a cell that reads two cells that read one input
 *     recomputes once, not twice, because updates are glitch-free.
 *   - A cycle is where the two part ways. Svelte's only answer to a
 *     derived that reads itself is an exception — `derived_references_self`
 *     in development — and a production build has no such check: the
 *     deriveds call each other until the stack runs out, and the runtime is
 *     left in a state the page does not recover from. So this sheet does what
 *     the engine does and reads the formulas first. Which cells are on a
 *     cycle is one more `$derived`, worked out from the formulas' references
 *     and never from a value, and a cell on a cycle answers `#CYCLE!` without
 *     reading another cell. A cycle becomes a value only because somebody
 *     kept a graph.
 *
 * WHAT IT SHOWS ABOUT THE ENGINE, TOO
 * -----------------------------------
 * The hand-written engine exists because a spreadsheet needs what a
 * runtime cannot give: cycles as values, a million cells that are not each
 * a signal, undo, and a graph that can be serialised. The lesson is that
 * both are the same algorithm, and knowing one is knowing the other.
 */

import { isRangeRef, references } from '#lib/formula/ast.ts';
import { parse } from '#lib/formula/parser.ts';
import { evaluate, type Context } from '#lib/formula/evaluate.ts';
import { CYCLE, ErrorValue, type Scalar } from '#lib/formula/values.ts';
import { parseCanonical } from '#lib/engine/engine.ts';
import { parseA1 } from '#lib/sheet/address.ts';

export class ReactiveCell {
	readonly name: string;
	input = $state('');

	/**
	 * How many times this cell's formula has been evaluated — counted the way
	 * the engine counts. A literal is not evaluated, it is read; a cell on a
	 * cycle is marked, not evaluated. Bumped inside the derived: a side effect,
	 * kept only because counting is the lesson.
	 */
	evaluations = 0;

	readonly #sheet: ReactiveSheet;

	/**
	 * Whether this cell's formula is on a cycle — derived, like everything
	 * else here, from the formulas. See `reachesItself` for why it reads only
	 * the inputs this cell can reach. Declared here, and made a `$derived` in
	 * the constructor once the name and the sheet it reads exist.
	 */
	readonly onCycle: boolean;

	/**
	 * The cell's value: a `$derived` over `input` and, through the sheet,
	 * over whichever other cells the formula reads. Svelte records those
	 * reads as dependencies; there is no code here that says "A3 depends on
	 * A1", and yet A3 will recompute when A1 changes.
	 */
	readonly value: Scalar = $derived.by(() => {
		const text = this.input;
		// On a cycle, say so and read nothing: reading round the cycle is
		// exactly what the runtime cannot survive.
		if (this.onCycle) return CYCLE();
		if (!text.startsWith('=')) return parseCanonical(text);
		this.evaluations += 1;
		try {
			const ctx: Context = {
				cell: (row, col) => this.#sheet.read(`${String.fromCharCode(65 + col)}${row + 1}`),
				// A fresh Date per evaluation, never mutated: a plain Date is right.
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				now: () => new Date(),
				random: Math.random,
				locale: 'en-US'
			};
			const result = evaluate(parse(text.slice(1)), ctx);
			return result instanceof Object && !(result instanceof ErrorValue)
				? new ErrorValue('#VALUE!', 'A range cannot be shown in one cell')
				: result;
		} catch (e) {
			return new ErrorValue('#ERROR!', e instanceof Error ? e.message : String(e));
		}
	});

	constructor(name: string, sheet: ReactiveSheet) {
		this.name = name;
		this.#sheet = sheet;
		this.onCycle = $derived(this.#sheet.reachesItself(this.name));
	}
}

/** A three-by-three sheet of reactive cells. */
export class ReactiveSheet {
	readonly names: string[];
	/** Filled in the constructor and never changed after; the cells inside are the reactive part. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly cells = new Map<string, ReactiveCell>();

	readonly #rows: number;
	readonly #cols: number;

	constructor(rows = 3, cols = 3) {
		this.#rows = rows;
		this.#cols = cols;
		this.names = [];
		for (let r = 0; r < rows; r += 1) {
			for (let c = 0; c < cols; c += 1) {
				const name = `${String.fromCharCode(65 + c)}${r + 1}`;
				this.names.push(name);
				this.cells.set(name, new ReactiveCell(name, this));
			}
		}
	}

	read(name: string): Scalar {
		const cell = this.cells.get(name.toUpperCase());
		if (cell) return cell.value;
		return parseA1(name) ? null : new ErrorValue('#REF!', `${name} is outside this little sheet`);
	}

	set(name: string, input: string): void {
		const cell = this.cells.get(name);
		if (cell) cell.input = input;
	}

	/**
	 * Whether following the references from `start` comes back to it.
	 *
	 * It reads the input of every cell on the way and nothing else — never a
	 * value, so it cannot be caught in the cycle it is looking for. And it
	 * reads exactly the inputs `start` can reach, which are the cells its value
	 * depends on, so a cell's `onCycle` wakes on the same edits its value does.
	 * Nothing writes the answer, so no edit can forget to bring it up to date:
	 * `cell.input = '=C3'` is as safe as `set`.
	 *
	 * Nine cells, so a walk is plenty; the hand-written engine finds cycles
	 * among a million with Tarjan's algorithm.
	 */
	reachesItself(start: string): boolean {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to this walk
		const seen = new Set<string>();
		const todo = this.#referredTo(this.#input(start));
		while (todo.length > 0) {
			const next = todo.pop()!;
			if (next === start) return true;
			if (seen.has(next)) continue;
			seen.add(next);
			todo.push(...this.#referredTo(this.#input(next)));
		}
		return false;
	}

	#input(name: string): string {
		return this.cells.get(name)?.input ?? '';
	}

	/** The cells of this sheet a formula refers to, ranges spelled out. */
	#referredTo(input: string): string[] {
		if (!input.startsWith('=')) return [];
		let found;
		try {
			found = references(parse(input.slice(1)));
		} catch {
			return []; // a formula that does not parse refers to nothing yet
		}
		const names: string[] = [];
		for (const { ref } of found) {
			const [from, to] = isRangeRef(ref) ? [ref.start, ref.end] : [ref, ref];
			const lastRow = Math.min(Math.max(from.row, to.row), this.#rows - 1);
			const lastCol = Math.min(Math.max(from.col, to.col), this.#cols - 1);
			for (let row = Math.min(from.row, to.row); row <= lastRow; row += 1) {
				for (let col = Math.min(from.col, to.col); col <= lastCol; col += 1) {
					names.push(`${String.fromCharCode(65 + col)}${row + 1}`);
				}
			}
		}
		return names;
	}

	/** Formula evaluations across every cell — the number the lesson compares with the engine's. */
	get evaluations(): number {
		let n = 0;
		for (const cell of this.cells.values()) n += cell.evaluations;
		return n;
	}
}
