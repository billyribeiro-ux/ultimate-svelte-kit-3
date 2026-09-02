/**
 * ONE AXIS OF A GRID
 * ==================
 *
 * Rows have heights, columns have widths, and a person may have changed a
 * few of them. Everything the grid needs to draw — where row 40,000 starts,
 * which row is under the pointer, how tall the whole sheet is — is a
 * question about those sizes, and this class answers it without an array of
 * a million numbers.
 *
 * The trick is that almost every row is the default height. Only the
 * exceptions are stored, sorted, with a running total of how much each one
 * differs from the default; an offset is then `index × default + the deltas
 * of the exceptions before it`, which is a binary search over a short list.
 */

export class Axis {
	readonly #default: number;
	/** Indexes with a custom size, ascending. */
	readonly #indexes: number[];
	/** `#deltas[i]` is the sum of (size − default) for the first `i + 1` custom indexes. */
	readonly #deltas: number[];
	readonly #sizes: Map<number, number>;

	constructor(defaultSize: number, sizes: ReadonlyMap<number, number>) {
		this.#default = defaultSize;
		this.#sizes = new Map(sizes);
		this.#indexes = [...sizes.keys()].sort((a, b) => a - b);
		this.#deltas = [];
		let running = 0;
		for (const index of this.#indexes) {
			running += sizes.get(index)! - defaultSize;
			this.#deltas.push(running);
		}
	}

	size(index: number): number {
		return this.#sizes.get(index) ?? this.#default;
	}

	/** Where an index starts, in pixels from the origin. */
	offset(index: number): number {
		// How many custom indexes are strictly before `index`?
		let lo = 0;
		let hi = this.#indexes.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.#indexes[mid]! < index) lo = mid + 1;
			else hi = mid;
		}
		const delta = lo === 0 ? 0 : this.#deltas[lo - 1]!;
		return index * this.#default + delta;
	}

	/** The index whose span contains a pixel position. */
	indexAt(px: number): number {
		if (px <= 0) return 0;
		// Start from where a uniform axis would put it, then correct for the
		// custom sizes before that point. Each correction moves at most a few
		// indexes, and there are few custom sizes, so this converges at once
		// in the common case.
		let index = Math.floor(px / this.#default);
		for (let guard = 0; guard < 64; guard += 1) {
			const start = this.offset(index);
			if (px < start) {
				index -= 1;
				continue;
			}
			if (px >= start + this.size(index)) {
				// Jump by the uniform estimate of the remaining distance, at least one.
				index += Math.max(1, Math.floor((px - start - this.size(index)) / this.#default));
				continue;
			}
			return index;
		}
		return index;
	}

	/** The pixel length of `count` indexes. */
	total(count: number): number {
		return this.offset(count);
	}
}
