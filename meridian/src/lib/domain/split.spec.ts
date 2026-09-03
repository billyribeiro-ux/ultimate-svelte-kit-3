import { describe, expect, it } from 'vitest';
import { balances, settle, shares } from './split.ts';

const even = (...ids: string[]) => ids.map((userId) => ({ userId, weight: 1 }));

describe('shares', () => {
	it('splits evenly when it can', () => {
		expect([...shares(3000, even('a', 'b', 'c'))]).toEqual([
			['a', 1000],
			['b', 1000],
			['c', 1000]
		]);
	});

	it('hands the leftover cents out by largest remainder, and always sums to the whole', () => {
		const result = shares(1000, even('a', 'b', 'c'));
		expect([...result.values()].reduce((s, n) => s + n, 0)).toBe(1000);
		expect([...result.values()].sort()).toEqual([333, 333, 334]);
	});

	it('is deterministic about who gets the extra cent', () => {
		const first = shares(1000, even('b', 'a', 'c'));
		const second = shares(1000, even('c', 'b', 'a'));
		expect(first.get('a')).toBe(334);
		expect(second.get('a')).toBe(334);
	});

	it('respects weights', () => {
		const result = shares(900, [
			{ userId: 'a', weight: 2 },
			{ userId: 'b', weight: 1 }
		]);
		expect(result.get('a')).toBe(600);
		expect(result.get('b')).toBe(300);
	});

	it('refuses nonsense', () => {
		expect(() => shares(10.5, even('a'))).toThrow(RangeError);
		expect(() => shares(100, [])).toThrow(RangeError);
		expect(() => shares(100, [{ userId: 'a', weight: 0 }])).toThrow(RangeError);
	});
});

describe('balances and settle', () => {
	const trip = [
		{ amountMinor: 9000, paidBy: 'ana', shares: even('ana', 'ben', 'cal') },
		{ amountMinor: 3000, paidBy: 'ben', shares: even('ana', 'ben', 'cal') },
		{ amountMinor: 1200, paidBy: 'cal', shares: even('ben', 'cal') }
	];

	it('balances sum to zero', () => {
		const b = balances(trip);
		expect([...b.values()].reduce((s, n) => s + n, 0)).toBe(0);
		expect(b.get('ana')).toBe(5000);
		expect(b.get('ben')).toBe(-1600);
		expect(b.get('cal')).toBe(-3400);
	});

	it('settles with at most people − 1 transfers', () => {
		const transfers = settle(balances(trip));
		expect(transfers).toEqual([
			{ from: 'cal', to: 'ana', amountMinor: 3400 },
			{ from: 'ben', to: 'ana', amountMinor: 1600 }
		]);
	});

	it('settles nothing when everybody is square', () => {
		expect(settle(new Map([['a', 0]]))).toEqual([]);
		expect(settle(new Map())).toEqual([]);
	});

	it('pairs the biggest debtor with the biggest creditor first', () => {
		const transfers = settle(
			new Map([
				['a', 500],
				['b', 300],
				['c', -600],
				['d', -200]
			])
		);
		expect(transfers).toEqual([
			{ from: 'c', to: 'a', amountMinor: 500 },
			{ from: 'c', to: 'b', amountMinor: 100 },
			{ from: 'd', to: 'b', amountMinor: 200 }
		]);
	});
});
