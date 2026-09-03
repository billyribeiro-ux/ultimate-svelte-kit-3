import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { DocumentSchema, emptyDocument, parseDocument } from './document.ts';

describe('the document schema', () => {
	it('accepts an empty sheet and a sheet with cells', () => {
		const doc = emptyDocument('Budget');
		doc.cells.push({
			r: 0,
			c: 0,
			i: '=SUM(B1:B3)',
			f: { kind: 'number', decimals: 2, grouping: true }
		});
		expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
	});

	it('refuses what could not have come from this app', () => {
		const bad = (patch: object) =>
			v.safeParse(DocumentSchema, { ...emptyDocument(), ...patch }).success;
		expect(bad({ version: 2 })).toBe(false);
		expect(bad({ cells: [{ r: -1, c: 0, i: 'x' }] })).toBe(false);
		expect(bad({ cells: [{ r: 0, c: 0, i: 'x'.repeat(9000) }] })).toBe(false);
		expect(
			bad({
				cells: [{ r: 0, c: 0, i: 'x', f: { kind: 'currency', currency: 'usd', decimals: 2 } }]
			})
		).toBe(false);
		expect(bad({ frozen: { rows: 99, cols: 0 } })).toBe(false);
		expect(bad({ columns: { '0': 5 } })).toBe(false);
	});
});
