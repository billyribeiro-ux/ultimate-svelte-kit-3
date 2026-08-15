/**
 * Which events become notifications, and what they look like on the wire.
 *
 * A **pure function** from an event record to a list of outbox messages. No
 * database, no clock beyond what the record already carries, no network. That
 * makes "what does a member receive when a trade happens" a question you can
 * answer with an assertion rather than by running a venue and watching a log.
 *
 * ## The public shape is not the internal shape
 *
 * An event in the log is written for the engine. A webhook payload is written
 * for somebody else's integration, and once published it cannot change without
 * breaking them. Translating between the two here — rather than posting the
 * internal event verbatim — is what lets the engine's event schema evolve.
 *
 * The version that posts internal events directly is quicker to write and turns
 * every internal rename into a customer-facing outage.
 *
 * ## One trade, two notifications
 *
 * A trade has two sides at two different firms, and each gets its own message
 * describing *their* side. Neither is told who the other was: in a centrally
 * cleared market the counterparty is the clearing house, and revealing that
 * Northgate just bought from Lowfield hands both of them information they would
 * pay for.
 */

import type { Event } from '@sequent/protocol';
import type { EventRecord } from './log.ts';
import type { OutboxMessage } from './outbox.ts';
import type { WebhookEvent } from './webhooks.ts';

/** The envelope every webhook payload is wrapped in. */
export interface NotificationPayload {
	readonly event: WebhookEvent;
	/** The venue sequence number. Lets a receiver order what it gets. */
	readonly seq: number;
	readonly at: number;
	readonly data: Record<string, unknown>;
}

/**
 * The notifications one event produces.
 *
 * The idempotency key is derived from the event, never generated — so replaying
 * the log produces the same keys, and the outbox's unique constraint absorbs
 * the duplicate. A random key would make every projector restart re-notify
 * everybody, which is the failure mode the outbox exists to prevent.
 */
export function notificationsFor(record: EventRecord): OutboxMessage[] {
	const event: Event = record.body;
	const base = { seq: record.seq, at: record.at };

	const message = (
		firmId: string,
		name: WebhookEvent,
		suffix: string,
		data: Record<string, unknown>
	): OutboxMessage => ({
		kind: 'webhook',
		seq: record.seq,
		firmId,
		idempotencyKey: `${record.seq}:${name}:${suffix}`,
		payload: { event: name, ...base, data } satisfies NotificationPayload
	});

	switch (event.kind) {
		case 'order_accepted':
			return [
				message(event.firmId, 'order.accepted', event.orderId, {
					orderId: event.orderId,
					clientOrderId: event.clientOrderId,
					accountId: event.accountId,
					instrumentId: event.instrumentId,
					side: event.side,
					price: event.price ?? null,
					quantity: event.quantity
				})
			];

		case 'order_rejected':
			return [
				message(event.firmId, 'order.rejected', event.clientOrderId, {
					clientOrderId: event.clientOrderId,
					reason: event.reason,
					detail: event.detail ?? null
				})
			];

		case 'order_cancelled':
			return [
				message(event.firmId, 'order.cancelled', event.orderId, {
					orderId: event.orderId,
					clientOrderId: event.clientOrderId,
					reason: event.reason,
					remaining: event.remainingQuantity
				})
			];

		case 'traded': {
			/*
			 * Two messages, and the `buy`/`sell` suffix is load-bearing.
			 *
			 * When both sides of a trade are the same firm — which happens, on
			 * different desks — a key of `${seq}:trade.executed:${tradeId}` would
			 * collide, the outbox's unique constraint would swallow the second, and
			 * the firm would be told about one leg of its own cross.
			 *
			 * That is a bug you would find months later, in a reconciliation
			 * mismatch, having long since stopped suspecting the notification layer.
			 */
			const side = (
				firmId: string,
				accountId: string,
				orderId: string,
				direction: 'buy' | 'sell',
				fee: number
			) =>
				message(firmId, 'trade.executed', `${event.tradeId}:${direction}`, {
					tradeId: event.tradeId,
					orderId,
					accountId,
					instrumentId: event.instrumentId,
					side: direction,
					price: event.price,
					quantity: event.quantity,
					fee,
					// Absent for auction trades, where there is no aggressor by
					// definition — everybody crossed at one price simultaneously.
					aggressor: event.aggressor ?? null
				});

			return [
				side(event.buyFirmId, event.buyAccountId, event.buyOrderId, 'buy', event.buyerFee),
				side(event.sellFirmId, event.sellAccountId, event.sellOrderId, 'sell', event.sellerFee)
			];
		}

		case 'phase_changed':
			/*
			 * Venue-wide: `firmId` is undefined, and the worker fans it out to every
			 * subscribed firm at delivery time.
			 *
			 * Enqueuing one row per firm here would mean the fan-out is decided when
			 * the event is projected — so a firm that subscribes ten seconds later
			 * misses it, and the outbox grows with the number of members rather than
			 * with the number of events.
			 */
			return [
				{
					kind: 'webhook',
					seq: record.seq,
					firmId: undefined,
					idempotencyKey: `${record.seq}:instrument.phase_changed:${event.instrumentId}`,
					payload: {
						event: 'instrument.phase_changed',
						...base,
						data: {
							instrumentId: event.instrumentId,
							from: event.from,
							to: event.to,
							reason: event.reason ?? null
						}
					} satisfies NotificationPayload
				}
			];

		case 'kill_switch_changed':
			return [
				message(event.firmId, 'risk.kill_switch_engaged', event.firmId, {
					firmId: event.firmId,
					engaged: event.engaged,
					reason: event.reason ?? null
				}),
				/*
				 * And an email, on the same transaction.
				 *
				 * A kill switch is the one event where somebody needs to be told even
				 * if their integration is broken — which is exactly when a webhook is
				 * least likely to arrive. Two sinks, one outbox, one commit.
				 */
				{
					kind: 'email',
					seq: record.seq,
					firmId: event.firmId,
					idempotencyKey: `${record.seq}:email:kill_switch:${event.firmId}`,
					payload: {
						template: 'kill_switch',
						firmId: event.firmId,
						subject: event.engaged
							? 'Trading halted for your firm'
							: 'Trading resumed for your firm',
						data: { engaged: event.engaged, reason: event.reason ?? null, at: record.at }
					}
				}
			];

		/*
		 * Deliberately silent.
		 *
		 * `order_replaced` produces an accept and a cancel of its own, so notifying
		 * here as well would send three messages for two facts. `auction_uncrossed`
		 * is followed by the trades it produced, which are the interesting part.
		 * `risk_limits_set`, `instrument_listed` and `ticked` are internal.
		 *
		 * Listing them rather than using `default:` means adding an event type to
		 * the protocol produces a type error here — a prompt to decide whether
		 * members should hear about it, instead of silence by omission.
		 */
		case 'order_replaced':
		case 'risk_limits_set':
		case 'instrument_listed':
		case 'auction_uncrossed':
		case 'ticked':
			return [];
	}
}
