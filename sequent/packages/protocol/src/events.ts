/**
 * Events: things that happened.
 *
 * Every one is past tense, and none of them can be taken back. If an order was
 * accepted and then cancelled, that is two events, not one event that changed
 * its mind — and the difference is the entire audit trail. A regulator asking
 * "what did the book look like at 14:32:07.113" is answered by replaying the
 * events up to that sequence number, which is only possible because nothing
 * was ever overwritten.
 *
 * These are also the system's public vocabulary. They are what projections
 * consume, what webhooks deliver, and what the API reports. Adding a field is
 * cheap; changing the meaning of one is a breaking change for consumers you
 * cannot see, which is why the envelope carries a version.
 */

import type {
	AccountId,
	ClientOrderId,
	FirmId,
	InstrumentId,
	OrderId,
	TradeId,
	UserId
} from './ids.ts';
import type { Amount, Price, Quantity } from './money.ts';
import type { Phase, Side, TimeInForce } from './commands.ts';

/* -------------------------------------------------------------------------- */
/* Why something was refused                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rejection reasons, as codes rather than sentences.
 *
 * The code is for machines — an algorithmic trader retries on
 * `price_outside_collar` after re-reading the reference, and gives up entirely
 * on `kill_switch_engaged`. The human sentence lives next to it and can be
 * rewritten without breaking anybody's error handling, which is the point of
 * separating them.
 */
export const REJECT_REASONS = [
	/** The venue has never heard of this instrument. */
	'unknown_instrument',
	/** Trading is not open for this instrument right now. */
	'instrument_not_trading',
	/** A duplicate `clientOrderId` — almost always a retry, and safe to ignore. */
	'duplicate_client_order_id',
	/** No resting order with that reference. Already filled, or already pulled. */
	'unknown_order',
	/** The price is not on the instrument's tick ladder. */
	'price_off_tick',
	/** The quantity is not a whole number of lots. */
	'quantity_off_lot',
	/** Too far from the reference price. The fat-finger guard. */
	'price_outside_collar',
	/** Bigger than this account is allowed to send in one order. */
	'exceeds_max_order_size',
	/** Would take the account past its position limit. */
	'exceeds_position_limit',
	/** The firm has been stopped, by itself or by the venue. */
	'kill_switch_engaged',
	/** Fill-or-kill, and the book could not fill all of it. */
	'insufficient_liquidity',
	/** Self-trade prevention refused the aggressing order. */
	'self_trade_prevented',
	/** A market order arrived with an empty book on the other side. */
	'no_opposing_liquidity',
	/** The account does not belong to the firm that sent the command. */
	'account_not_owned'
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

/**
 * Why a resting order stopped resting.
 *
 * Distinguishing these matters more than it looks. A participant whose orders
 * keep disappearing needs to know whether they are expiring at the close,
 * being pulled by their own risk manager, or losing self-trade prevention
 * races against their own other desk — three completely different problems
 * that look identical if the event just says "cancelled".
 */
export const CANCEL_REASONS = [
	'requested',
	'replaced',
	'ioc_remainder',
	'day_expired',
	'self_trade_prevention',
	'kill_switch',
	'instrument_halted'
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

interface EventMeta {
	readonly firmId: FirmId;
	readonly accountId: AccountId;
	readonly instrumentId: InstrumentId;
}

export interface OrderAccepted extends EventMeta {
	readonly kind: 'order_accepted';
	readonly orderId: OrderId;
	readonly clientOrderId: ClientOrderId;
	readonly side: Side;
	readonly price?: Price;
	readonly quantity: Quantity;
	readonly timeInForce: TimeInForce;
	/**
	 * Where this order sits in its price level's queue.
	 *
	 * Published because price-time priority is only fair if participants can
	 * verify it. Hiding the queue position is how venues get accused of
	 * favouring one member over another, and the cheapest defence is to make the
	 * ordering checkable from the public event stream.
	 */
	readonly queuePosition: number;
}

export interface OrderRejected {
	readonly kind: 'order_rejected';
	readonly firmId: FirmId;
	readonly accountId: AccountId;
	readonly instrumentId: InstrumentId;
	readonly clientOrderId: ClientOrderId;
	readonly reason: RejectReason;
	/** A sentence for a human. Never parsed — that is what `reason` is for. */
	readonly detail: string;
}

export interface OrderCancelled extends EventMeta {
	readonly kind: 'order_cancelled';
	readonly orderId: OrderId;
	readonly clientOrderId: ClientOrderId;
	/** What was still unfilled when it went. Zero means it filled completely. */
	readonly remainingQuantity: Quantity;
	readonly reason: CancelReason;
}

export interface OrderReplaced extends EventMeta {
	readonly kind: 'order_replaced';
	readonly orderId: OrderId;
	readonly clientOrderId: ClientOrderId;
	readonly newOrderId: OrderId;
	readonly newClientOrderId: ClientOrderId;
	readonly price?: Price;
	readonly quantity: Quantity;
	/**
	 * Whether the order kept its place in the queue.
	 *
	 * Reducing quantity keeps it; raising quantity or moving the price does not.
	 * Publishing the outcome saves every participant from having to infer it
	 * from the rules, and saves the venue from arguments about what the rules
	 * were on the day.
	 */
	readonly keptPriority: boolean;
}

/**
 * A trade. The only event that moves money.
 *
 * Both sides are named because the clearing side needs both, and because a
 * trade is one fact rather than two — modelling it as a fill for the buyer and
 * a separate fill for the seller invites them to disagree.
 */
export interface Traded {
	readonly kind: 'traded';
	readonly tradeId: TradeId;
	readonly instrumentId: InstrumentId;
	readonly price: Price;
	readonly quantity: Quantity;

	readonly buyOrderId: OrderId;
	readonly buyFirmId: FirmId;
	readonly buyAccountId: AccountId;

	readonly sellOrderId: OrderId;
	readonly sellFirmId: FirmId;
	readonly sellAccountId: AccountId;

	/**
	 * Which side crossed the spread.
	 *
	 * The aggressor pays the taker fee and the resting side earns the maker
	 * rebate, so this single field decides who pays whom. It is also what makes
	 * the tape readable: a run of trades at the ask is buying pressure, and you
	 * cannot see that from price alone.
	 */
	readonly aggressor: Side;

	readonly buyerFee: Amount;
	readonly sellerFee: Amount;
}

export interface RiskLimitsSet {
	readonly kind: 'risk_limits_set';
	readonly firmId: FirmId;
	readonly accountId: AccountId;
	readonly maxOrderQuantity: Quantity;
	readonly maxOrderNotional: number;
	readonly maxPositionQuantity: Quantity;
	readonly priceCollarBps: number;
	readonly setBy: UserId;
}

export interface KillSwitchChanged {
	readonly kind: 'kill_switch_changed';
	readonly firmId: FirmId;
	readonly engaged: boolean;
	readonly reason: string;
	readonly setBy: UserId;
	/** How many resting orders engaging it pulled. Zero when releasing. */
	readonly ordersCancelled: number;
}

export interface InstrumentListed {
	readonly kind: 'instrument_listed';
	readonly instrumentId: InstrumentId;
	readonly name: string;
	readonly currency: string;
	readonly tickSize: number;
	readonly lotSize: number;
	readonly referencePrice: Price;
}

export interface PhaseChanged {
	readonly kind: 'phase_changed';
	readonly instrumentId: InstrumentId;
	readonly from: Phase;
	readonly to: Phase;
	readonly reason: string;
}

/**
 * An auction cleared.
 *
 * Emitted once, before the trades it produced, so a consumer reading the stream
 * in order sees the price the auction found before it sees the fills at that
 * price. The alternative — inferring the auction price from the trades — works
 * right up until an auction produces no trades at all, which happens whenever
 * the book does not cross.
 */
export interface AuctionUncrossed {
	readonly kind: 'auction_uncrossed';
	readonly instrumentId: InstrumentId;
	readonly price: Price;
	readonly quantity: Quantity;
	/**
	 * Unfilled quantity at the auction price, signed: positive means more buyers
	 * than sellers. Published because it is the number that tells participants
	 * which way the open is leaning, and withholding it advantages whoever can
	 * work it out fastest.
	 */
	readonly imbalance: number;
}

/**
 * Time passed and something expired because of it.
 *
 * Separate from `order_cancelled` with a `day_expired` reason? No — it uses
 * exactly that reason. This event exists only to mark that the venue processed
 * a tick, so that a replay can be checked for having processed the same ones.
 */
export interface Ticked {
	readonly kind: 'ticked';
	readonly at: number;
	readonly ordersExpired: number;
}

export type Event =
	| OrderAccepted
	| OrderRejected
	| OrderCancelled
	| OrderReplaced
	| Traded
	| RiskLimitsSet
	| KillSwitchChanged
	| InstrumentListed
	| PhaseChanged
	| AuctionUncrossed
	| Ticked;

export type EventKind = Event['kind'];

/**
 * An event as it appears in the log.
 *
 * `causedBy` is the sequence number of the command that produced it, and it is
 * the single most useful field in the system during an incident. Every event
 * points at its cause; every trade id contains its own sequence number. Between
 * them, "why did this happen" is a lookup rather than an investigation.
 */
export interface LoggedEvent {
	readonly seq: number;
	readonly causedBy: number;
	readonly at: number;
	readonly version: number;
	readonly body: Event;
}
