/**
 * `GET    /api/v1/orders/{clientOrderId}` — look one up by the client's own name.
 * `DELETE /api/v1/orders/{clientOrderId}` — cancel it.
 *
 * Addressed by the **client's** id, not the venue's. That is the whole point of
 * letting the client name its orders: after a reconnect it can ask about the
 * order it sent without having ever received our id for it.
 *
 * A venue that only accepts its own order ids forces a client to remember the
 * response to a request that might never have arrived — which is the exact
 * situation the client order id exists to survive.
 */

import { formatPrice, type Price } from '@sequent/protocol';
import { assertCan, NotAllowed } from '@sequent/store';
import { ApiError, apiErrorFrom, fromHttpError, handler } from '#lib/server/api.ts';
import { db } from '#lib/server/db.ts';
import { submit } from '#lib/server/gateway.ts';

const CLIENT_ORDER_ID = /^[\w.:-]{1,64}$/;

function clientOrderIdFrom(params: Partial<Record<string, string>>): string {
	const value = String(params['clientOrderId'] ?? '');
	if (!CLIENT_ORDER_ID.test(value)) {
		throw new ApiError('invalid_request', 'That is not a client order id.');
	}
	return value;
}

export const GET = handler(async ({ viewer }, { params }) => {
	const clientOrderId = clientOrderIdFrom(params);

	try {
		assertCan(viewer, 'view_orders', { firmId: viewer.firmId });
	} catch (thrown) {
		if (thrown instanceof NotAllowed) throw apiErrorFrom(thrown);
		throw thrown;
	}

	/*
	 * `firm_id = ?` is in the WHERE clause, not checked afterwards.
	 *
	 * Fetching by client order id alone and then comparing the firm would work
	 * and would be wrong in a way that is hard to see: for a moment the row is in
	 * memory, and every future edit to this function is one `return` away from
	 * sending it. Scoping in the query means the row never exists.
	 *
	 * Client order ids are only unique per firm, so this is also the *correct*
	 * lookup — two firms may each have an order called `ORD-1`.
	 */
	const result = await db.execute({
		sql: `SELECT order_id, seq, client_order_id, account_id, instrument_id, side, price,
					 quantity, filled, time_in_force, status, cancel_reason, created_at, updated_at
			  FROM order_record
			  WHERE firm_id = ? AND client_order_id = ?
			  ORDER BY seq DESC LIMIT 1`,
		args: [viewer.firmId, clientOrderId]
	});

	const row = result.rows[0];
	if (!row) throw new ApiError('not_found', 'No order with that client order id.');

	const fills = await db.execute({
		sql: `SELECT trade_id, at, price, quantity FROM trade
			  WHERE buy_order_id = ? OR sell_order_id = ?
			  ORDER BY seq`,
		args: [String(row['order_id']), String(row['order_id'])]
	});

	return Response.json({
		data: {
			orderId: String(row['order_id']),
			seq: Number(row['seq']),
			clientOrderId: String(row['client_order_id']),
			accountId: String(row['account_id']),
			instrumentId: String(row['instrument_id']),
			side: String(row['side']),
			price: row['price'] === null ? null : Number(row['price']),
			priceLabel: row['price'] === null ? null : formatPrice(Number(row['price']) as Price, 'GBP'),
			quantity: Number(row['quantity']),
			filled: Number(row['filled']),
			remaining: Number(row['quantity']) - Number(row['filled']),
			timeInForce: String(row['time_in_force']),
			status: String(row['status']),
			cancelReason: row['cancel_reason'] === null ? null : String(row['cancel_reason']),
			createdAt: Number(row['created_at']),
			updatedAt: Number(row['updated_at']),
			fills: fills.rows.map((fill) => ({
				tradeId: String(fill['trade_id']),
				at: Number(fill['at']),
				price: Number(fill['price']),
				priceLabel: formatPrice(Number(fill['price']) as Price, 'GBP'),
				quantity: Number(fill['quantity'])
			}))
		}
	});
});

/**
 * Cancel, and answer 202 for an order that was already gone.
 *
 * The tempting answer is 404 — there is no working order to cancel, after all.
 * It is the wrong one. A client whose connection dropped mid-cancel retries,
 * and a 404 tells it something went wrong when in fact it got exactly what it
 * wanted. Cancellation is idempotent by nature: the outcome the client asked
 * for — *this order is not working* — is true either way.
 *
 * A genuinely unknown client order id is still a 404, because that is a
 * different statement: we have never heard of this order at all.
 */
export const DELETE = handler(
	async ({ viewer }, { params }) => {
		const clientOrderId = clientOrderIdFrom(params);

		const existing = await db.execute({
			sql: `SELECT status FROM order_record WHERE firm_id = ? AND client_order_id = ?
				  ORDER BY seq DESC LIMIT 1`,
			args: [viewer.firmId, clientOrderId]
		});

		const row = existing.rows[0];
		if (!row) throw new ApiError('not_found', 'No order with that client order id.');

		if (String(row['status']) !== 'working') {
			return Response.json(
				{
					data: {
						clientOrderId,
						status: String(row['status']),
						message: 'That order is not working. Nothing to cancel.'
					}
				},
				{ status: 202 }
			);
		}

		const seq = await submit(viewer, {
			kind: 'cancel_order',
			clientOrderId
		}).catch((thrown: unknown) => fromHttpError(thrown, 'That cancel was refused.'));

		return Response.json(
			{ data: { seq, clientOrderId, status: 'cancel_accepted' } },
			{ status: 202 }
		);
	},
	{ cost: 2 }
);
