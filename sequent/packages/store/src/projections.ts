/**
 * Projections: turning the event log into things you can query.
 *
 * The engine's job is to decide what happened. This file's job is to write it
 * down in shapes a screen or an API can read quickly — the tape, a participant's
 * orders, positions, and the ledger.
 *
 * Two rules run through all of it, and both exist because a projector will be
 * fed the same event twice.
 *
 *   **Every write is idempotent.** `INSERT ... ON CONFLICT DO UPDATE`, never a
 *   bare insert; `SET filled = ?` computed from the event, never
 *   `filled = filled + ?`. A crash between applying an event and committing the
 *   checkpoint means the event arrives again on restart, and an accumulating
 *   update would double the fill.
 *
 *   **The checkpoint moves in the same transaction as the writes.** Not before,
 *   not after. `applyBatch` is the only place that decides this, so no
 *   individual projector can get it wrong.
 *
 * And one rule about what these tables *are*: caches. Drop every one of them and
 * `rebuild` puts them back from the log. Nothing here is the only copy of
 * anything, which is what lets a schema change be "truncate and replay" rather
 * than a migration nobody wants to write.
 */

import type { Client, InValue, Transaction } from '@libsql/client';
import type { Amount, Event } from '@sequent/protocol';
import { checkpointIn, readCheckpoint, readEvents, type EventRecord } from './log.ts';
import { ensureAccount, postTransaction, type Posting } from './ledger.ts';
import { notificationsFor } from './notify.ts';
import { enqueue } from './outbox.ts';

export const PROJECTOR_CONSUMER = 'projections';

/* -------------------------------------------------------------------------- */
/* Applying one event                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fold a single event into the read models.
 *
 * Every branch is safe to run twice. Where that is not obvious the comment says
 * why, because "is this idempotent" is the question a reviewer should be able to
 * answer without running it.
 */
async function project(tx: Transaction, record: EventRecord): Promise<void> {
	const event = record.body;

	switch (event.kind) {
		case 'order_accepted': {
			await tx.execute({
				sql: `INSERT INTO order_record (
						order_id, seq, firm_id, account_id, instrument_id, client_order_id,
						side, price, quantity, filled, time_in_force, status, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'working', ?, ?)
					ON CONFLICT (order_id) DO NOTHING`,
				args: [
					event.orderId,
					record.seq,
					event.firmId,
					event.accountId,
					event.instrumentId,
					event.clientOrderId,
					event.side,
					(event.price ?? null) as InValue,
					event.quantity,
					event.timeInForce,
					record.at,
					record.at
				]
			});
			break;
		}

		case 'order_cancelled': {
			/*
			 * `filled` is set from the event's own numbers rather than incremented.
			 *
			 * The event carries what was *remaining*, so the filled quantity is
			 * `quantity - remaining` — a value the event fully determines. An
			 * increment would be correct exactly once and wrong on every replay.
			 */
			await tx.execute({
				sql: `UPDATE order_record
					SET status = CASE WHEN ? = 0 THEN 'filled' ELSE 'cancelled' END,
						cancel_reason = ?,
						filled = quantity - ?,
						updated_at = ?
					WHERE order_id = ?`,
				args: [event.remainingQuantity, event.reason, event.remainingQuantity, record.at, event.orderId]
			});
			break;
		}

		case 'order_replaced': {
			await tx.execute({
				sql: `UPDATE order_record SET status = 'replaced', updated_at = ? WHERE order_id = ? AND order_id <> ?`,
				args: [record.at, event.orderId, event.newOrderId]
			});
			break;
		}

		case 'traded': {
			await tx.execute({
				sql: `INSERT INTO trade (
						trade_id, seq, instrument_id, at, price, quantity, aggressor,
						buy_order_id, buy_firm_id, buy_account_id,
						sell_order_id, sell_firm_id, sell_account_id,
						buyer_fee, seller_fee
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (trade_id) DO NOTHING`,
				args: [
					event.tradeId,
					record.seq,
					event.instrumentId,
					record.at,
					event.price,
					event.quantity,
					(event.aggressor ?? null) as InValue,
					event.buyOrderId,
					event.buyFirmId,
					event.buyAccountId,
					event.sellOrderId,
					event.sellFirmId,
					event.sellAccountId,
					event.buyerFee,
					event.sellerFee
				]
			});

			/*
			 * The trade is the idempotency key for everything downstream of it.
			 *
			 * `changes` is zero when the insert hit the conflict clause, which means
			 * this trade has already been projected — so the position updates and
			 * ledger postings below must not run again. Without this check a replayed
			 * batch would move every position twice and the ledger would still
			 * balance, which is the worst kind of wrong: internally consistent and
			 * completely false.
			 */
			const alreadySeen = await tx.execute({
				sql: 'SELECT COUNT(*) AS n FROM ledger_transaction WHERE transaction_id = ?',
				args: [event.tradeId]
			});
			if (Number(alreadySeen.rows[0]?.['n'] ?? 0) > 0) break;

			await applyToPosition(tx, {
				accountId: event.buyAccountId,
				instrumentId: event.instrumentId,
				signedQuantity: event.quantity,
				price: event.price,
				at: record.at
			});
			await applyToPosition(tx, {
				accountId: event.sellAccountId,
				instrumentId: event.instrumentId,
				signedQuantity: -event.quantity,
				price: event.price,
				at: record.at
			});

			/*
			 * Mark both sides as filled.
			 *
			 * This was missing, and the symptom was excellent: the depth ladder
			 * showed a **crossed** book. An order that fills completely produces
			 * trades and no cancellation, so the projection left it `working` with
			 * `filled = 0` forever — and the ladder, which is derived from working
			 * orders, kept showing liquidity that had already been consumed.
			 *
			 * The engine was right the whole time. Only the read model was lying,
			 * which is precisely the failure mode projections have: nothing throws,
			 * the numbers are just wrong in a way that looks like a matching bug.
			 *
			 * The increments are safe because the whole block sits behind the
			 * already-projected guard above, so it runs at most once per trade.
			 */
			for (const orderId of [event.buyOrderId, event.sellOrderId]) {
				await tx.execute({
					sql: `UPDATE order_record
						SET filled = filled + ?,
							status = CASE WHEN filled + ? >= quantity THEN 'filled' ELSE status END,
							updated_at = ?
						WHERE order_id = ?`,
					args: [event.quantity, event.quantity, record.at, orderId]
				});
			}

			await postTrade(tx, record, event);
			break;
		}

		/*
		 * The rest change no read model. They are listed rather than swept up by a
		 * `default`, so that adding an event kind to the protocol produces a
		 * compile error here instead of being silently ignored — which is exactly
		 * the failure mode of a projector nobody remembered to update.
		 */
		case 'order_rejected':
		case 'risk_limits_set':
		case 'kill_switch_changed':
		case 'instrument_listed':
		case 'phase_changed':
		case 'auction_uncrossed':
		case 'ticked':
			break;
	}
}

/* -------------------------------------------------------------------------- */
/* Positions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Move a position, and work out what was realised doing it.
 *
 * The arithmetic is the part worth reading slowly, because "average cost" is
 * easy to state and easy to implement wrongly.
 *
 *   - **Increasing** a position (buying while long, selling while short) adds to
 *     the cost basis and realises nothing. You have not sold anything.
 *   - **Reducing** it realises the difference between what you paid on average
 *     and what you just got, for the quantity closed.
 *   - **Crossing through zero** — selling 150 while long 100 — is both: close
 *     the 100 at the realised price, then open a new short of 50 at the new
 *     price. Treating it as one operation is the classic bug, and it produces a
 *     cost basis that is a blend of a position that no longer exists and one
 *     that just started.
 */
async function applyToPosition(
	tx: Transaction,
	input: {
		accountId: string;
		instrumentId: string;
		signedQuantity: number;
		price: number;
		at: number;
	}
): Promise<void> {
	const existing = await tx.execute({
		sql: 'SELECT quantity, cost_basis, realised_pnl FROM position WHERE account_id = ? AND instrument_id = ?',
		args: [input.accountId, input.instrumentId]
	});

	const row = existing.rows[0];
	const held = Number(row?.['quantity'] ?? 0);
	const basis = Number(row?.['cost_basis'] ?? 0);
	let realised = Number(row?.['realised_pnl'] ?? 0);

	const delta = input.signedQuantity;
	let quantity = held;
	let costBasis = basis;

	const increasing = held === 0 || Math.sign(held) === Math.sign(delta);

	if (increasing) {
		quantity = held + delta;
		costBasis = basis + delta * input.price;
	} else {
		const closing = Math.min(Math.abs(delta), Math.abs(held));
		const averageCost = basis / held; // held is non-zero in this branch.

		// Selling above average cost realises a gain; buying back below it does
		// too. The sign of `held` makes one expression cover both.
		realised += closing * (input.price - averageCost) * Math.sign(held);

		const remainingHeld = held + Math.sign(delta) * closing;
		costBasis = remainingHeld === 0 ? 0 : averageCost * remainingHeld;
		quantity = remainingHeld;

		// Crossed through zero: whatever is left opens a fresh position at the
		// price it was opened at, not at a blend with the one just closed.
		const overshoot = Math.abs(delta) - closing;
		if (overshoot > 0) {
			quantity = Math.sign(delta) * overshoot;
			costBasis = quantity * input.price;
		}
	}

	await tx.execute({
		sql: `INSERT INTO position (account_id, instrument_id, quantity, cost_basis, realised_pnl, updated_at)
		      VALUES (?, ?, ?, ?, ?, ?)
		      ON CONFLICT (account_id, instrument_id) DO UPDATE
		      SET quantity = excluded.quantity,
		          cost_basis = excluded.cost_basis,
		          realised_pnl = excluded.realised_pnl,
		          updated_at = excluded.updated_at`,
		args: [
			input.accountId,
			input.instrumentId,
			quantity,
			Math.round(costBasis),
			Math.round(realised),
			input.at
		]
	});
}

/* -------------------------------------------------------------------------- */
/* The money                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Post a trade to the ledger.
 *
 * Four movements, one transaction, summing to zero:
 *
 *   1. Buyer's cash decreases by the notional.
 *   2. Buyer's securities increase by the notional.
 *   3. Seller's securities decrease; seller's cash increases.
 *   4. Both fees move from the participants' cash to the venue's revenue.
 *
 * The fee arithmetic is where this gets interesting. The taker pays and the
 * maker is *paid*, so one of the fee postings is negative. The venue keeps the
 * difference — and the difference is what makes the transaction balance, which
 * is a pleasant way of saying the venue's revenue account is defined as
 * whatever is left over rather than computed separately and hoped about.
 */
async function postTrade(
	tx: Transaction,
	record: EventRecord,
	event: Extract<Event, { kind: 'traded' }>
): Promise<void> {
	const currency = 'GBP';
	const notional = event.price * event.quantity;

	const buyerCash = await ensureAccount(tx, 'firm_cash', event.buyFirmId, currency);
	const sellerCash = await ensureAccount(tx, 'firm_cash', event.sellFirmId, currency);
	const buyerStock = await ensureAccount(tx, 'firm_securities', event.buyFirmId, currency, event.instrumentId);
	const sellerStock = await ensureAccount(tx, 'firm_securities', event.sellFirmId, currency, event.instrumentId);
	const revenue = await ensureAccount(tx, 'venue_revenue', 'venue', currency);

	const postings: Posting[] = [
		// The exchange of value itself.
		{ accountId: buyerCash, amount: -notional as Amount },
		{ accountId: buyerStock, amount: notional as Amount },
		{ accountId: sellerStock, amount: -notional as Amount },
		{ accountId: sellerCash, amount: notional as Amount },

		// Fees. A negative fee is a rebate, and the sign handles it with no
		// special case anywhere.
		{ accountId: buyerCash, amount: -event.buyerFee as Amount },
		{ accountId: sellerCash, amount: -event.sellerFee as Amount },
		{ accountId: revenue, amount: (event.buyerFee + event.sellerFee) as Amount }
	];

	await postTransaction(tx, {
		transactionId: event.tradeId,
		seq: record.seq,
		at: record.at,
		kind: 'trade',
		reference: event.instrumentId,
		postings
	});
}

/* -------------------------------------------------------------------------- */
/* Running                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Apply a batch of events and move the checkpoint, atomically.
 *
 * This is the only function that knows the checkpoint rule, which is the point:
 * an individual projector cannot get it wrong because it never sees it.
 */
export interface ApplyOptions {
	/**
	 * Whether to enqueue outbox messages. On during normal operation, **off**
	 * during a rebuild — see `rebuild`.
	 */
	readonly notify?: boolean;
}

export async function applyBatch(
	client: Client,
	batch: readonly EventRecord[],
	options: ApplyOptions = {}
): Promise<void> {
	if (batch.length === 0) return;

	const { notify = true } = options;
	const tx = await client.transaction('write');

	try {
		for (const record of batch) {
			await project(tx, record);

			/*
			 * Notifications are enqueued **in this transaction**, next to the rows
			 * they describe.
			 *
			 * That is the whole transactional-outbox pattern in two lines. The
			 * alternative — projecting, committing, then posting a webhook — has no
			 * correct ordering: commit first and a crash loses the notification
			 * forever; send first and a rollback tells a firm about a trade that did
			 * not happen. Here there is one commit, and it contains both or neither.
			 */
			if (notify) {
				for (const message of notificationsFor(record)) {
					await enqueue(tx, message, record.at);
				}
			}
		}

		const last = batch[batch.length - 1]!;
		await checkpointIn(tx, PROJECTOR_CONSUMER, last.seq, last.at);
		await tx.commit();
	} catch (error) {
		await tx.rollback();
		throw error;
	}
}

/** Catch the projections up to the end of the event log. */
export async function catchUp(
	client: Client,
	batchSize = 500,
	options: ApplyOptions = {}
): Promise<number> {
	let cursor = await readCheckpoint(client, PROJECTOR_CONSUMER);
	let applied = 0;

	for (;;) {
		const batch = await readEvents(client, cursor, batchSize);
		if (batch.length === 0) break;

		await applyBatch(client, batch, options);
		cursor = batch[batch.length - 1]!.seq;
		applied += batch.length;
	}

	return applied;
}

/**
 * Throw the projections away and build them again from the log.
 *
 * The operation that proves they are caches. It is also the migration strategy:
 * changing the shape of a read model is a truncate and a replay rather than an
 * `ALTER TABLE` and a backfill script that has to be right first time.
 *
 * ## `notify: false`, and why it is the most important argument here
 *
 * A rebuild replays every event the venue has ever recorded. Without this flag
 * it would also re-enqueue every notification — and every member would be told,
 * again, about six months of trades, in one burst, because somebody changed the
 * shape of a read model.
 *
 * The outbox's idempotency keys would absorb it *only* while the original rows
 * are still there, and `prune` deletes delivered ones. So the protection cannot
 * come from the constraint; it has to be this argument.
 *
 * The general rule: replay is for **internal** state. Anything that leaves the
 * building must be suppressed during it.
 */
export async function rebuild(client: Client): Promise<number> {
	const tx = await client.transaction('write');

	try {
		for (const table of ['ledger_posting', 'ledger_transaction', 'ledger_account', 'position', 'trade', 'order_record']) {
			await tx.execute(`DELETE FROM ${table}`);
		}
		await tx.execute({
			sql: 'DELETE FROM consumer_checkpoint WHERE consumer = ?',
			args: [PROJECTOR_CONSUMER]
		});
		await tx.commit();
	} catch (error) {
		await tx.rollback();
		throw error;
	}

	return catchUp(client, 500, { notify: false });
}
