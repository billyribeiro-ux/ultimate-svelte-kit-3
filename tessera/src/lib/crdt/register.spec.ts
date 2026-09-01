import { describe, expect, it } from 'vitest';
import { mergeRegister, register, write } from './register';
import { stamp } from './testing';

const early = stamp(1_000, 0, 'a');
const late = stamp(1_000, 1, 'a');
const concurrentA = stamp(1_000, 0, 'a');
const concurrentB = stamp(1_000, 0, 'b');

describe('mergeRegister', () => {
	it('keeps the later write', () => {
		expect(mergeRegister(register('old', early), register('new', late)).value).toBe('new');
		expect(mergeRegister(register('new', late), register('old', early)).value).toBe('new');
	});

	it('breaks a tie by actor, identically in both directions', () => {
		/*
		 * The property that stops two replicas disagreeing when two people drag the
		 * same box in the same millisecond. Without the actor inside the stamp this
		 * is a coin flip decided by argument order.
		 */
		const left = register('from a', concurrentA);
		const right = register('from b', concurrentB);

		expect(mergeRegister(left, right)).toEqual(mergeRegister(right, left));
		expect(mergeRegister(left, right).value).toBe('from b');
	});

	it('is idempotent', () => {
		const value = register('x', early);
		expect(mergeRegister(value, value)).toBe(value);
	});

	it('is associative', () => {
		const x = register('x', stamp(1, 0, 'a'));
		const y = register('y', stamp(2, 0, 'b'));
		const z = register('z', stamp(3, 0, 'c'));

		expect(mergeRegister(mergeRegister(x, y), z)).toEqual(mergeRegister(x, mergeRegister(y, z)));
	});
});

describe('write', () => {
	it('accepts the first value', () => {
		expect(write(undefined, 'first', early)).toEqual({ value: 'first', stamp: early });
	});

	it('reports no change for a stale write', () => {
		// `undefined` here means "nothing to invalidate", which is what keeps a
		// reconnect from re-rendering the whole board.
		expect(write(register('current', late), 'stale', early)).toBeUndefined();
	});

	it('reports no change when the same write arrives twice', () => {
		expect(write(register('current', late), 'current', late)).toBeUndefined();
	});
});
