/**
 * `GET /api/v1/orders` — the firm's orders.
 * `POST /api/v1/orders` — send one.
 *
 * ## The POST is idempotent, and it cost nothing to make it so
 *
 * An order carries a `clientOrderId` that the client chooses. That field
 * already exists because traders need to refer to their own orders by their own
 * name — but it doubles as an idempotency key, for free.
 *
 * That matters more here than almost anywhere. A client sends an order, the
 * connection drops before the response arrives, and the client does not know
 * whether it traded. Retrying is terrifying — it might buy twice. Not retrying
 * is also terrifying — it might not have bought at all.
 *
 * With a client order id, retrying is safe: the engine already has an order
 * under that name and rejects the duplicate. The client can retry until it gets
 * an answer, which is the only retry policy that is actually implementable.
 *
 * Notice this is enforced by the **engine**, not here. A check in this route
 * would be a second opinion racing the first, and two processes both deciding
 * "no order under that name yet" at the same moment is how a duplicate gets in.
 * The engine is single-threaded over a total order, so its answer is the only
 * one that cannot race.
 *
 * ## What a 202 means
 *
 * POST returns **202 Accepted**, not 201 Created. The venue has accepted the
 * *command*; whether the order rests, trades or is rejected on risk is decided
 * by the engine a moment later. Returning 201 would be a lie, and blocking
 * until the engine caught up would give this endpoint the engine's latency plus
 * a deadlock to look forward to.
 *
 * The response carries the sequence number, which is how a client finds its own
 * outcome on the event stream.
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
import { ApiError, apiErrorFrom, fromHttpError, handler, jsonBody } from '#lib/server/api.ts';
import { db } from '#lib/server/db.ts';
import { submit } from '#lib/server/gateway.ts';

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export const GET = handler(async ({ viewer }, { url }) => {
	try {
		assertCan(viewer, 'view_orders', { firmId: viewer.firmId });
	} catch (thrown) {
		if (thrown instanceof NotAllowed) throw apiErrorFrom(thrown);
		throw thrown;
	}

	const limit = clampLimit(url.searchParams.get('limit'));
	const status = url.searchParams.get('status');
	const instrument = url.searchParams.get('instrument');

	let cursor: Cursor | undefined;
	const presented = url.searchParams.get('cursor');
	if (presented) {
		try {
			cursor = decodeCursor(presented);
		} catch (thrown) {
			if (thrown instanceof InvalidCursor) {
				throw new ApiError('invalid_request', 'That cursor is not valid.');
			}
			throw thrown;
		}
	}

	const filters: string[] = [];
	const args: Array<string | number> = [viewer.firmId];

	/*
	 * `status=working` is the query every client actually wants, and the one an
	 * offset-paginated API cannot serve correctly — orders leave the working set
	 * constantly, so the page boundaries move under the reader.
	 */
	if (status) {
		if (!['working', 'filled', 'cancelled', 'rejected'].includes(status)) {
			throw new ApiError('invalid_request', `Unknown status: ${status}`);
		}
		filters.push('AND status = ?');
		args.push(status);
	}

	if (instrument) {
		filters.push('AND instrument_id = ?');
		args.push(instrument);
	}

	const resume = cursorClause(cursor, 'newest_first', { seq: 'seq', id: 'order_id' });
	args.push(...resume.args, limit + 1);

	const result = await db.execute({
		sql: `SELECT order_id, seq, client_order_id, account_id, instrument_id, side, price,
					 quantity, filled, time_in_force, status, cancel_reason, created_at, updated_at
			  FROM order_record
			  WHERE firm_id = ?
			  ${filters.join(' ')}
			  ${resume.sql}
			  ${orderClause('newest_first', { seq: 'seq', id: 'order_id' })}
			  LIMIT ?`,
		args
	});

	const rows = result.rows.map((row) => ({
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
		updatedAt: Number(row['updated_at'])
	}));

	const page = pageFrom(rows, limit, (row) => ({ seq: row.seq, id: row.orderId }));

	return Response.json({
		data: page.data,
		pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit }
	});
});

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * An order costs more than a read.
 *
 * Weighting writes higher in the token bucket is the cheap version of a
 * separate limit for them. A client that can read 20 times a second should not
 * therefore be able to send 20 orders a second, and one number with a cost
 * multiplier says that without a second bucket to keep in step.
 */
export const POST = handler(async ({ viewer }, { request }) => {
	const body = await jsonBody(request);

	/*
	 * The body is passed to `submit` almost untouched — no field-by-field copying
	 * here. `submit` parses it against the protocol's own valibot schema, which
	 * is the same schema the engine validates against on replay.
	 *
	 * Restating the shape in this file would create a second definition of what
	 * an order is, and the two would disagree within a month.
	 */
	const seq = await submit(viewer, { ...body, kind: 'place_order' }).catch((thrown: unknown) =>
		/*
		 * `submit` throws SvelteKit's `error()`, whose shape is `{ status, body }`
		 * and which is *not* an `Error`. Translated generically rather than by an
		 * `if` chain: the chain handled 400/403/404 and dropped 503, so the day the
		 * venue gained a pause flag, "we are not accepting orders" became
		 * "something went wrong at our end" — a retryable condition reported as a
		 * bug.
		 */
		fromHttpError(thrown, 'That order was refused.')
	);

	return Response.json(
		{
			data: {
				seq,
				clientOrderId: body['clientOrderId'],
				status: 'accepted',
				message: 'The command is sequenced. Watch the event stream for the outcome.'
			}
		},
		{ status: 202 }
	);
}, { cost: 2 });
