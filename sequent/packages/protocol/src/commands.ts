/**
 * Commands: things somebody is asking the venue to do.
 *
 * A command is a **request**, and the venue is free to refuse it. That is the
 * whole distinction between this file and `events.ts`, and getting it wrong is
 * the most common mistake in event-sourced systems: naming a command
 * `OrderPlaced` quietly promises it happened, and then somebody writes code
 * that trusts it before the engine has looked at the risk limits.
 *
 * The rule we follow, and it is worth saying out loud:
 *
 *   **Commands are imperative and may be refused. Events are past tense and
 *   cannot be unhappened.**
 *
 * `PlaceOrder` may be rejected. `OrderAccepted` may not — once it is in the
 * log, it is a fact about the world, and the only way to change your mind is
 * another fact after it.
 */

import * as v from 'valibot';
import type { AccountId, ClientOrderId, FirmId, InstrumentId, UserId } from './ids.ts';
import type { Price, Quantity } from './money.ts';

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

export const SIDES = ['buy', 'sell'] as const;
export type Side = (typeof SIDES)[number];

export const ORDER_TYPES = ['limit', 'market'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/**
 * Time in force — how long an order is allowed to live.
 *
 *   `gtc` — good till cancelled. Rests on the book until filled or pulled.
 *   `day` — the same, but the venue cancels it at the close.
 *   `ioc` — immediate or cancel. Take what is available right now, cancel the
 *           remainder. Never rests.
 *   `fok` — fill or kill. Fill the *entire* quantity immediately or do nothing
 *           at all. The difference from `ioc` is all-or-nothing, and it matters
 *           to anybody hedging: half a hedge is often worse than none.
 */
export const TIME_IN_FORCE = ['gtc', 'day', 'ioc', 'fok'] as const;
export type TimeInForce = (typeof TIME_IN_FORCE)[number];

/**
 * What to do when a firm's order would trade against its own resting order.
 *
 * Wash trades — buying from yourself — inflate reported volume and are market
 * abuse whether or not anybody meant it. Two desks at the same firm running
 * different strategies will cross each other by accident, regularly, so the
 * venue has to decide rather than leaving it to them.
 *
 *   `cancel_resting`   — pull the old order, let the new one through.
 *   `cancel_aggressing`— reject the incoming order, leave the book alone.
 *   `cancel_both`      — the conservative choice, and the one that surprises
 *                        people least when they read the fill report.
 */
export const SELF_TRADE_PREVENTION = [
	'cancel_resting',
	'cancel_aggressing',
	'cancel_both'
] as const;
export type SelfTradePrevention = (typeof SELF_TRADE_PREVENTION)[number];

/**
 * What the venue is doing right now.
 *
 *   `pre_open`   — orders accepted, nothing matches, an indicative price is
 *                  published so participants can see where the auction is
 *                  heading.
 *   `auction`    — the book is uncrossed in one shot at a single price.
 *   `continuous` — ordinary trading: an aggressive order matches immediately.
 *   `closed`     — nothing accepted.
 *   `halted`     — trading suspended, usually for news. Orders may be cancelled
 *                  but not placed, which is the humane way round: a participant
 *                  with unwanted exposure must always be able to get out of an
 *                  order, even when they cannot get into one.
 */
export const PHASES = ['pre_open', 'auction', 'continuous', 'closed', 'halted'] as const;
export type Phase = (typeof PHASES)[number];

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

/** Fields every command carries, whoever sent it. */
export interface CommandMeta {
	readonly firmId: FirmId;
	/** The human or key that issued it. Kept for the audit trail, not for auth. */
	readonly actorId: UserId;
}

export interface PlaceOrder extends CommandMeta {
	readonly kind: 'place_order';
	readonly accountId: AccountId;
	readonly instrumentId: InstrumentId;
	/**
	 * The participant's own reference. Unique per firm, and the whole basis of
	 * idempotency — a retry after a timeout carries the same one, and the venue
	 * must treat the second copy as a duplicate rather than a second order.
	 */
	readonly clientOrderId: ClientOrderId;
	readonly side: Side;
	readonly orderType: OrderType;
	/**
	 * Absent for a market order, and that is why `exactOptionalPropertyTypes` is
	 * switched on: without it, `{ price: undefined }` type-checks against
	 * `{ price?: Price }`, and a market order and a limit order with a missing
	 * price become indistinguishable at exactly the wrong moment.
	 */
	readonly price?: Price;
	readonly quantity: Quantity;
	readonly timeInForce: TimeInForce;
	readonly selfTradePrevention: SelfTradePrevention;
}

export interface CancelOrder extends CommandMeta {
	readonly kind: 'cancel_order';
	/**
	 * Cancel by the participant's reference, not the venue's.
	 *
	 * A client that never received the acknowledgement still needs to be able to
	 * pull the order — and by definition it does not know the venue's id. Making
	 * the venue id the only way to cancel builds a system where a network blip
	 * leaves somebody with live exposure they cannot reach.
	 */
	readonly clientOrderId: ClientOrderId;
}

/**
 * Cancel and replace, as one command rather than two.
 *
 * Sending a cancel followed by a place gives up the order's place in the queue
 * *and* leaves a window where the participant has no order in the market at all.
 * As a single command the engine can decide the semantics deliberately: a
 * reduction in quantity keeps time priority, an increase or a price change
 * loses it. Those are the rules real venues use, and they are only expressible
 * if the two halves arrive together.
 */
export interface ReplaceOrder extends CommandMeta {
	readonly kind: 'replace_order';
	readonly clientOrderId: ClientOrderId;
	readonly newClientOrderId: ClientOrderId;
	readonly price?: Price;
	readonly quantity: Quantity;
}

/** Cancel everything a firm has resting. The button nobody wants to need. */
export interface CancelAll extends CommandMeta {
	readonly kind: 'cancel_all';
	readonly accountId?: AccountId;
	readonly instrumentId?: InstrumentId;
}

export interface SetRiskLimits extends CommandMeta {
	readonly kind: 'set_risk_limits';
	readonly accountId: AccountId;
	readonly maxOrderQuantity: Quantity;
	readonly maxOrderNotional: number;
	readonly maxPositionQuantity: Quantity;
	/** How far from the reference price an order may be, in basis points. */
	readonly priceCollarBps: number;
}

/**
 * Stop a firm trading, now.
 *
 * Engaging it cancels every resting order the firm has and refuses new ones.
 * This exists because algorithms fail in ways that are fast and expensive, and
 * the only useful response is a control that works in one action and does not
 * need anybody to reason about which orders to pull.
 */
export interface SetKillSwitch extends CommandMeta {
	readonly kind: 'set_kill_switch';
	readonly targetFirmId: FirmId;
	readonly engaged: boolean;
	readonly reason: string;
}

export interface ListInstrument extends CommandMeta {
	readonly kind: 'list_instrument';
	readonly instrumentId: InstrumentId;
	readonly name: string;
	readonly currency: string;
	readonly tickSize: number;
	readonly lotSize: number;
	/** Where the price bands are anchored until the first trade of the session. */
	readonly referencePrice: Price;
}

export interface SetPhase extends CommandMeta {
	readonly kind: 'set_phase';
	readonly instrumentId: InstrumentId;
	readonly phase: Phase;
	readonly reason: string;
}

/**
 * A tick of wall-clock time, delivered as a command.
 *
 * This is the trick that keeps the engine pure. Some things happen because time
 * passed rather than because anybody asked — `day` orders expire at the close,
 * an auction ends. If the engine looked at a clock to notice, it would produce
 * different events on replay and the whole architecture would be a decoration.
 *
 * So time arrives the same way everything else does: as a command, in the log,
 * with a sequence number. Replay feeds it back and gets the same expiries at
 * the same points, forever.
 */
export interface Tick extends CommandMeta {
	readonly kind: 'tick';
	readonly at: number;
}

export type Command =
	| PlaceOrder
	| CancelOrder
	| ReplaceOrder
	| CancelAll
	| SetRiskLimits
	| SetKillSwitch
	| ListInstrument
	| SetPhase
	| Tick;

export type CommandKind = Command['kind'];

/* -------------------------------------------------------------------------- */
/* The envelope                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A command as it appears in the log, once the sequencer has stamped it.
 *
 * Three fields are added, and each one is a deliberate transfer of a decision
 * from the engine to the sequencer:
 *
 *   `seq`        — the position in the total order. The engine never chooses
 *                  this; being handed it is what makes the engine a function.
 *   `receivedAt` — the venue's clock reading when the command arrived. The
 *                  engine uses this instead of calling `Date.now()`, which is
 *                  what lets a replay four years later reproduce a timestamp.
 *   `version`    — which rules applied. When matching logic changes, old
 *                  commands must still replay under the rules that were in
 *                  force when they ran, or the log stops describing what
 *                  actually happened.
 */
export interface Sequenced<T> {
	readonly seq: number;
	readonly receivedAt: number;
	readonly version: number;
	readonly body: T;
}

export type SequencedCommand = Sequenced<Command>;

/* -------------------------------------------------------------------------- */
/* Wire schemas                                                                */
/* -------------------------------------------------------------------------- */

/*
 * Everything above is a TypeScript type, which is worth exactly nothing at the
 * boundary — a JSON body from an API client is `unknown` no matter how
 * confidently it is typed. These schemas are the runtime half.
 *
 * They are deliberately strict about numbers: integers only, positive where a
 * negative makes no sense, and bounded. A price of `1e308` would not crash the
 * engine, it would quietly poison every notional calculation downstream of it.
 */

const positiveInteger = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1e15));
const nonNegativeInteger = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1e15));
const identifier = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64));
const symbol = v.pipe(v.string(), v.regex(/^[A-Z][A-Z0-9.]{0,15}$/, 'Not an instrument symbol'));

const meta = {
	firmId: identifier,
	actorId: identifier
};

export const placeOrderSchema = v.pipe(
	v.object({
		kind: v.literal('place_order'),
		...meta,
		accountId: identifier,
		instrumentId: symbol,
		clientOrderId: identifier,
		side: v.picklist(SIDES),
		orderType: v.picklist(ORDER_TYPES),
		price: v.optional(positiveInteger),
		quantity: positiveInteger,
		timeInForce: v.picklist(TIME_IN_FORCE),
		selfTradePrevention: v.optional(v.picklist(SELF_TRADE_PREVENTION), 'cancel_both')
	}),
	/*
	 * A cross-field rule the type system cannot express: a limit order must have
	 * a price and a market order must not. Checking it here means the engine can
	 * treat "limit with no price" as impossible rather than as a case to handle,
	 * and `v.check` on the whole object is the only place a rule about two
	 * fields at once can live.
	 */
	v.check(
		(order) => (order.orderType === 'limit') === (order.price !== undefined),
		'A limit order needs a price, and a market order must not have one'
	),
	/*
	 * `fok` and `ioc` never rest, so a market order with `gtc` is a request to
	 * leave an unpriced order on the book forever. Venues reject it; so do we,
	 * at the door, where the message can still say something useful.
	 */
	v.check(
		(order) =>
			order.orderType !== 'market' || order.timeInForce === 'ioc' || order.timeInForce === 'fok',
		'A market order must be immediate-or-cancel or fill-or-kill'
	)
);

export const cancelOrderSchema = v.object({
	kind: v.literal('cancel_order'),
	...meta,
	clientOrderId: identifier
});

export const replaceOrderSchema = v.object({
	kind: v.literal('replace_order'),
	...meta,
	clientOrderId: identifier,
	newClientOrderId: identifier,
	price: v.optional(positiveInteger),
	quantity: positiveInteger
});

export const cancelAllSchema = v.object({
	kind: v.literal('cancel_all'),
	...meta,
	accountId: v.optional(identifier),
	instrumentId: v.optional(symbol)
});

export const setRiskLimitsSchema = v.object({
	kind: v.literal('set_risk_limits'),
	...meta,
	accountId: identifier,
	maxOrderQuantity: positiveInteger,
	maxOrderNotional: positiveInteger,
	maxPositionQuantity: positiveInteger,
	priceCollarBps: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000))
});

export const setKillSwitchSchema = v.object({
	kind: v.literal('set_kill_switch'),
	...meta,
	targetFirmId: identifier,
	engaged: v.boolean(),
	reason: v.pipe(v.string(), v.trim(), v.maxLength(200))
});

export const listInstrumentSchema = v.object({
	kind: v.literal('list_instrument'),
	...meta,
	instrumentId: symbol,
	name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
	currency: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/, 'Not an ISO 4217 currency code')),
	tickSize: positiveInteger,
	lotSize: positiveInteger,
	referencePrice: positiveInteger
});

export const setPhaseSchema = v.object({
	kind: v.literal('set_phase'),
	...meta,
	instrumentId: symbol,
	phase: v.picklist(PHASES),
	reason: v.pipe(v.string(), v.trim(), v.maxLength(200))
});

export const tickSchema = v.object({
	kind: v.literal('tick'),
	...meta,
	at: nonNegativeInteger
});

/**
 * Every command, as one schema.
 *
 * `variant` discriminates on `kind`, which means a bad payload gets the error
 * for *its own* command type rather than a union of nine unrelated complaints.
 * A union would tell an API client that their order is simultaneously not a
 * cancel, not a tick and not an instrument listing, which is true and useless.
 */
export const commandSchema = v.variant('kind', [
	placeOrderSchema,
	cancelOrderSchema,
	replaceOrderSchema,
	cancelAllSchema,
	setRiskLimitsSchema,
	setKillSwitchSchema,
	listInstrumentSchema,
	setPhaseSchema,
	tickSchema
]);

/** Parse an untrusted payload into a command, or throw with a real message. */
export function parseCommand(input: unknown): Command {
	return v.parse(commandSchema, input) as Command;
}
