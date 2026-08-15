/**
 * `GET /api/v1/instruments/{id}/book` — the depth ladder, aggregated.
 *
 * Aggregated by price, deliberately. The engine knows which firm owns each
 * resting order; this endpoint does not say. Publishing the individual orders
 * would let anyone reconstruct a competitor's working inventory from public
 * data, which is the sort of thing that ends in a regulator's letter.
 *
 * What is public is the *shape* of the demand: how much is bid at each price,
 * and across how many orders. That is what a market participant needs and it is
 * all they are entitled to.
 */

import { formatPrice, type Price } from '@sequent/protocol';
import { ApiError, handler } from '#lib/server/api.ts';
import { db } from '#lib/server/db.ts';

const SYMBOL = /^[A-Z][A-Z0-9.]{0,15}$/;

export const GET = handler(async (_context, { params, url }) => {
	const instrumentId = String(params['instrumentId'] ?? '');

	// Validated even though it only ever reaches a bound parameter. A path
	// segment is user input like any other, and "it is only used in a `WHERE`"
	// is a sentence that ages badly.
	if (!SYMBOL.test(instrumentId)) {
		throw new ApiError('invalid_request', 'That is not an instrument symbol.');
	}

	const depth = Math.min(50, Math.max(1, Number(url.searchParams.get('depth') ?? 10) || 10));

	const listing = await db.execute({
		sql: `SELECT body FROM event_log WHERE kind = 'instrument_listed' AND instrument_id = ? LIMIT 1`,
		args: [instrumentId]
	});

	const listingRow = listing.rows[0];
	if (!listingRow) throw new ApiError('not_found', 'No such instrument.');

	const currency = (JSON.parse(String(listingRow['body'])) as { currency: string }).currency;

	/*
	 * `quantity - filled`, not `quantity`.
	 *
	 * A partially filled order still rests, for what is left of it. Publishing
	 * its original size would overstate the book by exactly the amount already
	 * traded — and it would overstate it most at the touch, where it matters.
	 */
	const levels = await db.execute({
		sql: `SELECT side, price,
					 SUM(quantity - filled) AS quantity,
					 COUNT(*) AS orders
			  FROM order_record
			  WHERE instrument_id = ? AND status = 'working' AND price IS NOT NULL
			  GROUP BY side, price
			  HAVING SUM(quantity - filled) > 0`,
		args: [instrumentId]
	});

	const bids: Array<{ price: number; priceLabel: string; quantity: number; orders: number }> = [];
	const asks: typeof bids = [];

	for (const row of levels.rows) {
		const price = Number(row['price']);
		const level = {
			price,
			priceLabel: formatPrice(price as Price, currency),
			quantity: Number(row['quantity']),
			orders: Number(row['orders'])
		};

		if (String(row['side']) === 'buy') bids.push(level);
		else asks.push(level);
	}

	bids.sort((a, b) => b.price - a.price);
	asks.sort((a, b) => a.price - b.price);

	const phaseRow = await db.execute({
		sql: `SELECT body FROM event_log WHERE kind = 'phase_changed' AND instrument_id = ?
			  ORDER BY seq DESC LIMIT 1`,
		args: [instrumentId]
	});

	const phase = phaseRow.rows[0]
		? (JSON.parse(String(phaseRow.rows[0]['body'])) as { to: string }).to
		: 'closed';

	const seqRow = await db.execute('SELECT COALESCE(MAX(seq), 0) AS seq FROM event_log');

	return Response.json({
		data: {
			instrumentId,
			currency,
			phase,
			bids: bids.slice(0, depth),
			asks: asks.slice(0, depth),
			/*
			 * The sequence number this snapshot was taken at.
			 *
			 * Without it a client has no way to order two responses that arrived out
			 * of order, and will happily overwrite a newer book with an older one.
			 * With it, "ignore anything with a seq below what I already have" is one
			 * line at their end.
			 */
			seq: Number(seqRow.rows[0]?.['seq'] ?? 0)
		}
	});
});
