import { beforeEach, describe, expect, it } from 'vitest';
import {
	asAccountId,
	asClientOrderId,
	asFirmId,
	asInstrumentId,
	asUserId,
	price,
	quantity,
	type Command,
	type Event,
	type SequencedCommand
} from '@sequent/protocol';
import { apply } from './apply.ts';
import { isCrossed } from './book.ts';
import { newState, positionOf, type EngineState } from './state.ts';

/**
 * The engine, end to end.
 *
 * Every test here drives the venue the way the log does — a list of commands in
 * — and asserts on the events that come out. Nothing reaches inside to poke at
 * the book, because nothing in production does either: if a behaviour is not
 * visible in the event stream, participants cannot see it and it does not exist.
 */

const VOD = asInstrumentId('VOD.L');
const ADMIN = asUserId('venue-admin');

const FIRM_A = asFirmId('firm-a');
const FIRM_B = asFirmId('firm-b');
const ACC_A = asAccountId('acc-a');
const ACC_B = asAccountId('acc-b');

let state: EngineState;
let seq: number;
let clientOrderCounter: number;

/** Feed one command in and get the events out. */
function send(body: Command): Event[] {
	seq += 1;
	const sequenced: SequencedCommand = {
		seq,
		// The clock arrives on the command. The engine never reads one.
		receivedAt: 1_700_000_000_000 + seq,
		version: 1,
		body
	};
	return apply(state, sequenced);
}

function list(overrides: Partial<Extract<Command, { kind: 'list_instrument' }>> = {}) {
	return send({
		kind: 'list_instrument',
		firmId: FIRM_A,
		actorId: ADMIN,
		instrumentId: VOD,
		name: 'Vodafone Group',
		currency: 'GBP',
		tickSize: 25,
		lotSize: 1,
		referencePrice: price(455_000),
		...overrides
	});
}

function phase(to: Extract<Command, { kind: 'set_phase' }>['phase']) {
	return send({
		kind: 'set_phase',
		firmId: FIRM_A,
		actorId: ADMIN,
		instrumentId: VOD,
		phase: to,
		reason: 'test'
	});
}

interface OrderOptions {
	firm?: typeof FIRM_A;
	account?: typeof ACC_A;
	side?: 'buy' | 'sell';
	at?: number;
	qty?: number;
	tif?: 'gtc' | 'day' | 'ioc' | 'fok';
	type?: 'limit' | 'market';
	stp?: 'cancel_resting' | 'cancel_aggressing' | 'cancel_both';
	clientOrderId?: string;
}

function place(options: OrderOptions = {}) {
	clientOrderCounter += 1;
	const type = options.type ?? 'limit';

	return send({
		kind: 'place_order',
		firmId: options.firm ?? FIRM_A,
		actorId: asUserId('trader'),
		accountId: options.account ?? ACC_A,
		instrumentId: VOD,
		clientOrderId: asClientOrderId(options.clientOrderId ?? `C${clientOrderCounter}`),
		side: options.side ?? 'buy',
		orderType: type,
		...(type === 'limit' ? { price: price(options.at ?? 455_000) } : {}),
		quantity: quantity(options.qty ?? 100),
		timeInForce: options.tif ?? 'gtc',
		selfTradePrevention: options.stp ?? 'cancel_both'
	});
}

const kinds = (events: Event[]) => events.map((event) => event.kind);
const only = <K extends Event['kind']>(events: Event[], kind: K) =>
	events.filter((event): event is Extract<Event, { kind: K }> => event.kind === kind);

beforeEach(() => {
	state = newState();
	seq = 0;
	clientOrderCounter = 0;
	list();
	phase('continuous');
});

/* -------------------------------------------------------------------------- */

describe('placing an order', () => {
	it('accepts a limit order and rests it', () => {
		const events = place({ side: 'buy', at: 455_000, qty: 100 });

		expect(kinds(events)).toEqual(['order_accepted']);
		const accepted = only(events, 'order_accepted')[0]!;
		expect(accepted.price).toBe(455_000);
		expect(accepted.queuePosition).toBe(1);
		// The venue's id is derived from the sequence number that placed it.
		expect(accepted.orderId).toMatch(/^O-\d{16}$/);
	});

	it('matches an aggressive order against a resting one', () => {
		place({ side: 'sell', at: 455_000, qty: 100, firm: FIRM_A });
		const events = place({ side: 'buy', at: 455_000, qty: 60, firm: FIRM_B, account: ACC_B });

		expect(kinds(events)).toEqual(['order_accepted', 'traded']);

		const trade = only(events, 'traded')[0]!;
		expect(trade.quantity).toBe(60);
		expect(trade.price).toBe(455_000);
		expect(trade.aggressor).toBe('buy');
		expect(trade.buyFirmId).toBe(FIRM_B);
		expect(trade.sellFirmId).toBe(FIRM_A);
	});

	it('charges the taker and pays the maker', () => {
		place({ side: 'sell', at: 455_000, qty: 100, firm: FIRM_A });
		const trade = only(
			place({ side: 'buy', at: 455_000, qty: 100, firm: FIRM_B, account: ACC_B }),
			'traded'
		)[0]!;

		// Notional is 455_000 × 100. Taker pays 3bps, maker is paid 1bps.
		expect(trade.buyerFee).toBeGreaterThan(0);
		expect(trade.sellerFee).toBeLessThan(0);
		// The venue keeps the difference, so the two never net to zero.
		expect(trade.buyerFee + trade.sellerFee).toBeGreaterThan(0);
	});

	it('moves both positions by the same amount in opposite directions', () => {
		place({ side: 'sell', at: 455_000, qty: 100, firm: FIRM_A, account: ACC_A });
		place({ side: 'buy', at: 455_000, qty: 100, firm: FIRM_B, account: ACC_B });

		expect(positionOf(state, ACC_A, VOD)).toBe(-100);
		expect(positionOf(state, ACC_B, VOD)).toBe(100);
	});

	it('leaves the book uncrossed after an aggressive sweep', () => {
		place({ side: 'sell', at: 455_000, qty: 50, firm: FIRM_A });
		place({ side: 'sell', at: 455_025, qty: 50, firm: FIRM_A, clientOrderId: 'S2' });
		place({ side: 'buy', at: 455_050, qty: 200, firm: FIRM_B, account: ACC_B });

		expect(isCrossed(state.instruments.get(VOD)!.book)).toBe(false);
	});
});

describe('idempotency', () => {
	it('refuses a repeated client order id while the first is still working', () => {
		place({ clientOrderId: 'RETRY-1' });
		const events = place({ clientOrderId: 'RETRY-1' });

		const rejected = only(events, 'order_rejected')[0]!;
		expect(rejected.reason).toBe('duplicate_client_order_id');
	});

	it('lets the reference be reused once the order is no longer live', () => {
		place({ clientOrderId: 'REUSE-1' });
		send({
			kind: 'cancel_order',
			firmId: FIRM_A,
			actorId: asUserId('trader'),
			clientOrderId: asClientOrderId('REUSE-1')
		});

		expect(kinds(place({ clientOrderId: 'REUSE-1' }))).toEqual(['order_accepted']);
	});

	it('does not confuse two firms using the same reference', () => {
		place({ firm: FIRM_A, clientOrderId: 'ORDER-1' });
		// firm-b choosing the same name is not a collision, it is Tuesday.
		expect(kinds(place({ firm: FIRM_B, account: ACC_B, clientOrderId: 'ORDER-1' }))).toEqual([
			'order_accepted'
		]);
	});
});

describe('time in force', () => {
	it('cancels the unfilled remainder of an immediate-or-cancel order', () => {
		place({ side: 'sell', at: 455_000, qty: 40, firm: FIRM_A });
		const events = place({
			side: 'buy',
			at: 455_000,
			qty: 100,
			tif: 'ioc',
			firm: FIRM_B,
			account: ACC_B
		});

		expect(kinds(events)).toEqual(['order_accepted', 'traded', 'order_cancelled']);
		const cancelled = only(events, 'order_cancelled')[0]!;
		expect(cancelled.remainingQuantity).toBe(60);
		expect(cancelled.reason).toBe('ioc_remainder');
	});

	it('refuses a fill-or-kill order the book cannot fill completely', () => {
		place({ side: 'sell', at: 455_000, qty: 40, firm: FIRM_A });
		const events = place({
			side: 'buy',
			at: 455_000,
			qty: 100,
			tif: 'fok',
			firm: FIRM_B,
			account: ACC_B
		});

		expect(only(events, 'order_rejected')[0]!.reason).toBe('insufficient_liquidity');
		// Nothing traded, and the resting order is untouched.
		expect(kinds(events)).toEqual(['order_rejected']);
	});

	it('fills a fill-or-kill order the book can satisfy', () => {
		place({ side: 'sell', at: 455_000, qty: 100, firm: FIRM_A });
		const events = place({
			side: 'buy',
			at: 455_000,
			qty: 100,
			tif: 'fok',
			firm: FIRM_B,
			account: ACC_B
		});

		expect(kinds(events)).toEqual(['order_accepted', 'traded']);
	});

	it('refuses a market order with nothing on the other side', () => {
		const events = place({
			side: 'buy',
			type: 'market',
			qty: 100,
			tif: 'ioc',
			firm: FIRM_B,
			account: ACC_B
		});

		expect(only(events, 'order_rejected')[0]!.reason).toBe('no_opposing_liquidity');
	});

	it('never publishes the sentinel price a market order is stored at', () => {
		place({ side: 'sell', at: 455_000, qty: 100, firm: FIRM_A });
		const events = place({
			side: 'buy',
			type: 'market',
			qty: 100,
			tif: 'ioc',
			firm: FIRM_B,
			account: ACC_B
		});

		expect(only(events, 'order_accepted')[0]!.price).toBeUndefined();
	});
});

describe('the grids and the collar', () => {
	it('refuses a price off the tick ladder', () => {
		expect(only(place({ at: 455_001 }), 'order_rejected')[0]!.reason).toBe('price_off_tick');
	});

	it('refuses a quantity off the lot grid', () => {
		/*
		 * A second instrument, because re-listing VOD would do nothing:
		 * `list_instrument` is deliberately idempotent so that a replay can apply
		 * the same command twice without the venue diverging. The first version of
		 * this test re-listed VOD with a bigger lot size and then wondered why the
		 * order was accepted — the engine was right and the test was wrong.
		 */
		const BP = asInstrumentId('BP.L');

		send({
			kind: 'list_instrument',
			firmId: FIRM_A,
			actorId: ADMIN,
			instrumentId: BP,
			name: 'BP plc',
			currency: 'GBP',
			tickSize: 25,
			lotSize: 100,
			referencePrice: price(455_000)
		});
		send({
			kind: 'set_phase',
			firmId: FIRM_A,
			actorId: ADMIN,
			instrumentId: BP,
			phase: 'continuous',
			reason: 'open'
		});

		const events = send({
			kind: 'place_order',
			firmId: FIRM_A,
			actorId: asUserId('trader'),
			accountId: ACC_A,
			instrumentId: BP,
			clientOrderId: asClientOrderId('LOT-1'),
			side: 'buy',
			orderType: 'limit',
			price: price(455_000),
			quantity: quantity(150),
			timeInForce: 'gtc',
			selfTradePrevention: 'cancel_both'
		});

		expect(only(events, 'order_rejected')[0]!.reason).toBe('quantity_off_lot');
	});

	it('refuses a price far from the reference — the fat-finger guard', () => {
		// Reference is 455_000 and the default collar is 10%.
		expect(only(place({ at: 4_550_000 }), 'order_rejected')[0]!.reason).toBe(
			'price_outside_collar'
		);
	});

	it('moves the reference to the last traded price', () => {
		place({ side: 'sell', at: 455_500, qty: 10, firm: FIRM_A });
		place({ side: 'buy', at: 455_500, qty: 10, firm: FIRM_B, account: ACC_B });

		expect(state.instruments.get(VOD)!.referencePrice).toBe(455_500);
	});
});

describe('risk limits', () => {
	beforeEach(() => {
		send({
			kind: 'set_risk_limits',
			firmId: FIRM_A,
			actorId: ADMIN,
			accountId: ACC_A,
			maxOrderQuantity: quantity(500),
			maxOrderNotional: 1e15,
			maxPositionQuantity: quantity(1_000),
			priceCollarBps: 1_000
		});
	});

	it('refuses an order bigger than the per-order limit', () => {
		expect(only(place({ qty: 501 }), 'order_rejected')[0]!.reason).toBe('exceeds_max_order_size');
	});

	it('counts resting exposure towards the position limit', () => {
		// Three orders of 400 are each inside the per-order limit, and together
		// they commit more than the 1,000 position limit allows.
		expect(kinds(place({ qty: 400, clientOrderId: 'P1' }))).toEqual(['order_accepted']);
		expect(kinds(place({ qty: 400, clientOrderId: 'P2' }))).toEqual(['order_accepted']);

		const third = place({ qty: 400, clientOrderId: 'P3' });
		expect(only(third, 'order_rejected')[0]!.reason).toBe('exceeds_position_limit');
	});

	it('always lets an order that reduces exposure through', () => {
		place({ side: 'sell', at: 455_000, qty: 500, firm: FIRM_B, account: ACC_B });
		place({ side: 'buy', at: 455_000, qty: 500, firm: FIRM_A, account: ACC_A });
		expect(positionOf(state, ACC_A, VOD)).toBe(500);

		// Tighten the limit below the position they already hold.
		send({
			kind: 'set_risk_limits',
			firmId: FIRM_A,
			actorId: ADMIN,
			accountId: ACC_A,
			maxOrderQuantity: quantity(500),
			maxOrderNotional: 1e15,
			maxPositionQuantity: quantity(100),
			priceCollarBps: 1_000
		});

		// Selling reduces the position, so it is allowed even though the account
		// is over its limit. Refusing would trap them.
		expect(kinds(place({ side: 'sell', at: 454_000, qty: 500, clientOrderId: 'FLAT' }))).toEqual([
			'order_accepted'
		]);
	});
});

describe('the kill switch', () => {
	it('pulls every resting order and refuses new ones', () => {
		place({ clientOrderId: 'K1' });
		place({ clientOrderId: 'K2' });

		const events = send({
			kind: 'set_kill_switch',
			firmId: FIRM_A,
			actorId: ADMIN,
			targetFirmId: FIRM_A,
			engaged: true,
			reason: 'algo misbehaving'
		});

		// Cancellations first, then the explanation.
		expect(kinds(events)).toEqual(['order_cancelled', 'order_cancelled', 'kill_switch_changed']);
		expect(only(events, 'kill_switch_changed')[0]!.ordersCancelled).toBe(2);
		expect(only(events, 'order_cancelled')[0]!.reason).toBe('kill_switch');

		expect(only(place({ clientOrderId: 'K3' }), 'order_rejected')[0]!.reason).toBe(
			'kill_switch_engaged'
		);
	});

	it('does not touch another firm', () => {
		place({ firm: FIRM_B, account: ACC_B, clientOrderId: 'B1' });

		send({
			kind: 'set_kill_switch',
			firmId: FIRM_A,
			actorId: ADMIN,
			targetFirmId: FIRM_A,
			engaged: true,
			reason: 'test'
		});

		expect(kinds(place({ firm: FIRM_B, account: ACC_B, clientOrderId: 'B2' }))).toEqual([
			'order_accepted'
		]);
	});

	it('lets trading resume when released', () => {
		send({
			kind: 'set_kill_switch',
			firmId: FIRM_A,
			actorId: ADMIN,
			targetFirmId: FIRM_A,
			engaged: true,
			reason: 'test'
		});
		send({
			kind: 'set_kill_switch',
			firmId: FIRM_A,
			actorId: ADMIN,
			targetFirmId: FIRM_A,
			engaged: false,
			reason: 'fixed'
		});

		expect(kinds(place())).toEqual(['order_accepted']);
	});
});

describe('cancel and replace', () => {
	it('keeps queue priority when the quantity shrinks', () => {
		place({ clientOrderId: 'R1', qty: 100 });

		const events = send({
			kind: 'replace_order',
			firmId: FIRM_A,
			actorId: asUserId('trader'),
			clientOrderId: asClientOrderId('R1'),
			newClientOrderId: asClientOrderId('R2'),
			quantity: quantity(60)
		});

		const replaced = only(events, 'order_replaced')[0]!;
		expect(replaced.keptPriority).toBe(true);
		expect(replaced.newOrderId).toBe(replaced.orderId);
	});

	it('loses priority when the price moves', () => {
		place({ clientOrderId: 'R1', qty: 100, at: 455_000 });

		const events = send({
			kind: 'replace_order',
			firmId: FIRM_A,
			actorId: asUserId('trader'),
			clientOrderId: asClientOrderId('R1'),
			newClientOrderId: asClientOrderId('R2'),
			price: price(455_025),
			quantity: quantity(100)
		});

		const replaced = only(events, 'order_replaced')[0]!;
		expect(replaced.keptPriority).toBe(false);
		expect(replaced.newOrderId).not.toBe(replaced.orderId);
	});

	it('loses priority when the quantity grows', () => {
		place({ clientOrderId: 'R1', qty: 100 });

		const events = send({
			kind: 'replace_order',
			firmId: FIRM_A,
			actorId: asUserId('trader'),
			clientOrderId: asClientOrderId('R1'),
			newClientOrderId: asClientOrderId('R2'),
			quantity: quantity(200)
		});

		expect(only(events, 'order_replaced')[0]!.keptPriority).toBe(false);
	});

	it('reports an unknown reference rather than throwing', () => {
		const events = send({
			kind: 'cancel_order',
			firmId: FIRM_A,
			actorId: asUserId('trader'),
			clientOrderId: asClientOrderId('NEVER-EXISTED')
		});

		expect(only(events, 'order_rejected')[0]!.reason).toBe('unknown_order');
	});
});

describe('phases', () => {
	it('refuses orders when the instrument is halted', () => {
		phase('halted');
		expect(only(place(), 'order_rejected')[0]!.reason).toBe('instrument_not_trading');
	});

	it('pulls the book when the instrument is halted', () => {
		place({ clientOrderId: 'H1' });
		const events = phase('halted');

		expect(only(events, 'order_cancelled')[0]!.reason).toBe('instrument_halted');
	});

	it('expires day orders at the close and leaves good-till-cancelled alone', () => {
		place({ clientOrderId: 'DAY', tif: 'day' });
		place({ clientOrderId: 'GTC', tif: 'gtc', at: 454_975 });

		const cancelled = only(phase('closed'), 'order_cancelled');

		expect(cancelled).toHaveLength(1);
		expect(cancelled[0]!.clientOrderId).toBe('DAY');
		expect(cancelled[0]!.reason).toBe('day_expired');
	});
});

describe('determinism', () => {
	it('produces identical events when the same commands are replayed', () => {
		const script: Command[] = [
			{
				kind: 'place_order',
				firmId: FIRM_A,
				actorId: asUserId('trader'),
				accountId: ACC_A,
				instrumentId: VOD,
				clientOrderId: asClientOrderId('D1'),
				side: 'sell',
				orderType: 'limit',
				price: price(455_000),
				quantity: quantity(100),
				timeInForce: 'gtc',
				selfTradePrevention: 'cancel_both'
			},
			{
				kind: 'place_order',
				firmId: FIRM_B,
				actorId: asUserId('trader'),
				accountId: ACC_B,
				instrumentId: VOD,
				clientOrderId: asClientOrderId('D2'),
				side: 'buy',
				orderType: 'limit',
				price: price(455_025),
				quantity: quantity(150),
				timeInForce: 'gtc',
				selfTradePrevention: 'cancel_both'
			}
		];

		const run = () => {
			const fresh = newState();
			const events: Event[] = [];
			let at = 0;

			for (const body of [
				{
					kind: 'list_instrument' as const,
					firmId: FIRM_A,
					actorId: ADMIN,
					instrumentId: VOD,
					name: 'Vodafone Group',
					currency: 'GBP',
					tickSize: 25,
					lotSize: 1,
					referencePrice: price(455_000)
				},
				{
					kind: 'set_phase' as const,
					firmId: FIRM_A,
					actorId: ADMIN,
					instrumentId: VOD,
					phase: 'continuous' as const,
					reason: 'open'
				},
				...script
			]) {
				at += 1;
				events.push(
					...apply(fresh, { seq: at, receivedAt: 1_700_000_000_000 + at, version: 1, body })
				);
			}

			return events;
		};

		// Byte-identical, including every derived identifier. This is the property
		// the entire architecture is built to preserve.
		expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
	});
});
