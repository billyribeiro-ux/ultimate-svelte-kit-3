/**
 * HYPERLOGLOG — COUNTING DISTINCT THINGS IN A FIXED AMOUNT OF SPACE
 * ================================================================
 *
 * "How many distinct users hit the error path this hour?" A `Set` answers it
 * exactly, in memory proportional to the answer. That is fine until the answer
 * is ten million and the question is asked per minute per service.
 *
 * HyperLogLog answers it in **1.5kB, regardless of the cardinality**, with about
 * 1.6% standard error — and, like DDSketch, it merges. One register array per
 * minute per series, and any range query is a max over registers.
 *
 * THE IDEA, IN ONE PARAGRAPH
 * --------------------------
 * Hash each value to a uniform bit string. In a uniform stream, seeing a hash
 * beginning with `k` zeroes suggests you have seen about `2^k` distinct values —
 * because one value in `2^k` starts that way. That estimator is correct on
 * average and wildly noisy, so HyperLogLog runs `m` of them in parallel — the
 * first `p` bits of the hash choose which register to update — and combines them
 * with a harmonic mean, which is what suppresses the influence of a single
 * unluckily-long run of zeroes.
 *
 * WHAT "APPROXIMATE" MEANS HERE, PRECISELY
 * ----------------------------------------
 * The error is a *relative* standard error of `1.04/√m`, so with `m = 2048` it
 * is about 2.3%: a true count of a million reports as somewhere near a million,
 * not near a thousand. It is not a bound — an unlucky hash distribution can do
 * worse — and it is symmetric, so it over-counts as often as it under-counts.
 *
 * The important consequence, which is a product decision rather than a
 * mathematical one: **a dcount must never be presented as an exact number.**
 * Sextant renders it with a `~`, and the query language names the function
 * `dcount` rather than `count_distinct` so that nobody reads it as exact.
 */

/**
 * Precision: `m = 2^P` registers.
 *
 * 11 gives 2048 registers, ~2.3% standard error and a 2kB register array — which
 * fits comfortably in a rollup row alongside a DDSketch. Going to 14 (the common
 * default elsewhere) would give 0.8% error and 16kB per series per minute, which
 * for a system storing one row per minute per series is the difference between a
 * rollup table smaller than the raw data and one that is larger.
 */
const P = 11;
const M = 1 << P;

/** `alpha_m`, the bias-correction constant. Empirical, from the HLL paper. */
const ALPHA_M = 0.7213 / (1 + 1.079 / M);

export interface HllJson {
	readonly p: number;
	/** Registers, base-64 encoded. One byte each; most are zero and gzip loves it. */
	readonly r: string;
}

export class HyperLogLog {
	/**
	 * One byte per register, holding the longest run of leading zeroes seen.
	 *
	 * `Uint8Array` rather than `number[]`: 2kB against roughly 16kB, and it is the
	 * difference between a rollup row that fits in a page and one that does not.
	 * A register can never exceed 64 - P + 1, so a byte is plenty.
	 */
	readonly #registers = new Uint8Array(M);

	add(value: string): void {
		const hash = hash64(value);

		/*
		 * The first P bits choose the register; the rest are counted for leading
		 * zeroes.
		 *
		 * `Number(hash >> BigInt(64 - P))` rather than arithmetic on a `number`,
		 * because JavaScript's bitwise operators are 32-bit and silently truncate.
		 * A 64-bit hash processed with `>>>` gives 32 bits of entropy, which halves
		 * the usable range and makes the estimator collide badly past a few million
		 * — a failure that only appears at the scale nobody tests at.
		 */
		const index = Number(hash >> BigInt(64 - P));
		const remaining = (hash << BigInt(P)) & MASK_64;
		const zeroes = leadingZeroes64(remaining) + 1;

		if (zeroes > this.#registers[index]!) this.#registers[index] = zeroes;
	}

	/** The estimated number of distinct values added. */
	count(): number {
		let harmonic = 0;
		let empty = 0;

		for (const register of this.#registers) {
			harmonic += 2 ** -register;
			if (register === 0) empty += 1;
		}

		const estimate = (ALPHA_M * M * M) / harmonic;

		/*
		 * SMALL-RANGE CORRECTION
		 *
		 * The harmonic-mean estimator is badly biased below about `2.5m`, and this
		 * is not a rounding matter: with 2048 registers, an *empty* sketch estimates
		 * roughly 1478 rather than 0. Shipping without this correction gives a
		 * dashboard that says "~1.5k distinct users" for a service nobody has used,
		 * which destroys trust in the number permanently.
		 *
		 * Linear counting — `m · ln(m/empty)` — is exact-ish in that range, and the
		 * two agree closely at the crossover, so there is no visible discontinuity
		 * as a series grows through it.
		 */
		if (estimate <= 2.5 * M && empty > 0) {
			return Math.round(M * Math.log(M / empty));
		}

		return Math.round(estimate);
	}

	/** Fold another sketch in: a register-wise maximum. */
	merge(other: HyperLogLog): void {
		for (let i = 0; i < M; i += 1) {
			if (other.#registers[i]! > this.#registers[i]!) {
				this.#registers[i] = other.#registers[i]!;
			}
		}
	}

	/**
	 * Idempotent and order-independent by construction.
	 *
	 * A register only ever moves up, and `max` is commutative, associative and
	 * idempotent — so adding the same value twice, or merging the same sketch
	 * twice, changes nothing. That is what makes ingest safe to retry, and it is a
	 * stronger guarantee than the percentile sketch has: DDSketch counts, so a
	 * duplicated batch double-counts. Ingest deduplicates for that reason; this
	 * one would not have needed it.
	 */
	toJSON(): HllJson {
		return { p: P, r: Buffer.from(this.#registers).toString('base64') };
	}

	static fromJSON(json: HllJson): HyperLogLog {
		if (json.p !== P) {
			// Registers from a different precision cannot be merged or read: the
			// index bits mean something else. A migration re-sketches from raw data.
			throw new Error(`HyperLogLog precision changed: stored ${json.p}, expected ${P}`);
		}

		const sketch = new HyperLogLog();
		sketch.#registers.set(Buffer.from(json.r, 'base64'));
		return sketch;
	}
}

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

const MASK_64 = (1n << 64n) - 1n;

/**
 * A 64-bit hash. FNV-1a, then an avalanche mix.
 *
 * FNV-1a alone is not good enough on its own here: it is fast and simple, and
 * its low bits are well distributed while its *high* bits are not — which is
 * exactly backwards for HyperLogLog, since the high bits choose the register.
 * A sketch built on raw FNV-1a puts most values in a handful of registers and
 * under-counts by an order of magnitude on structured inputs like `user-1`,
 * `user-2`, `user-3`.
 *
 * The finaliser is the 64-bit avalanche from SplitMix64, which fixes that for
 * four multiplications. Non-cryptographic and deliberately so — this hash is
 * never a security boundary, and a cryptographic one would cost more than the
 * rest of ingest.
 */
export function hash64(value: string): bigint {
	let hash = 14695981039346656037n;

	for (let i = 0; i < value.length; i += 1) {
		// `codePointAt` rather than `charCodeAt` would need surrogate handling and
		// buys nothing: two code units hash as consistently as one code point, and
		// the only requirement here is determinism.
		hash ^= BigInt(value.charCodeAt(i));
		hash = (hash * 1099511628211n) & MASK_64;
	}

	hash ^= hash >> 33n;
	hash = (hash * 0xff51afd7ed558ccdn) & MASK_64;
	hash ^= hash >> 33n;
	hash = (hash * 0xc4ceb9fe1a85ec53n) & MASK_64;
	hash ^= hash >> 33n;

	return hash;
}

/**
 * Leading zeroes in a 64-bit value.
 *
 * A loop rather than `Math.clz32` on two halves, because the halves have to be
 * extracted with BigInt arithmetic anyway and the loop runs at most 64 times on
 * a value that is almost always small. Binary search would be four steps; it is
 * not worth the two extra branches to reason about.
 */
function leadingZeroes64(value: bigint): number {
	if (value === 0n) return 64;

	let zeroes = 0;
	let probe = 1n << 63n;
	while ((value & probe) === 0n) {
		zeroes += 1;
		probe >>= 1n;
	}
	return zeroes;
}
