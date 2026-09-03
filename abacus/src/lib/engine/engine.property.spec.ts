import { describe, expect, it } from 'vitest';
import { references, isRangeRef, type Node } from '#lib/formula/ast.ts';
import { evaluate, type Context } from '#lib/formula/evaluate.ts';
import { parse } from '#lib/formula/parser.ts';
import { CYCLE, ErrorValue, type Scalar } from '#lib/formula/values.ts';
import { key, unkey } from '#lib/sheet/address.ts';
import { cyclicMembers, Engine, parseCanonical, same } from './engine.ts';
import { shiftFormula, translateFormula } from './rewrite.ts';

/**
 * THE PROPERTY
 * ============
 *
 * After any sequence of edits, the incremental engine must hold exactly the
 * values a from-scratch evaluation of the same cells would produce. The
 * from-scratch evaluator below shares the parser and the evaluator with the
 * engine — those are tested on their own — and shares nothing else: no
 * indexes, no dirty sets, no versions. It builds the whole graph every time.
 *
 * A thousand random sheets and ten thousand random edits, from a printed
 * seed, is a stronger statement about the engine than any list of cases a
 * person could think of, and it is the reason the engine can be optimised
 * later without fear.
 */

/** mulberry32: a small, good, seedable generator. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ROWS = 5;
const COLS = 4;
const NOW = new Date(Date.UTC(2026, 8, 2));

function a1(row: number, col: number): string {
	return `${String.fromCharCode(65 + col)}${row + 1}`;
}

/** A random input: a number, empty, or a formula over random cells and ranges. */
function randomInput(random: () => number): string | null {
	const roll = random();
	if (roll < 0.25) return String(Math.floor(random() * 20) - 5);
	if (roll < 0.3) return null;
	if (roll < 0.35) return ['x', 'TRUE', '7', "'abc"][Math.floor(random() * 4)]!;

	const cell = () => a1(Math.floor(random() * ROWS), Math.floor(random() * COLS));
	const range = () => {
		const r1 = Math.floor(random() * ROWS);
		const c1 = Math.floor(random() * COLS);
		const r2 = Math.min(ROWS - 1, r1 + Math.floor(random() * 3));
		const c2 = Math.min(COLS - 1, c1 + Math.floor(random() * 2));
		return `${a1(r1, c1)}:${a1(r2, c2)}`;
	};
	const pick = Math.floor(random() * 8);
	switch (pick) {
		case 0:
			return `=${cell()}+${cell()}`;
		case 1:
			return `=${cell()}*2-1`;
		case 2:
			return `=SUM(${range()})`;
		case 3:
			return `=IF(${cell()}>3, ${cell()}, ${cell()})`;
		case 4:
			return `=AVERAGE(${range()})`;
		case 5:
			return `=IFERROR(${cell()}/${cell()}, -1)`;
		case 6:
			return `=COUNT(${range()})+${cell()}`;
		default:
			return `=MAX(${range()})`;
	}
}

/** Everything from scratch: parse all, find cycles, evaluate recursively. */
function fromScratch(inputs: Map<number, string>): Map<number, Scalar> {
	const formulas = new Map<number, Node>();
	const literals = new Map<number, Scalar>();
	const errors = new Map<number, ErrorValue>();

	for (const [k, input] of inputs) {
		if (!input.startsWith('=')) {
			literals.set(k, parseCanonical(input));
			continue;
		}
		try {
			formulas.set(k, parse(input.slice(1)));
		} catch (e) {
			errors.set(k, new ErrorValue('#ERROR!', String(e)));
		}
	}

	const edges = (k: number): number[] => {
		const node = formulas.get(k);
		if (!node) return [];
		const out: number[] = [];
		for (const { ref } of references(node)) {
			if (isRangeRef(ref)) {
				for (let r = ref.start.row; r <= ref.end.row; r += 1) {
					for (let c = ref.start.col; c <= ref.end.col; c += 1) {
						if (formulas.has(key(r, c))) out.push(key(r, c));
					}
				}
			} else if (formulas.has(key(ref.row, ref.col))) {
				out.push(key(ref.row, ref.col));
			}
		}
		return out;
	};

	// Cycle members are found on the static graph, exactly as the engine does.
	const cyclic = cyclicMembers(new Set(formulas.keys()), edges);

	const values = new Map<number, Scalar>();
	for (const [k, v] of literals) values.set(k, v);
	for (const [k, e] of errors) values.set(k, e);
	for (const k of cyclic) values.set(k, CYCLE());

	const ctx: Context = {
		cell: (row, col) => resolve(key(row, col)),
		now: () => NOW,
		random: () => 0.5,
		locale: 'en-US'
	};

	function resolve(k: number): Scalar {
		if (values.has(k)) return values.get(k)!;
		const node = formulas.get(k);
		if (!node) return null;
		const v = evaluate(node, ctx) as Scalar;
		values.set(k, v);
		return v;
	}

	for (const k of formulas.keys()) resolve(k);
	return values;
}

function agree(engine: Engine, inputs: Map<number, string>, seed: number, step: number) {
	const expected = fromScratch(inputs);
	for (let r = 0; r < ROWS; r += 1) {
		for (let c = 0; c < COLS; c += 1) {
			const k = key(r, c);
			const got = engine.value(r, c);
			const want = expected.get(k) ?? null;
			if (!same(got, want)) {
				throw new Error(
					`seed ${seed} step ${step}: ${a1(r, c)} = ${String(got)} but from scratch = ${String(want)}\n` +
						[...inputs].map(([kk, v]) => `${a1(unkey(kk).row, unkey(kk).col)}: ${v}`).join('\n')
				);
			}
		}
	}
}

describe('the engine agrees with a from-scratch evaluation', () => {
	it('after ten thousand random edits across a thousand sheets', () => {
		let checks = 0;
		for (let seed = 1; seed <= 1000; seed += 1) {
			const random = rng(seed);
			const engine = new Engine({ now: () => NOW, random: () => 0.5 });
			const inputs = new Map<number, string>();

			for (let step = 0; step < 10; step += 1) {
				const row = Math.floor(random() * ROWS);
				const col = Math.floor(random() * COLS);
				const input = randomInput(random);
				engine.set(row, col, input);
				if (input === null || input === '') inputs.delete(key(row, col));
				else inputs.set(key(row, col), input);
				agree(engine, inputs, seed, step);
				checks += 1;
			}
		}
		expect(checks).toBe(10_000);
	});

	it('after a batch of edits, exactly as after the same edits one at a time', () => {
		for (let seed = 1; seed <= 200; seed += 1) {
			const random = rng(seed * 7919);
			const batched = new Engine({ now: () => NOW, random: () => 0.5 });
			const inputs = new Map<number, string>();
			const edits = [];
			for (let i = 0; i < 8; i += 1) {
				const row = Math.floor(random() * ROWS);
				const col = Math.floor(random() * COLS);
				const input = randomInput(random);
				edits.push({ row, col, input });
				if (input === null || input === '') inputs.delete(key(row, col));
				else inputs.set(key(row, col), input);
			}
			batched.apply(edits);
			agree(batched, inputs, seed, -1);
			expect(batched.version).toBe(1);
		}
	});
});

describe('rewriting is consistent', () => {
	it('inserting rows and deleting them again restores every formula', () => {
		const random = rng(42);
		for (let i = 0; i < 500; i += 1) {
			const input = randomInput(random);
			if (!input?.startsWith('=')) continue;
			const source = input.slice(1);
			const at = Math.floor(random() * ROWS);
			const count = 1 + Math.floor(random() * 3);
			const inserted = shiftFormula(source, { kind: 'insert-rows', at, count });
			expect(shiftFormula(inserted, { kind: 'delete-rows', at, count })).toBe(source);
		}
	});

	it('translating a formula there and back is the identity when nothing falls off', () => {
		const random = rng(7);
		for (let i = 0; i < 500; i += 1) {
			const input = randomInput(random);
			if (!input?.startsWith('=')) continue;
			const source = input.slice(1);
			const dRow = Math.floor(random() * 3);
			const dCol = Math.floor(random() * 3);
			const there = translateFormula(source, dRow, dCol);
			expect(translateFormula(there, -dRow, -dCol)).toBe(source);
		}
	});
});
