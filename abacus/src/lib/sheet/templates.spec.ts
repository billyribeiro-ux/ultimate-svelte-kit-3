import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { Engine } from '#lib/engine/engine.ts';
import { ErrorValue } from '#lib/formula/values.ts';
import { DocumentSchema } from './document.ts';
import { TEMPLATE_SLUGS, templateDocument } from './templates.ts';

describe('the templates', () => {
	it.each(TEMPLATE_SLUGS)('%s is a valid document whose formulas all evaluate', (slug) => {
		const doc = templateDocument(slug);
		expect(v.safeParse(DocumentSchema, doc).success).toBe(true);

		const engine = new Engine();
		engine.apply(doc.cells.map((c) => ({ row: c.r, col: c.c, input: c.i, format: c.f })));
		for (const [, cell] of engine.cells) {
			expect(cell.error, `${cell.input}`).toBeNull();
			expect(cell.value, `${cell.input}`).not.toBeInstanceOf(ErrorValue);
		}
	});

	it('gets the loan arithmetic right', () => {
		const doc = templateDocument('loan');
		const engine = new Engine();
		engine.apply(doc.cells.map((c) => ({ row: c.r, col: c.c, input: c.i, format: c.f })));
		expect(engine.value(3, 1)).toBeCloseTo(765.09, 2); // the monthly payment
		expect(engine.value(42, 4)).toBe(0); // the balance after the last month
	});
});
