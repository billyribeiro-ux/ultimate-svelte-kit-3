import { describe, expect, it } from 'vitest';
import { MIDDLE, between, betweenMany, compareOrder, isOrderKey, type OrderKey } from './fracdex';
import { int, seeded } from './testing';

const key = (value: string) => value as OrderKey;

describe('between', () => {
	it('starts in the middle of the range', () => {
		expect(between(null, null)).toBe(MIDDLE);
	});

	it('produces a key strictly between its bounds', () => {
		const low = key('A');
		const high = key('B');
		const mid = between(low, high);

		expect(mid > low).toBe(true);
		expect(mid < high).toBe(true);
	});

	it('appends after everything and prepends before everything', () => {
		expect(between(key('V'), null) > 'V').toBe(true);
		expect(between(null, key('V')) < 'V').toBe(true);
	});

	it('descends when neighbours are adjacent digits', () => {
		// '1' and '2' have no room between them, so the key grows a character.
		const mid = between(key('1'), key('2'));
		expect(mid > '1').toBe(true);
		expect(mid < '2').toBe(true);
		expect(mid.length).toBeGreaterThan(1);
	});

	it('refuses bounds that are not ascending', () => {
		expect(() => between(key('B'), key('A'))).toThrow(RangeError);
		expect(() => between(key('A'), key('A'))).toThrow(RangeError);
	});

	it('never ends in a zero digit', () => {
		/*
		 * A trailing '0' would make `V` and `V0` sort equal as fractions while
		 * differing as strings — two shapes that are simultaneously in the same
		 * place and in a definite order, depending on which comparison ran.
		 */
		const random = seeded(5);
		let low = key('1');
		const high = key('2');

		for (let i = 0; i < 200; i += 1) {
			const next = between(low, high);
			expect(next.endsWith('0')).toBe(false);
			low = random() < 0.5 ? next : low;
		}
	});

	it('stays ordered under a thousand insertions at the same spot', () => {
		// "Send backward" pressed a thousand times. Keys get longer; they never
		// collide and never come out of order.
		let low: OrderKey | null = null;
		const high = key('V');
		const produced: OrderKey[] = [];

		for (let i = 0; i < 1000; i += 1) {
			const next = between(low, high);
			produced.push(next);
			low = next;
		}

		expect(produced).toEqual([...produced].sort());
		expect(new Set(produced).size).toBe(produced.length);
	});
});

describe('betweenMany', () => {
	it('returns nothing for a count of zero', () => {
		expect(betweenMany(null, null, 0)).toEqual([]);
	});

	it('returns ascending keys strictly inside the bounds', () => {
		const low = key('A');
		const high = key('B');
		const keys = betweenMany(low, high, 40);

		expect(keys).toHaveLength(40);
		expect(keys).toEqual([...keys].sort());
		expect(keys[0]! > low).toBe(true);
		expect(keys.at(-1)! < high).toBe(true);
	});

	it('keeps keys short by halving rather than chaining', () => {
		/*
		 * Pasting forty shapes with forty chained `between` calls grows the last key
		 * to forty characters. Splitting the range keeps every key within a couple
		 * of characters of the shortest possible.
		 */
		const chained: OrderKey[] = [];
		let cursor: OrderKey | null = null;
		for (let i = 0; i < 40; i += 1) {
			cursor = between(cursor, key('V'));
			chained.push(cursor);
		}

		const split = betweenMany(null, key('V'), 40);
		const longest = (keys: OrderKey[]) => Math.max(...keys.map((k) => k.length));

		expect(longest(split)).toBeLessThan(longest(chained));
	});

	it('refuses a negative count', () => {
		expect(() => betweenMany(null, null, -1)).toThrow(RangeError);
	});
});

describe('isOrderKey', () => {
	it('accepts what between produces', () => {
		const random = seeded(9);
		for (let i = 0; i < 100; i += 1) {
			const a = between(null, null);
			const b = between(a, null);
			expect(isOrderKey(random() < 0.5 ? a : b)).toBe(true);
			expect(int(random, 0, 1)).toBeLessThanOrEqual(1);
		}
	});

	it('rejects the shapes that would break sorting', () => {
		expect(isOrderKey('')).toBe(false);
		expect(isOrderKey('V0')).toBe(false);
		expect(isOrderKey('V-')).toBe(false);
		expect(isOrderKey('hello world')).toBe(false);
	});
});

describe('compareOrder', () => {
	it('breaks a collision with the element id', () => {
		/*
		 * Two replicas moving different shapes into the same gap compute the same
		 * key. Sorting on the key alone then leaves the result to whatever the sort
		 * implementation felt like — which is not the same on two machines, so the
		 * boards render differently while the data has technically converged.
		 */
		const a = { key: key('V'), id: 'node-a' };
		const b = { key: key('V'), id: 'node-b' };

		expect(compareOrder(a, b)).toBeLessThan(0);
		expect(compareOrder(b, a)).toBeGreaterThan(0);
		expect(compareOrder(a, a)).toBe(0);
	});

	it('sorts by key first', () => {
		const lower = { key: key('A'), id: 'zzz' };
		const higher = { key: key('B'), id: 'aaa' };
		expect(compareOrder(lower, higher)).toBeLessThan(0);
	});
});
