/**
 * The order book, and the matching walk that runs over it.
 *
 * This is the centre of the whole system. Everything else — the log, the three
 * processes, the ledger, the API — exists to get commands to this file and to
 * carry the consequences away from it.
 *
 * ## Deterministic, not immutable
 *
 * The book is mutated in place. That deserves a defence, because "pure
 * function" and "mutates its argument" look like they cannot both be true.
 *
 * The property we actually need is **determinism**: given the same book and the
 * same command, produce the same fills, every time, forever. Immutability is
 * one way to get there and it is not the only one. Copying a book with ten
 * thousand resting orders on every incoming order would cost more than the
 * matching itself, and a venue that allocates a fresh book per message spends
 * its life in the garbage collector.
 *
 * So: mutate, but never read anything the log did not provide. No clock, no
 * randomness, no `Map` iteration whose order depends on anything but insertion,
 * no floating point. Those are the rules that make replay exact, and they are
 * enforceable by reading the file — which immutability, incidentally, is not.
 *
 * ## Price-time priority
 *
 * Two rules, in this order:
 *
 *   1. **Price.** A better price always goes first. For buyers, higher is
 *      better; for sellers, lower.
 *   2. **Time.** Within a price, first in, first served.
 *
 * The second rule is what makes a venue worth resting an order on. If the
 * venue could reorder a queue at the same price, posting liquidity would be a
 * gamble, nobody would do it, and there would be no book to trade against.
 * Every design decision below defends that queue.
 */

import type {
	InstrumentId,
	OrderId,
	FirmId,
	AccountId,
	Price,
	Quantity,
	Side
} from '@sequent/protocol';

/* -------------------------------------------------------------------------- */
/* Resting orders                                                              */
/* -------------------------------------------------------------------------- */

/**
 * An order sitting on the book.
 *
 * `remaining` is mutable and everything else is not, which is exactly the
 * shape of the thing: an order's price, side and owner are settled the moment
 * it is accepted, and the only thing that changes afterwards is how much of it
 * is left.
 */
export interface RestingOrder {
	readonly orderId: OrderId;
	readonly firmId: FirmId;
	readonly accountId: AccountId;
	readonly side: Side;
	readonly price: Price;
	readonly originalQuantity: Quantity;
	remaining: Quantity;
	/**
	 * The sequence number that put this order on the book.
	 *
	 * This *is* time priority. Not a timestamp — two orders can arrive in the
	 * same millisecond, and then a timestamp cannot order them and something has
	 * to break the tie, usually by accident. The sequence number is unique and
	 * total by construction, so the queue has exactly one correct order and
	 * anybody replaying the log arrives at the same one.
	 */
	readonly seq: number;
	/** Cancelled at the close, if `true`. Carried here so expiry is a book walk. */
	readonly expiresAtClose: boolean;
}

/* -------------------------------------------------------------------------- */
/* Price levels                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every order resting at one price, in arrival order.
 *
 * `total` is maintained alongside the queue rather than summed on demand. The
 * depth ladder asks for it on every update and a fill-or-kill order asks for it
 * before committing to anything, so the alternative is walking a queue that can
 * be thousands long, thousands of times a second.
 *
 * A denormalised total is a promise you have to keep. Every mutation below
 * updates it in the same statement that changes the queue, and a test asserts
 * the invariant after every operation. Denormalisation without that test is
 * just a bug with better performance.
 */
export interface PriceLevel {
	readonly price: Price;
	readonly orders: RestingOrder[];
	total: number;
}

/**
 * One instrument's book.
 *
 * Bids descend and asks ascend, so index 0 of each is always the best price and
 * the most common question — "what is the top of book" — is an array lookup
 * rather than a search.
 */
export interface Book {
	readonly instrumentId: InstrumentId;
	readonly bids: PriceLevel[];
	readonly asks: PriceLevel[];
}

export function emptyBook(instrumentId: InstrumentId): Book {
	return { instrumentId, bids: [], asks: [] };
}

/* -------------------------------------------------------------------------- */
/* Finding a level                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Where a price belongs in a side's ladder.
 *
 * Binary search, returning either the index of the matching level or the index
 * it should be inserted at. Ladders are kept in *priority* order rather than
 * numeric order — descending for bids, ascending for asks — so one comparison
 * flip handles both sides and there is no second implementation to keep in
 * step with the first.
 *
 * A linear scan would be simpler and, on a real book, wrong: quiet instruments
 * have a handful of levels and liquid ones have hundreds, and the difference
 * only shows up on the day the volume arrives.
 */
function locate(
	levels: readonly PriceLevel[],
	price: Price,
	side: Side
): { index: number; found: boolean } {
	let low = 0;
	let high = levels.length;

	while (low < high) {
		const mid = (low + high) >>> 1;
		const at = levels[mid]!.price;

		if (at === price) return { index: mid, found: true };

		// Bids are better when higher, asks when lower. This is the only line in
		// the file that knows that, which is deliberate.
		const before = side === 'buy' ? at > price : at < price;

		if (before) low = mid + 1;
		else high = mid;
	}

	return { index: low, found: false };
}

/** The best price on a side, or `undefined` if the side is empty. */
export function best(book: Book, side: Side): PriceLevel | undefined {
	return side === 'buy' ? book.bids[0] : book.asks[0];
}

/** The spread, or `undefined` when either side is empty. */
export function spread(book: Book): number | undefined {
	const bid = book.bids[0];
	const ask = book.asks[0];
	if (!bid || !ask) return undefined;
	return ask.price - bid.price;
}

/**
 * Whether the book is crossed — the best bid at or above the best ask.
 *
 * This must never be true after a command has been fully applied during
 * continuous trading, because a crossed book is two participants who both agree
 * on a price and have not been matched. It is the single most important
 * invariant in the system and the property-based tests assert it after every
 * generated command.
 *
 * During a call auction it is *expected* to be true — that is what an auction
 * uncrosses.
 */
export function isCrossed(book: Book): boolean {
	const bid = book.bids[0];
	const ask = book.asks[0];
	return bid !== undefined && ask !== undefined && bid.price >= ask.price;
}

/* -------------------------------------------------------------------------- */
/* Adding and removing                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Rest an order, at the back of its price level's queue.
 *
 * Returns its position in that queue, which is published on the acceptance
 * event. Price-time priority is only credible if participants can check it, and
 * a queue position they can verify against the public event stream is a cheaper
 * defence against accusations of favouritism than any amount of assurance.
 */
export function rest(book: Book, order: RestingOrder): number {
	const levels = order.side === 'buy' ? book.bids : book.asks;
	const { index, found } = locate(levels, order.price, order.side);

	if (found) {
		const level = levels[index]!;
		level.orders.push(order);
		level.total += order.remaining;
		return level.orders.length;
	}

	levels.splice(index, 0, { price: order.price, orders: [order], total: order.remaining });
	return 1;
}

/**
 * Take an order off the book.
 *
 * Returns what was still unfilled, or `undefined` if it was not there — which
 * is not an error. A cancel racing a fill is completely normal: the participant
 * decided to pull an order at the same moment somebody else decided to take it,
 * and one of them was a few microseconds earlier. The caller turns
 * `undefined` into an "unknown order" rejection, and the participant learns
 * that they lost the race rather than that something broke.
 */
export function remove(book: Book, order: RestingOrder): Quantity | undefined {
	const levels = order.side === 'buy' ? book.bids : book.asks;
	const { index, found } = locate(levels, order.price, order.side);
	if (!found) return undefined;

	const level = levels[index]!;
	const at = level.orders.indexOf(order);
	if (at === -1) return undefined;

	level.orders.splice(at, 1);
	level.total -= order.remaining;

	// An empty level is not a level. Leaving it would put a rung on the ladder
	// with nothing on it, and every consumer of the depth feed would have to
	// learn to ignore it.
	if (level.orders.length === 0) levels.splice(index, 1);

	return order.remaining;
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                    */
/* -------------------------------------------------------------------------- */

/** One execution, before it becomes a protocol event. */
export interface Fill {
	readonly restingOrder: RestingOrder;
	readonly price: Price;
	readonly quantity: Quantity;
}

/** An order that self-trade prevention pulled off the book during a walk. */
export interface Pulled {
	readonly order: RestingOrder;
	readonly remaining: Quantity;
}

export interface MatchResult {
	readonly fills: Fill[];
	/** What the aggressor still has left. Zero means it filled completely. */
	readonly remaining: Quantity;
	/** Resting orders cancelled by self-trade prevention. */
	readonly pulled: Pulled[];
	/**
	 * True when self-trade prevention stopped the incoming order early.
	 *
	 * It means "cancel whatever is left", not "pretend this never happened". Any
	 * fills already in `fills` were taken from *other* firms before the walk
	 * reached the order that triggered prevention, and those are real: the book
	 * has been decremented and the counterparties have traded. A venue cannot
	 * un-take a fill.
	 *
	 * The caller decides what that means. No fills at all → the order is rejected
	 * outright. Some fills → the order is accepted, the trades stand, and the
	 * remainder is cancelled with a self-trade-prevention reason.
	 */
	readonly aggressorCancelled: boolean;
}

export interface MatchRequest {
	readonly side: Side;
	readonly quantity: Quantity;
	/** Absent for a market order: take whatever the book offers. */
	readonly limitPrice?: Price;
	readonly firmId: FirmId;
	readonly selfTradePrevention: 'cancel_resting' | 'cancel_aggressing' | 'cancel_both';
	/** When true, nothing is mutated — used to price a fill-or-kill before committing. */
	readonly dryRun?: boolean;
}

/**
 * Whether a resting price is acceptable to an aggressor.
 *
 * A market order has no limit and accepts anything. A buy limit at 100 will
 * take asks at 100 or better; a sell limit at 100 will take bids at 100 or
 * better. "Better" flips with the side, which is why it is written once.
 */
function crosses(restingPrice: Price, side: Side, limitPrice: Price | undefined): boolean {
	if (limitPrice === undefined) return true;
	return side === 'buy' ? restingPrice <= limitPrice : restingPrice >= limitPrice;
}

/**
 * Walk the opposite side of the book, taking liquidity in priority order.
 *
 * The trade price is **the resting order's price**, never the aggressor's. A
 * buy limit at 101 hitting a resting ask at 100 trades at 100, and the buyer
 * keeps the penny. That is not generosity — it is the rule that makes resting
 * an order worthwhile, because the passive side chose its price and gets it.
 * Filling at the aggressor's price would hand the improvement to whoever
 * crossed the spread, and posting liquidity would stop being rational.
 *
 * `dryRun` walks without mutating, which is how a fill-or-kill order finds out
 * whether it can be filled completely before committing to anything. Doing that
 * with a real walk and unwinding afterwards would mean writing an undo path for
 * every mutation in this file — and an undo path is only correct until somebody
 * adds a mutation and forgets it.
 */
export function match(book: Book, request: MatchRequest): MatchResult {
	const opposite = request.side === 'buy' ? book.asks : book.bids;
	const fills: Fill[] = [];
	const pulled: Pulled[] = [];

	let remaining: number = request.quantity;
	let levelIndex = 0;

	/*
	 * Self-trade prevention with `cancel_resting` removes orders while we are
	 * walking. Collecting them and deleting afterwards avoids mutating the
	 * structure being iterated — the classic way to skip an element without
	 * noticing.
	 */
	const toPull: RestingOrder[] = [];

	/**
	 * Take the collected self-trade-prevention cancels off the book.
	 *
	 * Every exit from the walk goes through here, and that is the point. An
	 * earlier version returned directly from the `cancel_both` branch and skipped
	 * the removal — so the result said the resting order had been pulled while it
	 * was still sitting on the book, happily matchable. The event stream would
	 * have announced a cancellation that never happened, and the book and the
	 * ledger would have disagreed from that moment on.
	 *
	 * A single exit point is not stylistic here. It is the difference between the
	 * report and the reality being the same thing.
	 */
	const settlePulls = (): Pulled[] => {
		if (request.dryRun) return [];

		for (const order of toPull) {
			const left = remove(book, order);
			if (left !== undefined) pulled.push({ order, remaining: left });
		}

		return pulled;
	};

	outer: while (remaining > 0 && levelIndex < opposite.length) {
		const level = opposite[levelIndex]!;

		if (!crosses(level.price, request.side, request.limitPrice)) break;

		for (let i = 0; i < level.orders.length && remaining > 0;) {
			const resting = level.orders[i]!;

			if (resting.firmId === request.firmId) {
				switch (request.selfTradePrevention) {
					/*
					 * Both of these stop the walk and hand back what has already
					 * happened. Returning `fills: []` here — which is what the first
					 * version did — was a genuine bug and a nasty one: the resting
					 * orders had already been decremented and removed, so the venue
					 * would have consumed liquidity without reporting a trade for it.
					 * The book and the participants' records would have disagreed
					 * from that moment on, silently, forever.
					 *
					 * Property-based testing found it in about four seconds.
					 */
					case 'cancel_aggressing':
						return {
							fills,
							remaining: remaining as Quantity,
							pulled: settlePulls(),
							aggressorCancelled: true
						};

					case 'cancel_resting':
						toPull.push(resting);
						i += 1;
						continue;

					case 'cancel_both':
						toPull.push(resting);
						return {
							fills,
							remaining: remaining as Quantity,
							pulled: settlePulls(),
							aggressorCancelled: true
						};
				}
			}

			const traded = Math.min(remaining, resting.remaining);
			fills.push({ restingOrder: resting, price: level.price, quantity: traded as Quantity });
			remaining -= traded;

			if (request.dryRun) {
				// Move on without touching anything. The caller only wanted a total.
				i += 1;
				continue;
			}

			resting.remaining = (resting.remaining - traded) as Quantity;
			level.total -= traded;

			if (resting.remaining === 0) level.orders.splice(i, 1);
			else i += 1;
		}

		if (!request.dryRun && level.orders.length === 0) {
			opposite.splice(levelIndex, 1);
			// Do not advance: the next level has shifted into this index.
			continue;
		}

		if (remaining === 0) break outer;
		levelIndex += 1;
	}

	return {
		fills,
		remaining: remaining as Quantity,
		pulled: settlePulls(),
		aggressorCancelled: false
	};
}

/**
 * How much of `quantity` the book could fill right now, without changing it.
 *
 * Fill-or-kill asks this first. `dryRun` is not an optimisation here — it is
 * the difference between "check, then act" being safe and being a race, and it
 * is safe only because the engine is single-threaded and nothing can arrive
 * between the two calls. That property is worth naming, because it is exactly
 * what a multi-threaded engine would have to give up.
 */
export function fillableQuantity(book: Book, request: MatchRequest): number {
	const result = match(book, { ...request, dryRun: true });
	return request.quantity - result.remaining;
}

/* -------------------------------------------------------------------------- */
/* Depth                                                                       */
/* -------------------------------------------------------------------------- */

export interface DepthLevel {
	readonly price: Price;
	readonly quantity: number;
	readonly orders: number;
}

/**
 * The top `depth` levels of each side — what a ladder actually shows.
 *
 * Aggregated, so it says "4,200 at 455.00" rather than naming the eleven orders
 * that make it up. Publishing the individual orders would let anybody watch a
 * large participant's queue position move and trade in front of it, which is
 * why every venue aggregates.
 */
export function depthOf(book: Book, depth = 10): { bids: DepthLevel[]; asks: DepthLevel[] } {
	const take = (levels: readonly PriceLevel[]): DepthLevel[] =>
		levels.slice(0, depth).map((level) => ({
			price: level.price,
			quantity: level.total,
			orders: level.orders.length
		}));

	return { bids: take(book.bids), asks: take(book.asks) };
}

/**
 * Every resting order, in a deterministic order.
 *
 * Used by snapshots and by the tests that compare a replayed book against a
 * live one. The traversal is ladder order then queue order, which is total and
 * reproducible — so two books with the same orders serialise identically and a
 * hash of the output is a usable fingerprint.
 */
export function* allOrders(book: Book): Generator<RestingOrder> {
	for (const level of book.bids) yield* level.orders;
	for (const level of book.asks) yield* level.orders;
}
