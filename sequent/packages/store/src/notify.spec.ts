import { describe, expect, it } from 'vitest';
import {
	asAccountId,
	asClientOrderId,
	asFirmId,
	asInstrumentId,
	asOrderId,
	tradeIdFor,
	asUserId,
	price,
	quantity,
	type Amount,
	type Event
} from '@sequent/protocol';
import type { EventRecord } from './log.ts';
import { notificationsFor } from './notify.ts';

/**
 * Which events become notifications.
 *
 * A pure function, so the tests need no database and no venue — which is the
 * point of having written it as one. "What does a member receive when a trade
 * happens" is answered by an assertion rather than by running an exchange and
 * reading a log.
 */

const record = (body: Event, seq = 42): EventRecord => ({
	seq,
	causedBy: 1,
	at: 1_700_000_000_000,
	version: 1,
	body
});

const trade = (overrides: Partial<Extract<Event, { kind: 'traded' }>> = {}, seq = 42) =>
	record(
		{
			kind: 'traded',
			tradeId: tradeIdFor(seq, 1),
			instrumentId: asInstrumentId('VOD.L'),
			price: price(455_000),
			quantity: quantity(100),
			buyOrderId: asOrderId('O-1'),
			buyFirmId: asFirmId('firm-a'),
			buyAccountId: asAccountId('acc-a'),
			sellOrderId: asOrderId('O-2'),
			sellFirmId: asFirmId('firm-b'),
			sellAccountId: asAccountId('acc-b'),
			aggressor: 'buy',
			buyerFee: 137 as Amount,
			sellerFee: -45 as Amount,
			...overrides
		},
		seq
	);

describe('trades', () => {
	it('produces one notification per side', () => {
		const messages = notificationsFor(trade());

		expect(messages).toHaveLength(2);
		expect(messages.map((m) => m.firmId)).toEqual(['firm-a', 'firm-b']);
	});

	it('tells each side which side it was', () => {
		const [buyer, seller] = notificationsFor(trade());

		expect((buyer!.payload as { data: { side: string } }).data.side).toBe('buy');
		expect((seller!.payload as { data: { side: string } }).data.side).toBe('sell');
	});

	it('never reveals the counterparty', () => {
		/*
		 * In a centrally cleared market the counterparty is the clearing house.
		 * Telling Northgate they bought from Lowfield hands both of them
		 * information they would pay for.
		 */
		for (const message of notificationsFor(trade())) {
			const serialised = JSON.stringify(message.payload);

			if (message.firmId === 'firm-a') expect(serialised).not.toContain('firm-b');
			else expect(serialised).not.toContain('firm-a');
		}
	});

	it('sends each side its own fee, signed', () => {
		const [buyer, seller] = notificationsFor(trade());

		expect((buyer!.payload as { data: { fee: number } }).data.fee).toBe(137);
		// Negative: the resting side earns a maker rebate. One signed field means
		// a client's P&L is `notional - fee` either way, with no branch to get
		// backwards.
		expect((seller!.payload as { data: { fee: number } }).data.fee).toBe(-45);
	});

	it('gives both legs distinct keys when one firm trades with itself', () => {
		/*
		 * The bug this is here to prevent. Two desks at the same firm cross; with a
		 * key of `seq:trade.executed:tradeId` both legs collide, the outbox's
		 * unique constraint swallows the second, and the firm is told about one
		 * side of its own trade.
		 *
		 * It would surface months later as a reconciliation mismatch, by which
		 * point nobody suspects the notification layer.
		 */
		const messages = notificationsFor(
			trade({ sellFirmId: asFirmId('firm-a'), sellAccountId: asAccountId('acc-a2') })
		);

		expect(messages).toHaveLength(2);
		expect(messages[0]!.idempotencyKey).not.toBe(messages[1]!.idempotencyKey);
	});

	it('reports a null aggressor for an auction trade', () => {
		/*
		 * The field is *omitted*, not set to undefined. Under
		 * `exactOptionalPropertyTypes` those are different things, and the
		 * distinction is the right one: "absent" and "present but undefined" mean
		 * different things on the wire.
		 */
		const { aggressor: _omitted, ...withoutAggressor } = trade().body as Extract<
			Event,
			{ kind: 'traded' }
		>;

		const messages = notificationsFor(record(withoutAggressor as Event));

		// An auction has no aggressor by definition — everybody crossed at one
		// price simultaneously. `null` says that; omitting the field would leave a
		// client guessing.
		expect((messages[0]!.payload as { data: { aggressor: unknown } }).data.aggressor).toBeNull();
	});
});

describe('orders', () => {
	it('notifies the accepting firm', () => {
		const messages = notificationsFor(
			record({
				kind: 'order_accepted',
				orderId: asOrderId('O-1'),
				clientOrderId: asClientOrderId('C-1'),
				firmId: asFirmId('firm-a'),
				accountId: asAccountId('acc-a'),
				instrumentId: asInstrumentId('VOD.L'),
				side: 'buy',
				price: price(455_000),
				quantity: quantity(100),
				timeInForce: 'gtc',
				queuePosition: 3
			})
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]!.payload).toMatchObject({ event: 'order.accepted' });
	});

	it('notifies a rejection, with the machine-readable reason', () => {
		const messages = notificationsFor(
			record({
				kind: 'order_rejected',
				firmId: asFirmId('firm-a'),
				accountId: asAccountId('acc-a'),
				instrumentId: asInstrumentId('VOD.L'),
				clientOrderId: asClientOrderId('C-1'),
				reason: 'price_off_tick',
				detail: 'Price 455001 is not a multiple of the 25 tick.'
			})
		);

		expect((messages[0]!.payload as { data: { reason: string } }).data.reason).toBe(
			'price_off_tick'
		);
	});

	it('reports what was left when an order was cancelled', () => {
		const messages = notificationsFor(
			record({
				kind: 'order_cancelled',
				orderId: asOrderId('O-1'),
				clientOrderId: asClientOrderId('C-1'),
				firmId: asFirmId('firm-a'),
				accountId: asAccountId('acc-a'),
				instrumentId: asInstrumentId('VOD.L'),
				remainingQuantity: quantity(60),
				reason: 'requested'
			})
		);

		expect((messages[0]!.payload as { data: { remaining: number } }).data.remaining).toBe(60);
	});
});

describe('venue-wide events', () => {
	it('leaves a phase change unaddressed, for fan-out at delivery time', () => {
		const messages = notificationsFor(
			record({
				kind: 'phase_changed',
				instrumentId: asInstrumentId('VOD.L'),
				from: 'auction',
				to: 'continuous',
				reason: 'open'
			})
		);

		/*
		 * `firmId` undefined, deliberately. Enqueuing one row per firm here would
		 * decide the fan-out when the event is projected — so a firm subscribing
		 * ten seconds later misses it, and the outbox grows with the membership
		 * rather than with the number of events.
		 */
		expect(messages[0]!.firmId).toBeUndefined();
	});
});

describe('the kill switch', () => {
	it('sends a webhook and an email, in one enqueue', () => {
		const messages = notificationsFor(
			record({
				kind: 'kill_switch_changed',
				firmId: asFirmId('firm-a'),
				engaged: true,
				reason: 'exposure breach',
				setBy: asUserId('u1'),
				ordersCancelled: 14
			})
		);

		// The one event where somebody must be told even if their integration is
		// broken — which is exactly when a webhook is least likely to arrive.
		expect(messages.map((m) => m.kind).sort()).toEqual(['email', 'webhook']);
	});
});

describe('events that notify nobody', () => {
	it('stays silent for internal ones', () => {
		expect(
			notificationsFor(
				record({
					kind: 'instrument_listed',
					instrumentId: asInstrumentId('VOD.L'),
					name: 'Vodafone',
					currency: 'GBP',
					tickSize: 25,
					lotSize: 1,
					referencePrice: price(455_000)
				})
			)
		).toEqual([]);

		expect(notificationsFor(record({ kind: 'ticked', at: 1, ordersExpired: 0 }))).toEqual([]);
	});
});

describe('idempotency keys', () => {
	it('is derived from the event, so replay produces the same key', () => {
		// Not random. A random key would make every projector restart re-notify
		// everybody, which is the failure the outbox exists to prevent.
		expect(notificationsFor(trade())[0]!.idempotencyKey).toBe(
			notificationsFor(trade())[0]!.idempotencyKey
		);
	});

	it('differs between sequences', () => {
		expect(notificationsFor(trade({}, 1))[0]!.idempotencyKey).not.toBe(
			notificationsFor(trade({}, 2))[0]!.idempotencyKey
		);
	});
});
