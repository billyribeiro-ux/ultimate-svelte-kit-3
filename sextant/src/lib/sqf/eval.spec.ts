import { describe, expect, it } from 'vitest';
import { check } from './check.ts';
import { evaluate } from './eval.ts';
import { parse } from './parser.ts';
import type { Row, Value } from './value.ts';
import { seeded } from '#lib/sketch/testing.ts';

/**
 * Parse, check and run — the whole pipeline, over rows that match the real
 * schema. Fails loudly on a query the tests thought was valid.
 */
function run(source: string, rows: readonly Row[]) {
	const { query, errors } = parse(source);
	expect(errors.map((e) => e.message)).toEqual([]);
	expect(check(query!).errors.map((e) => e.message)).toEqual([]);
	return evaluate(query!, rows);
}

/**
 * Parse and run, without the checker.
 *
 * The evaluator is a separate component from the checker and has to work on
 * whatever rows it is handed — the storage layer produces rows whose columns
 * come from a `project`, and a rollup produces columns that exist in no table.
 * Testing value semantics through the checker would mean every test about
 * three-valued logic also has to satisfy the `logs` schema, which makes the
 * tests about the schema rather than about the semantics.
 *
 * The full-pipeline tests above use `run`; the semantic ones below use this.
 */
function runRaw(source: string, rows: readonly Row[]) {
	const { query, errors } = parse(source);
	expect(errors.map((e) => e.message)).toEqual([]);
	return evaluate(query!, rows);
}

function columnRaw(source: string, rows: readonly Row[], name: string): Value[] {
	return runRaw(source, rows).rows.map((row) => row[name] ?? null);
}

/** Just the values of one column, which is what most assertions want. */
function column(source: string, rows: readonly Row[], name: string): Value[] {
	return run(source, rows).rows.map((row) => row[name] ?? null);
}

const LOGS: Row[] = [
	{ timestamp: 1_000, service: 'api', level: 'error', message: 'Timeout talking to db', host: 'a' },
	{ timestamp: 2_000, service: 'api', level: 'info', message: 'ok', host: 'a' },
	{ timestamp: 3_000, service: 'web', level: 'error', message: 'upstream TIMEOUT', host: 'b' },
	{ timestamp: 4_000, service: 'web', level: 'warn', message: 'slow', host: 'b' },
	{ timestamp: 5_000, service: 'api', level: 'error', message: 'boom', host: 'c' }
];

describe('filtering', () => {
	it('keeps matching rows', () => {
		expect(column('from logs | where level == "error"', LOGS, 'service')).toEqual([
			'api',
			'web',
			'api'
		]);
	});

	it('combines conditions', () => {
		expect(
			column('from logs | where level == "error" and service == "api"', LOGS, 'message')
		).toEqual(['Timeout talking to db', 'boom']);
	});

	it('matches text case-insensitively', () => {
		// Somebody looking for "Timeout" wants the line that says "TIMEOUT".
		expect(column('from logs | where message contains "timeout"', LOGS, 'host')).toEqual([
			'a',
			'b'
		]);
	});

	it('runs a regular expression', () => {
		expect(column('from logs | where message =~ "^(ok|slow)$"', LOGS, 'level')).toEqual([
			'info',
			'warn'
		]);
	});

	it('treats an invalid pattern as no match rather than throwing', () => {
		/*
		 * A query is edited one character at a time, and `=~ "("` exists for one
		 * keystroke on the way to something valid. Throwing there makes the editor
		 * flash an error on every partial pattern.
		 */
		expect(() => run('from logs | where message =~ "("', LOGS)).not.toThrow();
		expect(run('from logs | where message =~ "("', LOGS).rows).toEqual([]);
	});

	it('handles `in` over a list', () => {
		expect(column('from logs | where level in ["warn", "info"]', LOGS, 'level')).toEqual([
			'info',
			'warn'
		]);
	});
});

describe('missing fields — three-valued logic', () => {
	const MIXED: Row[] = [
		{ id: 1, user: 'ada' },
		{ id: 2, user: 'bob' },
		{ id: 3, user: null },
		{ id: 4 }
	];

	it('does not return rows where the field is absent, even for !=', () => {
		/*
		 * The SQL rule, and the one that surprises people exactly once. A row with
		 * no `user` is neither equal nor unequal to "bob" — the answer is unknown,
		 * and `where` keeps only definite truth.
		 */
		expect(columnRaw('from logs | where user != "bob"', MIXED, 'id')).toEqual([1]);
		expect(columnRaw('from logs | where user == "bob"', MIXED, 'id')).toEqual([2]);
	});

	it('lets `and` short-circuit a false to false rather than unknown', () => {
		// `false and unknown` is false: whatever the unknown turns out to be, the
		// answer cannot be true. Getting this wrong drops rows that should be kept.
		expect(columnRaw('from logs | where id == 99 and user == "ada"', MIXED, 'id')).toEqual([]);
	});

	it('lets `or` short-circuit a true to true', () => {
		expect(columnRaw('from logs | where id == 4 or user == "zzz"', MIXED, 'id')).toEqual([4]);
	});

	it('propagates unknown through `not`', () => {
		expect(columnRaw('from logs | where not (user == "bob")', MIXED, 'id')).toEqual([1]);
	});

	it('treats a list containing null as possibly-matching', () => {
		// A non-match against a list with a null in it is unknown, not false: the
		// null might have been the match.
		expect(columnRaw('from logs | where user in ["zzz", null]', MIXED, 'id')).toEqual([]);
	});
});

describe('attribute bags', () => {
	const SPANS: Row[] = [
		{ service: 'api', duration: 120, attributes: { http: { status: 200 } } },
		{ service: 'api', duration: 900, attributes: { http: { status: 500 } } },
		{ service: 'api', duration: 40, attributes: {} },
		{ service: 'api', duration: 60, attributes: { http: { status: '503' } } }
	];

	it('reads a nested path', () => {
		expect(column('from spans | where attributes.http.status == 500', SPANS, 'duration')).toEqual([
			900
		]);
	});

	it('compares a number against a numeric string from another sender', () => {
		/*
		 * The same field arrives as `500` from one service and `"503"` from another,
		 * because bags are untyped. Refusing to compare them means a filter that
		 * silently misses half the data.
		 */
		expect(column('from spans | where attributes.http.status >= 500', SPANS, 'duration')).toEqual([
			900, 60
		]);
	});

	it('returns null for a path that is not there', () => {
		expect(column('from spans | where attributes.http.status == 200', SPANS, 'duration')).toEqual([
			120
		]);
	});
});

describe('aggregation', () => {
	it('counts by a group', () => {
		const result = run('from logs | summarize n = count() by service', LOGS);
		expect(result.columns).toEqual(['service', 'n']);
		expect(result.rows).toEqual([
			{ service: 'api', n: 3 },
			{ service: 'web', n: 2 }
		]);
	});

	it('counts conditionally', () => {
		expect(
			run('from logs | summarize e = countif(level == "error") by service', LOGS).rows
		).toEqual([
			{ service: 'api', e: 2 },
			{ service: 'web', e: 1 }
		]);
	});

	it('groups by several keys', () => {
		const result = run('from logs | summarize n = count() by service, level', LOGS);
		expect(result.rows).toHaveLength(4);
		expect(result.columns).toEqual(['service', 'level', 'n']);
	});

	it('keeps a number and a numeric string in different groups', () => {
		/*
		 * The opposite of the comparison rule, deliberately. Comparison asks "is
		 * this above the threshold", where coercion helps. Grouping asks "is this
		 * the same thing", and merging two senders' differently-typed values into
		 * one row hides a real difference in a place nothing downstream can recover
		 * it from.
		 */
		const rows: Row[] = [{ code: 500 }, { code: '500' }, { code: 500 }];
		expect(runRaw('from logs | summarize n = count() by code', rows).rows).toEqual([
			{ code: 500, n: 2 },
			{ code: '500', n: 1 }
		]);
	});

	it('does not merge groups whose keys concatenate the same way', () => {
		// ["a|b"] and ["a", "b"] must be different groups. A separator that can
		// appear in a key is a classic way to merge two rows that are not the same.
		const rows: Row[] = [
			{ a: 'x y', b: 'z' },
			{ a: 'x', b: 'y z' }
		];
		expect(runRaw('from logs | summarize n = count() by a, b', rows).rows).toHaveLength(2);
	});

	it('sums, averages and takes extremes', () => {
		const rows: Row[] = [{ v: 10 }, { v: 20 }, { v: 30 }];
		expect(
			runRaw('from logs | summarize s = sum(v), a = avg(v), lo = min(v), hi = max(v)', rows).rows
		).toEqual([{ s: 60, a: 20, lo: 10, hi: 30 }]);
	});

	it('skips nulls in an average rather than counting them as zero', () => {
		// `avg` is the average of the values present, not one diluted by every row
		// that did not have the field.
		const rows: Row[] = [{ v: 10 }, { v: null }, { v: 20 }];
		expect(runRaw('from logs | summarize a = avg(v)', rows).rows).toEqual([{ a: 15 }]);
	});

	it('returns 0 for a sum over nothing and null for an average over nothing', () => {
		/*
		 * A sum over nothing is zero, and a blank "total requests" cell reads as
		 * missing data. An average over nothing is undefined, and showing 0ms
		 * latency for a service with no traffic is the kind of number people page
		 * on.
		 */
		const rows: Row[] = [{ v: null }];
		expect(runRaw('from logs | summarize s = sum(v), a = avg(v)', rows).rows).toEqual([
			{ s: 0, a: null }
		]);
	});

	it('estimates a percentile through the sketch', () => {
		const rows: Row[] = Array.from({ length: 1_000 }, (_, i) => ({ v: i + 1 }));
		const [row] = runRaw('from logs | summarize p = percentile(v, 95)', rows).rows;
		// Within the sketch's 2% relative accuracy of the true 950.
		expect(Math.abs(Number(row!.p) - 950) / 950).toBeLessThan(0.02);
	});

	it('estimates a distinct count', () => {
		const rows: Row[] = Array.from({ length: 5_000 }, (_, i) => ({ u: `user-${i % 700}` }));
		const [row] = runRaw('from logs | summarize d = dcount(u)', rows).rows;
		expect(Math.abs(Number(row!.d) - 700) / 700).toBeLessThan(0.07);
	});
});

describe('projection, sorting and take', () => {
	it('narrows and renames columns', () => {
		const result = run('from logs | project svc = service, lvl = level', LOGS);
		expect(result.columns).toEqual(['svc', 'lvl']);
		expect(result.rows[0]).toEqual({ svc: 'api', lvl: 'error' });
	});

	it('sorts ascending and descending', () => {
		expect(column('from logs | sort by timestamp desc', LOGS, 'timestamp')).toEqual([
			5_000, 4_000, 3_000, 2_000, 1_000
		]);
	});

	it('sorts by several keys', () => {
		const values = run('from logs | sort by service asc, timestamp desc', LOGS).rows.map(
			(row) => `${row.service}:${row.timestamp}`
		);
		expect(values).toEqual(['api:5000', 'api:2000', 'api:1000', 'web:4000', 'web:3000']);
	});

	it('puts nulls last in both directions', () => {
		/*
		 * A sort that leaves missing values wherever they were puts them in the
		 * middle, interrupting whatever the person was scanning for. And "sort by
		 * slowest" should not begin with rows that have no duration at all.
		 */
		const rows: Row[] = [{ v: 2 }, { v: null }, { v: 1 }];
		expect(columnRaw('from logs | sort by v asc', rows, 'v')).toEqual([1, 2, null]);
		expect(columnRaw('from logs | sort by v desc', rows, 'v')).toEqual([2, 1, null]);
	});

	it('takes the first n', () => {
		expect(run('from logs | sort by timestamp desc | take 2', LOGS).rows).toHaveLength(2);
	});
});

describe('arithmetic', () => {
	it('computes', () => {
		const rows: Row[] = [{ a: 10, b: 4 }];
		expect(runRaw('from logs | project x = a + b * 2', rows).rows).toEqual([{ x: 18 }]);
	});

	it('makes division by zero null rather than Infinity', () => {
		// An Infinity propagates through every later aggregate and renders as "∞",
		// which tells nobody anything. A blank cell says "not available".
		const rows: Row[] = [{ a: 1, b: 0 }];
		expect(runRaw('from logs | project x = a / b', rows).rows).toEqual([{ x: null }]);
	});
});

describe('truncation is reported honestly', () => {
	it('says so when a result was cut short', () => {
		const { query } = parse('from logs');
		const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ i }));
		const result = evaluate(query!, rows, { maxRows: 10 });
		expect(result.rows).toHaveLength(10);
		expect(result.truncated).toBe(true);
	});

	it('does not call an explicit take a truncation', () => {
		// `take 5` is what was asked for, not a limit the system imposed.
		const { query } = parse('from logs | take 5');
		const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ i }));
		expect(evaluate(query!, rows, { maxRows: 100 }).truncated).toBe(false);
	});

	it('stops claiming truncation once a summarize has collapsed everything', () => {
		const { query } = parse('from logs | summarize n = count()');
		const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ i }));
		expect(evaluate(query!, rows, { maxRows: 10 }).truncated).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/* The differential test                                               */
/* ------------------------------------------------------------------ */

describe('differential against a naive reference', () => {
	/**
	 * A second implementation of `where` + `sort` + `take`, written as directly as
	 * possible with no shared code.
	 *
	 * The point is not that this one is better — it is deliberately naive. It is
	 * that two implementations written from the same spec disagree in exactly the
	 * places where the spec was ambiguous or one of them was clever, and randomly
	 * generated inputs find those places far faster than a person thinking of
	 * cases does.
	 */
	function reference(rows: readonly Row[], level: string, minTs: number, limit: number): Row[] {
		const kept: Row[] = [];
		for (const row of rows) {
			if (row.level !== level) continue;
			if (typeof row.timestamp !== 'number' || !(row.timestamp > minTs)) continue;
			kept.push(row);
		}
		kept.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
		return kept.slice(0, limit);
	}

	it('agrees with the reference on hundreds of random inputs', () => {
		for (let seed = 1; seed <= 200; seed += 1) {
			const random = seeded(seed);
			const levels = ['debug', 'info', 'warn', 'error'];

			const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({
				timestamp: Math.floor(random() * 10_000),
				service: `svc-${Math.floor(random() * 4)}`,
				level: levels[Math.floor(random() * levels.length)]!,
				i
			}));

			const level = levels[Math.floor(random() * levels.length)]!;
			const minTs = Math.floor(random() * 10_000);
			const limit = 1 + Math.floor(random() * 20);

			const expected = reference(rows, level, minTs, limit);
			const actual = run(
				`from logs | where level == "${level}" and timestamp > ${minTs} | sort by timestamp desc | take ${limit}`,
				rows
			).rows;

			// `i` rather than the whole row, so a failure names which rows differ
			// rather than printing sixty objects.
			expect(
				actual.map((row) => row.i),
				`seed ${seed}`
			).toEqual(expected.map((row) => row.i));
		}
	});

	it('agrees on grouped counts', () => {
		for (let seed = 1; seed <= 100; seed += 1) {
			const random = seeded(seed * 7);
			const rows: Row[] = Array.from({ length: 200 }, () => ({
				service: `svc-${Math.floor(random() * 5)}`
			}));

			const expected = new Map<string, number>();
			for (const row of rows) {
				const key = String(row.service);
				expected.set(key, (expected.get(key) ?? 0) + 1);
			}

			const actual = run('from logs | summarize n = count() by service', rows).rows;

			expect(actual.length, `seed ${seed}`).toBe(expected.size);
			for (const row of actual) {
				expect(row.n, `seed ${seed} ${String(row.service)}`).toBe(
					expected.get(String(row.service))
				);
			}
			// Every row is accounted for — a grouping that loses rows is the failure
			// mode a spot check misses.
			expect(actual.reduce((total, row) => total + Number(row.n), 0)).toBe(rows.length);
		}
	});
});
