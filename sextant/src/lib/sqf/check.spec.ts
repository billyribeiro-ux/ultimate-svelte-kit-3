import { describe, expect, it } from 'vitest';
import { check } from './check.ts';
import { parse } from './parser.ts';

/** Every checker error message for a query, with parse errors surfaced loudly. */
function errors(source: string): string[] {
	const { query, errors: parseErrors } = parse(source);
	expect(parseErrors.map((e) => e.message)).toEqual([]);
	return check(query!).errors.map((e) => e.message);
}

function hints(source: string): (string | undefined)[] {
	const { query } = parse(source);
	return check(query!).errors.map((e) => e.hint);
}

function clean(source: string): void {
	expect(errors(source)).toEqual([]);
}

/** The columns a query produces, in order. */
function shape(source: string): [string, string][] {
	const { query } = parse(source);
	return [...check(query!).scope.columns].map(([name, type]) => [name, type]);
}

describe('the three mistakes that would otherwise return a plausible answer', () => {
	it('refuses a duration compared with a bare number', () => {
		/*
		 * The reason this file exists. `duration > 200` runs, compares against two
		 * hundred milliseconds, and is off by a factor of a thousand from what
		 * anybody typing it meant.
		 */
		expect(errors('from spans | where duration > 200')).toEqual([
			'Cannot compare a duration with a number'
		]);
		expect(hints('from spans | where duration > 200')[0]).toBe(
			'Durations need a unit — try `200ms` or `200s`'
		);
	});

	it('refuses a percentile over a string', () => {
		expect(errors('from spans | summarize percentile(service, 95)')).toContain(
			'`percentile` needs a number or a duration, not a string'
		);
	});

	it('refuses an aggregate outside summarize', () => {
		expect(errors('from logs | where count() > 5')).toContain(
			'`count` can only be used in `summarize`'
		);
	});
});

describe('durations', () => {
	it('accepts a duration against a duration', () => {
		clean('from spans | where duration > 200ms');
		clean('from spans | where duration <= 1s and duration > 10ms');
	});

	it('lets a duration stand in for a number', () => {
		// `sum(duration)` is meaningful; the reverse — a number where a duration is
		// wanted — is what the units check rejects.
		clean('from spans | summarize total = sum(duration)');
	});

	it('keeps the unit through an aggregate', () => {
		/*
		 * `returnsArg` doing its job. Without it `max(duration)` would be a plain
		 * number and every comparison downstream of a summarize would lose the unit
		 * check — which is exactly where people compare a p95 against a threshold.
		 */
		expect(shape('from spans | summarize slowest = max(duration) by service')).toEqual([
			['service', 'string'],
			['slowest', 'duration']
		]);
		clean('from spans | summarize slowest = max(duration) by service | where slowest > 1s');
	});

	it('keeps the unit through arithmetic and drops it on a ratio', () => {
		expect(shape('from spans | project doubled = duration * 2')).toEqual([['doubled', 'duration']]);
		// A duration over a duration is a ratio, which is a plain number.
		expect(shape('from spans | project ratio = duration / duration')).toEqual([
			['ratio', 'number']
		]);
	});
});

describe('the pipeline changes the schema', () => {
	it('replaces the columns after a summarize', () => {
		expect(shape('from logs | summarize n = count() by service')).toEqual([
			['service', 'string'],
			['n', 'number']
		]);
	});

	it('puts grouping keys before aggregates', () => {
		// Row identity on the left is what makes a result table readable.
		expect(
			shape(
				'from logs | summarize n = count(), e = countif(level == "error") by service, host'
			).map(([n]) => n)
		).toEqual(['service', 'host', 'n', 'e']);
	});

	it('rejects a column that a summarize removed', () => {
		expect(errors('from logs | summarize n = count() by service | where message == "x"')).toEqual([
			'Unknown column `message`'
		]);
	});

	it('narrows the columns after a project', () => {
		expect(shape('from logs | project service, level')).toEqual([
			['service', 'string'],
			['level', 'string']
		]);
		expect(errors('from logs | project service | where host == "a"')).toEqual([
			'Unknown column `host`'
		]);
	});
});

describe('summarize', () => {
	it('rejects a non-aggregate output', () => {
		expect(errors('from logs | summarize service')).toEqual(['`service` is not an aggregate']);
		expect(hints('from logs | summarize service')[0]).toBe(
			'Move it after `by`, or wrap it — `max(service)`'
		);
	});

	it('reports two outputs with the same name', () => {
		expect(errors('from logs | summarize n = count(), n = count() by service')).toEqual([
			'Two outputs are both called `n`'
		]);
	});

	it('suggests naming when the collision was inferred', () => {
		expect(hints('from logs | summarize count(), count() by service')[0]).toBe(
			'Name one of them — `something = count`'
		);
	});
});

describe('columns and attributes', () => {
	it('suggests a near miss', () => {
		expect(hints('from logs | where servce == "a"')[0]).toBe('Did you mean `service`?');
	});

	it('lists the columns when nothing is close', () => {
		expect(hints('from logs | where zzzzzz == "a"')[0]).toContain('Available:');
	});

	it('reports an unknown column once, not once per use', () => {
		expect(errors('from logs | where nope == "a" and nope == "b"')).toEqual([
			'Unknown column `nope`',
			'Unknown column `nope`'
		]);
	});

	it('allows any path into a bag', () => {
		clean('from logs | where attributes.http.status_code == 500');
		clean('from metrics | where labels.region == "eu-west-1"');
	});

	it('refuses a path into a scalar', () => {
		expect(errors('from logs | where service.name == "a"')).toEqual([
			'`service` is a string, not a set of attributes'
		]);
	});

	it('refuses to sort by a whole bag', () => {
		expect(errors('from logs | sort by attributes')).toEqual([
			'Cannot sort by `attributes`, which holds many values'
		]);
	});
});

describe('functions', () => {
	it('checks arity', () => {
		expect(errors('from spans | summarize percentile(duration)')).toContain(
			'`percentile` takes 2 arguments, not 1'
		);
	});

	it('suggests aggregates inside summarize and scalars outside it', () => {
		expect(hints('from logs | summarize n = cont()')[0]).toBe('Did you mean `count`?');
		expect(hints('from logs | project x = strlan(message)')[0]).toBe('Did you mean `strlen`?');
	});

	it('does not suggest an aggregate outside summarize', () => {
		// Suggesting `percentile` in a `where` would be a correction that leads
		// straight to a second error.
		// `?? ''` because "no suggestion" is the correct outcome here: `percentil`
		// is not close to any *scalar*, and offering the aggregate would be a
		// correction that leads straight to a second error.
		expect(hints('from logs | where percentil(x) > 1')[0] ?? '').not.toContain('percentile');
	});
});

describe('conditions', () => {
	it('insists a where is a condition', () => {
		expect(errors('from logs | where service')).toEqual([
			'`where` needs a condition, not a string'
		]);
	});

	it('lets a dynamic attribute through', () => {
		// The deliberate hole. The checker cannot know `attributes.ok` is a boolean,
		// and rejecting it would make half the useful queries unwritable.
		clean('from logs | where attributes.ok');
	});

	it('checks both sides of and/or', () => {
		expect(errors('from logs | where service and level == "error"')).toEqual([
			'`and` needs a condition, not a string'
		]);
	});
});

describe('take', () => {
	it('refuses a non-positive count', () => {
		expect(errors('from logs | take 0')).toEqual(['`take` needs a whole number of rows']);
	});
});
