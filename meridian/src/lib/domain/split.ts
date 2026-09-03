/**
 * WHO OWES WHOM
 * =============
 *
 * Three questions, three functions, all on integers:
 *
 *   `shares`    — one expense, split by weight, to the cent, with the
 *                 leftover cents handed out by largest remainder so the
 *                 parts always sum to the whole;
 *   `balances`  — everything paid minus everything owed, per person;
 *   `settle`    — the transfers that clear the balances, greedily pairing
 *                 the biggest debtor with the biggest creditor, which gives
 *                 at most `people − 1` transfers.
 *
 * The greedy answer is not always the *minimum* number of transfers — that
 * problem is NP-hard in general — but for a trip of six it is the answer a
 * person would write down, and it is deterministic, which is what the tests
 * and the two browsers looking at the same page need.
 */

export interface Share {
	readonly userId: string;
	/** Relative weight: 1 for an even split, 2 for somebody who ate for two. */
	readonly weight: number;
}

/** The minor units each participant owes for one expense. */
export function shares(amountMinor: number, participants: readonly Share[]): Map<string, number> {
	if (!Number.isInteger(amountMinor) || amountMinor < 0) {
		throw new RangeError('amount must be a non-negative integer of minor units');
	}
	const totalWeight = participants.reduce((sum, p) => sum + p.weight, 0);
	if (participants.length === 0 || totalWeight <= 0) {
		throw new RangeError('at least one participant with positive weight is needed');
	}

	const exact = participants.map((p) => (amountMinor * p.weight) / totalWeight);
	const floors = exact.map(Math.floor);
	let leftover = amountMinor - floors.reduce((sum, n) => sum + n, 0);

	/*
	 * Largest remainder: whoever was rounded down the most gets the next cent.
	 * Ties break on user id so two servers agree — the alternative, "whoever
	 * came first", depends on the order the rows came back.
	 */
	const order = participants
		.map((p, i) => ({ i, remainder: exact[i]! - floors[i]!, id: p.userId }))
		.sort((a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : 1));

	for (const { i } of order) {
		if (leftover <= 0) break;
		floors[i] = floors[i]! + 1;
		leftover -= 1;
	}

	return new Map(participants.map((p, i) => [p.userId, floors[i]!]));
}

export interface ExpenseLike {
	readonly amountMinor: number;
	readonly paidBy: string;
	readonly shares: readonly Share[];
}

/** Per person: positive is owed money, negative owes it. Sums to zero. */
export function balances(expenses: readonly ExpenseLike[]): Map<string, number> {
	const out = new Map<string, number>();
	const add = (id: string, delta: number) => out.set(id, (out.get(id) ?? 0) + delta);

	for (const expense of expenses) {
		add(expense.paidBy, expense.amountMinor);
		for (const [userId, owed] of shares(expense.amountMinor, expense.shares)) {
			add(userId, -owed);
		}
	}

	return out;
}

export interface Transfer {
	readonly from: string;
	readonly to: string;
	readonly amountMinor: number;
}

/** The payments that bring every balance to zero. */
export function settle(balanceByUser: ReadonlyMap<string, number>): Transfer[] {
	const debtors = [...balanceByUser]
		.filter(([, amount]) => amount < 0)
		.map(([id, amount]) => ({ id, remaining: -amount }))
		.sort((a, b) => b.remaining - a.remaining || (a.id < b.id ? -1 : 1));
	const creditors = [...balanceByUser]
		.filter(([, amount]) => amount > 0)
		.map(([id, amount]) => ({ id, remaining: amount }))
		.sort((a, b) => b.remaining - a.remaining || (a.id < b.id ? -1 : 1));

	const transfers: Transfer[] = [];
	let d = 0;
	let c = 0;

	while (d < debtors.length && c < creditors.length) {
		const debtor = debtors[d]!;
		const creditor = creditors[c]!;
		const amount = Math.min(debtor.remaining, creditor.remaining);

		if (amount > 0) transfers.push({ from: debtor.id, to: creditor.id, amountMinor: amount });

		debtor.remaining -= amount;
		creditor.remaining -= amount;
		if (debtor.remaining === 0) d += 1;
		if (creditor.remaining === 0) c += 1;
	}

	return transfers;
}
