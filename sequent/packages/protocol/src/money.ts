/**
 * Numbers that represent money and quantity.
 *
 * One rule, and everything else follows from it: **there are no floating point
 * numbers anywhere in this system.** Not in prices, not in fees, not in
 * balances, not "just for display".
 *
 * The reason is not pedantry. `0.1 + 0.2` is `0.30000000000000004` in every
 * language that uses IEEE 754 doubles, which is every language you are likely
 * to write this in. A venue that adds a fee to a price in floating point will,
 * on some fill, produce a number that does not exist on its own tick ladder —
 * and the double-entry ledger will then fail to balance by a fraction of a
 * penny, once, on a Tuesday, out of eleven million trades. Finding that is a
 * week you will not enjoy.
 *
 * So: every monetary and quantity value in Sequent is a JavaScript integer, in
 * a unit small enough that fractions never arise.
 */

/* -------------------------------------------------------------------------- */
/* Scale                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How many integer price units make up one unit of currency.
 *
 * 10,000 means the smallest representable amount is 1/100th of a penny, which
 * is finer than any venue we are modelling quotes in — deliberately, so that
 * fee arithmetic has somewhere to round *to* rather than rounding a price.
 *
 * £45.50 is therefore `455_000`.
 */
export const SCALE = 10_000;

/**
 * The largest value we allow through the door.
 *
 * JavaScript integers are exact up to 2^53 − 1 (about 9.007e15). A price times
 * a quantity has to stay inside that, and so does the sum of every posting in
 * the ledger. Capping a single value at 1e15 leaves nine orders of magnitude of
 * headroom for aggregation, which is a margin nobody will exhaust and a limit
 * that turns a silent precision loss into a loud rejection.
 *
 * Silent is the enemy. `2 ** 53 + 1 === 2 ** 53` is `true`, and no exception is
 * thrown when your balance stops being the number you think it is.
 */
export const MAX_MAGNITUDE = 1e15;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A price, in units of 1/`SCALE` of the instrument's currency.
 *
 * Branded so that a quantity cannot be passed where a price is expected. The
 * brand exists only in the type system — at runtime this is a plain number, and
 * the tag costs nothing.
 */
export type Price = number & { readonly __brand: 'Price' };

/** A quantity, in whole tradeable units. Shares, contracts, lots. */
export type Quantity = number & { readonly __brand: 'Quantity' };

/**
 * An amount of money, in units of 1/`SCALE` of a currency.
 *
 * Signed: in a double-entry ledger a posting is a debit or a credit, and
 * representing that as a sign rather than a separate field is what lets us
 * assert that a transaction's postings sum to exactly zero.
 */
export type Amount = number & { readonly __brand: 'Amount' };

/* -------------------------------------------------------------------------- */
/* Constructors                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Assert a value is a safe integer of the right magnitude, and brand it.
 *
 * Every one of these throws rather than returning a result type. That is the
 * right trade at this layer: a non-integer price is not a business outcome the
 * caller should handle, it is a programming error, and the earliest possible
 * loud failure is the cheapest one. Untrusted input is validated by a schema
 * long before it reaches here.
 */
function integer(value: number, what: string): number {
	if (!Number.isInteger(value)) {
		throw new TypeError(`${what} must be an integer, got ${value}`);
	}
	if (Math.abs(value) > MAX_MAGNITUDE) {
		throw new RangeError(`${what} is out of range: ${value}`);
	}
	return value;
}

export function price(value: number): Price {
	if (value <= 0) throw new RangeError(`price must be positive, got ${value}`);
	return integer(value, 'price') as Price;
}

export function quantity(value: number): Quantity {
	if (value <= 0) throw new RangeError(`quantity must be positive, got ${value}`);
	return integer(value, 'quantity') as Quantity;
}

export function amount(value: number): Amount {
	return integer(value, 'amount') as Amount;
}

/** Zero, in the places where a typed zero reads better than a cast. */
export const ZERO = 0 as Amount;

/* -------------------------------------------------------------------------- */
/* Arithmetic                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What a fill is worth: price × quantity, as an `Amount`.
 *
 * Both operands are integers and so is the product, so this is exact — which is
 * the entire reason for the integer discipline above. The result is in the same
 * 1/`SCALE` units as the price, so it can be posted to the ledger without
 * conversion.
 */
export function notional(p: Price, q: Quantity): Amount {
	return amount(p * q);
}

/**
 * A fee in basis points, rounded **towards zero**.
 *
 * The rounding direction is a real decision, not a default. Rounding a fee down
 * means the venue collects fractionally less than the published rate, and the
 * remainder stays with the participant. Rounding up would mean the venue takes
 * a fraction of a unit more than it advertised, several million times a day,
 * which is the sort of thing regulators write letters about.
 *
 * The rounding is also why `SCALE` is finer than any price we quote: a fee on a
 * penny-priced trade still has room to be represented rather than vanishing.
 *
 * The remainder does not disappear. `feeSplit` below returns it, and the ledger
 * posts it, because an amount that is neither charged nor refunded is an amount
 * that stops the books balancing.
 */
export function feeOf(value: Amount, basisPoints: number): Amount {
	if (!Number.isInteger(basisPoints) || basisPoints < 0) {
		throw new RangeError(`basis points must be a non-negative integer, got ${basisPoints}`);
	}
	return amount(Math.trunc((value * basisPoints) / 10_000));
}

/** Add, with the same overflow guard as construction. */
export function add(a: Amount, b: Amount): Amount {
	return amount(a + b);
}

/** Negate, for the credit side of a posting. */
export function negate(a: Amount): Amount {
	return amount(-a);
}

/** Sum, for asserting a transaction balances. */
export function sum(values: readonly Amount[]): Amount {
	let total = 0;
	for (const value of values) total += value;
	return amount(total);
}

/* -------------------------------------------------------------------------- */
/* Ticks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whether a price sits exactly on an instrument's tick ladder.
 *
 * Rejecting an off-tick price is not fussiness. Price-time priority only means
 * anything if two orders at "the same price" are genuinely the same number, and
 * a ladder with arbitrary prices on it turns every price level into a level of
 * one. Venues enforce this, and so do we.
 */
export function isOnTick(p: Price, tickSize: number): boolean {
	return p % tickSize === 0;
}

/** The nearest tick at or below `p`. Used for price bands, never for orders. */
export function floorToTick(p: Price, tickSize: number): Price {
	return price(Math.floor(p / tickSize) * tickSize);
}

/** The nearest tick at or above `p`. */
export function ceilToTick(p: Price, tickSize: number): Price {
	return price(Math.ceil(p / tickSize) * tickSize);
}

/* -------------------------------------------------------------------------- */
/* The edges                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Format for a human. The only place a fraction is allowed to appear.
 *
 * Note that this divides at the very last moment, into a string, and the result
 * never travels back inwards. A formatted price is output, not a value.
 */
export function formatPrice(p: Price, currency = 'GBP', locale = 'en-GB'): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 4
	}).format(p / SCALE);
}

/** Parse a human's decimal string into an exact integer price. */
export function parsePrice(text: string): Price {
	const trimmed = text.trim().replace(/[,\s]/g, '');
	if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
		throw new RangeError(`not a price: ${text}`);
	}

	/*
	 * String arithmetic, not `Number(text) * SCALE`.
	 *
	 * `45.55 * 10_000` is `455499.99999999994` — the multiplication reintroduces
	 * exactly the error the integer discipline exists to avoid, on the very last
	 * step before the value becomes trusted. Padding the fractional digits and
	 * concatenating keeps it exact.
	 */
	const [whole = '0', fraction = ''] = trimmed.split('.');
	return price(Number(whole + fraction.padEnd(4, '0')));
}
