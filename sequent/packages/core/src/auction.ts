/**
 * The call auction, and the uncross that ends it.
 *
 * Continuous trading matches one order at a time against a book. An auction
 * does the opposite: orders accumulate without matching — the book is allowed
 * to cross, which is illegal at any other moment — and then the whole thing
 * clears at once, at a single price, for everybody.
 *
 * Venues open and close this way for a reason. At 08:00 there is no price:
 * overnight news has happened, nobody knows where the market is, and the first
 * participant to send an order into a continuous book would trade against a
 * stale one. An auction lets everybody express interest first and then finds
 * the price that satisfies the most of it — so the opening price is a
 * consensus rather than a race to be first.
 *
 * The algorithm below is the one European venues actually use, and it is worth
 * following closely because the tie-breaks are where the fairness lives.
 */

import type { Price, Quantity } from '@sequent/protocol';
import type { Book, PriceLevel, RestingOrder } from './book.ts';

/** One execution in an auction. Both sides are passive, so neither aggresses. */
export interface AuctionTrade {
	readonly buy: RestingOrder;
	readonly sell: RestingOrder;
	readonly quantity: Quantity;
}

export interface UncrossResult {
	/** Absent when the book did not cross and there is nothing to do. */
	readonly price?: Price;
	readonly quantity: number;
	/**
	 * Unfilled quantity at the auction price, signed. Positive means demand
	 * exceeded supply — more buyers went unsatisfied than sellers.
	 */
	readonly imbalance: number;
	readonly trades: AuctionTrade[];
}

/* -------------------------------------------------------------------------- */
/* Finding the price                                                           */
/* -------------------------------------------------------------------------- */

interface Candidate {
	readonly price: Price;
	readonly executable: number;
	readonly imbalance: number;
}

/**
 * How much of each side would trade if the auction cleared at `price`.
 *
 * Everyone who bid at or above the price is willing to buy there; everyone who
 * offered at or below is willing to sell. The amount that actually trades is
 * the smaller of the two, because a trade needs both.
 */
function evaluate(book: Book, price: Price): Candidate {
	let demand = 0;
	for (const level of book.bids) {
		if (level.price < price) break; // Ladder is descending: nothing further qualifies.
		demand += level.total;
	}

	let supply = 0;
	for (const level of book.asks) {
		if (level.price > price) break; // Ascending.
		supply += level.total;
	}

	return { price, executable: Math.min(demand, supply), imbalance: demand - supply };
}

/**
 * Every price worth considering.
 *
 * Only prices that somebody actually quoted can be auction prices — clearing at
 * a price nobody named would fill orders at a level no participant chose. And
 * only prices inside the crossed region can produce a trade, so the search is
 * bounded by the best bid above and the best ask below.
 *
 * The candidate set is therefore small: on a typical open it is a handful of
 * levels, not a scan of the whole ladder.
 */
function candidatePrices(book: Book): Price[] {
	const bestBid = book.bids[0];
	const bestAsk = book.asks[0];
	if (!bestBid || !bestAsk || bestBid.price < bestAsk.price) return [];

	const inRange = (level: PriceLevel) =>
		level.price >= bestAsk.price && level.price <= bestBid.price;

	const prices = new Set<number>();
	for (const level of book.bids) if (inRange(level)) prices.add(level.price);
	for (const level of book.asks) if (inRange(level)) prices.add(level.price);

	return [...prices].sort((a, b) => a - b) as Price[];
}

/**
 * The auction price.
 *
 * Four rules, applied in order, each one only reached when the previous left a
 * tie:
 *
 *   1. **Maximum executable volume.** The auction exists to trade as much as
 *      possible; the price that does that is the price the market wants.
 *
 *   2. **Minimum imbalance.** Between two prices that trade the same amount,
 *      prefer the one that leaves the least unsatisfied. Fewer participants go
 *      home holding an order they could not fill.
 *
 *   3. **Which way the surplus leans.** If every remaining candidate has
 *      leftover *buyers*, take the highest — unfilled demand means the price
 *      should be higher, and settling lower would be a gift to the buyers who
 *      did get filled. Mirror it for leftover sellers.
 *
 *   4. **Closest to the reference price.** When the surplus changes sign across
 *      the remaining candidates, the market has genuinely bracketed the price,
 *      and the least arbitrary answer is the one nearest to where the
 *      instrument was before the auction.
 *
 * Every one of these is a fairness rule with a constituency, which is why they
 * are spelled out rather than collapsed into a comparator nobody can read.
 */
export function findAuctionPrice(book: Book, referencePrice: Price): Candidate | undefined {
	const candidates = candidatePrices(book).map((price) => evaluate(book, price));
	const tradeable = candidates.filter((candidate) => candidate.executable > 0);

	if (tradeable.length === 0) return undefined;

	// 1. Maximum executable volume.
	const maxVolume = Math.max(...tradeable.map((c) => c.executable));
	let short = tradeable.filter((c) => c.executable === maxVolume);
	if (short.length === 1) return short[0];

	// 2. Minimum absolute imbalance.
	const minImbalance = Math.min(...short.map((c) => Math.abs(c.imbalance)));
	short = short.filter((c) => Math.abs(c.imbalance) === minImbalance);
	if (short.length === 1) return short[0];

	// 3. Which way the surplus leans, if it leans one way for all of them.
	const allBuySurplus = short.every((c) => c.imbalance > 0);
	const allSellSurplus = short.every((c) => c.imbalance < 0);

	if (allBuySurplus) return short.reduce((a, b) => (b.price > a.price ? b : a));
	if (allSellSurplus) return short.reduce((a, b) => (b.price < a.price ? b : a));

	// 4. Closest to the reference. Ties inside this go to the lower price, so
	//    the rule is total and a replay cannot pick differently.
	return short.reduce((best, candidate) => {
		const closer =
			Math.abs(candidate.price - referencePrice) - Math.abs(best.price - referencePrice);
		if (closer < 0) return candidate;
		if (closer > 0) return best;
		return candidate.price < best.price ? candidate : best;
	});
}

/* -------------------------------------------------------------------------- */
/* Allocating                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Clear the book at the auction price.
 *
 * Allocation is still price-time priority: better prices fill first, and within
 * a price, earlier orders fill first. The difference from continuous trading is
 * that *everybody* trades at the auction price regardless of what they bid — a
 * buyer who was willing to pay 460 pays 455 along with everyone else.
 *
 * That is the point of an auction and it is worth being explicit about, because
 * it is the opposite of the continuous rule where the resting price wins. Here
 * there is no resting side and no aggressing side; there is one price and every
 * participant on the right side of it gets it.
 *
 * The book is mutated: filled orders are removed and partially filled ones are
 * reduced. Anything left over stays exactly where it was, keeping its queue
 * position for the continuous session that follows.
 */
export function uncross(book: Book, referencePrice: Price): UncrossResult {
	const chosen = findAuctionPrice(book, referencePrice);

	if (!chosen) {
		return { quantity: 0, imbalance: 0, trades: [] };
	}

	const price = chosen.price;
	const trades: AuctionTrade[] = [];
	let remaining = chosen.executable;

	/*
	 * Two pointers walking inwards from the best price on each side.
	 *
	 * Both ladders are already in priority order, so "next order to fill" is
	 * always the first order of the first eligible level — no sorting, and no
	 * chance of the allocation disagreeing with the queue positions that were
	 * published when the orders were accepted.
	 */
	while (remaining > 0) {
		const bidLevel = book.bids[0];
		const askLevel = book.asks[0];

		// The executable quantity was computed from these same levels a moment
		// ago, so running out is impossible — but "impossible" states are worth
		// a guard rather than an infinite loop.
		if (!bidLevel || !askLevel) break;
		if (bidLevel.price < price || askLevel.price > price) break;

		const buy = bidLevel.orders[0];
		const sell = askLevel.orders[0];
		if (!buy || !sell) break;

		const quantity = Math.min(buy.remaining, sell.remaining, remaining);

		trades.push({ buy, sell, quantity: quantity as Quantity });
		remaining -= quantity;

		for (const [order, level] of [
			[buy, bidLevel],
			[sell, askLevel]
		] as const) {
			order.remaining = (order.remaining - quantity) as Quantity;
			level.total -= quantity;

			if (order.remaining === 0) {
				level.orders.shift();
				if (level.orders.length === 0) {
					(order.side === 'buy' ? book.bids : book.asks).shift();
				}
			}
		}
	}

	return {
		price,
		quantity: chosen.executable,
		imbalance: chosen.imbalance,
		trades
	};
}

/**
 * What the venue publishes during `pre_open`, before anything has cleared.
 *
 * Participants use it to decide whether to add to the auction, so withholding
 * it would advantage whoever could compute it fastest from the depth feed — and
 * the depth feed is public, so the only people it would disadvantage are the
 * ones without the infrastructure to do the sum. Publishing it is cheaper than
 * defending the alternative.
 */
export function indicativePrice(
	book: Book,
	referencePrice: Price
): { price?: Price; quantity: number; imbalance: number } {
	const chosen = findAuctionPrice(book, referencePrice);
	if (!chosen) return { quantity: 0, imbalance: 0 };

	return { price: chosen.price, quantity: chosen.executable, imbalance: chosen.imbalance };
}
