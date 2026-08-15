/**
 * The market data and order entry API, as remote functions.
 *
 * A `.remote.ts` file is SvelteKit 3's replacement for load functions and form
 * actions: what is exported here runs on the server, and a component that
 * imports it gets a typed, awaitable function that happens to cross a network.
 *
 * The security model is the opposite of a load function's, and it matters more
 * here than anywhere else in the three projects. A load function runs for one
 * URL and can trust `params`. A remote function is a public HTTP endpoint that
 * an algorithm can call four hundred times a second with anything it likes. So
 * every argument has a schema, and the server never reads `event.url` to decide
 * what to return — SvelteKit enforces that by making those properties throw.
 */

import * as v from 'valibot';
import type { Row } from '@libsql/client';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent, query } from '$app/server';
import { asInstrumentId, formatPrice, type Price } from '@sequent/protocol';
import { assertCan, NotAllowed, tailEvents, type Viewer } from '@sequent/store';
import { db } from '#lib/server/db.ts';
import { submit } from '#lib/server/gateway.ts';

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

const symbol = v.pipe(v.string(), v.regex(/^[A-Z][A-Z0-9.]{0,15}$/, 'Not an instrument symbol'));
const positiveInteger = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1e15));

/* -------------------------------------------------------------------------- */
/* Who is asking                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The signed-in viewer, or a redirect.
 *
 * Reads the request through `getRequestEvent()` rather than taking it as a
 * parameter, so a helper deep in a call stack can ask "who is this?" without
 * every layer above threading the answer down.
 */
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

/* -------------------------------------------------------------------------- */
/* Instruments                                                                 */
/* -------------------------------------------------------------------------- */

export interface InstrumentSummary {
	instrumentId: string;
	name: string;
	currency: string;
	tickSize: number;
	lotSize: number;
	phase: string;
	referencePrice: number;
	referenceLabel: string;
}

/**
 * Every listed instrument.
 *
 * A plain `query`, not a live one. Instruments change when the venue lists
 * something, which is roughly never during one person's session — and reserving
 * the live machinery for the thing that genuinely moves underneath people is
 * the difference between a streaming connection that earns its keep and one
 * that is on because it was easy.
 */
export const getInstruments = query(async (): Promise<InstrumentSummary[]> => {
	requireViewer();

	const result = await db.execute(`
		SELECT body FROM event_log
		WHERE kind = 'instrument_listed' ORDER BY seq
	`);

	const phases = await db.execute(`
		SELECT instrument_id, body FROM event_log WHERE kind = 'phase_changed' ORDER BY seq
	`);

	const phaseOf = new Map<string, string>();
	for (const row of phases.rows) {
		const body = JSON.parse(String(row['body'])) as { instrumentId: string; to: string };
		phaseOf.set(body.instrumentId, body.to);
	}

	return result.rows.map((row: Row) => {
		const body = JSON.parse(String(row['body'])) as {
			instrumentId: string;
			name: string;
			currency: string;
			tickSize: number;
			lotSize: number;
			referencePrice: number;
		};

		return {
			...body,
			phase: phaseOf.get(body.instrumentId) ?? 'closed',
			referenceLabel: formatPrice(body.referencePrice as Price, body.currency)
		};
	});
});

/* -------------------------------------------------------------------------- */
/* The live book                                                               */
/* -------------------------------------------------------------------------- */

export interface DepthLevel {
	price: number;
	label: string;
	quantity: number;
	orders: number;
}

export interface MarketSnapshot {
	instrumentId: string;
	phase: string;
	bids: DepthLevel[];
	asks: DepthLevel[];
	last?: { price: number; label: string; quantity: number; aggressor?: string };
	tape: Array<{
		tradeId: string;
		price: number;
		label: string;
		quantity: number;
		at: number;
		aggressor?: string;
	}>;
	seq: number;
}

/**
 * The book and the tape, streamed.
 *
 * `query.live` takes an async generator, and everything it yields goes to every
 * browser subscribed with the same arguments. The shape is always the same
 * three steps: yield the current answer immediately so the page has something
 * to draw, wait for a reason to look again, yield the new answer.
 *
 * ## Coalescing, and why it is not an optimisation
 *
 * A busy instrument produces hundreds of events a second. Yielding once per
 * event would push hundreds of renders a second at a browser that can paint
 * sixty — the queue grows, the tab heats up, and the ladder falls behind the
 * market it is supposed to be showing.
 *
 * So the loop drains **every event waiting** and yields **one** snapshot. Under
 * load that is one render per batch instead of one per event; when quiet it is
 * one render per event, because the batch is one event long. The rate adapts to
 * the market rather than to a timer, which is what a `setInterval` would give
 * you and is worse in both directions: too slow when quiet, still too fast when
 * busy.
 *
 * `request.signal` is what makes this safe to leave running. Close the tab and
 * the generator's `finally` runs and the tail stops. Without it every abandoned
 * terminal leaves a database poller behind forever.
 */
export const watchMarket = query.live(
	v.object({ instrumentId: symbol, depth: v.optional(positiveInteger, 10) }),
	async function* (args) {
		requireViewer();
		const { request } = getRequestEvent();

		yield await snapshotOf(args.instrumentId, args.depth);

		for await (const batch of tailEvents(db, await currentSeq(), {
			signal: request.signal,
			idleMs: 40
		})) {
			// Only wake for events about this instrument. A quiet instrument on a
			// busy venue should cost nothing.
			const relevant = batch.some((record) => {
				const body = record.body as { instrumentId?: string };
				return body.instrumentId === args.instrumentId;
			});

			if (relevant) yield await snapshotOf(args.instrumentId, args.depth);
		}
	}
);

async function currentSeq(): Promise<number> {
	const result = await db.execute('SELECT COALESCE(MAX(seq), 0) AS seq FROM event_log');
	return Number(result.rows[0]?.['seq'] ?? 0);
}

/**
 * Rebuild the visible book from the projections.
 *
 * The depth ladder is derived from live orders rather than kept as its own
 * table, because a projection of "the current book" would have to handle every
 * partial fill and cancellation — and a book that is wrong is worse than a book
 * that is a moment old.
 */
async function snapshotOf(instrumentId: string, depth: number): Promise<MarketSnapshot> {
	const currency = 'GBP';

	const levels = await db.execute({
		sql: `SELECT side, price, SUM(quantity - filled) AS quantity, COUNT(*) AS orders
		      FROM order_record
		      WHERE instrument_id = ? AND status = 'working' AND price IS NOT NULL
		      GROUP BY side, price`,
		args: [instrumentId]
	});

	const bids: DepthLevel[] = [];
	const asks: DepthLevel[] = [];

	for (const row of levels.rows) {
		const level: DepthLevel = {
			price: Number(row['price']),
			label: formatPrice(Number(row['price']) as Price, currency),
			quantity: Number(row['quantity']),
			orders: Number(row['orders'])
		};

		if (Number(row['quantity']) <= 0) continue;
		if (String(row['side']) === 'buy') bids.push(level);
		else asks.push(level);
	}

	bids.sort((a, b) => b.price - a.price);
	asks.sort((a, b) => a.price - b.price);

	const tapeRows = await db.execute({
		sql: `SELECT trade_id, price, quantity, at, aggressor FROM trade
		      WHERE instrument_id = ? ORDER BY seq DESC LIMIT 30`,
		args: [instrumentId]
	});

	const tape = tapeRows.rows.map((row: Row) => ({
		tradeId: String(row['trade_id']),
		price: Number(row['price']),
		label: formatPrice(Number(row['price']) as Price, currency),
		quantity: Number(row['quantity']),
		at: Number(row['at']),
		...(row['aggressor'] === null ? {} : { aggressor: String(row['aggressor']) })
	}));

	const phaseRow = await db.execute({
		sql: `SELECT body FROM event_log WHERE kind = 'phase_changed' AND instrument_id = ? ORDER BY seq DESC LIMIT 1`,
		args: [instrumentId]
	});

	const phase = phaseRow.rows[0]
		? (JSON.parse(String(phaseRow.rows[0]['body'])) as { to: string }).to
		: 'closed';

	return {
		instrumentId,
		phase,
		bids: bids.slice(0, depth),
		asks: asks.slice(0, depth),
		...(tape[0] ? { last: tape[0] } : {}),
		tape,
		seq: await currentSeq()
	};
}

/* -------------------------------------------------------------------------- */
/* A participant's own view                                                    */
/* -------------------------------------------------------------------------- */

export const getMyOrders = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'view_orders');

	const result = await db.execute({
		sql: `SELECT order_id, client_order_id, instrument_id, side, price, quantity, filled,
					 time_in_force, status, cancel_reason, updated_at
			  FROM order_record WHERE firm_id = ? ORDER BY seq DESC LIMIT 100`,
		args: [viewer.firmId]
	});

	return result.rows.map((row: Row) => ({
		orderId: String(row['order_id']),
		clientOrderId: String(row['client_order_id']),
		instrumentId: String(row['instrument_id']),
		side: String(row['side']),
		price: row['price'] === null ? null : Number(row['price']),
		priceLabel:
			row['price'] === null ? 'market' : formatPrice(Number(row['price']) as Price, 'GBP'),
		quantity: Number(row['quantity']),
		filled: Number(row['filled']),
		timeInForce: String(row['time_in_force']),
		status: String(row['status']),
		cancelReason: row['cancel_reason'] === null ? null : String(row['cancel_reason']),
		updatedAt: Number(row['updated_at'])
	}));
});

export const getMyPositions = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'view_positions');

	const result = await db.execute({
		sql: `SELECT p.account_id, p.instrument_id, p.quantity, p.cost_basis, p.realised_pnl
			  FROM position p JOIN trading_account a ON a.account_id = p.account_id
			  WHERE a.firm_id = ? ORDER BY p.instrument_id`,
		args: [viewer.firmId]
	});

	return result.rows.map((row: Row) => {
		const quantity = Number(row['quantity']);
		const basis = Number(row['cost_basis']);

		return {
			accountId: String(row['account_id']),
			instrumentId: String(row['instrument_id']),
			quantity,
			// Average price is only meaningful with a position to average over.
			averagePrice: quantity === 0 ? null : Math.round(basis / quantity),
			averageLabel:
				quantity === 0 ? '—' : formatPrice(Math.round(basis / quantity) as Price, 'GBP'),
			realisedPnl: Number(row['realised_pnl']),
			realisedLabel: formatPrice(Math.abs(Number(row['realised_pnl'])) as Price, 'GBP')
		};
	});
});

/* -------------------------------------------------------------------------- */
/* Order entry                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Send an order.
 *
 * Everything this does is in `submit`: validate, authorise, append. It returns
 * the sequence number rather than the outcome, and that is the honest answer —
 * the venue has accepted the *command*, and whether the order is accepted,
 * rejected or filled is decided by the engine a moment later and arrives on the
 * event stream.
 *
 * Pretending otherwise would mean blocking here until the engine caught up,
 * which is how a gateway acquires the engine's latency and a deadlock risk in
 * one move.
 */
export const placeOrder = command(
	v.object({
		accountId: v.pipe(v.string(), v.minLength(1)),
		instrumentId: symbol,
		clientOrderId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
		side: v.picklist(['buy', 'sell'] as const),
		orderType: v.picklist(['limit', 'market'] as const),
		price: v.optional(positiveInteger),
		quantity: positiveInteger,
		timeInForce: v.picklist(['gtc', 'day', 'ioc', 'fok'] as const)
	}),
	async (input) => {
		const viewer = requireViewer();

		const seq = await submit(viewer, {
			kind: 'place_order',
			selfTradePrevention: 'cancel_both',
			...input,
			instrumentId: asInstrumentId(input.instrumentId)
		});

		// Refresh the participant's own order list in the same response, so the
		// ticket does not have to fire a second request to show what it just sent.
		void getMyOrders().refresh();

		return { seq };
	}
);

export const cancelOrder = command(
	v.object({ clientOrderId: v.pipe(v.string(), v.minLength(1)) }),
	async ({ clientOrderId }) => {
		const viewer = requireViewer();

		const seq = await submit(viewer, {
			kind: 'cancel_order',
			clientOrderId
		});

		void getMyOrders().refresh();
		return { seq };
	}
);
