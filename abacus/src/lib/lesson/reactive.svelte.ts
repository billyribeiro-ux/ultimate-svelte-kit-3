/**
 * THE SAME ENGINE, OUT OF RUNES
 * =============================
 *
 * Chapter 10 built a dependency graph by hand: cells, edges, a dirty set,
 * a topological sort. Svelte's runtime *is* one of those. This file proves
 * it by building a small sheet where every cell's value is a `$derived`
 * that reads other cells — and nothing else. No edges are recorded, no
 * order is computed; Svelte tracks what each cell read and recomputes,
 * in dependency order, exactly the cells that need it.
 *
 * WHAT IT SHOWS
 * -------------
 *   - A `$derived` is a formula cell. Its dependencies are whatever it read.
 *   - Change an input and only the deriveds downstream re-run — Svelte's
 *     "push-pull" scheduling is the incremental recalculation of chapter 10.
 *   - Diamonds are fine: a cell that reads two cells that read one input
 *     recomputes once, not twice, because updates are glitch-free.
 *   - A cycle is not fine: Svelte throws rather than marking `#CYCLE!`,
 *     because a derived that reads itself is a bug in a program, not a
 *     mistake in a sheet.
 *
 * WHAT IT SHOWS ABOUT THE ENGINE, TOO
 * -----------------------------------
 * The hand-written engine exists because a spreadsheet needs what a
 * runtime cannot give: cycles as values, a million cells that are not each
 * a signal, undo, and a graph that can be serialised. The lesson is that
 * both are the same algorithm, and knowing one is knowing the other.
 */

import { parse } from '#lib/formula/parser.ts';
import { evaluate, type Context } from '#lib/formula/evaluate.ts';
import { ErrorValue, type Scalar } from '#lib/formula/values.ts';
import { parseCanonical } from '#lib/engine/engine.ts';
import { parseA1 } from '#lib/sheet/address.ts';

export class ReactiveCell {
	readonly name: string;
	input = $state('');

	/** How many times this cell has been evaluated. Bumped inside the derived — a side effect, kept only because counting is the lesson. */
	evaluations = 0;

	readonly #lookup: (name: string) => Scalar;

	/**
	 * The cell's value: a `$derived` over `input` and, through `lookup`,
	 * over whichever other cells the formula reads. Svelte records those
	 * reads as dependencies; there is no code here that says "A3 depends on
	 * A1", and yet A3 will recompute when A1 changes.
	 */
	readonly value: Scalar = $derived.by(() => {
		this.evaluations += 1;
		const text = this.input;
		if (!text.startsWith('=')) return parseCanonical(text);
		try {
			const ctx: Context = {
				cell: (row, col) => this.#lookup(`${String.fromCharCode(65 + col)}${row + 1}`),
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
			return new ErrorValue('#ERROR!', (e as Error).message);
		}
	});

	constructor(name: string, lookup: (name: string) => Scalar) {
		this.name = name;
		this.#lookup = lookup;
	}
}

/** A three-by-three sheet of reactive cells. */
export class ReactiveSheet {
	readonly names: string[];
	/** Filled in the constructor and never changed after; the cells inside are the reactive part. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly cells = new Map<string, ReactiveCell>();

	constructor(rows = 3, cols = 3) {
		this.names = [];
		for (let r = 0; r < rows; r += 1) {
			for (let c = 0; c < cols; c += 1) {
				const name = `${String.fromCharCode(65 + c)}${r + 1}`;
				this.names.push(name);
				this.cells.set(name, new ReactiveCell(name, (other) => this.read(other)));
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

	/** Total evaluations across every cell — the number the lesson compares. */
	get evaluations(): number {
		let n = 0;
		for (const cell of this.cells.values()) n += cell.evaluations;
		return n;
	}
}
