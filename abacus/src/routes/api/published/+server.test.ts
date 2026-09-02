import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { _SearchSchema } from './+server.ts';

/**
 * A test beside a route. Since SvelteKit 3.0.0-next.19 a `+` file with
 * `.test.` in its name is not a route, so a schema's defaults get a fast
 * unit test next to the thing they describe.
 */
const parse = (body: unknown) => v.parse(_SearchSchema, body);

describe('the search body', () => {
	it('has documented defaults and bounds', () => {
		expect(parse({})).toEqual({ limit: 20 });
		expect(parse({ q: '  budget ' }).q).toBe('budget');
		expect(() => parse({ limit: 51 })).toThrow();
		expect(() => parse({ limit: 0 })).toThrow();
		expect(() => parse({ q: 'x'.repeat(81) })).toThrow();
	});
});
