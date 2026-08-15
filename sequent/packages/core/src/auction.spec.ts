import { describe, expect, it } from 'vitest';
import {
	asAccountId,
	asFirmId,
	asInstrumentId,
	asOrderId,
	price,
	quantity,
	type Side
} from '@sequent/protocol';
import { emptyBook, isCrossed, rest, type Book, type RestingOrder } from './book.ts';
import { findAuctionPrice, indicativePrice, uncross } from './auction.ts';

/**
 * The call auction.
 *
 * These tests are the tie-break rules written as assertions. Each rule has a
 * constituency — somebody is better off under it than under the alternative —
 * so getting them wrong is not a rounding error, it is a transfer of money
 * between participants who did nothing different.
 */

const VOD = asInstrumentId('VOD.L');
const REFERENCE = price(100);

let counter = 0;

function order(side: Side, at: number, qty: number, firm = 'firm-a'): RestingOrder {
	counter += 1;
	return {
		orderId: asOrderId(`O${counter}`),
		firmId: asFirmId(firm),
		accountId: asAccountId(`${firm}-main`),
		side,
		price: price(at),
		originalQuantity: quantity(qty),
		remaining: quantity(qty),
		seq: counter,
		expiresAtClose: false
	};
}

function bookWith(...orders: RestingOrder[]): Book {
	const book = emptyBook(VOD);
	for (const o of orders) rest(book, o);
	return book;
}

describe('finding the auction price', () => {
	it('does nothing when the book does not cross', () => {
		const book = bookWith(order('buy', 99, 100), order('sell', 101, 100));

		expect(findAuctionPrice(book, REFERENCE)).toBeUndefined();
		expect(uncross(book, REFERENCE).price).toBeUndefined();
	});

	it('picks the price that trades the most', () => {
		/*
		 * At 100: buyers willing = 200 (the 101 bid and the 100 bid), sellers
		 * willing = 100. Ten trade.
		 * At 101: buyers willing = 100, sellers willing = 300. A hundred trade.
		 * At 99:  buyers = 300, sellers = 100 — also a hundred.
		 *
		 * Volume decides first, and only then do the tie-breaks matter.
		 */
		const book = bookWith(
			order('buy', 101, 100),
			order('buy', 100, 100),
			order('buy', 99, 100),
			order('sell', 99, 100),
			order('sell', 100, 100),
			order('sell', 101, 100)
		);

		const chosen = findAuctionPrice(book, REFERENCE)!;
		expect(chosen.executable).toBe(200);
		expect(chosen.price).toBe(100);
	});

	it('prefers the smaller imbalance when volume ties', () => {
		// Both 100 and 101 execute 100. At 100 the surplus is +100 buyers; at 101
		// it is 0. The price that leaves the fewest people unfilled wins.
		const book = bookWith(order('buy', 101, 100), order('buy', 100, 100), order('sell', 101, 100));

		const chosen = findAuctionPrice(book, REFERENCE)!;
		expect(chosen.price).toBe(101);
		expect(chosen.imbalance).toBe(0);
	});

	it('settles higher when every tied price leaves buyers unfilled', () => {
		/*
		 * Unfilled demand at every candidate means the price is too low. Settling
		 * at the bottom of the range would hand the filled buyers a discount paid
		 * for by the sellers, so the rule pushes towards the buyers' side.
		 */
		const book = bookWith(order('buy', 102, 200), order('buy', 101, 200), order('sell', 100, 100));

		const chosen = findAuctionPrice(book, REFERENCE)!;
		expect(chosen.imbalance).toBeGreaterThan(0);
		expect(chosen.price).toBe(102);
	});

	it('settles lower when every tied price leaves sellers unfilled', () => {
		const book = bookWith(order('buy', 102, 100), order('sell', 100, 200), order('sell', 101, 200));

		const chosen = findAuctionPrice(book, REFERENCE)!;
		expect(chosen.imbalance).toBeLessThan(0);
		expect(chosen.price).toBe(100);
	});

	it('falls back to the price nearest the reference', () => {
		// Symmetric book: 100 and 101 both trade 100 with zero imbalance, and the
		// surplus does not lean one way. The reference breaks the tie.
		const build = () =>
			bookWith(
				order('buy', 101, 100),
				order('buy', 100, 100),
				order('sell', 100, 100),
				order('sell', 101, 100)
			);

		expect(findAuctionPrice(build(), price(100))!.price).toBe(100);
		expect(findAuctionPrice(build(), price(105))!.price).toBe(101);
	});
});

describe('clearing the book', () => {
	it('fills everybody at the one auction price, whatever they bid', () => {
		// The buyer was willing to pay 110 and pays 100 along with everyone else.
		const eager = order('buy', 110, 100);
		const book = bookWith(eager, order('sell', 100, 100));

		const result = uncross(book, REFERENCE);

		expect(result.price).toBe(100);
		expect(result.trades).toHaveLength(1);
		expect(result.trades[0]!.quantity).toBe(100);
		expect(eager.remaining).toBe(0);
	});

	it('allocates in price-time priority', () => {
		const first = order('buy', 105, 60);
		const second = order('buy', 105, 60);
		const book = bookWith(first, second, order('sell', 100, 100));

		const result = uncross(book, REFERENCE);

		// 100 available, 120 wanted: the earlier order fills entirely, the later
		// one gets what is left.
		expect(result.trades.map((t) => [t.buy.orderId, t.quantity])).toEqual([
			[first.orderId, 60],
			[second.orderId, 40]
		]);
	});

	it('leaves the book uncrossed afterwards', () => {
		const book = bookWith(
			order('buy', 105, 100),
			order('buy', 104, 100),
			order('sell', 100, 100),
			order('sell', 101, 100)
		);

		uncross(book, REFERENCE);

		expect(isCrossed(book)).toBe(false);
	});

	it('leaves unfilled orders resting with their queue position intact', () => {
		const big = order('buy', 105, 500);
		const book = bookWith(big, order('sell', 100, 100));

		uncross(book, REFERENCE);

		expect(big.remaining).toBe(400);
		expect(book.bids[0]!.orders[0]).toBe(big);
		expect(book.bids[0]!.total).toBe(400);
	});

	it('conserves quantity: what the buyers got is what the sellers gave', () => {
		const book = bookWith(
			order('buy', 106, 130),
			order('buy', 105, 70),
			order('sell', 100, 90),
			order('sell', 102, 60)
		);

		const result = uncross(book, REFERENCE);
		const traded = result.trades.reduce((total, t) => total + t.quantity, 0);

		expect(traded).toBe(result.quantity);
		// And every trade has a real order on both sides.
		for (const trade of result.trades) {
			expect(trade.buy.side).toBe('buy');
			expect(trade.sell.side).toBe('sell');
		}
	});
});

describe('the indicative price', () => {
	it('reports where the auction would clear before it does', () => {
		const book = bookWith(order('buy', 105, 200), order('sell', 100, 100));

		const indicative = indicativePrice(book, REFERENCE);

		expect(indicative.price).toBe(105);
		expect(indicative.quantity).toBe(100);
		expect(indicative.imbalance).toBe(100);
		// Reporting must not clear anything.
		expect(book.bids[0]!.total).toBe(200);
	});

	it('reports nothing when there is no crossing interest', () => {
		expect(indicativePrice(bookWith(order('buy', 99, 100)), REFERENCE)).toEqual({
			quantity: 0,
			imbalance: 0
		});
	});
});
