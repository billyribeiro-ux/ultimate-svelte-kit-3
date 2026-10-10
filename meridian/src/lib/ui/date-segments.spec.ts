import { describe, expect, it } from 'vitest';
import { segmentAttributes } from './date-segments.ts';

/*
 * The props Bits UI computes for a segment, as far as these attributes go:
 * the English it writes, which `segmentAttributes` is spread over.
 */
const bits = (valuetext: string) => ({
	role: 'spinbutton',
	'aria-label': 'day, ',
	'aria-valuetext': valuetext
});

describe('segmentAttributes', () => {
	it('names the part in the page’s language, from the browser’s own data', () => {
		expect(segmentAttributes(bits('Empty'), 'day', { locale: 'de', empty: 'Leer' })).toMatchObject({
			'aria-label': 'Tag, '
		});
		expect(
			segmentAttributes(bits('Empty'), 'month', { locale: 'pt-BR', empty: 'Vazio' })
		).toMatchObject({ 'aria-label': 'mês, ' });
	});

	it('says "Empty" in the page’s language, and marks it for the stylesheet', () => {
		const empty = segmentAttributes(bits('Empty'), 'day', { locale: 'de', empty: 'Leer' });
		expect(empty['aria-valuetext']).toBe('Leer');
		expect(empty['data-empty']).toBe('');

		// A typed value is left as Bits wrote it, and is not a placeholder.
		const typed = segmentAttributes(bits('3'), 'day', { locale: 'de', empty: 'Leer' });
		expect(typed['aria-valuetext']).toBe('3');
		expect(typed['data-empty']).toBeUndefined();
	});

	it('points an invalid segment at the issue line under the field', () => {
		const invalid = segmentAttributes(bits('3'), 'day', {
			locale: 'en',
			empty: 'Empty',
			issueId: 'issue-1'
		});
		expect(invalid['aria-invalid']).toBe('true');
		expect(invalid['aria-describedby']).toBe('issue-1');

		const valid = segmentAttributes(bits('3'), 'day', { locale: 'en', empty: 'Empty' });
		expect(valid['aria-invalid']).toBeUndefined();
		expect(valid['aria-describedby']).toBeUndefined();
	});

	it('leaves the separators alone', () => {
		expect(segmentAttributes({}, 'literal', { locale: 'de', empty: 'Leer' })).toEqual({});
	});
});
