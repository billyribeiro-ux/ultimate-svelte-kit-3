/**
 * DDSKETCH — PERCENTILES THAT CAN BE ADDED TOGETHER
 * =================================================
 *
 * The problem this solves is not "computing a percentile". Sorting an array and
 * taking the 95th element is four lines. The problem is that percentiles do not
 * *add up*, and an observability system needs them to.
 *
 * A dashboard showing p95 latency over a day, at one-minute resolution, is 1,440
 * numbers. Computing each from raw events means scanning a day of data every
 * time somebody moves the time range. The fix everywhere else in the system is
 * pre-aggregation: store one row per minute and read 1,440 rows. But:
 *
 *   avg(p95 of each minute)  ≠  p95 of the day
 *
 * and it is not close, and it is wrong in the direction that matters — it
 * *understates* the tail, which is the number people are watching. So a
 * pre-aggregated percentile has to store something that merges correctly, and
 * that something is a sketch.
 *
 * WHY DDSKETCH AND NOT T-DIGEST
 * -----------------------------
 * t-digest gives excellent accuracy at the extremes and its error guarantee is
 * on the *rank*: it will tell you a value near the 95th percentile. DDSketch's
 * guarantee is on the *value*: the answer is within α relative error of the true
 * quantile, always, for any distribution.
 *
 * For latency, the value guarantee is the one that means something. "p95 is
 * 210ms ± 2%" is a sentence somebody can set an alert threshold against. "p95 is
 * some value whose rank is within 1% of the 95th" is not, because the mapping
 * from rank to milliseconds depends on the shape of a distribution nobody has
 * looked at.
 *
 * HOW IT WORKS
 * ------------
 * Buckets are logarithmic. Bucket `i` holds values in `(γ^(i-1), γ^i]` where
 * `γ = (1+α)/(1-α)`. Any value in a bucket is within α relative error of any
 * other, so reporting the bucket's midpoint bounds the error by construction —
 * there is no statistical argument, just algebra.
 *
 * Merging is adding the bucket counts. That is the whole trick, and it is why
 * this is worth 150 lines: a rollup table can store one sketch per minute per
 * series, and any range query is a sum.
 */

/**
 * Relative accuracy. 2% is the usual default and is the right trade for latency:
 * it puts p95 within 4ms at 200ms, which is far below the noise anybody is
 * looking at, and it keeps the bucket count small enough that a serialised
 * sketch is a few hundred bytes.
 */
export const DEFAULT_ALPHA = 0.02;

/**
 * Values at or below this collapse into a single zero bucket.
 *
 * A logarithmic mapping cannot represent zero — `log(0)` is `-Infinity` — and
 * durations legitimately are zero. Everything below this threshold is treated as
 * indistinguishable, which for a nanosecond-scale floor is true.
 */
const MIN_VALUE = 1e-9;

/** Refuse to allocate past this many buckets. See `indexOf`. */
const MAX_BUCKETS = 4096;

export interface DDSketchJson {
	readonly a: number;
	readonly z: number;
	/** Bucket index to count, as a flat pair array — half the JSON of an object. */
	readonly b: readonly number[];
	readonly n: number;
	readonly min: number;
	readonly max: number;
	readonly sum: number;
}

export class DDSketch {
	readonly alpha: number;
	readonly #gamma: number;
	readonly #logGamma: number;

	/** Bucket index to count. Sparse — most indices are never touched. */
	readonly #buckets = new Map<number, number>();

	/** Values at or below `MIN_VALUE`, including exact zeroes. */
	#zeroes = 0;
	#count = 0;

	/*
	 * The exact min, max and sum, kept alongside the sketch.
	 *
	 * They cost three numbers and they are *not* approximations, which matters
	 * more than it looks: `min` and `max` from bucket edges would be wrong by up
	 * to α, and a max latency that is 2% off is the one number in a latency panel
	 * people quote verbatim. The sum makes `avg` exact too, so the whole rollup
	 * row is exact except for the percentiles it cannot be.
	 */
	#min = Infinity;
	#max = -Infinity;
	#sum = 0;

	constructor(alpha: number = DEFAULT_ALPHA) {
		if (!(alpha > 0 && alpha < 1)) {
			throw new RangeError(`alpha must be in (0, 1), got ${alpha}`);
		}
		this.alpha = alpha;
		this.#gamma = (1 + alpha) / (1 - alpha);
		this.#logGamma = Math.log(this.#gamma);
	}

	get count(): number {
		return this.#count;
	}

	get sum(): number {
		return this.#sum;
	}

	get min(): number {
		return this.#count === 0 ? NaN : this.#min;
	}

	get max(): number {
		return this.#count === 0 ? NaN : this.#max;
	}

	get avg(): number {
		return this.#count === 0 ? NaN : this.#sum / this.#count;
	}

	/** How many buckets are populated. The sketch's real size. */
	get buckets(): number {
		return this.#buckets.size;
	}

	add(value: number, count = 1): void {
		if (!Number.isFinite(value)) {
			// A NaN or an Infinity in a latency series is a bug upstream, and letting
			// it in poisons every percentile from this sketch forever — one Infinity
			// makes `max` infinite and the bucket index unrepresentable. Dropping it
			// silently is the wrong answer too, which is why ingest validates before
			// this is ever called; this is the last line of defence.
			return;
		}
		if (count <= 0) return;

		this.#count += count;
		this.#sum += value * count;
		if (value < this.#min) this.#min = value;
		if (value > this.#max) this.#max = value;

		if (value <= MIN_VALUE && value >= -MIN_VALUE) {
			this.#zeroes += count;
			return;
		}

		/*
		 * Negative values.
		 *
		 * A general DDSketch keeps a second set of buckets for them. This one
		 * refuses, because every quantity Sextant sketches — a duration, a byte
		 * count, a queue depth — is non-negative, and the second bucket map doubles
		 * the code and the serialised size to handle a case that would be a bug if
		 * it arrived. It is recorded in `min` so it is still visible.
		 */
		if (value < 0) return;

		const index = this.#indexOf(value);
		this.#buckets.set(index, (this.#buckets.get(index) ?? 0) + count);
	}

	/**
	 * The value at `q`, where `q` is in [0, 1].
	 *
	 * Walks buckets in ascending index order until the cumulative count reaches
	 * the rank. `Map` does not guarantee sorted iteration — it iterates in
	 * insertion order — so the keys are sorted first. Forgetting that produces a
	 * percentile that depends on the order values arrived in, which is
	 * intermittent, plausible-looking, and appears only under real traffic.
	 */
	quantile(q: number): number {
		if (!(q >= 0 && q <= 1)) throw new RangeError(`quantile must be in [0, 1], got ${q}`);
		if (this.#count === 0) return NaN;

		// The exact ends, rather than a bucket edge within α.
		if (q === 0) return this.#min;
		if (q === 1) return this.#max;

		const rank = q * (this.#count - 1);

		if (rank < this.#zeroes) return 0;

		let seen = this.#zeroes;
		for (const index of [...this.#buckets.keys()].sort((a, b) => a - b)) {
			seen += this.#buckets.get(index)!;
			if (seen > rank) return this.#valueOf(index);
		}

		// Floating-point drift in the cumulative sum can leave the loop one short.
		return this.#max;
	}

	/** Fold another sketch in. The reason this class exists. */
	merge(other: DDSketch): void {
		if (other.alpha !== this.alpha) {
			/*
			 * Two sketches with different α cannot be merged without losing the
			 * guarantee, and there is no honest way to fake it: re-bucketing the
			 * coarser one into the finer's buckets invents precision it never had.
			 *
			 * Throwing is the right answer because this can only happen if α changed
			 * between deployments, and the fix is a migration rather than a runtime
			 * decision.
			 */
			throw new Error(
				`Cannot merge sketches with different accuracy (${this.alpha} and ${other.alpha})`
			);
		}

		for (const [index, count] of other.#buckets) {
			this.#buckets.set(index, (this.#buckets.get(index) ?? 0) + count);
		}

		this.#zeroes += other.#zeroes;
		this.#count += other.#count;
		this.#sum += other.#sum;
		if (other.#count > 0) {
			this.#min = Math.min(this.#min, other.#min);
			this.#max = Math.max(this.#max, other.#max);
		}
	}

	toJSON(): DDSketchJson {
		// Sorted, so two sketches holding the same values serialise identically —
		// which lets a rollup row be compared or hashed to detect a bad merge.
		const pairs: number[] = [];
		for (const index of [...this.#buckets.keys()].sort((a, b) => a - b)) {
			pairs.push(index, this.#buckets.get(index)!);
		}

		return {
			a: this.alpha,
			z: this.#zeroes,
			b: pairs,
			n: this.#count,
			min: this.#count === 0 ? 0 : this.#min,
			max: this.#count === 0 ? 0 : this.#max,
			sum: this.#sum
		};
	}

	static fromJSON(json: DDSketchJson): DDSketch {
		const sketch = new DDSketch(json.a);

		for (let i = 0; i + 1 < json.b.length; i += 2) {
			sketch.#buckets.set(json.b[i]!, json.b[i + 1]!);
		}

		sketch.#zeroes = json.z;
		sketch.#count = json.n;
		sketch.#sum = json.sum;
		sketch.#min = json.n === 0 ? Infinity : json.min;
		sketch.#max = json.n === 0 ? -Infinity : json.max;

		return sketch;
	}

	/* ---- the mapping ------------------------------------------------ */

	#indexOf(value: number): number {
		const index = Math.ceil(Math.log(value) / this.#logGamma);

		/*
		 * Clamp rather than allocate without bound.
		 *
		 * The bucket count is logarithmic in the *ratio* of largest to smallest
		 * value, so it is tiny for real data — a nanosecond to an hour at α=0.02 is
		 * about 1,300 buckets. It explodes only when something upstream sends
		 * 1e300, and the honest failure there is a sketch that says "very large"
		 * rather than a Map with a hundred thousand entries per series.
		 */
		return Math.max(-MAX_BUCKETS, Math.min(MAX_BUCKETS, index));
	}

	/**
	 * The representative value for a bucket.
	 *
	 * `2γ^i / (γ+1)` is the midpoint of the bucket in the sense that matters: it
	 * is the value whose relative distance to both edges is equal, which is what
	 * bounds the error at exactly α rather than at α on one side and more on the
	 * other. Using `γ^i` — the upper edge, which is the obvious choice — doubles
	 * the worst-case error and is the most common way this is implemented wrong.
	 */
	#valueOf(index: number): number {
		return (2 * Math.pow(this.#gamma, index)) / (this.#gamma + 1);
	}
}
