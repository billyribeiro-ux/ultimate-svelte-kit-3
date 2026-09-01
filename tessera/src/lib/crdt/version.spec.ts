import { describe, expect, it } from 'vitest';
import {
	dominates,
	empty,
	equal,
	fromJSON,
	has,
	merge,
	observe,
	toJSON,
	unseen
} from './version.ts';
import { actor, stamp } from './testing.ts';

const a1 = stamp(1_000, 0, 'a');
const a2 = stamp(1_000, 1, 'a');
const b1 = stamp(1_000, 0, 'b');

describe('has', () => {
	it('is false for an empty vector', () => {
		expect(has(empty(), a1)).toBe(false);
	});

	it('is inclusive of the stamp it stores', () => {
		/*
		 * `<=`, not `<`. With `<` every sync redelivers exactly one operation per
		 * actor forever — which looks like a bandwidth problem and is a correctness
		 * one, because redelivered operations re-fire everything watching them.
		 */
		const vector = observe(empty(), a1);
		expect(has(vector, a1)).toBe(true);
		expect(has(vector, a2)).toBe(false);
	});

	it('does not confuse one actor for another', () => {
		const vector = observe(empty(), a2);
		expect(has(vector, b1)).toBe(false);
	});
});

describe('observe', () => {
	it('returns the same object when nothing changed', () => {
		// Identity is how the reactive layer skips work; this is load-bearing.
		const vector = observe(empty(), a2);
		expect(observe(vector, a1)).toBe(vector);
	});

	it('never moves an actor backwards', () => {
		const vector = observe(observe(empty(), a2), a1);
		expect(vector.get(actor('a'))).toBe(a2);
	});
});

describe('merge', () => {
	it('takes the greatest stamp per actor', () => {
		const mine = observe(observe(empty(), a1), b1);
		const yours = observe(empty(), a2);
		const merged = merge(mine, yours);

		expect(merged.get(actor('a'))).toBe(a2);
		expect(merged.get(actor('b'))).toBe(b1);
	});

	it('is commutative', () => {
		const mine = observe(empty(), a2);
		const yours = observe(empty(), b1);
		expect(toJSON(merge(mine, yours))).toEqual(toJSON(merge(yours, mine)));
	});
});

describe('dominates', () => {
	it('recognises a vector that is strictly ahead', () => {
		const ahead = observe(observe(empty(), a2), b1);
		const behind = observe(empty(), a1);

		expect(dominates(ahead, behind)).toBe(true);
		expect(dominates(behind, ahead)).toBe(false);
	});

	it('says neither dominates when the two are concurrent', () => {
		const mine = observe(empty(), a2);
		const yours = observe(empty(), b1);

		expect(dominates(mine, yours)).toBe(false);
		expect(dominates(yours, mine)).toBe(false);
	});

	it('backs equality', () => {
		const mine = observe(empty(), a2);
		const same = observe(empty(), a2);
		const more = observe(same, b1);

		expect(equal(mine, same)).toBe(true);
		expect(equal(mine, more)).toBe(false);
	});
});

describe('unseen', () => {
	it('keeps only what the vector has not observed', () => {
		const vector = observe(empty(), a1);
		const batch = [{ stamp: a1 }, { stamp: a2 }, { stamp: b1 }];
		expect(unseen(vector, batch)).toEqual([{ stamp: a2 }, { stamp: b1 }]);
	});
});

describe('encoding', () => {
	it('round-trips through JSON', () => {
		const vector = observe(observe(empty(), a2), b1);
		expect(toJSON(fromJSON(toJSON(vector)))).toEqual(toJSON(vector));
	});
});
