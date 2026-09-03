import { describe, expect, it } from 'vitest';
import { completionsAt, type Catalogue } from './completion.ts';
import { highlight, marks, splitAt } from './highlight.ts';

const catalogue: Catalogue = {
	source: 'logs',
	services: ['payments-api', 'payments-worker', 'checkout']
};

/**
 * The caret is written as `$` in the query, and stripped before the call.
 *
 * `$` rather than the `|` these helpers originally used, because `|` is the
 * pipe operator and every query in this file contains several — so the marker
 * was found at the first stage boundary and every test measured completion in
 * the wrong place. A marker for a language has to be a character the language
 * does not use.
 */
function at(withCaret: string) {
	const cursor = withCaret.indexOf('$');
	if (cursor === -1) throw new Error('mark the caret with $');
	const source = withCaret.slice(0, cursor) + withCaret.slice(cursor + 1);
	return completionsAt(source, cursor, catalogue);
}

function labels(withCaret: string): string[] {
	return at(withCaret).items.map((item) => item.label);
}

describe('completion', () => {
	it('offers the three sources after `from`', () => {
		expect(labels('from $')).toEqual(['logs', 'metrics', 'spans']);
	});

	it('narrows to what has been typed', () => {
		expect(labels('from lo$')).toEqual(['logs']);
	});

	it('offers stages after a pipe', () => {
		expect(labels('from logs | $')).toEqual(['project', 'sort', 'summarize', 'take', 'where']);
	});

	it('offers columns and scalar functions inside `where`', () => {
		const items = labels('from logs | where $');
		expect(items).toContain('service');
		expect(items).toContain('level');
		expect(items).toContain('strlen');
	});

	/**
	 * The rule that makes the list worth reading.
	 *
	 * An aggregate outside `summarize` always fails the check, so offering it is
	 * offering something that cannot work — which is worse than offering nothing,
	 * because a completion list reads as a list of things that are allowed.
	 */
	it('hides aggregates outside summarize and shows them inside it', () => {
		expect(labels('from logs | where $')).not.toContain('count');
		expect(labels('from logs | summarize $')).toContain('count');
	});

	it('hides aggregates after `by`, where only grouping keys are legal', () => {
		const items = labels('from logs | summarize n = count() by $');
		expect(items).not.toContain('count');
		expect(items).toContain('service');
	});

	it('completes service names on the right of a comparison', () => {
		expect(labels('from logs | where service == $')).toEqual([
			'checkout',
			'payments-api',
			'payments-worker'
		]);
	});

	it('keeps completing services inside an `in` list', () => {
		expect(labels('from logs | where service in ["checkout", $')).toContain('payments-api');
	});

	it('filters service names by the partial string being typed', () => {
		expect(labels('from logs | where service == "payments-w$')).toEqual(['payments-worker']);
	});

	/**
	 * No value list for a column that has no small one.
	 *
	 * `message` is free text: a distinct-values query on it is a full scan on every
	 * keystroke and would return a list as long as the data.
	 */
	it('offers nothing for a free-text column', () => {
		expect(labels('from logs | where message == $')).toEqual([]);
	});

	it('offers a direction after a sort key', () => {
		expect(labels('from logs | sort duration $')).toEqual(['asc', 'desc']);
	});

	it('puts the caret inside a function that takes arguments and past one that does not', () => {
		const items = at('from logs | summarize $').items;
		const count = items.find((item) => item.label === 'count')!;
		const avg = items.find((item) => item.label === 'avg')!;

		expect(count.insert).toBe('count()');
		expect(count.caret).toBe('count()'.length);
		expect(avg.insert).toBe('avg()');
		expect(avg.caret).toBe('avg('.length);
	});

	it('replaces exactly the word under the caret', () => {
		const result = at('from logs | where serv$');
		expect(result.prefix).toBe('serv');
		expect(result.from).toBe('from logs | where '.length);
	});

	/**
	 * The property that makes this work at all: it never throws.
	 *
	 * Completion runs on text that is, by definition, half-typed. A parser-based
	 * implementation has to have an answer for every broken intermediate state; a
	 * token-based one simply does.
	 */
	it('survives every prefix of a real query', () => {
		const query = 'from logs | where service == "checkout" and duration > 250ms | take 10';
		for (let i = 0; i <= query.length; i += 1) {
			expect(() => completionsAt(query.slice(0, i), i, catalogue)).not.toThrow();
		}
	});

	it('survives an unterminated string', () => {
		expect(() => completionsAt('from logs | where service == "pay', 32, catalogue)).not.toThrow();
	});
});

describe('highlight', () => {
	/**
	 * The contract the overlay depends on.
	 *
	 * The highlighted copy sits underneath a transparent textarea, positioned by
	 * nothing but the text itself. One dropped character and every character after
	 * it is out of step with the caret.
	 */
	it('concatenates back to the exact source', () => {
		const sources = [
			'from logs',
			'from logs | where service == "a | b" | take 5',
			'  from   logs  ',
			'from logs | where x == 1e-5',
			'from logs | where s == "unterminated',
			''
		];

		for (const source of sources) {
			expect(
				highlight(source)
					.map((chunk) => chunk.text)
					.join('')
			).toBe(source);
		}
	});

	it('does not colour a pipe inside a string', () => {
		const chunks = highlight('where m == "a | b"');
		const string = chunks.find((chunk) => chunk.category === 'string');
		expect(string?.text).toBe('"a | b"');
		// One pipe token in the source text, and it is inside the string, so no
		// chunk is categorised as punctuation.
		expect(chunks.some((chunk) => chunk.category === 'punctuation')).toBe(false);
	});

	it('separates keywords, functions and identifiers', () => {
		const chunks = highlight('summarize avg(duration) by service');
		const byCategory = (category: string) =>
			chunks.filter((chunk) => chunk.category === category).map((chunk) => chunk.text);

		expect(byCategory('keyword')).toEqual(['summarize', 'by']);
		expect(byCategory('function')).toEqual(['avg']);
		expect(byCategory('ident')).toEqual(['duration', 'service']);
	});
});

describe('splitAt', () => {
	it('splits inside a chunk without losing a character', () => {
		const chunks = highlight('from logs');
		const [before, after] = splitAt(chunks, 6);

		expect(before.map((chunk) => chunk.text).join('')).toBe('from l');
		expect(after.map((chunk) => chunk.text).join('')).toBe('ogs');
	});

	it('handles both ends', () => {
		const chunks = highlight('from logs');
		expect(splitAt(chunks, 0)[0]).toEqual([]);
		expect(splitAt(chunks, 9)[1]).toEqual([]);
	});
});

describe('marks', () => {
	it('covers the source exactly', () => {
		const source = 'from logs | where nope == 1';
		const result = marks(source, [{ start: 18, end: 22 }]);

		expect(result.map((chunk) => chunk.text).join('')).toBe(source);
		expect(result.filter((chunk) => chunk.marked).map((chunk) => chunk.text)).toEqual(['nope']);
	});

	/**
	 * Two overlapping wavy underlines draw twice, one pixel apart, which reads as a
	 * rendering fault rather than as an error.
	 */
	it('merges overlapping ranges', () => {
		const result = marks('abcdefgh', [
			{ start: 1, end: 4 },
			{ start: 3, end: 6 }
		]);

		expect(result.filter((chunk) => chunk.marked).map((chunk) => chunk.text)).toEqual(['bcdef']);
	});

	it('gives a zero-width error at least one character to underline', () => {
		const result = marks('abc', [{ start: 3, end: 3 }]);
		expect(result.filter((chunk) => chunk.marked)).toHaveLength(1);
	});
});

describe('replacement range', () => {
	/**
	 * A hyphen is a word character inside a string and an operator outside one.
	 *
	 * The first version of this walked back over `[A-Za-z0-9_.]` and stopped at the
	 * hyphen, so accepting `payments-worker` at the caret below produced
	 * `"payments-payments-worker"`. It passed every test in this file, because none
	 * of the fixtures had a hyphen in a partially typed name — which is the whole
	 * argument for writing the fixture that does.
	 */
	it('replaces the whole string literal, hyphens included', () => {
		const result = at('from logs | where service == "payments-w$');
		expect(result.from).toBe('from logs | where service == '.length);
		expect(result.prefix).toBe('"payments-w');

		const source = 'from logs | where service == "payments-w';
		const item = result.items[0]!;
		expect(source.slice(0, result.from) + item.insert).toBe(
			'from logs | where service == "payments-worker"'
		);
	});

	it('leaves an identifier alone', () => {
		const result = at('from logs | where serv$');
		expect(result.prefix).toBe('serv');
	});
});
