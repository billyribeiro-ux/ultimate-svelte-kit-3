/**
 * Cursor pagination, and why the obvious alternative is broken.
 *
 * ## The problem with `?page=2`
 *
 * Offset pagination — `LIMIT 50 OFFSET 50` — is what everybody writes first,
 * and on a table that never changes it is fine. This table changes constantly.
 *
 * Say a client reads page 1 of the trade tape, newest first. Between that
 * request and the next, twenty trades happen. Every row shifts down by twenty,
 * so `OFFSET 50` now points at rows the client already saw. It gets twenty
 * duplicates and — worse, and this is the part that goes unnoticed — it *never
 * sees* the twenty rows that were pushed past the boundary in the other
 * direction on a delete. A client reconciling its own books against ours ends
 * up with a total that is wrong, and no error anywhere.
 *
 * Offset pagination also gets slower the deeper you go: `OFFSET 100000` means
 * the database counts to a hundred thousand and throws the results away.
 *
 * ## What a cursor is
 *
 * A cursor names a **position in a total order**, not a count. "Everything
 * after seq 8134" is an answer that does not change when new rows arrive, so
 * the same cursor returns the same page tomorrow. It is also an index seek
 * rather than a scan, so page 10,000 costs what page 1 costs.
 *
 * ## Why it is opaque, and why that is not security theatre
 *
 * The cursor is base64url of a small JSON object. That is not encryption and it
 * is not pretending to be — anybody can decode it. The point is a contract:
 * clients that cannot read the cursor cannot build a URL out of one, so we can
 * change what is inside it without breaking them. A client that has learned to
 * write `?after_seq=8134` has made our column names part of our public API.
 *
 * The tie-breaker matters as much as the sort key. Two trades can share a seq
 * when one command produces several, so the cursor carries the id as well, and
 * the SQL compares the pair. A cursor on a non-unique column silently skips
 * rows at every page boundary, and it does it rarely enough that nobody notices
 * until an auditor does.
 */

/* -------------------------------------------------------------------------- */
/* The cursor                                                                  */
/* -------------------------------------------------------------------------- */

/** A position in a `(seq, id)` ordering. */
export interface Cursor {
	readonly seq: number;
	readonly id: string;
}

export class InvalidCursor extends Error {
	constructor(presented: string) {
		super(`Not a valid cursor: ${presented.slice(0, 32)}`);
		this.name = 'InvalidCursor';
	}
}

/**
 * base64url, not base64.
 *
 * A cursor travels in a query string, and base64's `+` and `/` are `space` and
 * a path separator there. Callers who forget to escape produce a cursor that
 * works in tests and fails in the field, so we hand them one that has nothing
 * needing escaped in the first place.
 */
export function encodeCursor(cursor: Cursor): string {
	return Buffer.from(JSON.stringify([cursor.seq, cursor.id])).toString('base64url');
}

export function decodeCursor(presented: string): Cursor {
	let parsed: unknown;

	try {
		parsed = JSON.parse(Buffer.from(presented, 'base64url').toString('utf8'));
	} catch {
		throw new InvalidCursor(presented);
	}

	/*
	 * Validated as strictly as anything else that arrives from outside.
	 *
	 * A cursor is user input. It reaches a SQL comparison, and while these values
	 * are bound as parameters rather than interpolated, a `seq` of `"1 OR 1=1"`
	 * arriving as a string is the kind of thing that stops being harmless the day
	 * somebody builds a query out of it in a hurry.
	 */
	if (!Array.isArray(parsed) || parsed.length !== 2) throw new InvalidCursor(presented);

	const [seq, id] = parsed as [unknown, unknown];

	if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) {
		throw new InvalidCursor(presented);
	}
	if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
		throw new InvalidCursor(presented);
	}

	return { seq, id };
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                       */
/* -------------------------------------------------------------------------- */

export interface Page<T> {
	readonly data: readonly T[];
	/** The cursor to pass as `?cursor=` for the next page, or `null` at the end. */
	readonly nextCursor: string | null;
	readonly hasMore: boolean;
}

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

/**
 * Clamp a client-supplied limit into something the venue will actually serve.
 *
 * Clamping rather than rejecting: a client asking for 10,000 rows has made a
 * reasonable request that we decline to serve in full, and giving them 200 with
 * a cursor is more useful than a 400. Anything unparseable falls back to the
 * default for the same reason.
 */
export function clampLimit(requested: string | number | null | undefined): number {
	if (requested === null || requested === undefined || requested === '') return DEFAULT_LIMIT;

	const value = typeof requested === 'number' ? requested : Number(requested);
	if (!Number.isFinite(value)) return DEFAULT_LIMIT;

	return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

/**
 * Turn `limit + 1` rows into a page of `limit`.
 *
 * The extra row is the trick that makes `hasMore` honest without a second
 * `COUNT(*)` query. Ask for one more than you will return: if it arrives, there
 * is another page; either way you throw it away before answering.
 *
 * The alternative — counting the whole table — is a full scan on every request
 * to compute a number that is stale by the time it is serialised.
 */
export function pageFrom<T>(
	rows: readonly T[],
	limit: number,
	cursorOf: (row: T) => Cursor
): Page<T> {
	const hasMore = rows.length > limit;
	const data = hasMore ? rows.slice(0, limit) : rows;
	const last = data[data.length - 1];

	return {
		data,
		hasMore,
		nextCursor: hasMore && last !== undefined ? encodeCursor(cursorOf(last)) : null
	};
}

/* -------------------------------------------------------------------------- */
/* The SQL half                                                                */
/* -------------------------------------------------------------------------- */

export type Direction = 'newest_first' | 'oldest_first';

/**
 * The `WHERE` fragment and arguments that resume from a cursor.
 *
 * Returns a fragment rather than a whole query because every caller has
 * different columns to select and different filters to apply — and because a
 * function that builds the entire statement ends up taking the table name as a
 * string, which is how a query builder becomes an injection surface.
 *
 * The comparison is on the **pair**, written as `(seq, id) < (?, ?)` in the
 * expanded form SQLite understands. Comparing only `seq` would drop every row
 * that shares a seq with the last one on the previous page — which, for a
 * command that produced four trades, means losing three of them at a page
 * boundary and nowhere else.
 */
export function cursorClause(
	cursor: Cursor | undefined,
	direction: Direction,
	columns: { seq: string; id: string } = { seq: 'seq', id: 'id' }
): { sql: string; args: Array<number | string> } {
	if (!cursor) return { sql: '', args: [] };

	const { seq, id } = columns;

	return direction === 'newest_first'
		? {
				sql: `AND (${seq} < ? OR (${seq} = ? AND ${id} < ?))`,
				args: [cursor.seq, cursor.seq, cursor.id]
			}
		: {
				sql: `AND (${seq} > ? OR (${seq} = ? AND ${id} > ?))`,
				args: [cursor.seq, cursor.seq, cursor.id]
			};
}

export function orderClause(
	direction: Direction,
	columns: { seq: string; id: string } = { seq: 'seq', id: 'id' }
): string {
	return direction === 'newest_first'
		? `ORDER BY ${columns.seq} DESC, ${columns.id} DESC`
		: `ORDER BY ${columns.seq} ASC, ${columns.id} ASC`;
}
