import * as v from 'valibot';
import type { Row } from '@libsql/client';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent, query } from '$app/server';
import { formatPrice, type Price } from '@sequent/protocol';
import { assertCan, NotAllowed, trialBalance, type Viewer } from '@sequent/store';
import { db } from '#lib/server/db.ts';
import { submit } from '#lib/server/gateway.ts';

function requireViewer(): Viewer {
	const { locals } = getRequestEvent();
	if (!locals.viewer) error(401, 'Sign in to continue.');
	return locals.viewer;
}

function requireCan(viewer: Viewer, action: Parameters<typeof assertCan>[1]): void {
	try {
		assertCan(viewer, action, { firmId: viewer.firmId });
	} catch (thrown) {
		if (thrown instanceof NotAllowed) error(thrown.status as 403, thrown.message);
		throw thrown;
	}
}

/** The firm's exposure, and whether it is currently stopped. */
export const getExposure = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'view_positions');

	const positions = await db.execute({
		sql: `SELECT p.account_id, p.instrument_id, p.quantity, p.cost_basis
			  FROM position p JOIN trading_account a ON a.account_id = p.account_id
			  WHERE a.firm_id = ?`,
		args: [viewer.firmId]
	});

	const working = await db.execute({
		sql: `SELECT account_id, side, SUM(quantity - filled) AS quantity
			  FROM order_record WHERE firm_id = ? AND status = 'working' GROUP BY account_id, side`,
		args: [viewer.firmId]
	});

	const killed = await db.execute({
		sql: `SELECT body FROM event_log WHERE kind = 'kill_switch_changed' ORDER BY seq DESC LIMIT 20`
	});

	let stopped = false;
	for (const row of killed.rows) {
		const body = JSON.parse(String(row['body'])) as { firmId: string; engaged: boolean };
		if (body.firmId === viewer.firmId) {
			stopped = body.engaged;
			break;
		}
	}

	return {
		stopped,
		positions: positions.rows.map((row: Row) => ({
			accountId: String(row['account_id']),
			instrumentId: String(row['instrument_id']),
			quantity: Number(row['quantity']),
			exposureLabel: formatPrice(Math.abs(Number(row['cost_basis'])) as Price, 'GBP')
		})),
		working: working.rows.map((row: Row) => ({
			accountId: String(row['account_id']),
			side: String(row['side']),
			quantity: Number(row['quantity'])
		}))
	};
});

/** The venue's books. Only roles that may see the ledger get this. */
export const getTrialBalance = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'view_ledger');

	const { accounts, total } = await trialBalance(db);

	return {
		total,
		accounts: accounts
			.filter(
				(account) => account.accountId.includes(viewer.firmId) || viewer.role === 'venue_operator'
			)
			.map((account) => ({
				...account,
				label: formatPrice(Math.abs(account.balance) as Price, 'GBP'),
				negative: account.balance < 0
			}))
	};
});

/**
 * The kill switch.
 *
 * One action, and it does two things: stops new orders and pulls everything
 * already resting. Doing only the first would leave an algorithm that has
 * already flooded the book with mispriced liquidity exposed to everyone who
 * noticed.
 */
export const setKillSwitch = command(
	v.object({ engaged: v.boolean(), reason: v.pipe(v.string(), v.trim(), v.maxLength(200)) }),
	async ({ engaged, reason }) => {
		const viewer = requireViewer();

		const seq = await submit(viewer, {
			kind: 'set_kill_switch',
			targetFirmId: viewer.firmId,
			engaged,
			reason: reason || (engaged ? 'Stopped by risk' : 'Released by risk')
		});

		void getExposure().refresh();
		return { seq };
	}
);

export const setRiskLimits = command(
	v.object({
		accountId: v.pipe(v.string(), v.minLength(1)),
		maxOrderQuantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
		maxOrderNotional: v.pipe(v.number(), v.integer(), v.minValue(1)),
		maxPositionQuantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
		priceCollarBps: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000))
	}),
	async (input) => {
		const viewer = requireViewer();

		const seq = await submit(viewer, {
			kind: 'set_risk_limits',
			...input
		});

		return { seq };
	}
);
