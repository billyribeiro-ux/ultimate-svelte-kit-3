/**
 * EXPENSES
 * ========
 *
 * `addExpense` is a `form`, and a form's values arrive as what a form
 * sends: strings, unless the field was rendered with `fields.amount.as('number')`,
 * in which case SvelteKit coerces it before the schema runs, and a set of
 * checkboxes rendered with `fields.participants.as('checkbox', id)` arrives
 * as a `string[]`. The schema — `ExpenseFormSchema`, in `domain/schemas.ts`
 * because the browser runs it too, as the form's preflight — is therefore
 * *typed* by the form, and the component's `as()` calls are checked against
 * it: a checkbox for a field the schema says is a number is a compile error.
 *
 * The amount is converted to minor units here, once, with the trip's
 * currency — the form never sees cents, and the database never sees a float.
 */

import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import { command, form, requested } from '$app/server';
import { and, eq } from 'drizzle-orm';
import { toMinor } from '#lib/domain/money.ts';
import { ExpenseFormSchema, IdSchema } from '#lib/domain/schemas.ts';
import { m } from '#lib/paraglide/messages.js';
import { bump, requireMember } from '#lib/server/access.ts';
import { db, schema } from '#lib/server/db/index.ts';
import { tripBySlug } from './trips.remote.ts';

export const addExpense = form(
	// Shared with the browser, which runs it as a preflight before sending anything.
	ExpenseFormSchema,
	async (data, issue) => {
		const { trip } = await requireMember(data.tripId, 'editor');

		// Only companions can pay or share. Anything else is a stale form.
		const members = await db.query.member.findMany({
			where: eq(schema.member.tripId, trip.id),
			columns: { userId: true }
		});
		const ids = new Set(members.map((member) => member.userId));
		if (!ids.has(data.paidBy)) invalid(issue.paidBy(m.issue_payer_not_member()));
		const participants = data.participants.filter((id) => ids.has(id));
		// `invalid` with a field-bound issue lands under that field in the form.
		if (participants.length === 0) invalid(issue.participants(m.issue_participants_member()));

		await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(schema.expense)
				.values({
					tripId: trip.id,
					title: data.title,
					amountMinor: toMinor(data.amount, trip.currency),
					currency: trip.currency,
					category: data.category,
					date: data.date,
					paidBy: data.paidBy
				})
				.returning({ id: schema.expense.id });
			await tx
				.insert(schema.expenseShare)
				.values(participants.map((userId) => ({ expenseId: row!.id, userId, weight: 1 })));
		});

		await bump(trip.id);
		await requested(tripBySlug, 1).refreshAll();
	}
);

export const removeExpense = command(
	v.object({ tripId: IdSchema, id: IdSchema }),
	async ({ tripId, id }) => {
		await requireMember(tripId, 'editor');
		await db
			.delete(schema.expense)
			.where(and(eq(schema.expense.id, id), eq(schema.expense.tripId, tripId)));
		await bump(tripId);
	}
);
