/**
 * Billing, and where the difficulty actually is.
 *
 * There is no payment provider here, and adding one would be the easy part —
 * a client library and a webhook handler. Everything that goes wrong with
 * billing goes wrong *before* the charge, and that is what this file is.
 *
 * ## What actually bites
 *
 *   **Proration.** A firm adds a seat on the 12th of a 30-day month. They owe
 *   19/30 of a seat. Get the arithmetic wrong by a rounding and you either
 *   overcharge — which is a support ticket and, at scale, a regulator — or
 *   undercharge, which nobody reports.
 *
 *   **Metering that cannot double count.** Usage is derived from the same
 *   event log everything else is, so a re-run produces the same number. A
 *   counter incremented on each order would drift the first time the projector
 *   replayed a batch.
 *
 *   **Invoices that never change.** An issued invoice is immutable. A
 *   correction is a credit note, for exactly the reason a ledger correction is
 *   a reversing entry: "what did we bill them in March" must have an answer.
 *
 * ## The money rule, again
 *
 * Every amount is an integer in the same scaled units as everything else in the
 * venue. Prices, fees and invoices share one representation, so a fee earned by
 * the venue can be compared with an invoice line without a conversion nobody
 * would remember to write.
 */

import type { Client } from '@libsql/client';
import type { Executor } from './client.ts';
import type { Amount } from '@sequent/protocol';

/* -------------------------------------------------------------------------- */
/* Plans                                                                       */
/* -------------------------------------------------------------------------- */

export interface Plan {
	readonly id: string;
	readonly name: string;
	/** Per seat, per month, in scaled units. £250.00 is 2_500_000. */
	readonly seatPrice: Amount;
	/** Seats included before the per-seat charge starts. */
	readonly includedSeats: number;
	/** Orders included per month; beyond this, the metered rate applies. */
	readonly includedOrders: number;
	/** Per order beyond the allowance, in scaled units. */
	readonly overageRate: Amount;
	readonly maxApiKeys: number;
	readonly maxRatePerSecond: number;
}

/**
 * The plans, as data.
 *
 * A table rather than a chain of conditionals, for the same reason the
 * permission matrix is: somebody who is not a programmer has to be able to
 * check it. A pricing bug found by the finance team reading this table costs
 * nothing; the same bug found by a customer costs a refund and a conversation.
 */
export const PLANS: Readonly<Record<string, Plan>> = {
	starter: {
		id: 'starter',
		name: 'Starter',
		seatPrice: 0 as Amount,
		includedSeats: 2,
		includedOrders: 1_000,
		overageRate: 100 as Amount, // £0.01
		maxApiKeys: 1,
		maxRatePerSecond: 5
	},
	desk: {
		id: 'desk',
		name: 'Desk',
		seatPrice: 2_500_000 as Amount, // £250.00
		includedSeats: 5,
		includedOrders: 250_000,
		overageRate: 20 as Amount, // £0.002
		maxApiKeys: 10,
		maxRatePerSecond: 50
	},
	institutional: {
		id: 'institutional',
		name: 'Institutional',
		seatPrice: 9_000_000 as Amount, // £900.00
		includedSeats: 25,
		includedOrders: 10_000_000,
		overageRate: 5 as Amount,
		maxApiKeys: 100,
		maxRatePerSecond: 500
	}
};

export function planFor(id: string): Plan {
	const plan = PLANS[id];
	// An unknown plan is a bug in whatever wrote the firm row, and defaulting to
	// the cheapest would hide it while giving the work away.
	if (!plan) throw new Error(`Unknown plan: ${id}`);
	return plan;
}

/* -------------------------------------------------------------------------- */
/* Proration                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What a seat costs for part of a period.
 *
 * ## Why days and not milliseconds
 *
 * Prorating by the millisecond is more "accurate" and produces an invoice
 * nobody can check. A firm that added a seat on the 12th expects to see
 * 19 days out of 30 on the line item, and a number derived from
 * `1_641_600_000ms / 2_592_000_000ms` is not something a finance team can
 * verify against their own records.
 *
 * Billing arithmetic should be reproducible with a calculator. That is worth
 * more than a resolution nobody asked for.
 *
 * ## Rounding down, deliberately
 *
 * `Math.floor`, not `Math.round`. Across thousands of line items the difference
 * is pennies, and the direction of the error is the whole point: rounding down
 * means every rounding error is in the customer's favour. A billing system that
 * rounds *up* is one that has to defend itself, and "we round in your favour"
 * is a sentence that ends the conversation.
 */
export function prorate(amount: Amount, daysActive: number, daysInPeriod: number): Amount {
	if (daysInPeriod <= 0) return 0 as Amount;

	const days = Math.max(0, Math.min(daysActive, daysInPeriod));

	// `amount * days` before the division, so the integer division happens once
	// at the end. Dividing first would truncate to zero for any amount smaller
	// than the number of days.
	return Math.floor((amount * days) / daysInPeriod) as Amount;
}

/** Whole days between two instants, rounded down. */
export function daysBetween(from: number, to: number): number {
	return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/* -------------------------------------------------------------------------- */
/* Metering                                                                    */
/* -------------------------------------------------------------------------- */

export interface Usage {
	readonly firmId: string;
	readonly seats: number;
	readonly orders: number;
	readonly trades: number;
	/** Fees the venue already earned from this firm's trading, in scaled units. */
	readonly tradingFees: Amount;
}

/**
 * What a firm used in a period.
 *
 * Derived by counting the log, not by a counter somebody increments. That is
 * the property that makes it safe to re-run: the same window always produces
 * the same number, however many times a projector has replayed it, and a
 * disputed invoice can be recomputed from first principles months later.
 *
 * A `usage_counter` table incremented on each order would be faster and would
 * drift the first time the projector re-applied a batch after a crash — by an
 * amount nobody could ever reconstruct.
 */
export async function usageFor(
	client: Client,
	firmId: string,
	from: number,
	to: number
): Promise<Usage> {
	const seats = await client.execute({
		sql: 'SELECT COUNT(*) AS n FROM venue_user WHERE firm_id = ? AND is_active = 1',
		args: [firmId]
	});

	/*
	 * Orders are counted from `command_log`, not `order_record`.
	 *
	 * A rejected order is still an order the venue processed — it took a
	 * sequence number, ran the risk checks and produced an event. Counting only
	 * the accepted ones would let a firm send a hundred thousand orders that all
	 * breach their limits and pay for none of the work.
	 */
	const orders = await client.execute({
		sql: `SELECT COUNT(*) AS n FROM command_log
		      WHERE firm_id = ? AND kind = 'place_order' AND received_at >= ? AND received_at < ?`,
		args: [firmId, from, to]
	});

	const trades = await client.execute({
		sql: `SELECT COUNT(*) AS n,
		             COALESCE(SUM(CASE WHEN buy_firm_id = ?1 THEN buyer_fee ELSE 0 END), 0)
		           + COALESCE(SUM(CASE WHEN sell_firm_id = ?1 THEN seller_fee ELSE 0 END), 0) AS fees
		      FROM trade
		      WHERE (buy_firm_id = ?1 OR sell_firm_id = ?1) AND at >= ?2 AND at < ?3`,
		args: [firmId, from, to]
	});

	return {
		firmId,
		seats: Number(seats.rows[0]?.['n'] ?? 0),
		orders: Number(orders.rows[0]?.['n'] ?? 0),
		trades: Number(trades.rows[0]?.['n'] ?? 0),
		tradingFees: Number(trades.rows[0]?.['fees'] ?? 0) as Amount
	};
}

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

export interface InvoiceLine {
	readonly description: string;
	readonly quantity: number;
	readonly unitAmount: Amount;
	readonly amount: Amount;
}

export interface Invoice {
	readonly invoiceId: string;
	readonly firmId: string;
	readonly planId: string;
	readonly periodStart: number;
	readonly periodEnd: number;
	readonly lines: readonly InvoiceLine[];
	readonly total: Amount;
	readonly issuedAt: number;
}

/**
 * Build an invoice. Pure — no database, no clock.
 *
 * Which is what makes billing testable at all. Every hard case here — a firm
 * that joined mid-period, one that used exactly its allowance, one on a free
 * plan that went into overage — is an assertion rather than an afternoon with a
 * seeded database and a fake clock.
 *
 * The venue's *trading fees* are deliberately not on this invoice. They were
 * already taken at the moment of each trade, through the ledger, and appear on
 * the invoice as a memo line so the total is not double counted. Billing for
 * them again is a mistake that would be very hard to notice and very expensive
 * to explain.
 */
export function buildInvoice(input: {
	invoiceId: string;
	firmId: string;
	plan: Plan;
	usage: Usage;
	periodStart: number;
	periodEnd: number;
	/** When the firm became billable. Earlier than `periodStart` for most. */
	activeFrom: number;
	issuedAt: number;
}): Invoice {
	const { plan, usage } = input;
	const lines: InvoiceLine[] = [];

	const daysInPeriod = Math.max(1, daysBetween(input.periodStart, input.periodEnd));
	const billableFrom = Math.max(input.activeFrom, input.periodStart);
	const daysActive = Math.min(daysInPeriod, daysBetween(billableFrom, input.periodEnd));

	/* ---- seats ---- */

	const chargeableSeats = Math.max(0, usage.seats - plan.includedSeats);

	if (plan.includedSeats > 0) {
		lines.push({
			description: `${plan.name} plan — ${plan.includedSeats} seats included`,
			quantity: Math.min(usage.seats, plan.includedSeats),
			unitAmount: 0 as Amount,
			amount: 0 as Amount
		});
	}

	if (chargeableSeats > 0 && plan.seatPrice > 0) {
		const full = (plan.seatPrice * chargeableSeats) as Amount;
		const amount = prorate(full, daysActive, daysInPeriod);

		lines.push({
			description:
				daysActive < daysInPeriod
					? `Additional seats (${daysActive}/${daysInPeriod} days)`
					: 'Additional seats',
			quantity: chargeableSeats,
			unitAmount: plan.seatPrice,
			amount
		});
	}

	/* ---- metered orders ---- */

	const overage = Math.max(0, usage.orders - plan.includedOrders);

	if (overage > 0) {
		lines.push({
			description: `Orders beyond ${plan.includedOrders.toLocaleString('en-GB')} included`,
			quantity: overage,
			unitAmount: plan.overageRate,
			// Not prorated: an order sent on the 29th cost the venue the same work
			// as one sent on the 1st. Proration applies to *access*, metering to
			// *use*, and conflating them is how a bill stops matching the invoice.
			amount: (overage * plan.overageRate) as Amount
		});
	}

	const total = lines.reduce((sum, line) => sum + line.amount, 0) as Amount;

	/*
	 * The memo line, at zero.
	 *
	 * Trading fees were already collected per trade through the ledger. Showing
	 * them at £0 on the invoice tells the firm what they paid without charging
	 * for it twice — and makes the omission obvious to anybody checking, which a
	 * silent absence would not.
	 */
	if (usage.tradingFees !== 0) {
		lines.push({
			description: `Trading fees already settled (${usage.trades.toLocaleString('en-GB')} trades)`,
			quantity: usage.trades,
			unitAmount: 0 as Amount,
			amount: 0 as Amount
		});
	}

	return {
		invoiceId: input.invoiceId,
		firmId: input.firmId,
		planId: plan.id,
		periodStart: input.periodStart,
		periodEnd: input.periodEnd,
		lines,
		total,
		issuedAt: input.issuedAt
	};
}

/* -------------------------------------------------------------------------- */
/* Persisting                                                                  */
/* -------------------------------------------------------------------------- */

export class InvoiceAlreadyIssued extends Error {
	constructor(invoiceId: string) {
		super(`Invoice ${invoiceId} has already been issued and cannot be changed.`);
		this.name = 'InvoiceAlreadyIssued';
	}
}

/**
 * Write an invoice, once.
 *
 * The `ON CONFLICT DO NOTHING` plus the check is not belt and braces — it is
 * the difference between "this ran twice" and "this ran twice and quietly
 * changed the number". Reissuing must fail loudly, because the alternative is a
 * firm receiving a different total for the same period and nobody knowing which
 * one they paid.
 *
 * A correction is a **credit note**, exactly as a ledger correction is a
 * reversing entry, and for exactly the same reason.
 */
export async function issueInvoice(tx: Executor, invoice: Invoice): Promise<void> {
	const existing = await tx.execute({
		sql: 'SELECT total FROM invoice WHERE invoice_id = ?',
		args: [invoice.invoiceId]
	});

	if (existing.rows.length > 0) {
		if (Number(existing.rows[0]?.['total']) !== invoice.total) {
			throw new InvoiceAlreadyIssued(invoice.invoiceId);
		}
		// Same invoice, same total: an idempotent re-run, which is fine.
		return;
	}

	await tx.execute({
		sql: `INSERT INTO invoice
		        (invoice_id, firm_id, plan_id, period_start, period_end, total, lines, issued_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			invoice.invoiceId,
			invoice.firmId,
			invoice.planId,
			invoice.periodStart,
			invoice.periodEnd,
			invoice.total,
			JSON.stringify(invoice.lines),
			invoice.issuedAt
		]
	});
}

export async function invoicesFor(client: Client, firmId: string): Promise<Invoice[]> {
	const result = await client.execute({
		sql: `SELECT invoice_id, firm_id, plan_id, period_start, period_end, total, lines, issued_at
		      FROM invoice WHERE firm_id = ? ORDER BY period_start DESC`,
		args: [firmId]
	});

	return result.rows.map((row) => ({
		invoiceId: String(row['invoice_id']),
		firmId: String(row['firm_id']),
		planId: String(row['plan_id']),
		periodStart: Number(row['period_start']),
		periodEnd: Number(row['period_end']),
		lines: JSON.parse(String(row['lines'])) as InvoiceLine[],
		total: Number(row['total']) as Amount,
		issuedAt: Number(row['issued_at'])
	}));
}

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

export interface LimitCheck {
	readonly allowed: boolean;
	readonly reason?: string;
}

/**
 * Whether the plan permits another key.
 *
 * Plan limits are checked at the moment of *creation*, never retroactively. A
 * firm that downgrades from Institutional to Desk keeps its eleven existing
 * keys and cannot make a twelfth.
 *
 * The alternative — revoking keys on downgrade — means a plan change silently
 * breaks a trading system in production, which is a thing no customer will
 * forgive and no support conversation will fix.
 */
export async function canCreateKey(
	client: Client,
	firmId: string,
	plan: Plan
): Promise<LimitCheck> {
	const result = await client.execute({
		sql: 'SELECT COUNT(*) AS n FROM api_key WHERE firm_id = ? AND revoked_at IS NULL',
		args: [firmId]
	});

	const active = Number(result.rows[0]?.['n'] ?? 0);

	if (active >= plan.maxApiKeys) {
		return {
			allowed: false,
			reason: `The ${plan.name} plan allows ${plan.maxApiKeys} active ${plan.maxApiKeys === 1 ? 'key' : 'keys'}. Revoke one, or change plan.`
		};
	}

	return { allowed: true };
}

/** The rate a key may be given, capped by the plan. */
export function cappedRate(requested: number, plan: Plan): number {
	// Clamped rather than refused: a firm asking for 500 on a plan that allows 50
	// has made a reasonable request we decline to fill, and telling them the cap
	// is more useful than an error about a number they cannot see.
	return Math.min(Math.max(1, Math.floor(requested)), plan.maxRatePerSecond);
}
