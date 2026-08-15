/**
 * Double-entry bookkeeping, and the one constraint that makes it work.
 *
 * Every transaction is a set of postings that **sum to exactly zero**. Money is
 * never created or destroyed, only moved, and the check is enforced in code
 * before the transaction is written rather than reconciled afterwards.
 *
 * That single rule is worth more than every other correctness measure in this
 * file put together. A ledger that balances by construction cannot silently
 * lose a penny; a ledger that is *checked* nightly can lose one every day for a
 * month before anybody runs the report.
 *
 * ## Signs, not columns
 *
 * A posting is a signed amount. Positive is a debit, negative is a credit, and
 * a transaction is valid when they cancel.
 *
 * Accounting textbooks use two columns and a rule about which side increases
 * which kind of account. That is the right notation for a human with a pen and
 * the wrong one for a database: two columns means two places to make an error
 * and a sum that has to be written as `SUM(debit) - SUM(credit)`, which is a
 * subtraction somebody will eventually get backwards. One signed column makes
 * "does this balance" into `SUM(amount) = 0`, which is very hard to get wrong.
 *
 * ## Corrections are entries, not edits
 *
 * There is no `UPDATE` here and a trigger enforces it. A mistake is fixed by
 * posting its reverse, so the ledger records both what was believed and what
 * was later understood. An accountant's question is never "what is the balance"
 * alone — it is "what did you think the balance was in March", and an updated
 * row cannot answer that.
 */

import type { Client, Transaction } from '@libsql/client';
import { type Amount } from '@sequent/protocol';

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The kinds of account the venue keeps.
 *
 * A firm has cash and it has securities, and both are ledger accounts — that is
 * the part people find surprising. Shares are not "a position tracked
 * elsewhere"; they are a balance, and a purchase moves value out of one account
 * and into the other. Modelling them together is what makes it impossible for a
 * trade to debit somebody's cash and forget to credit their stock.
 */
export const ACCOUNT_KINDS = [
	/** A firm's money, per currency. */
	'firm_cash',
	/** A firm's holding of one instrument. */
	'firm_securities',
	/** What the venue has earned in fees. */
	'venue_revenue',
	/**
	 * The venue's own side of every trade.
	 *
	 * Every trade here is cleared *centrally*: the venue stands between the two
	 * participants rather than leaving them exposed to each other. So a trade is
	 * two transactions — buyer with the clearing house, seller with the clearing
	 * house — and this account is the clearing house's own position, which nets
	 * to zero across any completed trade. If it does not, one leg is missing.
	 */
	'venue_clearing'
] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/**
 * The identifier for a ledger account, built rather than looked up.
 *
 * Deterministic naming means a projector rebuilding from the log arrives at the
 * same account identifiers it did the first time, with no table of allocated
 * ids to keep in step. `cash:firm-a:GBP` is also readable in a query output at
 * 3am, which a UUID is not.
 */
export function ledgerAccountId(
	kind: AccountKind,
	ownerId: string,
	currencyOrInstrument: string
): string {
	const prefix =
		kind === 'firm_cash'
			? 'cash'
			: kind === 'firm_securities'
				? 'sec'
				: kind === 'venue_revenue'
					? 'rev'
					: 'clr';

	return `${prefix}:${ownerId}:${currencyOrInstrument}`;
}

export async function ensureAccount(
	tx: Transaction,
	kind: AccountKind,
	ownerId: string,
	currency: string,
	instrumentId?: string
): Promise<string> {
	const accountId = ledgerAccountId(kind, ownerId, instrumentId ?? currency);

	await tx.execute({
		sql: `INSERT INTO ledger_account (account_id, kind, owner_id, currency, instrument_id)
		      VALUES (?, ?, ?, ?, ?) ON CONFLICT (account_id) DO NOTHING`,
		args: [accountId, kind, ownerId, currency, instrumentId ?? null]
	});

	return accountId;
}

/* -------------------------------------------------------------------------- */
/* Posting                                                                     */
/* -------------------------------------------------------------------------- */

export interface Posting {
	readonly accountId: string;
	readonly amount: Amount;
}

export class UnbalancedTransaction extends Error {
	constructor(
		readonly transactionId: string,
		readonly total: number,
		readonly postings: readonly Posting[]
	) {
		super(
			`Ledger transaction ${transactionId} does not balance: postings sum to ${total}, not 0. ` +
				postings.map((p) => `${p.accountId}=${p.amount}`).join(' ')
		);
		this.name = 'UnbalancedTransaction';
	}
}

/**
 * Write a balanced transaction, or write nothing.
 *
 * The check happens **before** the insert and throws rather than returning a
 * result. An unbalanced transaction is not a business outcome somebody chose to
 * handle — it is a bug in whichever code built the postings, and the useful
 * behaviour is to stop loudly with the numbers in the message.
 *
 * Note what is *not* here: any attempt to fix it. Rounding the difference into
 * one of the postings would make every transaction balance and quietly move the
 * error into the ledger, where it would compound. Refusing is the feature.
 */
export async function postTransaction(
	tx: Transaction,
	input: {
		transactionId: string;
		seq: number;
		at: number;
		kind: string;
		reference?: string;
		postings: readonly Posting[];
	}
): Promise<void> {
	const total = input.postings.reduce((sum, posting) => sum + posting.amount, 0);

	if (total !== 0) {
		throw new UnbalancedTransaction(input.transactionId, total, input.postings);
	}

	// A transaction with no postings balances trivially and means nothing. Almost
	// always a bug in the caller rather than a deliberate no-op.
	if (input.postings.length === 0) {
		throw new Error(`Ledger transaction ${input.transactionId} has no postings`);
	}

	await tx.execute({
		sql: `INSERT INTO ledger_transaction (transaction_id, seq, at, kind, reference)
		      VALUES (?, ?, ?, ?, ?) ON CONFLICT (transaction_id) DO NOTHING`,
		args: [input.transactionId, input.seq, input.at, input.kind, input.reference ?? null]
	});

	for (const posting of input.postings) {
		await tx.execute({
			sql: `INSERT INTO ledger_posting (transaction_id, account_id, amount) VALUES (?, ?, ?)`,
			args: [input.transactionId, posting.accountId, posting.amount]
		});
	}
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export async function balanceOf(client: Client, accountId: string): Promise<number> {
	const result = await client.execute({
		sql: 'SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_posting WHERE account_id = ?',
		args: [accountId]
	});

	return Number(result.rows[0]?.['balance'] ?? 0);
}

/**
 * The trial balance: every account, and the total across all of them.
 *
 * That total must be zero. Not approximately zero, not zero after adjustments —
 * zero, because every posting ever written was part of a transaction that
 * summed to zero, and a sum of zeroes is zero.
 *
 * Running it is the cheapest possible audit and it should be part of the test
 * suite rather than a monthly ritual. If it is ever non-zero, something has
 * written to `ledger_posting` outside `postTransaction`, and finding out which
 * day that started is much easier than finding out which year.
 */
export async function trialBalance(client: Client): Promise<{
	accounts: Array<{ accountId: string; kind: string; balance: number }>;
	total: number;
}> {
	const result = await client.execute(`
		SELECT a.account_id AS account_id, a.kind AS kind, COALESCE(SUM(p.amount), 0) AS balance
		FROM ledger_account a
		LEFT JOIN ledger_posting p ON p.account_id = a.account_id
		GROUP BY a.account_id, a.kind
		ORDER BY a.account_id
	`);

	const accounts = result.rows.map((row) => ({
		accountId: String(row['account_id']),
		kind: String(row['kind']),
		balance: Number(row['balance'])
	}));

	return { accounts, total: accounts.reduce((sum, account) => sum + account.balance, 0) };
}

/**
 * Reverse a transaction by posting its mirror image.
 *
 * Not a delete and not an update — a new transaction whose postings are the
 * negatives of the original's. The books end up where they would have been if
 * the mistake had never happened, and the record still shows that it did.
 */
export async function reverseTransaction(
	tx: Transaction,
	client: Client,
	originalId: string,
	input: { transactionId: string; seq: number; at: number; reason: string }
): Promise<void> {
	const result = await client.execute({
		sql: 'SELECT account_id, amount FROM ledger_posting WHERE transaction_id = ?',
		args: [originalId]
	});

	if (result.rows.length === 0) {
		throw new Error(`Cannot reverse ${originalId}: no such transaction`);
	}

	await postTransaction(tx, {
		transactionId: input.transactionId,
		seq: input.seq,
		at: input.at,
		kind: 'reversal',
		reference: `${originalId} ${input.reason}`,
		postings: result.rows.map((row) => ({
			accountId: String(row['account_id']),
			amount: -Number(row['amount']) as Amount
		}))
	});
}
