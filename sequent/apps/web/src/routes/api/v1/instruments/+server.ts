/**
 * `GET /api/v1/instruments` — everything the venue lists.
 *
 * The one endpoint with no tenant scoping, because instruments belong to the
 * venue rather than to a firm. Every member sees the same list, and that is
 * correct: a market where participants see different instruments is not a
 * market.
 *
 * Note where the data comes from — the **event log**, not a table of
 * instruments. There is no such table. "What is listed" is the fold of every
 * `instrument_listed` event, and "what phase is it in" is the last
 * `phase_changed`. Keeping it that way means there is no second source of truth
 * to fall out of step with the engine's own view.
 */

import { formatPrice, type Price } from '@sequent/protocol';
import { assertCan, NotAllowed } from '@sequent/store';
import { apiErrorFrom, handler } from '#lib/server/api.ts';
import { db } from '#lib/server/db.ts';

export const GET = handler(async ({ viewer }) => {
	try {
		assertCan(viewer, 'view_orders', { firmId: viewer.firmId });
	} catch (thrown) {
		if (thrown instanceof NotAllowed) throw apiErrorFrom(thrown);
		throw thrown;
	}

	const listed = await db.execute(
		`SELECT body FROM event_log WHERE kind = 'instrument_listed' ORDER BY seq`
	);

	/*
	 * The latest phase per instrument, in one pass.
	 *
	 * A correlated subquery per instrument would be the obvious SQL and would
	 * cost one query per row. Two queries and a Map is O(n) and stays that way
	 * when the venue lists four hundred instruments.
	 */
	const phases = await db.execute(
		`SELECT instrument_id, body FROM event_log WHERE kind = 'phase_changed' ORDER BY seq`
	);

	const phaseOf = new Map<string, string>();
	for (const row of phases.rows) {
		const body = JSON.parse(String(row['body'])) as { instrumentId: string; to: string };
		phaseOf.set(body.instrumentId, body.to);
	}

	const data = listed.rows.map((row) => {
		const body = JSON.parse(String(row['body'])) as {
			instrumentId: string;
			name: string;
			currency: string;
			tickSize: number;
			lotSize: number;
			referencePrice: number;
		};

		return {
			instrumentId: body.instrumentId,
			name: body.name,
			currency: body.currency,
			tickSize: body.tickSize,
			lotSize: body.lotSize,
			phase: phaseOf.get(body.instrumentId) ?? 'closed',
			referencePrice: body.referencePrice,
			referencePriceLabel: formatPrice(body.referencePrice as Price, body.currency)
		};
	});

	/*
	 * Wrapped in `{ data: [...] }` rather than returned as a bare array.
	 *
	 * A bare array leaves nowhere to add pagination or a warning later without
	 * breaking every client, and a top-level JSON array is the shape that made
	 * older browsers vulnerable to script-tag data theft. The envelope costs nine
	 * characters and buys the ability to change your mind.
	 */
	return Response.json({ data });
});
