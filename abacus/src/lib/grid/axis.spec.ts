import { describe, expect, it } from 'vitest';
import { Axis } from './axis.ts';

describe('an axis with custom sizes', () => {
	const axis = new Axis(
		28,
		new Map([
			[2, 60],
			[5, 10],
			[1000, 100]
		])
	);

	it('offsets by the default plus the deltas before', () => {
		expect(axis.offset(0)).toBe(0);
		expect(axis.offset(2)).toBe(56);
		expect(axis.offset(3)).toBe(56 + 60);
		expect(axis.offset(5)).toBe(116 + 2 * 28);
		expect(axis.offset(6)).toBe(172 + 10);
		expect(axis.offset(1001)).toBe(1001 * 28 + 32 - 18 + 72);
		expect(axis.total(3)).toBe(116);
	});

	it('finds the index under a pixel, in both directions of the estimate', () => {
		for (let px = 0; px < 2000; px += 7) {
			const index = axis.indexAt(px);
			expect(axis.offset(index) <= px && px < axis.offset(index) + axis.size(index), `${px}`).toBe(
				true
			);
		}
		expect(axis.indexAt(-5)).toBe(0);
		expect(axis.indexAt(axis.offset(1000) + 50)).toBe(1000);
	});

	it('is uniform with no custom sizes', () => {
		const plain = new Axis(100, new Map());
		expect(plain.offset(17)).toBe(1700);
		expect(plain.indexAt(1750)).toBe(17);
	});
});
