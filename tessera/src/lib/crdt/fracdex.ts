/**
 * FRACTIONAL INDEXING
 * ===================
 *
 * Stacking order. "Bring to front", "send backward", and the order shapes sit in
 * when two of them overlap.
 *
 * The obvious model — an integer `z` per node — is a trap in a collaborative
 * document. Moving one shape between two others renumbers every shape above it,
 * so a one-shape reorder becomes fifty operations that all conflict with
 * anything anybody else did to the stack. Two people reordering different shapes
 * at the same time produce a mess that no merge rule can untangle, because the
 * operations were never about the shapes they touched.
 *
 * The fix is to stop using integers. A **fractional index** is a string that
 * sorts lexicographically, and there is always room to mint another one strictly
 * between any two. Moving a shape writes exactly one field on exactly one shape,
 * and that write is an ordinary last-write-wins register.
 *
 * The keys are base-62 digits read as the fractional part of a number — `"V"` is
 * roughly a half, `"V5"` is slightly more than a half — so `between` is long
 * division that stops as soon as it finds room.
 *
 * THE COLLISION NOBODY MENTIONS
 * -----------------------------
 * Two replicas that concurrently move different shapes to the same slot compute
 * the *same* key, because the inputs are the same. Sorting by key alone then
 * leaves their order down to whatever `Array#sort` felt like, which differs
 * between replicas — a divergence in the rendering, from a data structure that
 * has technically converged.
 *
 * So nothing sorts by the key alone. `compareOrder` sorts by key and breaks ties
 * with the element's own id, which is a stamp and therefore unique and totally
 * ordered. Cheap, and it removes the failure entirely.
 */

/** Digits in ascending order. ASCII order and value order must agree. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length; // 62

/** A stacking key. Sorts lexicographically; never empty; never ends in `'0'`. */
export type OrderKey = string & { readonly __brand: 'OrderKey' };

/** The key for the first element on an empty board — the midpoint of the range. */
export const MIDDLE = 'V' as OrderKey; // DIGITS[31], as close to a half as base 62 gets

function digitAt(key: string | null, index: number, fallback: number): number {
	if (key === null || index >= key.length) return fallback;
	const value = DIGITS.indexOf(key[index]!);
	if (value < 0) throw new RangeError(`"${key}" is not a valid order key`);
	return value;
}

/**
 * A key strictly between `before` and `after`.
 *
 * `null` means "no bound": `between(null, null)` is the middle of the range,
 * `between(key, null)` is after everything, `between(null, key)` is before
 * everything.
 *
 * The loop walks digit by digit. As soon as two consecutive positions differ by
 * more than one there is room for a midpoint and it stops; otherwise it copies
 * the lower bound's digit and descends. Since the upper bound is treated as
 * `BASE` past its end, descending always terminates — the worst case is one
 * extra character per call, which is why a thousand consecutive "insert just
 * above this one" operations grow a key to about a thousand characters and not
 * to infinity.
 */
export function between(before: OrderKey | null, after: OrderKey | null): OrderKey {
	if (before !== null && after !== null && before >= after) {
		throw new RangeError(`order keys are not ascending: "${before}" >= "${after}"`);
	}

	let result = '';

	for (let index = 0; ; index += 1) {
		const low = digitAt(before, index, 0);
		const high = digitAt(after, index, BASE);

		if (high - low > 1) {
			// `low + 1` rather than the midpoint when the gap is small keeps keys
			// short; the midpoint keeps them balanced when the gap is wide. Halving
			// is the one that survives repeated insertion at the same spot.
			result += DIGITS[Math.floor((low + high) / 2)];
			return result as OrderKey;
		}

		result += DIGITS[low];
	}
}

/**
 * `count` keys strictly between the two bounds, ascending.
 *
 * Pasting forty shapes should not be forty calls to `between` chained off each
 * other — that builds a key that grows a character per shape and reads like a
 * hash. Splitting the gap evenly keeps them all short.
 */
export function betweenMany(
	before: OrderKey | null,
	after: OrderKey | null,
	count: number
): OrderKey[] {
	if (count < 0) throw new RangeError(`count must not be negative: ${count}`);
	if (count === 0) return [];

	const middle = between(before, after);
	if (count === 1) return [middle];

	// Halve the range, fill the lower half, then the upper. Recursion depth is
	// log2(count), so a paste of a million shapes is twenty frames deep.
	const half = Math.floor(count / 2);
	return [
		...betweenMany(before, middle, half),
		middle,
		...betweenMany(middle, after, count - half - 1)
	];
}

/** Validate a key that arrived from somewhere untrusted. */
export function isOrderKey(value: string): value is OrderKey {
	if (value.length === 0) return false;
	if (value.endsWith('0')) return false; // ambiguous: "V" and "V0" would tie
	for (const character of value) {
		if (!DIGITS.includes(character)) return false;
	}
	return true;
}

/**
 * The comparator every render path uses.
 *
 * Never sort by `key` alone — see the note at the top of this file. The `id`
 * tiebreak is what makes two replicas agree when they have independently minted
 * the same key.
 */
export function compareOrder(
	a: { readonly key: OrderKey; readonly id: string },
	b: { readonly key: OrderKey; readonly id: string }
): number {
	if (a.key !== b.key) return a.key < b.key ? -1 : 1;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
