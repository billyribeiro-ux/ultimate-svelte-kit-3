import { describe, expect, it } from 'vitest';
import {
	clampLimit,
	cursorClause,
	decodeCursor,
	DEFAULT_LIMIT,
	encodeCursor,
	InvalidCursor,
	MAX_LIMIT,
	orderClause,
	pageFrom
} from './pagination.ts';

describe('cursor encoding', () => {
	it('survives a round trip', () => {
		const cursor = { seq: 8134, id: 'T-0000000000008134-002' };
		expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
	});

	it('produces something safe to put in a query string', () => {
		// base64url has no `+`, `/` or `=`, so no caller can forget to escape it.
		const encoded = encodeCursor({ seq: 999999, id: 'T-0000000000999999-127' });
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('rejects a cursor that is not base64 at all', () => {
		expect(() => decodeCursor('not a cursor!!')).toThrow(InvalidCursor);
	});

	it('rejects a well-formed cursor carrying the wrong shape', () => {
		const hostile = Buffer.from(JSON.stringify({ seq: 1, id: 'x' })).toString('base64url');
		expect(() => decodeCursor(hostile)).toThrow(InvalidCursor);
	});

	it('rejects a seq that is not a number', () => {
		const hostile = Buffer.from(JSON.stringify(['1 OR 1=1', 'x'])).toString('base64url');
		expect(() => decodeCursor(hostile)).toThrow(InvalidCursor);
	});

	it('rejects a negative seq', () => {
		const hostile = Buffer.from(JSON.stringify([-1, 'x'])).toString('base64url');
		expect(() => decodeCursor(hostile)).toThrow(InvalidCursor);
	});

	it('rejects an absurdly long id', () => {
		const hostile = Buffer.from(JSON.stringify([1, 'x'.repeat(500)])).toString('base64url');
		expect(() => decodeCursor(hostile)).toThrow(InvalidCursor);
	});
});

describe('clampLimit', () => {
	it('defaults when nothing was asked for', () => {
		expect(clampLimit(null)).toBe(DEFAULT_LIMIT);
		expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
		expect(clampLimit('')).toBe(DEFAULT_LIMIT);
	});

	it('clamps rather than refusing an oversized request', () => {
		expect(clampLimit(10_000)).toBe(MAX_LIMIT);
	});

	it('never returns less than one', () => {
		expect(clampLimit(0)).toBe(1);
		expect(clampLimit(-5)).toBe(1);
	});

	it('falls back to the default on nonsense', () => {
		expect(clampLimit('banana')).toBe(DEFAULT_LIMIT);
	});

	it('accepts the string a query parameter actually arrives as', () => {
		expect(clampLimit('25')).toBe(25);
	});
});

describe('pageFrom', () => {
	const rows = Array.from({ length: 11 }, (_, index) => ({ seq: index, id: `id-${index}` }));
	const cursorOf = (row: { seq: number; id: string }) => row;

	it('returns exactly the limit and reports more, given limit + 1 rows', () => {
		const page = pageFrom(rows, 10, cursorOf);

		expect(page.data).toHaveLength(10);
		expect(page.hasMore).toBe(true);
		// The extra row is the *probe*: it tells us there is more and is discarded.
		expect(page.data.at(-1)).toEqual({ seq: 9, id: 'id-9' });
	});

	it('cursors from the last returned row, not the probe', () => {
		const page = pageFrom(rows, 10, cursorOf);
		expect(decodeCursor(page.nextCursor!)).toEqual({ seq: 9, id: 'id-9' });
	});

	it('reports the end when fewer than limit + 1 rows came back', () => {
		const page = pageFrom(rows.slice(0, 4), 10, cursorOf);

		expect(page.hasMore).toBe(false);
		expect(page.nextCursor).toBeNull();
		expect(page.data).toHaveLength(4);
	});

	it('handles an empty result without inventing a cursor', () => {
		const page = pageFrom([], 10, cursorOf);

		expect(page.data).toEqual([]);
		expect(page.nextCursor).toBeNull();
	});

	it('treats exactly `limit` rows as the last page', () => {
		// The boundary everybody gets wrong: `limit` rows means there is nothing
		// after them, because we asked for `limit + 1` and did not get it.
		const page = pageFrom(rows.slice(0, 10), 10, cursorOf);
		expect(page.hasMore).toBe(false);
	});
});

describe('cursorClause', () => {
	it('is empty without a cursor, so the first page needs no special case', () => {
		expect(cursorClause(undefined, 'newest_first')).toEqual({ sql: '', args: [] });
	});

	it('compares the pair, not just the sort key', () => {
		const clause = cursorClause({ seq: 100, id: 'T-5' }, 'newest_first');

		// Without the `OR (seq = ? AND id < ?)` half, every row sharing seq 100 with
		// the last row of the previous page would be skipped.
		expect(clause.sql).toContain('seq = ?');
		expect(clause.args).toEqual([100, 100, 'T-5']);
	});

	it('flips the comparison with the direction', () => {
		expect(cursorClause({ seq: 1, id: 'a' }, 'newest_first').sql).toContain('seq < ?');
		expect(cursorClause({ seq: 1, id: 'a' }, 'oldest_first').sql).toContain('seq > ?');
	});

	it('uses the column names it was given', () => {
		const clause = cursorClause({ seq: 1, id: 'a' }, 'newest_first', {
			seq: 'trade.seq',
			id: 'trade.trade_id'
		});

		expect(clause.sql).toContain('trade.trade_id');
	});
});

describe('orderClause', () => {
	it('sorts by the pair so the ordering is total', () => {
		// A sort on a non-unique column has no defined order within a tie, which
		// means the same query can return the same rows in a different order and
		// pagination loses or repeats them.
		expect(orderClause('newest_first')).toBe('ORDER BY seq DESC, id DESC');
		expect(orderClause('oldest_first')).toBe('ORDER BY seq ASC, id ASC');
	});
});
