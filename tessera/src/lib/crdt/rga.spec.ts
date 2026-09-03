import { describe, expect, it } from 'vitest';
import { RgaText, type RgaItem } from './rga.ts';
import { int, pick, seeded, shuffle, stamp } from './testing.ts';
import type { Stamp } from './clock.ts';

/** All ids from one actor, so ordering is decided purely by the number given. */
const id = (n: number): Stamp => stamp(n, 0, 'a');

function item(n: number, after: number | null, value: string): RgaItem {
	return { id: id(n), after: after === null ? null : id(after), value, deleted: false };
}

describe('the counterexample the naive scan gets wrong', () => {
	it('keeps an insertion inside its parent’s subtree', () => {
		/*
		 * Nearly every RGA write-up inserts by walking forward from the parent and
		 * skipping everything with a greater id. Build `B X A C` — X under B, C
		 * under A — and insert Y under B with an id lower than all of them, and that
		 * shortcut walks straight out of B's subtree and puts Y at the very end.
		 *
		 * Low ids are not exotic: they are what an offline replica produces when it
		 * rejoins. This is the test that pins the tree-based implementation in place.
		 */
		const text = new RgaText();
		text.insert(item(20, null, 'B'));
		text.insert(item(40, 20, 'X'));
		text.insert(item(10, null, 'A'));
		text.insert(item(30, 10, 'C'));

		expect(text.text()).toBe('BXAC');

		text.insert(item(5, 20, 'Y'));

		expect(text.text()).toBe('BXYAC');
		expect(text.text()).not.toBe('BXACY'); // what the shortcut produces
	});
});

describe('ordering', () => {
	it('puts the higher stamp first among concurrent siblings', () => {
		const text = new RgaText();
		text.insert(item(10, null, 'a'));
		text.insert(item(30, 10, 'c')); // both typed after 'a', concurrently
		text.insert(item(20, 10, 'b'));

		expect(text.text()).toBe('acb');
	});

	it('reaches the same text whatever order the operations arrive in', () => {
		const operations = [
			item(10, null, 'H'),
			item(20, 10, 'e'),
			item(30, 20, 'l'),
			item(40, 30, 'l'),
			item(50, 40, 'o'),
			item(35, 20, '!') // a concurrent insertion in the middle
		];

		const random = seeded(11);
		const texts = new Set<string>();

		for (let run = 0; run < 60; run += 1) {
			const text = new RgaText();
			for (const operation of shuffle(random, operations)) text.insert(operation);
			texts.add(text.text());
		}

		expect([...texts]).toEqual(['He!llo']);
	});

	it('holds a subtree until its parent arrives, then shows the whole branch', () => {
		/*
		 * Out-of-causal-order delivery. The child is not an error and not dropped —
		 * it waits, invisible, and appears the moment its parent lands.
		 */
		const text = new RgaText();
		text.insert(item(20, 10, 'b'));
		expect(text.text()).toBe('');

		text.insert(item(10, null, 'a'));
		expect(text.text()).toBe('ab');
	});
});

describe('deletion', () => {
	it('tombstones rather than removing, so later inserts still land', () => {
		const text = RgaText.from('ab', [id(10), id(20)]);
		text.delete(id(10));

		expect(text.text()).toBe('b');

		// An operation from a replica that never saw the delete. It still anchors to
		// the tombstone, and still sorts ahead of 'b' because its stamp is greater.
		text.insert(item(25, 10, 'X'));
		expect(text.text()).toBe('Xb');
	});

	it('is idempotent', () => {
		const text = RgaText.from('a', [id(10)]);
		expect(text.delete(id(10))).toBe(true);
		expect(text.delete(id(10))).toBe(false);
	});

	it('remembers a deletion that arrives before the character it deletes', () => {
		/*
		 * The bug `convergence.spec.ts` found on its first run. A delete used to be
		 * a no-op for an unknown id, which looks harmless and is not: when the pair
		 * arrived in the other order the character came back, one replica showed
		 * `g` and another `ga`, and both had applied every operation.
		 */
		const text = new RgaText();

		expect(text.delete(id(20))).toBe(true); // nothing to delete — yet
		expect(text.delete(id(20))).toBe(false); // still idempotent

		text.insert(item(10, null, 'a'));
		text.insert(item(20, 10, 'b'));

		expect(text.text()).toBe('a');
	});

	it('carries unresolved deletions through a merge and a snapshot', () => {
		const early = new RgaText();
		early.delete(id(20));

		const viaMerge = new RgaText();
		viaMerge.merge(early);
		viaMerge.insert(item(20, null, 'b'));
		expect(viaMerge.text()).toBe('');

		const viaJson = RgaText.fromJSON(early.toJSON());
		viaJson.insert(item(20, null, 'b'));
		expect(viaJson.text()).toBe('');
	});
});

describe('caret anchoring', () => {
	it('maps offsets to ids and back', () => {
		const text = RgaText.from('abc', [id(10), id(20), id(30)]);

		expect(text.idBefore(0)).toBeNull();
		expect(text.idBefore(2)).toBe(id(20));
		expect(text.offsetAfter(id(20))).toBe(2);
		expect(text.offsetAfter(null)).toBe(0);
	});

	it('keeps a caret still when somebody types above it', () => {
		/*
		 * The reason the editor anchors to an id rather than a number. Remembering
		 * "offset 2" and re-applying it after a remote insertion moves the caret;
		 * remembering "after the character with this id" does not.
		 */
		const text = RgaText.from('bc', [id(20), id(30)]);
		const anchor = text.idBefore(1); // after 'b'
		expect(text.offsetAfter(anchor)).toBe(1);

		// A later stamp, because the other replica typed this after seeing 'bc'.
		text.insert(item(50, null, 'a'));
		expect(text.text()).toBe('abc');
		expect(text.offsetAfter(anchor)).toBe(2);
	});

	it('reports a tombstoned anchor as gone', () => {
		const text = RgaText.from('ab', [id(10), id(20)]);
		text.delete(id(20));
		expect(text.offsetAfter(id(20))).toBeNull();
	});

	it('lists the ids in a range for a selection delete', () => {
		const text = RgaText.from('abcd', [id(10), id(20), id(30), id(40)]);
		expect(text.idsBetween(1, 3)).toEqual([id(20), id(30)]);
	});
});

describe('merging', () => {
	it('converges under random concurrent editing', () => {
		const random = seeded(23);

		for (let run = 0; run < 40; run += 1) {
			const left = RgaText.from('shared', [10, 20, 30, 40, 50, 60].map(id));
			const right = RgaText.fromJSON(left.toJSON());

			let next = 100;
			for (const [replica, letter] of [
				[left, 'L'],
				[right, 'R']
			] as const) {
				for (let edit = 0; edit < 4; edit += 1) {
					const visible = replica.visible();
					if (visible.length > 0 && random() < 0.3) {
						replica.delete(pick(random, visible).id);
					} else {
						const at = int(random, 0, replica.visible().length);
						replica.insert({
							id: id((next += 1)),
							after: replica.idBefore(at),
							value: letter,
							deleted: false
						});
					}
				}
			}

			const a = RgaText.fromJSON(left.toJSON());
			a.merge(right);
			const b = RgaText.fromJSON(right.toJSON());
			b.merge(left);

			expect(a.text()).toBe(b.text());
		}
	});

	it('round-trips through JSON, tombstones included', () => {
		const text = RgaText.from('abc', [id(10), id(20), id(30)]);
		text.delete(id(20));

		const copy = RgaText.fromJSON(text.toJSON());
		expect(copy.text()).toBe('ac');
		expect(copy.toJSON()).toEqual(text.toJSON());
	});
});

describe('robustness', () => {
	it('flattens a long chain without blowing the stack', () => {
		// A label typed one character at a time is a chain as deep as it is long.
		// A recursive flatten dies here, from inside a render.
		const size = 20_000;
		const text = RgaText.from(
			'x'.repeat(size),
			Array.from({ length: size }, (_, i) => id(i + 1))
		);
		expect(text.text()).toHaveLength(size);
	});

	it('treats an emoji as one character', () => {
		expect(() => RgaText.from('a🎯b', [id(10), id(20)])).toThrow(RangeError);

		const text = RgaText.from('a🎯b', [id(10), id(20), id(30)]);
		expect(text.text()).toBe('a🎯b');
		expect(text.visible()).toHaveLength(3);
	});
});
