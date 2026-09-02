/**
 * A VIRTUALIZER FOR VARIABLE-HEIGHT ROWS
 * ======================================
 *
 * Render the rows that are on screen and none of the rest.
 *
 * WHY THIS IS NOT `rows.slice(start, end)`
 * ----------------------------------------
 * With fixed-height rows it very nearly is: the index at a scroll offset is a
 * division, and the total height is a multiplication. Log lines are not fixed
 * height — a stack trace is twelve lines and a heartbeat is one — and every
 * simplification that assumes otherwise fails on exactly the rows people care
 * about, because the long rows are the interesting ones.
 *
 * So heights are **measured after render and remembered**, and un-measured rows
 * use an estimate. That produces three problems, and this file is the three
 * solutions:
 *
 *   1. The total height is wrong until everything has been measured, so the
 *      scrollbar changes size as you scroll. Fixed by averaging the measured
 *      rows rather than using a constant estimate, so the guess improves.
 *
 *   2. Measuring changes layout, and reading layout after changing it in the
 *      same frame gives the *old* numbers. This is what `flushSync` is for.
 *
 *   3. Rows arriving at the top — which is what a live tail does — shift
 *      everything down, and the browser keeps the scroll *offset* rather than
 *      the scroll *position*, so the view jumps. Fixed by anchoring.
 *
 * The third is the one that makes a tail unusable if you get it wrong, and it is
 * the one no virtualizer library handles by default.
 */

import { flushSync, tick } from 'svelte';

export interface VirtualRow {
	readonly index: number;
	/** Offset from the top of the scrolled content, in pixels. */
	readonly top: number;
	readonly height: number;
}

export interface VirtualizerOptions {
	/**
	 * The height to assume for a row that has not been measured.
	 *
	 * Only used until the first measurement: after that the average of what has
	 * been measured is a much better guess, and it converges quickly because the
	 * rows near the viewport are the ones that get measured.
	 */
	readonly estimate?: number;
	/**
	 * Rows to render above and below the viewport.
	 *
	 * Three is enough to cover a fast wheel scroll without a blank frame, and
	 * small enough that the DOM stays tiny. Larger values look safer and are how a
	 * virtualizer ends up rendering two hundred rows.
	 */
	readonly overscan?: number;
}

export class Virtualizer {
	/** Total rows. Set by the component whenever the result changes. */
	count = $state(0);

	/** The scroll container's height, from a `ResizeObserver`. */
	viewport = $state(0);

	/** Current scroll offset. */
	offset = $state(0);

	readonly #estimate: number;
	readonly #overscan: number;

	/**
	 * Measured heights by index.
	 *
	 * `$state.raw` holding a plain `Map`, replaced wholesale on each measurement
	 * pass rather than mutated. A `SvelteMap` would make every `set` a reactive
	 * write, and a measurement pass sets thirty of them in a loop — thirty
	 * invalidations for one visual change, in the hot path of scrolling.
	 */
	#heights = $state.raw(new Map<number, number>());

	/** Running total, so the average does not walk the map on every read. */
	#measuredTotal = 0;

	constructor(options: VirtualizerOptions = {}) {
		this.#estimate = options.estimate ?? 28;
		this.#overscan = options.overscan ?? 3;
	}

	/** The best current guess for an unmeasured row. */
	get #guess(): number {
		const measured = this.#heights.size;
		return measured === 0 ? this.#estimate : this.#measuredTotal / measured;
	}

	/**
	 * Cumulative offsets, recomputed when heights or count change.
	 *
	 * O(n) in the row count, which for ten thousand rows is a few hundred
	 * microseconds and runs only when a measurement actually changed something. A
	 * prefix-sum tree would make it O(log n) and is the right answer at a million
	 * rows; at ten thousand it is a data structure to maintain in exchange for
	 * nothing measurable.
	 */
	readonly #offsets = $derived.by(() => {
		const guess = this.#guess;
		const offsets = new Float64Array(this.count + 1);

		for (let i = 0; i < this.count; i += 1) {
			offsets[i + 1] = offsets[i]! + (this.#heights.get(i) ?? guess);
		}

		return offsets;
	});

	/** The full scrollable height. */
	get total(): number {
		return this.#offsets[this.count] ?? 0;
	}

	/** The rows to render, with their positions. */
	readonly visible = $derived.by((): VirtualRow[] => {
		const offsets = this.#offsets;
		if (this.count === 0) return [];

		const start = Math.max(0, this.#indexAt(this.offset) - this.#overscan);
		const end = Math.min(
			this.count,
			this.#indexAt(this.offset + this.viewport) + this.#overscan + 1
		);

		const rows: VirtualRow[] = [];
		for (let i = start; i < end; i += 1) {
			rows.push({ index: i, top: offsets[i]!, height: offsets[i + 1]! - offsets[i]! });
		}
		return rows;
	});

	/** Binary search for the row containing a pixel offset. */
	#indexAt(pixel: number): number {
		const offsets = this.#offsets;
		let low = 0;
		let high = this.count;

		while (low < high) {
			const mid = (low + high) >>> 1;
			if (offsets[mid]! < pixel) low = mid + 1;
			else high = mid;
		}

		return Math.max(0, low - 1);
	}

	/**
	 * Record what a row actually measured.
	 *
	 * Returns whether anything changed, so the caller can skip a re-layout when
	 * the answer is the same — which it is on most scroll frames, because the rows
	 * coming into view were often measured on the way out.
	 */
	measure(index: number, height: number): boolean {
		const rounded = Math.round(height);
		const previous = this.#heights.get(index);
		if (previous === rounded) return false;

		const next = new Map(this.#heights);
		next.set(index, rounded);

		this.#measuredTotal += rounded - (previous ?? 0);
		this.#heights = next;
		return true;
	}

	/** Forget every measurement. Called when the result set changes underneath. */
	reset(count: number): void {
		this.count = count;
		this.#heights = new Map();
		this.#measuredTotal = 0;
	}

	/**
	 * Keep the row under a given offset in the same place while rows are inserted
	 * above it.
	 *
	 * THE PROBLEM THIS SOLVES
	 * -----------------------
	 * A live tail inserts at the top. The browser preserves `scrollTop`, which is
	 * a distance from the top of the *content* — so when the content grows above
	 * you, the row you were reading moves down and the view appears to jump.
	 *
	 * Nothing about that is a bug in the browser: preserving the offset is the
	 * only thing it can do without knowing what you were looking at. Anchoring is
	 * the application saying what it was looking at.
	 *
	 * `flushSync` is essential and is the whole reason this is a method rather
	 * than an effect. The new offsets have to be *computed* before the scroll
	 * position is set, and Svelte batches state changes into a microtask — so
	 * without it, the read happens against the old layout and the correction is
	 * one frame stale, which looks exactly like the jump it was meant to prevent.
	 */
	anchor(inserted: number, element: HTMLElement): void {
		if (inserted <= 0 || this.offset <= 0) return;

		const before = this.total;

		// Force the derived offsets to recompute with the new count *now*, rather
		// than at the end of the current microtask.
		flushSync();

		const grew = this.total - before;
		if (grew === 0) return;

		element.scrollTop = this.offset + grew;
		this.offset = element.scrollTop;
	}

	/**
	 * Scroll a row into view.
	 *
	 * `await tick()` first, because the row may not be rendered yet: scrolling to
	 * a row that is currently virtualized away means scrolling to an offset the
	 * component has not laid out, and the browser clamps to the current content
	 * height. One tick is enough because the offsets are derived, not measured.
	 */
	async scrollTo(index: number, element: HTMLElement): Promise<void> {
		await tick();

		const offsets = this.#offsets;
		const top = offsets[Math.max(0, Math.min(index, this.count - 1))] ?? 0;

		// Centre it rather than putting it at the top edge: a row flush against the
		// top of a scroll container has no context above it, and context above is
		// most of why somebody is looking at a log line.
		element.scrollTop = Math.max(0, top - this.viewport / 3);
		this.offset = element.scrollTop;
	}
}
