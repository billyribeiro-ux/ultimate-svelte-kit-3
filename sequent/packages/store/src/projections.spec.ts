import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import {
	asAccountId,
	asClientOrderId,
	asFirmId,
	asInstrumentId,
	asOrderId,
	asUserId,
	price,
	quantity,
	tradeIdFor,
	type Amount,
	type Command,
	type Event
} from '@sequent/protocol';
import { openStore } from './client.ts';
import { appendEvents, readCheckpoint, Sequencer } from './log.ts';
import { balanceOf, ledgerAccountId, postTransaction, trialBalance, UnbalancedTransaction } from './ledger.ts';
import { catchUp, rebuild } from './projections.ts';

/**
 * Projections and the ledger.
 *
 * The single most important assertion in this file is `total === 0` on the
 * trial balance. Everything else is detail; that one says the venue has not
 * created or destroyed money.
 */

let client: Client;
let directory: string;

const VOD = asInstrumentId('VOD.L');
const FIRM_A = asFirmId('firm-a');
const FIRM_B = asFirmId('firm-b');
const ACC_A = asAccountId('acc-a');
const ACC_B = asAccountId('acc-b');

let seq = 0;

/** Write a command so events have something to point at, then the events. */
async function emit(events: Event[]): Promise<void> {
	const sequencer = new Sequencer(client);
	await sequencer.start();

	const command: Command = {
		kind: 'tick',
		firmId: FIRM_A,
		actorId: asUserId('system'),
		at: 1_700_000_000_000
	};

	const record = await sequencer.append(command, 1_700_000_000_000 + seq, 1);
	seq += 1;
	await appendEvents(client, 'engine', record.seq, record.receivedAt, 1, events);
}

let tradeCounter = 0;

function trade(input: {
	at: number;
	qty: number;
	buyAccount?: typeof ACC_A;
	sellAccount?: typeof ACC_A;
	buyFirm?: typeof FIRM_A;
	sellFirm?: typeof FIRM_A;
}): Event {
	tradeCounter += 1;
	const notional = input.at * input.qty;

	return {
		kind: 'traded',
		tradeId: tradeIdFor(tradeCounter, 0),
		instrumentId: VOD,
		price: price(input.at),
		quantity: quantity(input.qty),
		buyOrderId: asOrderId(`OB${tradeCounter}`),
		buyFirmId: input.buyFirm ?? FIRM_A,
		buyAccountId: input.buyAccount ?? ACC_A,
		sellOrderId: asOrderId(`OS${tradeCounter}`),
		sellFirmId: input.sellFirm ?? FIRM_B,
		sellAccountId: input.sellAccount ?? ACC_B,
		aggressor: 'buy',
		// Taker pays 3bps, maker is paid 1bps — the maker fee is negative.
		buyerFee: Math.trunc((notional * 3) / 10_000) as Amount,
		sellerFee: -Math.trunc((notional * 1) / 10_000) as Amount
	};
}

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-proj-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });
	seq = 0;
	tradeCounter = 0;
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */

describe('the balancing rule', () => {
	it('refuses a transaction whose postings do not sum to zero', async () => {
		const tx = await client.transaction('write');

		await expect(
			postTransaction(tx, {
				transactionId: 'T1',
				seq: 1,
				at: 1,
				kind: 'test',
				postings: [
					{ accountId: 'a', amount: 100 as Amount },
					{ accountId: 'b', amount: -99 as Amount }
				]
			})
		).rejects.toThrow(UnbalancedTransaction);

		await tx.rollback();
	});

	it('refuses a transaction with no postings', async () => {
		const tx = await client.transaction('write');
		await expect(
			postTransaction(tx, { transactionId: 'T1', seq: 1, at: 1, kind: 'test', postings: [] })
		).rejects.toThrow(/no postings/);
		await tx.rollback();
	});

	it('refuses to update a posting once written', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		// Corrections are reversing entries. An accountant's question is "what did
		// you think in March", and an updated row cannot answer it.
		await expect(client.execute('UPDATE ledger_posting SET amount = 1')).rejects.toThrow(
			/immutable/
		);
	});
});

describe('a trade in the ledger', () => {
	it('balances to exactly zero', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		const { total } = await trialBalance(client);
		expect(total).toBe(0);
	});

	it('moves value from the buyer’s cash to the seller’s', async () => {
		const notional = 455_000 * 100;
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		const buyerCash = await balanceOf(client, ledgerAccountId('firm_cash', FIRM_A, 'GBP'));
		const sellerCash = await balanceOf(client, ledgerAccountId('firm_cash', FIRM_B, 'GBP'));
		const buyerStock = await balanceOf(client, ledgerAccountId('firm_securities', FIRM_A, VOD));

		// The buyer paid the notional plus a taker fee.
		expect(buyerCash).toBeLessThan(-notional);
		// The seller received the notional plus a maker rebate.
		expect(sellerCash).toBeGreaterThan(notional);
		// And the buyer holds the stock.
		expect(buyerStock).toBe(notional);
	});

	it('leaves the venue with the difference between the two fees', async () => {
		const notional = 455_000 * 100;
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		const revenue = await balanceOf(client, ledgerAccountId('venue_revenue', 'venue', 'GBP'));
		const taker = Math.trunc((notional * 3) / 10_000);
		const rebate = Math.trunc((notional * 1) / 10_000);

		expect(revenue).toBe(taker - rebate);
	});

	it('stays balanced across many trades', async () => {
		const events: Event[] = [];
		for (let n = 0; n < 25; n += 1) {
			events.push(trade({ at: 455_000 + n * 25, qty: 10 + n }));
		}
		await emit(events);
		await catchUp(client);

		expect((await trialBalance(client)).total).toBe(0);
	});
});

describe('positions', () => {
	it('tracks a long position and its cost basis', async () => {
		await emit([
			trade({ at: 455_000, qty: 100 }),
			trade({ at: 457_000, qty: 100 })
		]);
		await catchUp(client);

		const result = await client.execute({
			sql: 'SELECT quantity, cost_basis, realised_pnl FROM position WHERE account_id = ?',
			args: [ACC_A]
		});

		expect(Number(result.rows[0]!['quantity'])).toBe(200);
		expect(Number(result.rows[0]!['cost_basis'])).toBe(455_000 * 100 + 457_000 * 100);
		// Nothing sold, so nothing realised.
		expect(Number(result.rows[0]!['realised_pnl'])).toBe(0);
	});

	it('mirrors the two sides of a trade', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		const result = await client.execute('SELECT account_id, quantity FROM position ORDER BY account_id');
		const byAccount = Object.fromEntries(
			result.rows.map((row) => [String(row['account_id']), Number(row['quantity'])])
		);

		expect(byAccount[ACC_A]).toBe(100);
		expect(byAccount[ACC_B]).toBe(-100);
		// The venue as a whole is flat: every share bought was sold.
		expect(Object.values(byAccount).reduce((a, b) => a + b, 0)).toBe(0);
	});

	it('realises profit when a position is reduced', async () => {
		// Buy 100 at 455,000, then sell 100 at 460,000.
		await emit([
			trade({ at: 455_000, qty: 100, buyAccount: ACC_A, sellAccount: ACC_B }),
			trade({ at: 460_000, qty: 100, buyAccount: ACC_B, sellAccount: ACC_A })
		]);
		await catchUp(client);

		const result = await client.execute({
			sql: 'SELECT quantity, cost_basis, realised_pnl FROM position WHERE account_id = ?',
			args: [ACC_A]
		});

		expect(Number(result.rows[0]!['quantity'])).toBe(0);
		expect(Number(result.rows[0]!['cost_basis'])).toBe(0);
		expect(Number(result.rows[0]!['realised_pnl'])).toBe(5_000 * 100);
	});

	it('handles crossing through zero without blending the two positions', async () => {
		// Long 100 at 455,000, then sell 150 at 460,000: close the 100 and open a
		// short of 50. The new short's basis must be the price it opened at, not a
		// blend with the position that no longer exists.
		await emit([
			trade({ at: 455_000, qty: 100, buyAccount: ACC_A, sellAccount: ACC_B }),
			trade({ at: 460_000, qty: 150, buyAccount: ACC_B, sellAccount: ACC_A })
		]);
		await catchUp(client);

		const result = await client.execute({
			sql: 'SELECT quantity, cost_basis, realised_pnl FROM position WHERE account_id = ?',
			args: [ACC_A]
		});

		expect(Number(result.rows[0]!['quantity'])).toBe(-50);
		expect(Number(result.rows[0]!['cost_basis'])).toBe(-50 * 460_000);
		expect(Number(result.rows[0]!['realised_pnl'])).toBe(5_000 * 100);
	});
});

describe('idempotency', () => {
	it('applying the same events twice changes nothing', async () => {
		await emit([trade({ at: 455_000, qty: 100 }), trade({ at: 456_000, qty: 50 })]);
		await catchUp(client);

		const before = await snapshotOfReadModels();

		// Rewind the checkpoint and run again — exactly what a crash between
		// applying a batch and committing its checkpoint would produce.
		await client.execute({
			sql: 'UPDATE consumer_checkpoint SET last_seq = 0 WHERE consumer = ?',
			args: ['projections']
		});
		await catchUp(client);

		expect(await snapshotOfReadModels()).toEqual(before);
		expect((await trialBalance(client)).total).toBe(0);
	});

	it('rebuilds identically from the log alone', async () => {
		await emit([trade({ at: 455_000, qty: 100 }), trade({ at: 460_000, qty: 150, buyAccount: ACC_B, sellAccount: ACC_A })]);
		await catchUp(client);

		const before = await snapshotOfReadModels();

		// Every projection is a cache. Throw them away and put them back.
		const applied = await rebuild(client);

		expect(applied).toBeGreaterThan(0);
		expect(await snapshotOfReadModels()).toEqual(before);
	});

	it('moves the checkpoint as it goes', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		expect(await readCheckpoint(client, 'projections')).toBe(0);

		await catchUp(client);
		expect(await readCheckpoint(client, 'projections')).toBeGreaterThan(0);
	});
});

describe('the tape', () => {
	it('records every trade once, in sequence order', async () => {
		await emit([trade({ at: 455_000, qty: 10 }), trade({ at: 455_100, qty: 20 })]);
		await catchUp(client);

		const result = await client.execute('SELECT trade_id, price, quantity FROM trade ORDER BY seq');

		expect(result.rows.map((row) => Number(row['price']))).toEqual([455_000, 455_100]);
		expect(new Set(result.rows.map((row) => String(row['trade_id']))).size).toBe(2);
	});
});

/**
 * Everything the read models hold, in a comparable shape.
 *
 * `posting_id` is dropped before comparing, and the reason is worth stating.
 * It is an autoincrement surrogate key: a rebuild produces the same postings in
 * the same order with different numbers on them, because the counter started
 * again. Asserting on it would fail a rebuild that was completely correct.
 *
 * The rule that falls out: **compare meaning, not identity** — unless the
 * identity is itself derived, which is exactly why trade ids and order ids in
 * this system come from the sequence number rather than a counter. Those two
 * *are* compared, and they must match.
 */
async function snapshotOfReadModels() {
	const tables = ['trade', 'position', 'order_record', 'ledger_transaction', 'ledger_posting'];
	const out: Record<string, unknown[]> = {};

	for (const table of tables) {
		const order = table === 'ledger_posting' ? 'transaction_id, account_id, amount' : 'rowid';
		const result = await client.execute(`SELECT * FROM ${table} ORDER BY ${order}`);

		out[table] = result.rows.map((row) => {
			const { posting_id: _ignored, ...rest } = { ...row } as Record<string, unknown>;
			return rest;
		});
	}

	return out;
}

/* -------------------------------------------------------------------------- */
/* The outbox rides along with the projection                                  */
/* -------------------------------------------------------------------------- */

describe('notifications are written with the facts they describe', () => {
	it('enqueues an outbox message in the same transaction as the trade', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		const trades = await client.execute('SELECT COUNT(*) c FROM trade');
		const outbox = await client.execute("SELECT COUNT(*) c FROM outbox WHERE kind = 'webhook'");

		/*
		 * One trade, two notifications — one per side. The point of the assertion
		 * is not the arithmetic; it is that both landed in the same commit as the
		 * row they describe.
		 */
		expect(Number(trades.rows[0]!['c'])).toBe(1);
		expect(Number(outbox.rows[0]!['c'])).toBe(2);
	});

	it('addresses each notification to the firm on that side', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		const rows = await client.execute('SELECT firm_id FROM outbox ORDER BY firm_id');

		expect(rows.rows.map((row) => String(row['firm_id']))).toEqual(['firm-a', 'firm-b']);
	});

	it('does not enqueue twice when the projector re-runs', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		/*
		 * Rewind the checkpoint and project the same events again — exactly what a
		 * crash between applying a batch and committing its checkpoint would
		 * produce.
		 *
		 * Without the idempotency key, every restart would re-notify every firm
		 * about the last batch of trades.
		 */
		await client.execute({
			sql: 'UPDATE consumer_checkpoint SET last_seq = 0 WHERE consumer = ?',
			args: ['projections']
		});
		await catchUp(client);

		const outbox = await client.execute('SELECT COUNT(*) c FROM outbox');
		expect(Number(outbox.rows[0]!['c'])).toBe(2);
	});

	it('does not re-notify when the read models are rebuilt', async () => {
		await emit([trade({ at: 455_000, qty: 100 })]);
		await catchUp(client);

		// Simulate a prune: the delivered rows are gone, so the idempotency keys
		// can no longer absorb a duplicate. Only `notify: false` can.
		await client.execute('DELETE FROM outbox');

		await rebuild(client);

		/*
		 * Zero. A rebuild replays every event the venue has ever recorded, and
		 * without suppression it would tell every member about six months of
		 * trades in one burst because somebody changed the shape of a read model.
		 *
		 * The rule: replay is for internal state. Anything that leaves the
		 * building is suppressed during it.
		 */
		const outbox = await client.execute('SELECT COUNT(*) c FROM outbox');
		expect(Number(outbox.rows[0]!['c'])).toBe(0);

		// And the read models really were rebuilt.
		const trades = await client.execute('SELECT COUNT(*) c FROM trade');
		expect(Number(trades.rows[0]!['c'])).toBe(1);
	});
});
