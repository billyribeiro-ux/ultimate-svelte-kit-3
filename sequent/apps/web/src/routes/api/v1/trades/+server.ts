/**
 * `GET /api/v1/trades` — the caller's own executions, newest first.
 *
 * "Own" is doing real work in that sentence. A trade has two sides, and this
 * endpoint returns a trade if *either* side belongs to the caller's firm — and
 * then tells them which side was theirs, so their reconciliation does not have
 * to guess.
 *
 * It does **not** return the counterparty. In a centrally cleared market the
 * counterparty is the clearing house, and telling Northgate that they just
 * bought from Lowfield hands them information they would pay for and are not
 * entitled to.
 *
 * ## The scoping, and the mistake it avoids
 *
 * The `WHERE` clause names `buy_firm_id` and `sell_firm_id` explicitly. It
 * would be shorter to fetch the tape and filter in JavaScript, and that is the
 * version that leaks: the `LIMIT` applies before the filter, so a firm with one
 * trade on a busy venue gets an empty page and a cursor, over and over, until
 * they give up. Worse, any future maintainer who removes the filter by accident
 * ships every firm's trades to everybody, and no test that only ever has one
 * firm in it will notice.
 */

import { formatPrice, type Price } from '@sequent/protocol';
import {
	assertCan,
	clampLimit,
	cursorClause,
	decodeCursor,
	InvalidCursor,
	NotAllowed,
	orderClause,
	pageFrom,
	type Cursor
} from '@sequent/store';
import { ApiError, apiErrorFrom, handler } from '#lib/server/api.ts';
import { db } from '#lib/server/db.ts';

interface TradeRow {
	tradeId: string;
	seq: number;
	instrumentId: string;
	at: number;
	price: number;
	priceLabel: string;
	quantity: number;
	side: 'buy' | 'sell';
	accountId: string;
	orderId: string;
	fee: number;
	aggressor: string | null;
}

export const GET = handler(async ({ viewer }, { url }) => {
	try {
		assertCan(viewer, 'view_orders', { firmId: viewer.firmId });
	} catch (thrown) {
		if (thrown instanceof NotAllowed) throw apiErrorFrom(thrown);
		throw thrown;
	}

	const limit = clampLimit(url.searchParams.get('limit'));
	const instrument = url.searchParams.get('instrument');

	let cursor: Cursor | undefined;
	const presented = url.searchParams.get('cursor');
	if (presented) {
		try {
			cursor = decodeCursor(presented);
		} catch (thrown) {
			// A bad cursor is the client's mistake, and saying so beats silently
			// serving page one — which is how a client ends up in an infinite loop
			// re-reading the same fifty rows and never noticing.
			if (thrown instanceof InvalidCursor) {
				throw new ApiError('invalid_request', 'That cursor is not valid.');
			}
			throw thrown;
		}
	}

	const filters: string[] = [];
	const args: Array<string | number> = [viewer.firmId, viewer.firmId];

	if (instrument) {
		filters.push('AND instrument_id = ?');
		args.push(instrument);
	}

	const resume = cursorClause(cursor, 'newest_first', { seq: 'seq', id: 'trade_id' });
	args.push(...resume.args);

	// `limit + 1`: the extra row is the probe that answers "is there more?"
	// without a second COUNT over the whole table.
	args.push(limit + 1);

	const result = await db.execute({
		sql: `SELECT trade_id, seq, instrument_id, at, price, quantity, aggressor,
					 buy_order_id, buy_firm_id, buy_account_id, buyer_fee,
					 sell_order_id, sell_firm_id, sell_account_id, seller_fee
			  FROM trade
			  WHERE (buy_firm_id = ? OR sell_firm_id = ?)
			  ${filters.join(' ')}
			  ${resume.sql}
			  ${orderClause('newest_first', { seq: 'seq', id: 'trade_id' })}
			  LIMIT ?`,
		args
	});

	const rows: TradeRow[] = result.rows.map((row) => {
		const bought = String(row['buy_firm_id']) === viewer.firmId;
		const price = Number(row['price']);

		return {
			tradeId: String(row['trade_id']),
			seq: Number(row['seq']),
			instrumentId: String(row['instrument_id']),
			at: Number(row['at']),
			price,
			priceLabel: formatPrice(price as Price, 'GBP'),
			quantity: Number(row['quantity']),
			side: bought ? 'buy' : 'sell',
			accountId: String(row[bought ? 'buy_account_id' : 'sell_account_id']),
			orderId: String(row[bought ? 'buy_order_id' : 'sell_order_id']),
			/*
			 * A negative fee is a rebate. Makers are paid for posting liquidity, and
			 * folding that into one signed field means a client's P&L is
			 * `notional - fee` in both cases rather than a branch they might get
			 * backwards.
			 */
			fee: Number(row[bought ? 'buyer_fee' : 'seller_fee']),
			aggressor: row['aggressor'] === null ? null : String(row['aggressor'])
		};
	});

	const page = pageFrom(rows, limit, (row) => ({ seq: row.seq, id: row.tradeId }));

	return Response.json({
		data: page.data,
		pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit }
	});
});
