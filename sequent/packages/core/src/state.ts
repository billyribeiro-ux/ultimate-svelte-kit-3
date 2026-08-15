/**
 * Everything the engine knows.
 *
 * This is the whole of the venue's live state — books, orders, limits,
 * positions, which firms are stopped — held in memory in one object.
 *
 * In memory, deliberately. A matching engine that consults a database to decide
 * a fill has bought itself durability it does not need and latency it cannot
 * afford: the log is already durable, and this state is a *derivative* of the
 * log that can be rebuilt from it at any time. Losing it is not data loss, it
 * is a restart.
 *
 * That reframing is the whole architecture in one sentence. The log is the
 * system of record; this is a cache with an unusually good recovery story.
 */

import type {
	AccountId,
	ClientOrderId,
	FirmId,
	InstrumentId,
	OrderId,
	Phase,
	Price,
	Quantity
} from '@sequent/protocol';
import { clientKey, positionKey } from '@sequent/protocol';
import { emptyBook, type Book, type RestingOrder } from './book.ts';

/* -------------------------------------------------------------------------- */
/* Instruments                                                                 */
/* -------------------------------------------------------------------------- */

export interface Instrument {
	readonly instrumentId: InstrumentId;
	readonly name: string;
	readonly currency: string;
	/** The price grid. Orders must land exactly on it. */
	readonly tickSize: number;
	/** The quantity grid. Orders must be a whole number of these. */
	readonly lotSize: number;
	/**
	 * What price collars are measured against.
	 *
	 * Starts as the previous close and moves to the last traded price. Anchoring
	 * the fat-finger check to a price that moves with the market is the point: a
	 * collar fixed at yesterday's close would reject perfectly ordinary orders by
	 * the afternoon of a volatile day, and participants would learn to route
	 * around the venue rather than trust it.
	 */
	referencePrice: Price;
	phase: Phase;
	readonly book: Book;
}

export function newInstrument(input: {
	instrumentId: InstrumentId;
	name: string;
	currency: string;
	tickSize: number;
	lotSize: number;
	referencePrice: Price;
}): Instrument {
	return {
		...input,
		phase: 'closed',
		book: emptyBook(input.instrumentId)
	};
}

/* -------------------------------------------------------------------------- */
/* Live orders                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A resting order plus the two things the book itself does not need.
 *
 * The book cares about price, side, quantity and queue position. It does not
 * care which instrument it belongs to — it *is* one instrument — or what the
 * participant calls it. Both are needed to answer a cancel, so they live here,
 * in the index, rather than bloating every entry in every price level.
 */
export interface LiveOrder extends RestingOrder {
	readonly instrumentId: InstrumentId;
	readonly clientOrderId: ClientOrderId;
}

/* -------------------------------------------------------------------------- */
/* Risk                                                                        */
/* -------------------------------------------------------------------------- */

export interface RiskLimits {
	readonly maxOrderQuantity: Quantity;
	readonly maxOrderNotional: number;
	readonly maxPositionQuantity: Quantity;
	readonly priceCollarBps: number;
}

/**
 * What an account gets before anybody has configured it.
 *
 * Deliberately restrictive rather than generous. An account with no limits set
 * is an account nobody has thought about, and the safe reading of "nobody has
 * thought about this" is "not very much", not "unlimited". A venue whose
 * default is no limit discovers the problem when an untested algorithm connects
 * on a Friday afternoon.
 */
export const DEFAULT_LIMITS: RiskLimits = {
	maxOrderQuantity: 10_000 as Quantity,
	maxOrderNotional: 100_000 * 10_000,
	maxPositionQuantity: 50_000 as Quantity,
	priceCollarBps: 1_000
};

/* -------------------------------------------------------------------------- */
/* The state                                                                   */
/* -------------------------------------------------------------------------- */

export interface EngineState {
	/** The last command sequence applied. Where a replay resumes from. */
	lastSeq: number;
	/** The venue's clock, as told to it by the most recent command. */
	now: number;

	readonly instruments: Map<InstrumentId, Instrument>;

	/** Every live order, by venue id. */
	readonly orders: Map<OrderId, LiveOrder>;

	/**
	 * `firm + clientOrderId` → venue id, for live orders only.
	 *
	 * Two jobs at once, and it is worth separating them because they expire
	 * differently. It answers "cancel my order ORDER-1", and it answers "is this
	 * a duplicate". An entry is removed when the order stops being live, which
	 * means a client reference becomes reusable after the order it named has
	 * gone — matching how participants actually behave over a long session.
	 */
	readonly liveByClientKey: Map<string, OrderId>;

	readonly limits: Map<AccountId, RiskLimits>;

	/** Firms that have been stopped, by themselves or by the venue. */
	readonly killed: Set<FirmId>;

	/**
	 * Signed position per account per instrument. Positive is long.
	 *
	 * Held here rather than derived from the trade history because the risk
	 * check needs it on every single order, and re-deriving it would turn an
	 * O(1) lookup into a walk of the day's fills.
	 */
	readonly positions: Map<string, number>;

	/**
	 * Quantity an account already has working on each side, per instrument.
	 *
	 * A position limit that only counts *filled* quantity is not a limit. A firm
	 * with a 50,000 cap and no position can rest ten orders of 50,000 each and be
	 * inside the rule right up until the market moves and all ten fill. So the
	 * check counts resting exposure too, which is the difference between a limit
	 * and a suggestion.
	 */
	readonly working: Map<string, { buy: number; sell: number }>;
}

export function newState(): EngineState {
	return {
		lastSeq: 0,
		now: 0,
		instruments: new Map(),
		orders: new Map(),
		liveByClientKey: new Map(),
		limits: new Map(),
		killed: new Set(),
		positions: new Map(),
		working: new Map()
	};
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export function limitsFor(state: EngineState, accountId: AccountId): RiskLimits {
	return state.limits.get(accountId) ?? DEFAULT_LIMITS;
}

export function positionOf(
	state: EngineState,
	accountId: AccountId,
	instrumentId: InstrumentId
): number {
	return state.positions.get(positionKey(accountId, instrumentId)) ?? 0;
}

export function workingOf(
	state: EngineState,
	accountId: AccountId,
	instrumentId: InstrumentId
): { buy: number; sell: number } {
	return state.working.get(positionKey(accountId, instrumentId)) ?? { buy: 0, sell: 0 };
}

export function findLive(
	state: EngineState,
	firmId: FirmId,
	clientOrderId: ClientOrderId
): LiveOrder | undefined {
	const orderId = state.liveByClientKey.get(clientKey(firmId, clientOrderId));
	return orderId === undefined ? undefined : state.orders.get(orderId);
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Record an order as live.
 *
 * The three writes here have to happen together — index, client key, working
 * exposure — and the only reason they are safe as three statements is that this
 * function is the sole place they are written. Every "the position was right but
 * the working total drifted" bug comes from a second place learning to do two
 * of the three.
 */
export function trackLive(state: EngineState, order: LiveOrder): void {
	state.orders.set(order.orderId, order);
	state.liveByClientKey.set(clientKey(order.firmId, order.clientOrderId), order.orderId);
	addWorking(state, order, order.remaining);
}

/** Forget an order that is no longer live, and release its working exposure. */
export function untrackLive(state: EngineState, order: LiveOrder): void {
	state.orders.delete(order.orderId);
	state.liveByClientKey.delete(clientKey(order.firmId, order.clientOrderId));
	addWorking(state, order, -order.remaining);
}

function addWorking(state: EngineState, order: LiveOrder, delta: number): void {
	const key = positionKey(order.accountId, order.instrumentId);
	const current = state.working.get(key) ?? { buy: 0, sell: 0 };

	if (order.side === 'buy') current.buy += delta;
	else current.sell += delta;

	// Clean up rather than leaving zeroes behind. A map that only ever grows is
	// a leak with a long fuse — one entry per account per instrument per day.
	if (current.buy === 0 && current.sell === 0) state.working.delete(key);
	else state.working.set(key, current);
}

/**
 * Apply a fill to both sides' books.
 *
 * `quantity` is signed by side, so a buy of 100 is `+100` for the buyer and
 * `-100` for the seller — the two calls always net to zero, which is exactly
 * the property the position invariant test asserts across the whole venue.
 */
export function applyFill(
	state: EngineState,
	accountId: AccountId,
	instrumentId: InstrumentId,
	side: 'buy' | 'sell',
	quantity: number
): void {
	const key = positionKey(accountId, instrumentId);
	const delta = side === 'buy' ? quantity : -quantity;
	const next = (state.positions.get(key) ?? 0) + delta;

	if (next === 0) state.positions.delete(key);
	else state.positions.set(key, next);
}

/** Release working exposure as an order fills, without removing the order. */
export function reduceWorking(state: EngineState, order: LiveOrder, filled: number): void {
	addWorking(state, order, -filled);
}
