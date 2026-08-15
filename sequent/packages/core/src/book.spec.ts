import { describe, expect, it } from 'vitest';
import {
	asAccountId,
	asFirmId,
	asInstrumentId,
	asOrderId,
	price,
	quantity,
	type Price,
	type Quantity,
	type Side
} from '@sequent/protocol';
import {
	allOrders,
	best,
	depthOf,
	emptyBook,
	fillableQuantity,
	isCrossed,
	match,
	remove,
	rest,
	spread,
	type Book,
	type RestingOrder
} from './book.ts';

/**
 * Tests for the order book.
 *
 * These are the most valuable tests in the project, because the behaviour they
 * describe is invisible until it is expensive. A book that occasionally fills at
 * the wrong price, or that lets the second order in a queue jump the first, does
 * not throw — it just quietly transfers money between participants who have
 * lawyers.
 */

const VOD = asInstrumentId('VOD.L');

let nextSeq = 0;

/** A resting order, with only the fields a test actually cares about spelled out. */
function order(
	side: Side,
	at: number,
	qty: number,
	firm = 'firm-a'
): RestingOrder {
	nextSeq += 1;
	return {
		orderId: asOrderId(`O${nextSeq}`),
		firmId: asFirmId(firm),
		accountId: asAccountId(`${firm}-main`),
		side,
		price: price(at),
		originalQuantity: quantity(qty),
		remaining: quantity(qty),
		seq: nextSeq,
		expiresAtClose: false
	};
}

function bookWith(...orders: RestingOrder[]): Book {
	const book = emptyBook(VOD);
	for (const o of orders) rest(book, o);
	return book;
}

/** The invariant that must hold after every operation on a continuous book. */
function assertLadderIsSound(book: Book): void {
	for (const [side, levels] of [
		['buy', book.bids],
		['sell', book.asks]
	] as const) {
		for (let i = 1; i < levels.length; i += 1) {
			const previous = levels[i - 1]!.price;
			const current = levels[i]!.price;
			if (side === 'buy') expect(previous).toBeGreaterThan(current);
			else expect(previous).toBeLessThan(current);
		}

		for (const level of levels) {
			// The denormalised total is a promise. Check it every time.
			const summed = level.orders.reduce((total, o) => total + o.remaining, 0);
			expect(level.total).toBe(summed);
			expect(level.orders.length).toBeGreaterThan(0);
		}
	}
}

describe('the ladder', () => {
	it('keeps bids descending and asks ascending', () => {
		const book = bookWith(
			order('buy', 100, 10),
			order('buy', 102, 10),
			order('buy', 101, 10),
			order('sell', 106, 10),
			order('sell', 104, 10),
			order('sell', 105, 10)
		);

		expect(book.bids.map((l) => l.price)).toEqual([102, 101, 100]);
		expect(book.asks.map((l) => l.price)).toEqual([104, 105, 106]);
		assertLadderIsSound(book);
	});

	it('puts the best price at index 0 on both sides', () => {
		const book = bookWith(order('buy', 100, 5), order('buy', 103, 5), order('sell', 110, 5));

		expect(best(book, 'buy')?.price).toBe(103);
		expect(best(book, 'sell')?.price).toBe(110);
		expect(spread(book)).toBe(7);
	});

	it('has no spread when a side is empty', () => {
		expect(spread(bookWith(order('buy', 100, 5)))).toBeUndefined();
	});

	it('removes a level once its last order goes', () => {
		const only = order('buy', 100, 5);
		const book = bookWith(only, order('buy', 99, 5));

		expect(remove(book, only)).toBe(5);
		expect(book.bids.map((l) => l.price)).toEqual([99]);
		assertLadderIsSound(book);
	});

	it('reports an unknown order rather than throwing', () => {
		// A cancel that races a fill is ordinary, not exceptional.
		const book = bookWith(order('buy', 100, 5));
		expect(remove(book, order('buy', 100, 5))).toBeUndefined();
	});
});

describe('time priority', () => {
	it('serves the earliest order at a price first', () => {
		const first = order('sell', 100, 5);
		const second = order('sell', 100, 5);
		const third = order('sell', 100, 5);
		const book = bookWith(first, second, third);

		const result = match(book, {
			side: 'buy',
			quantity: quantity(7),
			limitPrice: price(100),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(result.fills.map((f) => [f.restingOrder.orderId, f.quantity])).toEqual([
			[first.orderId, 5],
			[second.orderId, 2]
		]);
		// The third order was never touched.
		expect(third.remaining).toBe(5);
		assertLadderIsSound(book);
	});

	it('reports queue position so participants can check it', () => {
		const book = emptyBook(VOD);
		expect(rest(book, order('sell', 100, 5))).toBe(1);
		expect(rest(book, order('sell', 100, 5))).toBe(2);
		// A better price starts a new queue, so it is first in its own.
		expect(rest(book, order('sell', 99, 5))).toBe(1);
	});
});

describe('price priority and price improvement', () => {
	it('takes the best price first, then walks the ladder', () => {
		const cheap = order('sell', 100, 3);
		const middle = order('sell', 101, 3);
		const dear = order('sell', 102, 3);
		const book = bookWith(dear, cheap, middle);

		const result = match(book, {
			side: 'buy',
			quantity: quantity(8),
			limitPrice: price(102),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(result.fills.map((f) => f.price)).toEqual([100, 101, 102]);
		expect(result.remaining).toBe(0);
		assertLadderIsSound(book);
	});

	it('fills at the RESTING price, not the aggressor’s', () => {
		// A buyer willing to pay 105 hitting an ask at 100 pays 100. The passive
		// side chose the price and gets it; the aggressor keeps the improvement.
		const book = bookWith(order('sell', 100, 5));

		const result = match(book, {
			side: 'buy',
			quantity: quantity(5),
			limitPrice: price(105),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(result.fills).toHaveLength(1);
		expect(result.fills[0]!.price).toBe(100);
	});

	it('stops at the aggressor’s limit', () => {
		const book = bookWith(order('sell', 100, 3), order('sell', 105, 3));

		const result = match(book, {
			side: 'buy',
			quantity: quantity(6),
			limitPrice: price(100),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(result.fills).toHaveLength(1);
		expect(result.remaining).toBe(3);
		// The 105 level is untouched and the book is not crossed.
		expect(book.asks.map((l) => l.price)).toEqual([105]);
	});

	it('a market order takes any price', () => {
		const book = bookWith(order('sell', 100, 2), order('sell', 900, 2));

		const result = match(book, {
			side: 'buy',
			quantity: quantity(4),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(result.fills.map((f) => f.price)).toEqual([100, 900]);
		expect(result.remaining).toBe(0);
	});
});

describe('the book never crosses', () => {
	it('is uncrossed after an aggressive order sweeps a side', () => {
		const book = bookWith(
			order('buy', 99, 5),
			order('sell', 100, 5),
			order('sell', 101, 5)
		);

		match(book, {
			side: 'buy',
			quantity: quantity(10),
			limitPrice: price(101),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(isCrossed(book)).toBe(false);
		expect(book.asks).toHaveLength(0);
		assertLadderIsSound(book);
	});
});

describe('self-trade prevention', () => {
	it('cancel_resting pulls the firm’s own order and keeps going', () => {
		const own = order('sell', 100, 5, 'firm-a');
		const other = order('sell', 100, 5, 'firm-b');
		const book = bookWith(own, other);

		const result = match(book, {
			side: 'buy',
			quantity: quantity(5),
			limitPrice: price(100),
			firmId: asFirmId('firm-a'),
			selfTradePrevention: 'cancel_resting'
		});

		// Filled against firm-b, and firm-a's own order was pulled off the book.
		expect(result.fills).toHaveLength(1);
		expect(result.fills[0]!.restingOrder.firmId).toBe('firm-b');
		expect(result.pulled.map((p) => p.order.orderId)).toEqual([own.orderId]);
		expect(result.remaining).toBe(0);
		assertLadderIsSound(book);
	});

	it('cancel_aggressing refuses the incoming order and leaves the book alone', () => {
		const own = order('sell', 100, 5, 'firm-a');
		const book = bookWith(own);

		const result = match(book, {
			side: 'buy',
			quantity: quantity(5),
			limitPrice: price(100),
			firmId: asFirmId('firm-a'),
			selfTradePrevention: 'cancel_aggressing'
		});

		expect(result.aggressorCancelled).toBe(true);
		expect(result.fills).toHaveLength(0);
		expect(own.remaining).toBe(5);
	});

	it('cancel_both pulls the resting order and refuses the aggressor', () => {
		const own = order('sell', 100, 5, 'firm-a');
		const book = bookWith(own);

		const result = match(book, {
			side: 'buy',
			quantity: quantity(5),
			limitPrice: price(100),
			firmId: asFirmId('firm-a'),
			selfTradePrevention: 'cancel_both'
		});

		expect(result.aggressorCancelled).toBe(true);
		expect(result.pulled.map((p) => p.order.orderId)).toEqual([own.orderId]);
		expect(book.asks).toHaveLength(0);
	});

	it('does not stop two different firms trading with each other', () => {
		const book = bookWith(order('sell', 100, 5, 'firm-a'));

		const result = match(book, {
			side: 'buy',
			quantity: quantity(5),
			limitPrice: price(100),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(result.fills).toHaveLength(1);
		expect(result.aggressorCancelled).toBe(false);
	});
});

describe('dry runs', () => {
	it('reports what could fill without touching the book', () => {
		const resting = order('sell', 100, 5);
		const book = bookWith(resting, order('sell', 101, 5));

		const fillable = fillableQuantity(book, {
			side: 'buy',
			quantity: quantity(8),
			limitPrice: price(101),
			firmId: asFirmId('firm-b'),
			selfTradePrevention: 'cancel_both'
		});

		expect(fillable).toBe(8);
		// Nothing moved. This is what makes fill-or-kill safe to check first.
		expect(resting.remaining).toBe(5);
		expect(book.asks.map((l) => l.total)).toEqual([5, 5]);
		assertLadderIsSound(book);
	});

	it('reports a shortfall when the book cannot fill it all', () => {
		const book = bookWith(order('sell', 100, 3));

		expect(
			fillableQuantity(book, {
				side: 'buy',
				quantity: quantity(10),
				limitPrice: price(100),
				firmId: asFirmId('firm-b'),
				selfTradePrevention: 'cancel_both'
			})
		).toBe(3);
	});
});

describe('depth', () => {
	it('aggregates a level rather than naming the orders in it', () => {
		const book = bookWith(
			order('sell', 100, 5),
			order('sell', 100, 7),
			order('sell', 101, 2)
		);

		const { asks } = depthOf(book, 10);

		expect(asks).toEqual([
			{ price: 100, quantity: 12, orders: 2 },
			{ price: 101, quantity: 2, orders: 1 }
		]);
	});

	it('truncates to the requested depth', () => {
		const book = bookWith(...[100, 101, 102, 103].map((p) => order('sell', p, 1)));
		expect(depthOf(book, 2).asks.map((l) => l.price)).toEqual([100, 101]);
	});
});

describe('traversal', () => {
	it('visits every order in a deterministic order', () => {
		const book = bookWith(
			order('buy', 99, 1),
			order('buy', 100, 1),
			order('sell', 101, 1),
			order('sell', 102, 1)
		);

		// Ladder order, then queue order — total and reproducible, which is what
		// makes a hash of this usable as a book fingerprint in the replay tests.
		expect([...allOrders(book)].map((o) => o.price)).toEqual([100, 99, 101, 102]);
	});
});
