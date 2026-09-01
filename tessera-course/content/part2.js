/**
 * PART 2 — The three data structures, and the proof
 * (chapters 09–12)
 *
 * Three files, about six hundred lines between them, and a test suite that is
 * longer than all three. That ratio is correct: this is the part of the system
 * where being subtly wrong produces no error message, only two people looking at
 * two different boards and each certain the other one is confused.
 */

export const part2 = [
	{
		slug: 'observed-remove-sets',
		title: 'Which shapes exist',
		summary:
			'The resurrection bug, why a tombstone is not the fix, and why "add wins" is the forgiving direction.',
		goal: 'Write a set where deleting is safe, undoing a delete works, and a straggler’s replay cannot bring anything back.',
		blocks: [
			{
				type: 'p',
				text: 'A board is a set of shapes and a set of edges. Membership sounds like the easy part, and it contains the single most famous failure in this whole field.'
			},

			{ type: 'h3', id: 'the-bug', text: 'The resurrection bug' },
			{
				type: 'p',
				text: 'Model membership as a `Set`. I delete a box. You are offline, holding the original "add". You reconnect, your replica replays what it has, and **the box comes back**. Nothing errored. Both replicas applied every operation they received. One of them is wrong and neither can tell.'
			},
			{
				type: 'p',
				text: 'The obvious patch is a tombstone: a `deleted: true` flag. That fixes resurrection and creates two new problems. Deletion becomes permanent, so undo cannot work. And re-creating an element with the same identity resurrects nothing, because the tombstone is still there.'
			},
			{
				type: 'p',
				text: 'The real fix is to make removal refer to **what it saw**.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/orset.ts',
				lang: 'ts',
				code: `
/**
 * ADD-WINS OBSERVED-REMOVE SET
 * ============================
 *
 * Which nodes and edges exist on the board.
 *
 * The naive answer — a \`Set\` with a \`deleted\` flag — has a famous failure. I
 * delete a box while you are offline; you come back; the box reappears, because
 * your replica still holds an "add" and nothing records that it was ever
 * removed. The fix is not "add a tombstone": a plain tombstone makes deletion
 * permanent, so undoing a delete becomes impossible and re-creating the same
 * element resurrects nothing.
 *
 * An observed-remove set fixes both by making removal refer to **what it saw**.
 *
 *   add(e)      records a fresh stamp under \`e\`
 *   remove(e)   records the stamps *currently visible* under \`e\` as removed
 *   present(e)  is "some add stamp for e has not been removed"
 *
 * The consequences fall out:
 *
 *   - Redelivering an add I already removed changes nothing: its stamp is in the
 *     removed set.
 *   - An add that happened **concurrently** with a remove survives, because the
 *     remove could not have seen its stamp. Hence "add wins".
 *   - Undo of a delete is a new add with a new stamp — which no existing remove
 *     observed, so it comes back.
 *
 * WHY ADD-WINS, AND NOT REMOVE-WINS
 * ---------------------------------
 * The two are equally consistent; they differ in what they do with "I deleted
 * this while you were editing it". Add-wins keeps the element. That is the
 * forgiving direction: the worst case is a box somebody has to delete again,
 * against a worst case of losing work that somebody was in the middle of. In a
 * tool where deletion is one keystroke and undo is another, cheap-to-repair beats
 * tidy.
 */`
			},
			{
				type: 'why',
				title: 'Read the three consequences again, slowly',
				text: 'They are not three separate features that happen to work. They are one rule — *a remove names the adds it observed* — seen from three angles. Redelivering a removed add is a no-op because its stamp is already in the removed set. A concurrent add survives because the remove *could not possibly* have named a stamp that did not exist yet. And undo works because a new add mints a new stamp, which no existing remove has ever seen. One rule, three problems gone.'
			},

			{ type: 'h3', id: 'the-code', text: 'The whole structure' },
			{
				type: 'code',
				file: 'src/lib/crdt/orset.ts',
				lang: 'ts',
				code: `
/** The two halves of an element's history. Both only ever grow. */
export interface ElementHistory {
	readonly added: ReadonlySet<Stamp>;
	readonly removed: ReadonlySet<Stamp>;
}

export class OrSet<K extends string> {
	readonly #added = new Map<K, Set<Stamp>>();
	readonly #removed = new Map<K, Set<Stamp>>();

	/** Record an add. Idempotent: the same stamp twice is one add. */
	add(key: K, stamp: Stamp): boolean {
		const stamps = this.#added.get(key);
		if (stamps) {
			if (stamps.has(stamp)) return false;
			stamps.add(stamp);
		} else {
			this.#added.set(key, new Set([stamp]));
		}
		return true;
	}

	/**
	 * The add stamps a remove issued *now* would observe.
	 *
	 * The caller puts these in the operation, so the operation is a self-contained
	 * delta: it means the same thing applied here, applied on a replica that has
	 * fallen behind, and applied again in six months during a replay. A remove
	 * that said only "delete node X" would mean different things depending on when
	 * it landed, which is the whole bug this design exists to avoid.
	 */
	observedAdds(key: K): Stamp[] {
		return [...(this.#added.get(key) ?? [])];
	}

	/** Record a remove of the given add stamps. Idempotent. */
	remove(key: K, stamps: readonly Stamp[]): boolean {
		if (stamps.length === 0) return false;

		let changed = false;
		const removed = this.#removed.get(key) ?? new Set<Stamp>();

		for (const stamp of stamps) {
			if (!removed.has(stamp)) {
				removed.add(stamp);
				changed = true;
			}
		}

		if (changed) this.#removed.set(key, removed);
		return changed;
	}

	/** Is this element on the board? */
	has(key: K): boolean {
		const added = this.#added.get(key);
		if (!added || added.size === 0) return false;

		const removed = this.#removed.get(key);
		if (!removed) return true;

		for (const stamp of added) {
			if (!removed.has(stamp)) return true;
		}
		return false;
	}`
			},
			{
				type: 'p',
				text: 'Two maps, both of which only ever grow. `has(key)` is *computed*, not stored — "some add stamp for this element has not been removed" — and that is the reason this structure never had the ordering bug that the text CRDT in chapter 11 did have. Nothing here is derived state waiting to go stale.'
			},
			{
				type: 'p',
				text: 'Look closely at `observedAdds`. It exists so that the *caller* can put the observed stamps into the operation, which makes a remove a self-contained delta:'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
// Wrong: means something different depending on when it lands.
{ kind: 'remove', node: 'n1' }

// Right: means exactly one thing, here, on a replica three weeks behind,
// and during a replay in six months.
{ kind: 'remove', node: 'n1', observed: ['1756…0000aaaaaaaa', '1756…0003bbbbbbbb'] }`
			},

			{ type: 'h3', id: 'add-wins', text: 'Why add-wins and not remove-wins' },
			{
				type: 'p',
				text: 'Both are perfectly consistent. They differ in exactly one situation: *I deleted this while you were editing it*. Add-wins keeps the element; remove-wins discards it.'
			},
			{
				type: 'p',
				text: 'This is a product decision, not a mathematical one, and it should be made with the failure modes side by side. The cost of add-wins going the wrong way is a box somebody has to delete a second time. The cost of remove-wins going the wrong way is work that somebody was in the middle of, gone. In a tool where deletion is one keystroke and undo is another, cheap-to-repair beats tidy.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/orset.spec.ts',
				lang: 'ts',
				code: `
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
});`
			},

			{ type: 'h3', id: 'compaction', text: 'Forgetting, safely' },
			{
				type: 'p',
				text: 'Both maps only grow, so eventually something has to forget. This is the only operation in the entire CRDT that *loses* information, and it takes the one argument that makes losing it safe.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/orset.ts',
				lang: 'ts',
				code: `
/**
 * Drop history that no replica can still need.
 *
 * An add stamp that has been removed, where every replica has seen the remove,
 * can never affect \`has()\` again — nothing can arrive that refers to it. Both
 * halves go, and the element's memory with them.
 *
 * This is the only operation in the CRDT that *loses* information, so it takes
 * the one argument that makes it safe: a version vector every replica is known
 * to dominate. Pass a vector that is ahead of some straggler and you have
 * resurrected their deleted nodes — which is why the caller of this is a
 * scheduled server job with a retention window, not the editor.
 */
compact(stable: VersionVector): number {
	let dropped = 0;

	for (const [key, removed] of this.#removed) {
		const added = this.#added.get(key);
		if (!added) continue;

		for (const stamp of removed) {
			if (!versionHas(stable, stamp)) continue;
			if (!added.has(stamp)) continue;

			added.delete(stamp);
			removed.delete(stamp);
			dropped += 1;
		}

		if (added.size === 0) this.#added.delete(key);
		if (removed.size === 0) this.#removed.delete(key);
	}

	return dropped;
}`
			},
			{
				type: 'warn',
				text: 'Pass a vector that is ahead of some straggler and you have just resurrected their deleted nodes — silently, permanently, and only for them. This is why compaction’s only caller is a scheduled server job with a retention window (`BOARD_LOG_RETENTION_DAYS` from chapter 04), and never the editor.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/orset.ts',
				lang: 'ts',
				code: `
/** Fold another set's history into this one. Pure union — no ordering needed. */
merge(other: OrSet<K>): void {
	for (const [key, stamps] of other.#added) {
		for (const stamp of stamps) this.add(key, stamp);
	}
	for (const [key, stamps] of other.#removed) {
		this.remove(key, [...stamps]);
	}
}

/** The serialisable form, sorted so two equal sets encode to equal bytes. */
toJSON(): { added: Record<string, string[]>; removed: Record<string, string[]> } {
	const encode = (map: Map<K, Set<Stamp>>) =>
		Object.fromEntries(
			[...map.entries()]
				.map(([key, stamps]) => [key, [...stamps].sort()] as const)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		);

	return { added: encode(this.#added), removed: encode(this.#removed) };
}

static fromJSON<K extends string>(json: ReturnType<OrSet<K>['toJSON']>): OrSet<K> {
	const set = new OrSet<K>();
	for (const [key, stamps] of Object.entries(json.added)) {
		for (const stamp of stamps) set.add(key as K, stamp as Stamp);
	}
	for (const [key, stamps] of Object.entries(json.removed)) {
		set.remove(key as K, stamps as Stamp[]);
	}
	return set;
}`
			},
			{
				type: 'p',
				text: '`merge` is a pure union with no ordering anywhere in it, which is the clearest possible statement that this structure is commutative. And `toJSON` sorts both keys and stamps — so two replicas in the same state produce byte-identical output, which is what makes a snapshot comparable and hashable.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can describe the resurrection bug and explain why a tombstone does not fix it.',
					'You can say why a remove operation must carry the stamps it observed.',
					'You can argue for add-wins in terms of the cost of being wrong in each direction.'
				]
			}
		]
	},

	{
		slug: 'last-write-wins-registers',
		title: 'The fields on a shape',
		summary:
			'Twenty-two lines of actual code, one rule of thumb for when to use them, and the `undefined` return that turns out to matter.',
		goal: 'Merge single-valued fields deterministically, and know precisely when this is the wrong tool.',
		blocks: [
			{
				type: 'p',
				text: 'x, y, width, height, fill, stroke, z-order. Single values where the only sensible resolution of "we both set this" is "the later one". This is the simplest CRDT there is, and it carries most of a diagram.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/register.ts',
				lang: 'ts',
				code: `
/**
 * LAST-WRITE-WINS REGISTERS
 * =========================
 *
 * The simplest useful CRDT, and the one that carries most of a diagram: a node's
 * x, y, width, height, fill, stroke and z-order are all single values where the
 * only sensible resolution of "we both set this" is "the later one".
 *
 * "Later" means \`clock.ts\`'s total order, not wall-clock time, so it is decided
 * identically on every replica and never ends in a tie — the actor id inside the
 * stamp is the final tiebreak.
 *
 * WHERE LWW IS THE WRONG TOOL
 * ---------------------------
 * LWW *discards* the losing write. That is correct for a position (two people
 * dragging one box: somebody's drag has to lose) and wrong for a set of members
 * (two people adding different collaborators: neither should lose). It is also
 * wrong for text, where the intuitive result is both edits, interleaved — which
 * is what \`rga.ts\` exists for.
 *
 * The rule of thumb this codebase follows: **use LWW when a human would accept
 * "somebody else got there first" as an explanation.** Nobody accepts that
 * explanation for a deleted paragraph.
 */

import { type Stamp, compare } from './clock.ts';

/** A value with the stamp of the write that produced it. */
export interface Lww<T> {
	readonly value: T;
	readonly stamp: Stamp;
}

export function register<T>(value: T, stamp: Stamp): Lww<T> {
	return { value, stamp };
}

/**
 * Merge two registers. Commutative, associative and idempotent — the three laws
 * that make a CRDT a CRDT, and the three properties \`crdt.spec.ts\` checks by
 * brute force rather than by trusting this comment.
 *
 * Returns one of the two inputs rather than a fresh object, so merging a value
 * that has not changed is free and reference equality keeps working as a cheap
 * "did this change?" test for the reactive layer.
 */
export function mergeRegister<T>(a: Lww<T>, b: Lww<T>): Lww<T> {
	return compare(a.stamp, b.stamp) >= 0 ? a : b;
}`
			},
			{
				type: 'p',
				text: '"Later" means the total order from chapter 06, not wall-clock time. So it is decided identically on every replica, and it never ties — the actor id inside the stamp is the final tiebreak.'
			},
			{
				type: 'why',
				title: 'The rule of thumb, which is the actual content of this chapter',
				text: '**Use last-write-wins when a human would accept "somebody else got there first" as an explanation.** Two people dragging one box: somebody’s drag has to lose, and nobody is upset. Two people adding different collaborators to a workspace: "somebody else got there first" is not an explanation, it is a bug report. A deleted paragraph: absolutely not. The rule takes four seconds to apply and prevents the most common CRDT design mistake there is, which is reaching for LWW because it is the one you already understand.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/register.ts',
				lang: 'ts',
				code: `
/**
 * Apply a write, keeping the register unchanged if the write is stale.
 *
 * Returns \`undefined\` when nothing changed, which the document uses to skip the
 * reactive invalidation entirely. Redelivery during a reconnect is common enough
 * that "this operation is old news" is a hot path, not an edge case.
 */
export function write<T>(current: Lww<T> | undefined, value: T, stamp: Stamp): Lww<T> | undefined {
	if (current !== undefined && compare(stamp, current.stamp) <= 0) return undefined;
	return { value, stamp };
}`
			},
			{
				type: 'p',
				text: 'Two small decisions in these twenty lines are worth pulling out, because both are about the layer above.'
			},
			{
				type: 'ul',
				items: [
					'**`mergeRegister` returns one of its inputs**, never a fresh object. Merging an unchanged value is free, and reference equality keeps working as a cheap "did this change?" test for the reactive layer in chapter 15.',
					'**`write` returns `undefined` when nothing changed.** The document uses that to skip reactive invalidation entirely. Redelivery during a reconnect is common enough that "this operation is old news" is a hot path rather than an edge case — and a `$state` write that sets the same value still schedules work.'
				]
			},

			{ type: 'h3', id: 'per-field', text: 'Per field, not per shape' },
			{
				type: 'p',
				text: 'One more decision, and it lives in the layer above but belongs in this chapter because it is the point of registers.'
			},
			{
				type: 'p',
				text: 'A shape could be one register holding `{ x, y, fill, … }`. It is not. Every field is its own register with its own stamp. Ada changes the fill while Mo drags the box: with one register per shape, one of them loses an edit they had no conflict with. With one register per field, both survive, because they were never competing.'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
// A move writes two fields, so it is two register writes with one stamp.
// A recolour writes one. They do not interact.
{ kind: 'node.set', node: 'n1', stamp, fields: { x: 240, y: 120 } }
{ kind: 'node.set', node: 'n1', stamp, fields: { fill: 'jade' } }`
			},
			{
				type: 'note',
				text: 'The cost is a stamp per field — twenty-six bytes — instead of a stamp per shape. For a board with a thousand shapes and eight fields each, that is about two hundred kilobytes of stamps. Worth it, and it is the sort of trade to make explicitly rather than discover.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can state the rule of thumb for when last-write-wins is appropriate.',
					'You can explain why fields get individual registers rather than one per shape.',
					'You can say what `write` returning `undefined` is for.'
				]
			}
		]
	},

	{
		slug: 'collaborative-text',
		title: 'Two people typing in one label',
		summary:
			'RGA — an identity per character, a tree rather than the famous scan, and the counterexample that shows why.',
		goal: 'Implement a sequence CRDT that interleaves concurrent typing correctly, including from a replica that was offline.',
		blocks: [
			{
				type: 'p',
				text: 'Labels are text, and text is the one place where last-write-wins is *visibly* wrong. Two people typing at opposite ends of a label should end up with both sentences — not with one person’s work discarded because their stamp lost by four milliseconds.'
			},
			{
				type: 'p',
				text: 'A **replicated growable array** gives every character a permanent identity and a permanent parent: "the character I typed after *that* character".'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/rga.ts',
				lang: 'ts',
				code: `
/**
 * RGA — A SEQUENCE CRDT FOR TEXT
 * ==============================
 *
 * Node labels are text, and text is the one place where "last write wins" is
 * visibly wrong. Two people typing at opposite ends of a label should end up
 * with both sentences, not with one person's work silently discarded because
 * their stamp lost by four milliseconds.
 *
 * A **replicated growable array** gives every character a permanent identity and
 * a permanent parent: "the character I typed after *that* character". Deletion
 * is a tombstone, so a character that somebody else's edit still refers to never
 * disappears out from under them. Because identity is a stamp from \`clock.ts\`,
 * concurrent insertions after the same parent have a definite order on every
 * replica: higher stamp first.
 *
 * THE TREE, AND WHY WE DO NOT USE THE FAMOUS SHORTCUT
 * ---------------------------------------------------
 * Nearly every RGA write-up implements insertion as: find the parent, then walk
 * forward skipping every item whose id is greater than the new one, and insert
 * there. It is short, it is fast, and it is wrong in a case that a diagram tool
 * hits regularly.
 *
 * Take a document whose flattened order is \`B X A C\`, where X is a child of B
 * and C is a child of A, with ids B=20, X=40, A=10, C=30. Now insert Y as a
 * child of B with id 5. The scan starts after B and skips X (40 > 5), then A
 * (10 > 5), then C (30 > 5), and lands at the end: \`B X A C Y\`.
 *
 * Y has been dragged out of B's subtree and past two elements it has nothing to
 * do with. The correct answer is \`B X Y A C\` — Y sorts below its sibling X, and
 * B's subtree ends before A begins. The shortcut works only while every id
 * happens to be larger than its parent's, which is true right up until somebody
 * edits offline and rejoins with older stamps.
 *
 * So this implementation stores the tree it actually means: children per parent,
 * sorted by stamp descending, flattened depth-first on read. Correct by
 * inspection, and the counterexample above is \`rga.spec.ts\`'s first test.
 *
 * COST, HONESTLY
 * --------------
 * Flattening is O(n) and memoised until the next edit; insertion is O(siblings).
 * For labels — tens of characters, occasionally hundreds — that is free. A
 * document-sized editor would need block-wise items and a balanced index, which
 * is most of what makes Yjs large. Tessera does not need it, and building it
 * anyway would be the expensive kind of foresight.
 */`
			},

			{ type: 'h3', id: 'the-counterexample', text: 'The counterexample' },
			{
				type: 'p',
				text: 'This is the most important thing in the chapter, so work through it on paper.'
			},
			{
				type: 'p',
				text: 'Nearly every RGA write-up implements insertion as a **scan**: find the parent, walk forward skipping every item whose id is greater than the new one, insert there. Short, fast, and wrong.'
			},
			{
				type: 'terminal',
				code: `
ids:      B=20   X=40   A=10   C=30
tree:     B ── X          A ── C
flat:     B  X  A  C

insert Y (id 5) as a child of B

the scan:  start after B
           skip X   (40 > 5)
           skip A   (10 > 5)   ← already outside B's subtree
           skip C   (30 > 5)
           insert   →  B X A C Y      ✗

the tree:  B's children sorted by id descending: [X=40, Y=5]
           flatten depth-first        →  B X Y A C   ✓`
			},
			{
				type: 'p',
				text: 'Y has been dragged out of B’s subtree and past two elements it has nothing to do with. The scan works only while every id happens to be larger than its parent’s — which is true right up until somebody edits offline and rejoins with older stamps. **Low ids are not exotic; they are what an offline replica produces.**'
			},
			{
				type: 'p',
				text: 'So this implementation stores the tree it actually means. It is the first test in the file:'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/rga.spec.ts',
				lang: 'ts',
				code: `
describe('the counterexample the naive scan gets wrong', () => {
	it('keeps an insertion inside its parent’s subtree', () => {
		/*
		 * Nearly every RGA write-up inserts by walking forward from the parent and
		 * skipping everything with a greater id. Build \`B X A C\` — X under B, C
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
});`
			},

			{ type: 'h3', id: 'the-fields', text: 'Three fields, and a bug in the third' },
			{
				type: 'code',
				file: 'src/lib/crdt/rga.ts',
				lang: 'ts',
				code: `
export class RgaText {
	/** Every item ever seen, tombstones included, keyed by id. */
	readonly #items = new Map<Stamp, RgaItem>();

	/**
	 * Children by parent, each list sorted by stamp descending.
	 *
	 * Keyed by \`Stamp | null\`, and an entry may exist for a parent that has not
	 * arrived yet. That is deliberate: an operation can outrun the one it depends
	 * on when a snapshot is applied out of causal order, and rather than reject it
	 * we let the subtree sit here, unreachable from the root and therefore
	 * invisible, until its parent shows up and the whole branch appears at once.
	 * Self-healing beats an error path nobody can reproduce.
	 */
	readonly #children = new Map<Stamp | null, Stamp[]>();

	/**
	 * Deletions for characters that have not arrived yet.
	 *
	 * Found by \`convergence.spec.ts\` on its first run, and worth spelling out
	 * because it is the bug that makes people distrust CRDTs.
	 *
	 * A delete used to be a no-op for an unknown id — reasonable-looking, since
	 * you cannot tombstone something you do not have. But an operation pair can
	 * reach a replica in either order, and when the delete lost the race the
	 * character came back to life: one replica showed \`g\`, another \`ga\`, both
	 * insisted they had applied every operation, and both were telling the truth.
	 *
	 * Remembering the deletion until its character shows up costs one \`Set\` and
	 * removes the entire class of failure. Note that \`orset.ts\` never had this bug:
	 * a remove there records stamps whether or not the matching add is present,
	 * because membership is computed rather than stored. Storing derived state is
	 * what created the ordering dependency here, and this set is the price of it.
	 */
	readonly #pendingDeletes = new Set<Stamp>();

	/** Flattened document order, rebuilt lazily after any change. */
	#order: RgaItem[] | null = null;`
			},
			{
				type: 'p',
				text: '`#children` may hold an entry for a parent that has not arrived. That is deliberate: the subtree sits there, unreachable from the root and therefore invisible, until the parent shows up and the whole branch appears at once. Self-healing beats an error path nobody can reproduce.'
			},
			{
				type: 'warn',
				text: '`#pendingDeletes` is the bug that makes people distrust CRDTs, and it was found by the property test in the next chapter on its first run. A delete used to be a no-op for an unknown id — perfectly reasonable, since you cannot tombstone something you do not have. But an insert/delete pair can arrive in either order, and when the delete lost the race the character **came back to life**. One replica showed `g`, another `ga`, both had applied every operation, and both were telling the truth.'
			},
			{
				type: 'p',
				text: 'Notice the diagnosis in the comment: `orset.ts` never had this bug, because membership there is *computed* rather than stored. Storing derived state is what created the ordering dependency, and a `Set` of unresolved deletions is the price of it. That is a general lesson about caches, arriving in an unusual place.'
			},

			{ type: 'h3', id: 'insert', text: 'Insertion' },
			{
				type: 'code',
				file: 'src/lib/crdt/rga.ts',
				lang: 'ts',
				code: `
/** Apply an insertion. Returns false if it was already known. */
insert(item: RgaItem): boolean {
	if (this.#items.has(item.id)) return false;

	// A deletion that outran this insertion is applied now, at the moment the
	// character it refers to finally exists.
	const deleted = item.deleted || this.#pendingDeletes.delete(item.id);
	this.#items.set(item.id, { ...item, deleted });

	const siblings = this.#children.get(item.after) ?? [];

	// Descending, so the highest stamp among concurrent siblings comes first.
	// Two replicas run this same insertion-sort over the same set and get the
	// same list, which is the entire convergence argument for this file.
	let index = 0;
	while (index < siblings.length && siblings[index]! > item.id) index += 1;
	siblings.splice(index, 0, item.id);

	this.#children.set(item.after, siblings);
	this.#order = null;
	return true;
}

/**
 * Tombstone a character. Idempotent, and safe for a character that has not
 * arrived yet — see \`#pendingDeletes\`.
 */
delete(id: Stamp): boolean {
	const item = this.#items.get(id);

	if (!item) {
		if (this.#pendingDeletes.has(id)) return false;
		this.#pendingDeletes.add(id);
		return true;
	}

	if (item.deleted) return false;

	item.deleted = true;
	this.#order = null;
	return true;
}`
			},
			{
				type: 'p',
				text: 'The insertion sort over siblings is the entire convergence argument for this file: two replicas run the same sort over the same set of siblings and get the same list. Descending, so the higher stamp among concurrent siblings comes first — an arbitrary choice that only has to be *the same* everywhere.'
			},

			{ type: 'h3', id: 'flatten', text: 'Reading it back' },
			{
				type: 'code',
				file: 'src/lib/crdt/rga.ts',
				lang: 'ts',
				code: `
/** Every item in document order, tombstones included. */
items(): readonly RgaItem[] {
	if (this.#order) return this.#order;

	const order: RgaItem[] = [];

	/*
	 * Iterative rather than recursive.
	 *
	 * A label built one character at a time is a chain a thousand deep, and a
	 * recursive flatten blows the stack on a document that is otherwise
	 * perfectly ordinary. The failure arrives as \`RangeError: Maximum call
	 * stack size exceeded\` from inside a render, which is a bad afternoon.
	 */
	const stack: Stamp[] = [...(this.#children.get(null) ?? [])].reverse();

	while (stack.length > 0) {
		const id = stack.pop()!;
		const item = this.#items.get(id);
		if (!item) continue;

		order.push(item);

		const children = this.#children.get(id);
		if (children) {
			for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]!);
		}
	}

	this.#order = order;
	return order;
}

/** The readable text. */
text(): string {
	let out = '';
	for (const item of this.items()) {
		if (!item.deleted) out += item.value;
	}
	return out;
}

/** The visible characters, in order. */
visible(): readonly RgaItem[] {
	return this.items().filter((item) => !item.deleted);
}`
			},
			{
				type: 'warn',
				text: 'Iterative, not recursive, and this is not premature caution. A label typed one character at a time is a chain a thousand nodes deep, because each character’s parent is the one before it. A recursive flatten blows the stack on a perfectly ordinary label, and the failure arrives as `RangeError: Maximum call stack size exceeded` from inside a render.'
			},

			{ type: 'h3', id: 'the-caret', text: 'The caret, which is the part users notice' },
			{
				type: 'code',
				file: 'src/lib/crdt/rga.ts',
				lang: 'ts',
				code: `
/**
 * The id a character typed at caret \`offset\` should hang off — the visible
 * character immediately to the left, or \`null\` at the start of the text.
 */
idBefore(offset: number): Stamp | null {
	if (offset <= 0) return null;
	const visible = this.visible();
	const item = visible[Math.min(offset, visible.length) - 1];
	return item ? item.id : null;
}

/** The ids of the visible characters in \`[from, to)\`, for a range delete. */
idsBetween(from: number, to: number): Stamp[] {
	return this.visible()
		.slice(Math.max(0, from), Math.max(0, to))
		.map((item) => item.id);
}

/**
 * Where a given character sits in the visible text.
 *
 * This is what keeps a caret still while somebody else types above it. The
 * editor remembers the id under the caret, not the offset — an offset is
 * invalidated by any remote insertion before it, and chasing that with
 * arithmetic is how collaborative editors end up jumping the cursor around.
 *
 * Returns the offset *after* the character, since that is where a caret
 * anchored to it belongs. A tombstoned or unknown id gives \`null\`, and the
 * caller falls back to clamping.
 */
offsetAfter(id: Stamp | null): number | null {
	if (id === null) return 0;

	let offset = 0;
	for (const item of this.items()) {
		if (item.deleted) {
			if (item.id === id) return null;
			continue;
		}
		offset += 1;
		if (item.id === id) return offset;
	}
	return null;
}`
			},
			{
				type: 'why',
				title: 'Why the editor remembers an id and not an offset',
				text: 'An offset is invalidated by any remote insertion before it. Chase that with arithmetic — "they inserted three characters at position 2, so add three to my caret" — and you have signed up for tracking every concurrent edit’s effect on your position, forever, correctly. That is how collaborative editors end up jumping the cursor around. Anchoring the caret to a **character id** makes the whole problem disappear: the character does not move, so neither does the caret, and `offsetAfter` recomputes where that now is.'
			},

			{ type: 'h3', id: 'code-points', text: 'One last trap: emoji' },
			{
				type: 'code',
				file: 'src/lib/crdt/rga.ts',
				lang: 'ts',
				code: `
/**
 * Seed a fresh text from a plain string, one item per character.
 *
 * "Character" means code point, not UTF-16 code unit — \`[...value]\`, not
 * \`value.split('')\`. An emoji is one thing a person can delete with one press
 * of backspace, and splitting it into surrogate halves lets a concurrent edit
 * land between them and produce a replica whose label is a replacement
 * character. \`value.length\` is therefore the wrong count to validate against,
 * which is why this counts the spread array instead.
 */
static from(value: string, stamps: readonly Stamp[]): RgaText {
	const characters = [...value];

	if (stamps.length !== characters.length) {
		throw new RangeError(
			\`need one stamp per character: \${characters.length} vs \${stamps.length}\`
		);
	}

	const text = new RgaText();
	let after: Stamp | null = null;

	for (const [index, character] of characters.entries()) {
		const id = stamps[index]!;
		text.insert({ id, after, value: character, deleted: false });
		after = id;
	}

	return text;
}`
			},
			{
				type: 'p',
				text: '`[...value]`, not `value.split(\'\')`. An emoji is one thing a person deletes with one press of backspace; split it into surrogate halves and a concurrent edit can land *between them*, producing a replica whose label contains a replacement character. `value.length` is the wrong count to validate against, which is why this counts the spread array.'
			},
			{
				type: 'note',
				text: 'Honest cost accounting, from the top of the file: flattening is O(n), memoised until the next edit; insertion is O(siblings). For labels — tens of characters, occasionally hundreds — that is free. A document-sized editor would need block-wise items and a balanced index, which is most of what makes Yjs large. Tessera does not need it, and building it anyway would be the expensive kind of foresight.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can draw the `B X Y A C` counterexample and explain why the scan fails it.',
					'You can say why a delete for an unknown character must be remembered rather than dropped.',
					'You can explain why the caret is anchored to a character id.'
				]
			}
		]
	},

	{
		slug: 'proving-convergence',
		title: 'Proving it, as far as it can be proved',
		summary:
			'A property test that builds a few hundred thousand hostile delivery schedules — and the two real bugs it found within a dozen seeds.',
		goal: 'Have a test that fails when the CRDT is wrong, rather than one that passes because you thought of the same cases twice.',
		blocks: [
			{
				type: 'p',
				text: 'Each structure has its own spec, checking cases a person thought of. Those are necessary and they are not enough, because the failures in this domain are precisely the ones nobody thought of.'
			},
			{
				type: 'p',
				text: 'So there is one more file, and it tests the property the whole folder exists to provide.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/convergence.spec.ts',
				lang: 'ts',
				code: `
/**
 * THE PROOF, SUCH AS IT IS
 * ========================
 *
 * The individual specs check each structure against cases a person thought of.
 * This one checks the property those structures exist to provide, against cases
 * nobody thought of: **any set of replicas that has seen the same operations
 * holds the same state, regardless of the order they arrived in, how many times
 * they arrived, or what each replica was doing at the time.**
 *
 * It is not a proof in the mathematical sense. It is a few hundred thousand
 * randomised histories, replayable from a printed seed, which in practice finds
 * the bugs a proof would have — and finds them in the implementation rather than
 * in the model of the implementation.
 *
 * The three laws being exercised, in the language of the operations:
 *
 *   commutative   deliver a then b, or b then a — same state
 *   associative   merge in any grouping — same state
 *   idempotent    deliver the same operation twice — same state
 *
 * The document model here is deliberately small: existence, a couple of
 * last-write-wins fields, and one piece of collaborative text. It is the
 * primitives composed, not the real board — \`board/document.spec.ts\` runs the
 * same schedule against that.
 */`
			},

			{ type: 'h3', id: 'the-replica', text: 'A replica, in miniature' },
			{
				type: 'code',
				file: 'src/lib/crdt/convergence.spec.ts',
				lang: 'ts',
				code: `
class Replica {
	readonly clock: Clock;
	readonly #nodes = new OrSet<NodeId>();
	readonly #fields = new Map<NodeId, Map<string, Lww<number | string>>>();
	readonly #labels = new Map<NodeId, RgaText>();
	#version: VersionVector = empty();

	constructor(readonly name: string) {
		// Every replica shares one physical clock reading, so the ordering under
		// test is the logical one and not an artefact of who ran first.
		this.clock = new Clock(actor(name), () => 1_700_000_000_000);
	}

	get version(): VersionVector {
		return this.#version;
	}

	label(node: NodeId): RgaText {
		let text = this.#labels.get(node);
		if (!text) {
			text = new RgaText();
			this.#labels.set(node, text);
		}
		return text;
	}
`
			},
			{
				type: 'p',
				text: 'The three structures composed: an OR-Set for existence, a map of registers per node for fields, an RGA per node for the label. Deliberately not the real board — `board/document.spec.ts` runs the same schedule against that. This one is the primitives, so a failure here points at a primitive.'
			},
			{
				type: 'p',
				text: 'Every replica shares one physical clock reading, so what is under test is the *logical* order rather than an artefact of which one ran first.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/convergence.spec.ts',
				lang: 'ts',
				code: `
/**
 * Apply an operation. Must be safe to call with anything, in any order, any
 * number of times — that is the entire contract this file tests.
 *
 * Note what is *not* here: a \`if (has(version, stamp)) return\` fast path.
 *
 * The first draft had one, and this suite caught it within a dozen seeds. A
 * version vector says "I have everything from this actor up to here", which is
 * only true when that actor's operations arrive in order. Shuffle the delivery
 * — which is what this file does on purpose, and what a reconnecting client
 * does by accident — and the vector jumps past a gap, after which the skipped
 * operation is discarded in silence. One replica ends up with \`aegaa\` and
 * another with \`aaegaa\`, and nothing anywhere reports an error.
 *
 * The fast path bought nothing, because every structure underneath is already
 * idempotent: a set insert, a stamp comparison, a \`Map.has\` check. Dropping it
 * makes \`apply\` safe under any delivery order at all. The version vector goes
 * back to the one job it is actually correct for — telling the *server* where
 * to resume — and \`sync/client.svelte.ts\` advances that cursor from the
 * watermark the server sends with each batch, never from individual
 * operations.
 */
apply(operation: Operation): void {
	this.clock.observe(operation.stamp);
`
			},
			{
				type: 'p',
				text: 'That comment is the first bug this suite found, and chapter 07 told the story from the other end. It is worth noticing *how* it was found: not by reasoning about version vectors, but by two replicas disagreeing about a five-character string and a seed that reproduced it.'
			},

			{ type: 'h3', id: 'comparing', text: 'Comparing two replicas' },
			{
				type: 'code',
				file: 'src/lib/crdt/convergence.spec.ts',
				lang: 'ts',
				code: `
	/**
	 * State, rendered canonically.
	 *
	 * Only *visible* state: present nodes, their winning field values, their text.
	 * Two replicas may legitimately hold different tombstones — one has compacted,
	 * the other has not — and comparing internals would fail on a difference that
	 * no user can observe and no future operation can expose.
	 */
	snapshot(): Snapshot {
		return {
			nodes: this.#nodes.keys().map((id) => ({
				id,
				fields: [...(this.#fields.get(id) ?? new Map())]
					.map(([field, register]) => [field, register.value] as [string, unknown])
					.sort(([a], [b]) => (a < b ? -1 : 1)),
				label: this.#labels.get(id)?.text() ?? ''
			}))
		};
	}
}`
			},
			{
				type: 'warn',
				text: 'Only *visible* state. Two replicas may legitimately hold different tombstones — one has compacted, the other has not — and comparing internals would fail on a difference no user can observe and no future operation can expose. Getting this wrong gives you a test that fails for correct code, which is worse than no test, because you will eventually make it pass by weakening it.'
			},

			{ type: 'h3', id: 'hostile', text: 'A deliberately hostile network' },
			{
				type: 'code',
				file: 'src/lib/crdt/convergence.spec.ts',
				lang: 'ts',
				code: `
/**
 * Run one randomised history and return every replica's final state.
 *
 * The schedule is deliberately hostile: operations are delivered in shuffled
 * order, some are delivered twice, and some are withheld until the very end so
 * that a replica edits for a while on stale information — which is exactly what
 * an offline collaborator is.
 */
function history(seed: number, replicaCount: number, rounds: number): Snapshot[] {
	const random = seeded(seed);
	const replicas = Array.from(
		{ length: replicaCount },
		(_, i) => new Replica(String.fromCharCode(97 + i))
	);
	const nodes: NodeId[] = ['n1', 'n2', 'n3'];

	/** Operations created but not yet delivered everywhere. */
	const inFlight: Operation[] = [];

	for (let round = 0; round < rounds; round += 1) {
		for (const replica of replicas) {
			for (let i = 0; i < int(random, 0, 2); i += 1) {
				const operation = generate(random, replica, nodes);
				if (!operation) continue;
				replica.apply(operation); // local first — that is what local-first means
				inFlight.push(operation);
			}
		}

		// Deliver a random slice to random replicas, sometimes twice.
		for (const operation of shuffle(random, inFlight).slice(0, int(random, 0, inFlight.length))) {
			const target = pick(random, replicas);
			target.apply(operation);
			if (random() < 0.15) target.apply(operation); // a duplicate from a reconnect
		}
	}

	// Finally, everybody hears everything, in a different order each.
	for (const replica of replicas) {
		for (const operation of shuffle(random, inFlight)) replica.apply(operation);
	}

	return replicas.map((replica) => replica.snapshot());
}`
			},
			{
				type: 'p',
				text: 'Read what this schedule does to the poor implementation. Operations are shuffled. Some are delivered twice. Some are withheld until the very end, so a replica edits for a while on stale information — which is exactly what an offline collaborator is. `replica.apply(operation)` happens *before* the operation goes into `inFlight`, because local-first means the local one always applies first.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/convergence.spec.ts',
				lang: 'ts',
				code: `
describe('convergence', () => {
	it('reaches one state from every random schedule', () => {
		for (let seed = 1; seed <= 200; seed += 1) {
			const snapshots = history(seed, 4, 12);
			const [first, ...rest] = snapshots;

			for (const [index, snapshot] of rest.entries()) {
				// The seed is in the message on purpose: a failure here is
				// reproducible by hand, which is the difference between a bug report
				// and a ghost story.
				expect(snapshot, \`replica \${index + 1} diverged (seed \${seed})\`).toEqual(first);
			}
		}
	});

	it('is unaffected by how many replicas are involved', () => {
		for (const count of [2, 3, 6, 9]) {
			const snapshots = history(count * 31, count, 8);
			expect(new Set(snapshots.map((s) => JSON.stringify(s))).size).toBe(1);
		}
	});
`
			},
			{
				type: 'p',
				text: 'Two hundred seeds, four replicas, twelve rounds each. The seed is in the failure message on purpose: a failure here is reproducible by hand, on any machine, in a year. That is the difference between a bug report and a ghost story.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/convergence.spec.ts',
				lang: 'ts',
				code: `
it('survives a replica that stays offline for the whole session', () => {
	/*
	 * The case a naive implementation passes every other test and still fails:
	 * one replica edits in isolation for a long time and merges once at the end.
	 * Its stamps are old, its view of what exists is stale, and every remove it
	 * issues observed a different set of adds.
	 */
	const random = seeded(4242);
	const online = [new Replica('a'), new Replica('b')];
	const offline = new Replica('c');
	const nodes: NodeId[] = ['n1', 'n2'];
	const all: Operation[] = [];

	for (let round = 0; round < 30; round += 1) {
		for (const replica of online) {
			const operation = generate(random, replica, nodes);
			if (!operation) continue;
			replica.apply(operation);
			all.push(operation);
			for (const other of online) other.apply(operation);
		}

		const solo = generate(random, offline, nodes);
		if (solo) {
			offline.apply(solo);
			all.push(solo);
		}
	}

	const replicas = [...online, offline];
	for (const replica of replicas) {
		for (const operation of shuffle(random, all)) replica.apply(operation);
	}

	const [first, ...rest] = replicas.map((replica) => replica.snapshot());
	for (const snapshot of rest) expect(snapshot).toEqual(first);
});
`
			},
			{
				type: 'why',
				title: 'Why the offline replica gets its own test',
				text: 'It is the case a naive implementation passes every other test and still fails. One replica edits in isolation for thirty rounds and merges once at the end: its stamps are old, its view of what exists is stale, and every remove it issues observed a different set of adds from the ones anybody else saw. Everything that can be subtly wrong is wrong at once. If you write only one test from this chapter, write this one.'
			},
			{
				type: 'terminal',
				code: `
pnpm vitest run src/lib/crdt

 ✓ src/lib/crdt/clock.spec.ts        (18 tests)
 ✓ src/lib/crdt/version.spec.ts      (12 tests)
 ✓ src/lib/crdt/orset.spec.ts        (11 tests)
 ✓ src/lib/crdt/register.spec.ts      (7 tests)
 ✓ src/lib/crdt/fracdex.spec.ts      (14 tests)
 ✓ src/lib/crdt/rga.spec.ts          (16 tests)
 ✓ src/lib/crdt/convergence.spec.ts   (4 tests)  1.1s`
			},
			{
				type: 'p',
				text: 'Four tests, about a second, and a few hundred thousand delivery schedules inside them. That second is the reason `crdt/` is not allowed to import anything: the moment it needs a browser, this stops being a test you run on every keystroke.'
			},

			{
				type: 'checkpoint',
				items: [
					'Your suite compares visible state only, and you can say why.',
					'Your schedule shuffles, duplicates and withholds — and you can explain what real-world event each of those models.',
					'A failure prints a seed that reproduces it exactly.'
				]
			}
		]
	}
];
