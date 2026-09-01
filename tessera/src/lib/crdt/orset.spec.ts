import { describe, expect, it } from 'vitest';
import { OrSet } from './orset.ts';
import { empty, observe } from './version.ts';
import { stamp } from './testing.ts';

const addA = stamp(1_000, 0, 'a');
const addB = stamp(1_000, 0, 'b');
const readdA = stamp(2_000, 0, 'a');

function set(): OrSet<'node-1'> {
	return new OrSet<'node-1'>();
}

describe('membership', () => {
	it('starts empty', () => {
		expect(set().has('node-1')).toBe(false);
	});

	it('adds and removes', () => {
		const s = set();
		s.add('node-1', addA);
		expect(s.has('node-1')).toBe(true);

		s.remove('node-1', s.observedAdds('node-1'));
		expect(s.has('node-1')).toBe(false);
	});

	it('is idempotent in both directions', () => {
		const s = set();
		expect(s.add('node-1', addA)).toBe(true);
		expect(s.add('node-1', addA)).toBe(false);

		const observed = s.observedAdds('node-1');
		expect(s.remove('node-1', observed)).toBe(true);
		expect(s.remove('node-1', observed)).toBe(false);
	});

	it('lists present keys in a stable order', () => {
		const s = new OrSet<string>();
		s.add('z', addA);
		s.add('a', addB);
		expect(s.keys()).toEqual(['a', 'z']);
	});
});

describe('the resurrection bug this structure exists to prevent', () => {
	it('does not bring an element back when its add is redelivered', () => {
		/*
		 * I delete a box; you are offline holding the original add; you reconnect
		 * and your replica replays it. With a plain set the box returns. Here the
		 * remove already names that exact add stamp, so replaying it changes
		 * nothing.
		 */
		const s = set();
		s.add('node-1', addA);
		s.remove('node-1', [addA]);

		s.add('node-1', addA); // the straggler
		expect(s.has('node-1')).toBe(false);
	});
});

describe('add-wins', () => {
	it('keeps an add that happened concurrently with a remove', () => {
		/*
		 * You delete the node. At the same moment, not having seen your delete, I
		 * re-create it. My add stamp is not in your remove set — it could not be,
		 * you never saw it — so the node survives. That is the forgiving direction:
		 * the cost of being wrong is one more keystroke, not lost work.
		 */
		const mine = set();
		const yours = set();

		mine.add('node-1', addA);
		yours.add('node-1', addA);

		yours.remove('node-1', yours.observedAdds('node-1'));
		mine.add('node-1', addB); // concurrent re-create

		mine.merge(yours);
		yours.merge(mine);

		expect(mine.has('node-1')).toBe(true);
		expect(yours.has('node-1')).toBe(true);
	});

	it('lets undo bring a deleted element back', () => {
		const s = set();
		s.add('node-1', addA);
		s.remove('node-1', s.observedAdds('node-1'));

		s.add('node-1', readdA); // undo mints a fresh stamp
		expect(s.has('node-1')).toBe(true);
	});
});

describe('merge', () => {
	it('is commutative', () => {
		const mine = set();
		const yours = set();

		mine.add('node-1', addA);
		yours.add('node-1', addB);
		yours.remove('node-1', [addB]);

		const left = new OrSet<'node-1'>();
		left.merge(mine);
		left.merge(yours);

		const right = new OrSet<'node-1'>();
		right.merge(yours);
		right.merge(mine);

		expect(left.toJSON()).toEqual(right.toJSON());
	});

	it('round-trips through JSON', () => {
		const s = set();
		s.add('node-1', addA);
		s.add('node-1', addB);
		s.remove('node-1', [addA]);

		expect(OrSet.fromJSON(s.toJSON()).toJSON()).toEqual(s.toJSON());
	});
});

describe('compaction', () => {
	it('drops history everybody has seen', () => {
		const s = set();
		s.add('node-1', addA);
		s.remove('node-1', [addA]);

		const stable = observe(empty(), addA);
		expect(s.compact(stable)).toBe(1);
		expect(s.has('node-1')).toBe(false);
		expect(s.toJSON()).toEqual({ added: {}, removed: {} });
	});

	it('keeps history a straggler might still contradict', () => {
		/*
		 * The dangerous direction. If compaction runs against a version vector that
		 * some replica has not reached, its pending add is no longer known to have
		 * been removed — and the node comes back from the dead.
		 */
		const s = set();
		s.add('node-1', addA);
		s.remove('node-1', [addA]);

		expect(s.compact(empty())).toBe(0);
		expect(s.has('node-1')).toBe(false);
	});
});
