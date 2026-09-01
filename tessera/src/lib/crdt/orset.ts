/**
 * ADD-WINS OBSERVED-REMOVE SET
 * ============================
 *
 * Which nodes and edges exist on the board.
 *
 * The naive answer — a `Set` with a `deleted` flag — has a famous failure. I
 * delete a box while you are offline; you come back; the box reappears, because
 * your replica still holds an "add" and nothing records that it was ever
 * removed. The fix is not "add a tombstone": a plain tombstone makes deletion
 * permanent, so undoing a delete becomes impossible and re-creating the same
 * element resurrects nothing.
 *
 * An observed-remove set fixes both by making removal refer to **what it saw**.
 *
 *   add(e)      records a fresh stamp under `e`
 *   remove(e)   records the stamps *currently visible* under `e` as removed
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
 */

import type { Stamp } from './clock.ts';
import { type VersionVector, has as versionHas } from './version.ts';

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
	}

	/**
	 * Every element currently on the board.
	 *
	 * Sorted, so that two replicas with the same state produce the same array.
	 * The board's own rendering order comes from a fractional index, not from
	 * here — but tests compare replicas by deep-equality, and an unsorted result
	 * would make them compare insertion history instead of state.
	 */
	keys(): K[] {
		const present: K[] = [];
		for (const key of this.#added.keys()) {
			if (this.has(key)) present.push(key);
		}
		return present.sort();
	}

	history(key: K): ElementHistory {
		return {
			added: this.#added.get(key) ?? new Set(),
			removed: this.#removed.get(key) ?? new Set()
		};
	}

	/**
	 * Drop history that no replica can still need.
	 *
	 * An add stamp that has been removed, where every replica has seen the remove,
	 * can never affect `has()` again — nothing can arrive that refers to it. Both
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
	}

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
	}
}
