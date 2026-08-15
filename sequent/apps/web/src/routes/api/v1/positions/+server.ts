/**
 * `GET /api/v1/positions` — what the firm is holding, and what it cost.
 *
 * Not paginated, and that is a decision rather than an omission. A firm has one
 * position per account per instrument; even a large member on a large venue has
 * hundreds, not millions. Adding a cursor here would be ceremony that every
 * client has to implement and no client will ever exercise.
 *
 * The rule worth taking away: paginate collections that grow **with time**
 * (trades, orders, events) and not collections that grow with the size of the
 * business (accounts, instruments, positions). The first kind is unbounded; the
 * second has a ceiling somebody in operations already worries about.
 */

import { formatPrice, type Price } from '@sequent/protocol';
import { assertCan, NotAllowed } from '@sequent/store';
import { apiErrorFrom, handler } from '#lib/server/api.ts';
import { db } from '#lib/server/db.ts';

export const GET = handler(async ({ viewer }, { url }) => {
	try {
		assertCan(viewer, 'view_positions', { firmId: viewer.firmId });
	} catch (thrown) {
		if (thrown instanceof NotAllowed) throw apiErrorFrom(thrown);
		throw thrown;
	}

	const flat = url.searchParams.get('include_flat') === 'true';

	/*
	 * The JOIN onto `trading_account` is the tenant boundary.
	 *
	 * `position` has no `firm_id` column — it is keyed by account — so the only
	 * way to scope it is through the account's firm. A query that filtered on
	 * `account_id IN (...)` built from the viewer's assignments would look
	 * equivalent and would quietly hide a risk manager's own firm's desks from
	 * them, because they are assigned to none.
	 */
	const result = await db.execute({
		sql: `SELECT p.account_id, p.instrument_id, p.quantity, p.cost_basis, p.realised_pnl,
					 p.updated_at
			  FROM position p
			  JOIN trading_account a ON a.account_id = p.account_id
			  WHERE a.firm_id = ? ${flat ? '' : 'AND p.quantity <> 0'}
			  ORDER BY p.account_id, p.instrument_id`,
		args: [viewer.firmId]
	});

	const data = result.rows.map((row) => {
		const quantity = Number(row['quantity']);
		const basis = Number(row['cost_basis']);

		/*
		 * Average price is `null` when flat, not zero.
		 *
		 * Zero is a price. A client that renders it will show a position bought at
		 * £0.00, and one that computes P&L against it will produce a number with no
		 * meaning at all. `null` forces the question to be answered.
		 */
		const average = quantity === 0 ? null : Math.round(basis / quantity);

		return {
			accountId: String(row['account_id']),
			instrumentId: String(row['instrument_id']),
			quantity,
			// Signed, so a short is negative. A `side` field plus an absolute
			// quantity would be the same information in two fields that can disagree.
			averagePrice: average,
			averagePriceLabel: average === null ? null : formatPrice(average as Price, 'GBP'),
			costBasis: basis,
			realisedPnl: Number(row['realised_pnl']),
			updatedAt: Number(row['updated_at'])
		};
	});

	return Response.json({ data });
});
