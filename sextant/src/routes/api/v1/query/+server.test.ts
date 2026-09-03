import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { _RequestSchema } from './+server.ts';

/**
 * THE READ API'S BODY CONTRACT, TESTED FROM NEXT DOOR
 * ===================================================
 *
 * This file is `+server.test.ts` and it sits beside `+server.ts`, which until
 * SvelteKit 3.0.0-next.19 was not possible: every `+`-prefixed file under
 * `src/routes` was a route, so this one would have been treated as an endpoint
 * exporting `describe` and `it`, and `svelte-kit sync` would have failed. Files
 * whose names contain `.test.`, `.spec.` or `.stories.` are now skipped when the
 * route table is built.
 *
 * That is worth using rather than noting. A schema is a contract with people
 * writing scripts against a documented endpoint, and its *defaults* are the part
 * of it nobody reads and everybody depends on — `maxRows` quietly becoming 20,000
 * would turn one scheduled report into an outage. Those belong in a fast unit
 * test, next to the thing they describe, rather than in an end-to-end run that
 * boots a browser to check a number.
 *
 * The end-to-end tests in `e2e/query-api.e2e.ts` still exist and still matter:
 * they cover authentication, scopes and the `QUERY` method reaching the handler.
 * This covers the shape of what that handler is handed.
 */

/** Parse or throw — every case below is meant to succeed or to be caught. */
function parse(body: unknown) {
	return v.parse(_RequestSchema, body);
}

describe('defaults', () => {
	it('fills in the range and the row ceiling', () => {
		const parsed = parse({ q: 'from logs' });

		// `-1h` and 1,000 are the documented defaults. A change here is a change to
		// what every existing script does, without those scripts changing.
		expect(parsed.range).toBe('-1h');
		expect(parsed.maxRows).toBe(1_000);
	});

	it('leaves what the caller sent alone', () => {
		const parsed = parse({ q: 'from logs', range: '-6h', maxRows: 25 });

		expect(parsed.range).toBe('-6h');
		expect(parsed.maxRows).toBe(25);
	});
});

describe('the query text', () => {
	it('must be there and must not be empty', () => {
		expect(() => parse({})).toThrow();
		expect(() => parse({ q: '' })).toThrow();
	});

	it('says what to do when it is missing', () => {
		// The message is the API's documentation for anybody who got it wrong, so
		// it is asserted rather than left to whatever valibot says by default.
		const result = v.safeParse(_RequestSchema, { q: '' });
		expect(result.success).toBe(false);
		expect(result.issues?.[0]?.message).toBe('Send a query in `q`.');
	});

	it('is bounded, because the body is not a reason to skip a limit', () => {
		expect(() => parse({ q: 'a'.repeat(4_000) })).not.toThrow();
		expect(() => parse({ q: 'a'.repeat(4_001) })).toThrow();
	});
});

describe('maxRows', () => {
	it('is a positive integer', () => {
		expect(() => parse({ q: 'from logs', maxRows: 0 })).toThrow();
		expect(() => parse({ q: 'from logs', maxRows: -1 })).toThrow();
		expect(() => parse({ q: 'from logs', maxRows: 1.5 })).toThrow();
		expect(() => parse({ q: 'from logs', maxRows: '10' })).toThrow();
	});

	it('has a ceiling, so one request cannot ask for the whole table', () => {
		expect(() => parse({ q: 'from logs', maxRows: 20_000 })).not.toThrow();
		expect(() => parse({ q: 'from logs', maxRows: 20_001 })).toThrow();
	});
});

describe('the range', () => {
	it('takes the same expressions the address bar does', () => {
		// Sharing the vocabulary is most of what makes an API feel like the same
		// product; these are the two forms the interface itself produces.
		expect(parse({ q: 'from logs', range: '-15m' }).range).toBe('-15m');
		expect(parse({ q: 'from logs', range: '1730000000000..1730003600000' }).range).toBe(
			'1730000000000..1730003600000'
		);
	});

	it('is bounded too', () => {
		expect(() => parse({ q: 'from logs', range: 'x'.repeat(65) })).toThrow();
	});
});
