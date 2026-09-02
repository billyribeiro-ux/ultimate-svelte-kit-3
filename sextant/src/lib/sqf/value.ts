/**
 * VALUES AT RUNTIME
 * =================
 *
 * A row is a plain object; a value is one of five things. The interesting part
 * of this file is not the type — it is the comparison rules, which are where a
 * dynamically-typed query language either behaves predictably or does not.
 *
 * THREE-VALUED LOGIC, AND WHY
 * ---------------------------
 * Telemetry is full of missing fields. `attributes.user_id` is present on some
 * rows and not others, and `where attributes.user_id != "bob"` has to decide
 * what to do with a row that has no `user_id` at all.
 *
 * SQL's answer is `NULL`: the comparison is neither true nor false, and a
 * `WHERE` clause keeps only rows that are definitely true. That is unintuitive
 * exactly once — `!=` does not return the rows you expected — and then it is
 * right forever, because the alternative is `x == "a"` and `x != "a"` together
 * failing to cover every row, which is worse.
 *
 * So: comparisons involving `null` produce `null`, `and`/`or` follow Kleene
 * logic, and `where` keeps `true` only. It is the one place SQF copies SQL
 * exactly, because SQL got it right and every language that tried something
 * friendlier ended up with a different surprise.
 */

/** A runtime value. `null` means absent, and is the only falsy-by-absence value. */
export type Value = string | number | boolean | null | Record<string, unknown>;

export type Row = Record<string, Value>;

/**
 * Three-valued AND.
 *
 * `false and null` is `false`, not `null` — because whatever the unknown side
 * turns out to be, the answer is false. Getting this wrong makes a predicate
 * with a missing field drop rows it should keep, which reads as data loss.
 */
export function and3(a: boolean | null, b: boolean | null): boolean | null {
	if (a === false || b === false) return false;
	if (a === null || b === null) return null;
	return true;
}

/** Three-valued OR. `true or null` is `true`, for the mirror reason. */
export function or3(a: boolean | null, b: boolean | null): boolean | null {
	if (a === true || b === true) return true;
	if (a === null || b === null) return null;
	return false;
}

export function not3(a: boolean | null): boolean | null {
	return a === null ? null : !a;
}

/** What `where` does with a three-valued result: keep only definite truth. */
export function isTrue(value: boolean | null): boolean {
	return value === true;
}

/**
 * Order two values, for `<`, `sort`, `min` and `max`.
 *
 * Returns `null` when they are not comparable, which the caller turns into a
 * `null` comparison result rather than an arbitrary answer. That is the
 * difference between `sort by mixed_column` producing a stable, explicable order
 * and producing whatever the JavaScript `<` operator does between a string and a
 * number — which is `false` both ways, and makes a sort that silently does
 * nothing.
 */
export function compareValues(a: Value, b: Value): number | null {
	if (a === null || b === null) return null;

	if (typeof a === 'number' && typeof b === 'number') {
		// NaN never arrives here from ingest, which validates; if it does, treating
		// it as incomparable is better than the `<` operator's silent false.
		if (Number.isNaN(a) || Number.isNaN(b)) return null;
		return a < b ? -1 : a > b ? 1 : 0;
	}

	if (typeof a === 'string' && typeof b === 'string') {
		/*
		 * `localeCompare` would sort "correctly" for a human and inconsistently
		 * across machines — the ICU version on the server is not the one in the
		 * browser, so a sort computed server-side and re-sorted client-side would
		 * disagree. Code-point order is ugly for accented text and identical
		 * everywhere, and identical everywhere is what a paginated result needs.
		 */
		return a < b ? -1 : a > b ? 1 : 0;
	}

	if (typeof a === 'boolean' && typeof b === 'boolean') {
		return a === b ? 0 : a ? 1 : -1;
	}

	/*
	 * A number against a numeric string.
	 *
	 * Attribute bags are untyped, so `attributes.status` may be `500` from one
	 * sender and `"500"` from another — for the same field, in the same query.
	 * Refusing to compare them means a filter that silently misses half the data,
	 * which is much worse than a coercion that is written down.
	 */
	if (typeof a === 'number' && typeof b === 'string') {
		const coerced = Number(b);
		return b.trim() !== '' && Number.isFinite(coerced) ? compareValues(a, coerced) : null;
	}
	if (typeof a === 'string' && typeof b === 'number') {
		const flipped = compareValues(b, a);
		return flipped === null ? null : -flipped;
	}

	return null;
}

/**
 * Equality, three-valued.
 *
 * Deliberately shares `compareValues`, so `a == b` and `not (a < b) and not
 * (a > b)` always agree. Writing a separate `equals` is how a language ends up
 * with `1 == "1"` true and `1 < "1"` null.
 */
export function equals3(a: Value, b: Value): boolean | null {
	const order = compareValues(a, b);
	return order === null ? null : order === 0;
}

/** A number, or `null` if this value is not one. Used by numeric aggregates. */
export function asNumber(value: Value): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const coerced = Number(value);
		return value.trim() !== '' && Number.isFinite(coerced) ? coerced : null;
	}
	if (typeof value === 'boolean') return value ? 1 : 0;
	return null;
}

/** A string, for text operators. Numbers render, objects do not. */
export function asString(value: Value): string | null {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return null;
}

/**
 * The key a value contributes to a `by` grouping.
 *
 * Type-tagged, so the number `1` and the string `"1"` are different groups —
 * which is the opposite of the comparison rule above, and deliberately so.
 *
 * Comparison answers "is this row above the threshold", where coercing a
 * numeric string helps. Grouping answers "is this the same thing", where
 * merging two senders' differently-typed values into one row would hide a real
 * difference — and hiding it in the *grouping key* means it can never be seen
 * again downstream.
 */
export function groupKey(value: Value): string {
	if (value === null) return 'n';
	if (typeof value === 'object') return 'o' + JSON.stringify(value);
	return typeof value === 'string'
		? 's' + value
		: typeof value === 'number'
			? 'd' + value
			: 'b' + value;
}
