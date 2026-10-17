import { describe, expect, it } from 'vitest';
import { Engine } from '#lib/engine/engine.ts';
import { toA1 } from './address.ts';
import { DEMO_INPUTS, DEMO_RESULTS, demoText } from './demo.ts';

/**
 * The landing page promises its numbers are real. This is the promise kept:
 * the demo's inputs go into the engine, and every answer the page shows must
 * be the one the engine gives.
 */
describe('the landing page demo', () => {
	it('shows what the engine computes, for every formula and nothing else', () => {
		const engine = new Engine();
		DEMO_INPUTS.forEach((row, r) => row.forEach((input, c) => engine.set(r, c, input)));

		const formulas = DEMO_INPUTS.flatMap((row, r) =>
			row.flatMap((input, c) => (input.startsWith('=') ? [{ row: r, col: c }] : []))
		);
		expect(Object.keys(DEMO_RESULTS).sort()).toEqual(formulas.map(toA1).sort());

		for (const cell of formulas) {
			expect(engine.value(cell.row, cell.col)).toBeCloseTo(DEMO_RESULTS[toA1(cell)]!, 9);
		}
	});

	it('writes numbers as money and words as they are', () => {
		expect(demoText(4, 3)).toBe('-38.90');
		expect(demoText(4, 1)).toBe('1,970.00');
		expect(demoText(1, 1)).toBe('1,400.00');
		expect(demoText(2, 0)).toBe('Groceries');
		expect(demoText(0, 3)).toBe('Difference');
	});
});
