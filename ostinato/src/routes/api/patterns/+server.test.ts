import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { _SearchSchema } from './+server.ts';

/**
 * A test file beside a route. Until SvelteKit 3.0.0-next.19 every `+`-prefixed
 * file under `src/routes` was a route, so this would have been an endpoint
 * exporting `describe`. Files with `.test.`, `.spec.` or `.stories.` in their
 * names are now skipped by the router, and a schema's defaults — the part of
 * an API nobody reads and everybody depends on — get a fast unit test next to
 * the thing they describe.
 */

const parse = (body: unknown) => v.parse(_SearchSchema, body);

describe('the search body', () => {
	it('has documented defaults', () => {
		const parsed = parse({});
		expect(parsed.sort).toBe('new');
		expect(parsed.limit).toBe(24);
		expect(parsed.bpm).toEqual({ min: 40, max: 240 });
	});

	it('fills in one end of a tempo range', () => {
		expect(parse({ bpm: { min: 120 } }).bpm).toEqual({ min: 120, max: 240 });
		expect(parse({ bpm: { max: 100 } }).bpm).toEqual({ min: 40, max: 100 });
	});

	it('bounds everything a caller could inflate', () => {
		expect(() => parse({ limit: 61 })).toThrow();
		expect(() => parse({ limit: 0 })).toThrow();
		expect(() => parse({ q: 'x'.repeat(81) })).toThrow();
		expect(() => parse({ bpm: { min: 10 } })).toThrow();
		expect(() => parse({ sort: 'random' })).toThrow();
	});

	it('trims the needle', () => {
		expect(parse({ q: '  boom  ' }).q).toBe('boom');
	});
});
