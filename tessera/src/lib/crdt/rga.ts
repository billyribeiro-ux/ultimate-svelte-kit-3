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
 * disappears out from under them. Because identity is a stamp from `clock.ts`,
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
 * Take a document whose flattened order is `B X A C`, where X is a child of B
 * and C is a child of A, with ids B=20, X=40, A=10, C=30. Now insert Y as a
 * child of B with id 5. The scan starts after B and skips X (40 > 5), then A
 * (10 > 5), then C (30 > 5), and lands at the end: `B X A C Y`.
 *
 * Y has been dragged out of B's subtree and past two elements it has nothing to
 * do with. The correct answer is `B X Y A C` — Y sorts below its sibling X, and
 * B's subtree ends before A begins. The shortcut works only while every id
 * happens to be larger than its parent's, which is true right up until somebody
 * edits offline and rejoins with older stamps.
 *
 * So this implementation stores the tree it actually means: children per parent,
 * sorted by stamp descending, flattened depth-first on read. Correct by
 * inspection, and the counterexample above is `rga.spec.ts`'s first test.
 *
 * COST, HONESTLY
 * --------------
 * Flattening is O(n) and memoised until the next edit; insertion is O(siblings).
 * For labels — tens of characters, occasionally hundreds — that is free. A
 * document-sized editor would need block-wise items and a balanced index, which
 * is most of what makes Yjs large. Tessera does not need it, and building it
 * anyway would be the expensive kind of foresight.
 */

import type { Stamp } from './clock.ts';

/** One character, and where it belongs. */
export interface RgaItem {
	/** Unique, totally ordered, and never reused. */
	readonly id: Stamp;
	/** The character this one was typed after; `null` means the start. */
	readonly after: Stamp | null;
	readonly value: string;
	/** Tombstoned. The item stays so that later inserts can still refer to it. */
	deleted: boolean;
}

/** The serialisable form. */
export interface RgaSnapshot {
	readonly items: readonly [id: string, after: string | null, value: string, deleted: 0 | 1][];
	/** Deletions still waiting for the character they refer to. Usually empty. */
	readonly pending?: readonly string[];
}

export class RgaText {
	/** Every item ever seen, tombstones included, keyed by id. */
	readonly #items = new Map<Stamp, RgaItem>();

	/**
	 * Children by parent, each list sorted by stamp descending.
	 *
	 * Keyed by `Stamp | null`, and an entry may exist for a parent that has not
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
	 * Found by `convergence.spec.ts` on its first run, and worth spelling out
	 * because it is the bug that makes people distrust CRDTs.
	 *
	 * A delete used to be a no-op for an unknown id — reasonable-looking, since
	 * you cannot tombstone something you do not have. But an operation pair can
	 * reach a replica in either order, and when the delete lost the race the
	 * character came back to life: one replica showed `g`, another `ga`, both
	 * insisted they had applied every operation, and both were telling the truth.
	 *
	 * Remembering the deletion until its character shows up costs one `Set` and
	 * removes the entire class of failure. Note that `orset.ts` never had this bug:
	 * a remove there records stamps whether or not the matching add is present,
	 * because membership is computed rather than stored. Storing derived state is
	 * what created the ordering dependency here, and this set is the price of it.
	 */
	readonly #pendingDeletes = new Set<Stamp>();

	/** Flattened document order, rebuilt lazily after any change. */
	#order: RgaItem[] | null = null;

	get size(): number {
		return this.#items.size;
	}

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
	 * arrived yet — see `#pendingDeletes`.
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
	}

	/** Every item in document order, tombstones included. */
	items(): readonly RgaItem[] {
		if (this.#order) return this.#order;

		const order: RgaItem[] = [];

		/*
		 * Iterative rather than recursive.
		 *
		 * A label built one character at a time is a chain a thousand deep, and a
		 * recursive flatten blows the stack on a document that is otherwise
		 * perfectly ordinary. The failure arrives as `RangeError: Maximum call
		 * stack size exceeded` from inside a render, which is a bad afternoon.
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
	}

	/**
	 * The id a character typed at caret `offset` should hang off — the visible
	 * character immediately to the left, or `null` at the start of the text.
	 */
	idBefore(offset: number): Stamp | null {
		if (offset <= 0) return null;
		const visible = this.visible();
		const item = visible[Math.min(offset, visible.length) - 1];
		return item ? item.id : null;
	}

	/** The ids of the visible characters in `[from, to)`, for a range delete. */
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
	 * anchored to it belongs. A tombstoned or unknown id gives `null`, and the
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
	}

	/**
	 * Fold another replica's text in. Insert-then-delete, so tombstones land, and
	 * the other side's unresolved deletions come across too — they may refer to
	 * characters that neither replica has seen yet.
	 */
	merge(other: RgaText): void {
		for (const item of other.items()) {
			this.insert(item);
			if (item.deleted) this.delete(item.id);
		}
		for (const id of other.#pendingDeletes) this.delete(id);
	}

	/**
	 * Encode. Items are written in document order, so the same text always
	 * produces the same bytes and a snapshot can be compared or hashed.
	 */
	toJSON(): RgaSnapshot {
		return {
			items: this.items().map((item) => [item.id, item.after, item.value, item.deleted ? 1 : 0]),
			// Sorted so that equal texts encode to equal bytes, which is what lets a
			// snapshot be hashed and compared.
			pending: [...this.#pendingDeletes].sort()
		};
	}

	static fromJSON(snapshot: RgaSnapshot): RgaText {
		const text = new RgaText();
		for (const [id, after, value, deleted] of snapshot.items) {
			text.insert({
				id: id as Stamp,
				after: after as Stamp | null,
				value,
				deleted: deleted === 1
			});
		}
		for (const id of snapshot.pending ?? []) text.delete(id as Stamp);
		return text;
	}

	/**
	 * Seed a fresh text from a plain string, one item per character.
	 *
	 * "Character" means code point, not UTF-16 code unit — `[...value]`, not
	 * `value.split('')`. An emoji is one thing a person can delete with one press
	 * of backspace, and splitting it into surrogate halves lets a concurrent edit
	 * land between them and produce a replica whose label is a replacement
	 * character. `value.length` is therefore the wrong count to validate against,
	 * which is why this counts the spread array instead.
	 */
	static from(value: string, stamps: readonly Stamp[]): RgaText {
		const characters = [...value];

		if (stamps.length !== characters.length) {
			throw new RangeError(
				`need one stamp per character: ${characters.length} vs ${stamps.length}`
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
	}
}
