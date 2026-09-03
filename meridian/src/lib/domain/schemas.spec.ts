import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { ExpenseInputSchema, StopInputSchema, TripInputSchema } from './schemas.ts';

const ID = '5c2d7f2e-3a44-4c5a-9a1d-1b2c3d4e5f60';

describe('TripInputSchema', () => {
	it('accepts a sensible trip', () => {
		const result = v.safeParse(TripInputSchema, {
			name: '  Iberia  ',
			description: '',
			startDate: '2026-05-10',
			endDate: '2026-05-17',
			currency: 'EUR'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.output.name).toBe('Iberia');
	});

	it('forwards the end-before-start error to endDate', () => {
		const result = v.safeParse(TripInputSchema, {
			name: 'Backwards',
			startDate: '2026-05-17',
			endDate: '2026-05-10',
			currency: 'EUR'
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues[0]?.path?.map((p) => p.key)).toEqual(['endDate']);
		}
	});

	it('rejects an impossible date and an unknown currency', () => {
		expect(
			v.safeParse(TripInputSchema, {
				name: 'x',
				startDate: '2026-02-30',
				endDate: '2026-03-01',
				currency: 'EUR'
			}).success
		).toBe(false);
		expect(
			v.safeParse(TripInputSchema, {
				name: 'x',
				startDate: '2026-02-01',
				endDate: '2026-03-01',
				currency: 'XYZ'
			}).success
		).toBe(false);
	});
});

describe('StopInputSchema', () => {
	it('keeps a stop on the planet', () => {
		const base = { tripId: ID, name: 'Alfama', kind: 'place', lng: -9.13, lat: 38.71, date: null };
		expect(v.safeParse(StopInputSchema, base).success).toBe(true);
		expect(v.safeParse(StopInputSchema, { ...base, lat: 91 }).success).toBe(false);
		expect(v.safeParse(StopInputSchema, { ...base, kind: 'moon' }).success).toBe(false);
	});
});

describe('ExpenseInputSchema', () => {
	it('insists on whole minor units and at least one participant', () => {
		const base = {
			tripId: ID,
			title: 'Dinner',
			amountMinor: 4500,
			category: 'food',
			date: '2026-05-10',
			paidBy: 'ana',
			participants: ['ana', 'ben']
		};
		expect(v.safeParse(ExpenseInputSchema, base).success).toBe(true);
		expect(v.safeParse(ExpenseInputSchema, { ...base, amountMinor: 45.5 }).success).toBe(false);
		expect(v.safeParse(ExpenseInputSchema, { ...base, participants: [] }).success).toBe(false);
	});
});
