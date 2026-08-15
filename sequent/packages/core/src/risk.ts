/**
 * Pre-trade risk.
 *
 * Every check in this file runs **before** the book sees the order, inside the
 * deterministic core, on the same thread as matching. That placement is the
 * whole design and it is not the obvious one — the obvious one is a risk
 * service the gateway calls before forwarding.
 *
 * The obvious one is wrong, for a reason worth internalising. A risk check that
 * happens somewhere else answers a question about a state that may have changed
 * by the time the order arrives. Two orders that each pass a position check
 * independently can breach the limit together, because the check and the fill
 * were not the same instant. It is the double-booking problem again, wearing a
 * suit: check-then-act across a boundary is a race, always, and no amount of
 * care in the checking fixes it.
 *
 * Inside the engine there is no boundary. The check reads the same state the
 * fill is about to change, and nothing can arrive in between. That is a
 * guarantee, not a mitigation.
 *
 * The cost is honest: every check has to be cheap enough to run on the critical
 * path, and none of them may touch a database. Everything below is arithmetic
 * over maps.
 */

import type {
	AccountId,
	FirmId,
	InstrumentId,
	Price,
	Quantity,
	RejectReason,
	Side
} from '@sequent/protocol';
import { isOnTick, notional } from '@sequent/protocol';
import { fillableQuantity, type Book } from './book.ts';
import { limitsFor, positionOf, workingOf, type EngineState, type Instrument } from './state.ts';

/** A refusal, with the code a machine reads and the sentence a human does. */
export interface Refusal {
	readonly reason: RejectReason;
	readonly detail: string;
}

export interface OrderCheck {
	readonly firmId: FirmId;
	readonly accountId: AccountId;
	readonly instrumentId: InstrumentId;
	readonly side: Side;
	readonly price?: Price;
	readonly quantity: Quantity;
}

/**
 * Phases in which a new order may be placed.
 *
 * Cancels are allowed in every phase except none, and that asymmetry is
 * deliberate: a participant with unwanted exposure must always be able to get
 * *out* of an order, even during a halt when they cannot get into one. A venue
 * that suspends cancellation during a halt traps everybody who was resting
 * liquidity when the news broke, which is precisely the population that was
 * doing the venue a favour.
 */
const PLACEABLE_PHASES = new Set(['pre_open', 'auction', 'continuous']);

/**
 * Run every pre-trade check, in order, and stop at the first refusal.
 *
 * The order is not arbitrary. Cheap and unconditional checks come first, so the
 * common rejections cost the least; and structural problems ("no such
 * instrument") are reported before policy ones ("too big"), because telling
 * somebody their order exceeds a limit on an instrument that does not exist is
 * a confusing way to say the symbol is wrong.
 */
export function checkOrder(
	state: EngineState,
	instrument: Instrument | undefined,
	check: OrderCheck
): Refusal | undefined {
	if (!instrument) {
		return { reason: 'unknown_instrument', detail: `No instrument ${check.instrumentId}` };
	}

	if (!PLACEABLE_PHASES.has(instrument.phase)) {
		return {
			reason: 'instrument_not_trading',
			detail: `${check.instrumentId} is ${instrument.phase}; orders are not accepted`
		};
	}

	if (state.killed.has(check.firmId)) {
		return {
			reason: 'kill_switch_engaged',
			detail: 'Trading is stopped for this firm. Contact your risk manager.'
		};
	}

	/*
	 * The grids. A price off the tick ladder or a quantity off the lot grid is
	 * rejected rather than rounded.
	 *
	 * Rounding would be friendlier and is the wrong call: price-time priority
	 * only means something if two orders "at the same price" are the same
	 * number, and a participant who asked for 455.03 and got 455.00 has been
	 * given a different order from the one they sent. Refusing is honest.
	 */
	if (check.price !== undefined && !isOnTick(check.price, instrument.tickSize)) {
		return {
			reason: 'price_off_tick',
			detail: `Price must be a multiple of ${instrument.tickSize}`
		};
	}

	if (check.quantity % instrument.lotSize !== 0) {
		return {
			reason: 'quantity_off_lot',
			detail: `Quantity must be a multiple of ${instrument.lotSize}`
		};
	}

	const limits = limitsFor(state, check.accountId);

	if (check.quantity > limits.maxOrderQuantity) {
		return {
			reason: 'exceeds_max_order_size',
			detail: `Order of ${check.quantity} exceeds the limit of ${limits.maxOrderQuantity}`
		};
	}

	/*
	 * The fat-finger collar.
	 *
	 * A limit price far from the reference is almost always a decimal point in
	 * the wrong place — the classic is a price typed in pounds into a field that
	 * wants pence. Collaring it costs a participant nothing on a normal order and
	 * saves them from selling a hundred thousand shares at a hundredth of their
	 * value.
	 *
	 * Only limit orders are collared. A market order has no price to check, which
	 * is why a market order is a far more dangerous instruction than it looks and
	 * why we only accept it as immediate-or-cancel.
	 */
	if (check.price !== undefined) {
		const distance = Math.abs(check.price - instrument.referencePrice);
		const allowed = Math.trunc((instrument.referencePrice * limits.priceCollarBps) / 10_000);

		if (distance > allowed) {
			return {
				reason: 'price_outside_collar',
				detail: `Price is more than ${limits.priceCollarBps / 100}% from the reference of ${instrument.referencePrice}`
			};
		}
	}

	/*
	 * Notional. A limit of quantity alone is not a limit of money: ten shares of
	 * something priced at a million is a bigger mistake than a million shares of
	 * something priced at ten.
	 *
	 * A market order is measured against the reference price, which is an
	 * estimate — it is the best the venue has before the order has traded, and an
	 * estimate applied consistently beats no check at all.
	 */
	const estimate = check.price ?? instrument.referencePrice;
	if (notional(estimate, check.quantity) > limits.maxOrderNotional) {
		return {
			reason: 'exceeds_max_order_size',
			detail: `Order value exceeds the limit of ${limits.maxOrderNotional}`
		};
	}

	/*
	 * The position limit, counting resting exposure as well as filled.
	 *
	 * The worst case is what matters: if everything this account has working on
	 * this side filled, plus this new order, where would the position be? An
	 * account long 40,000 with 8,000 more resting to buy has 48,000 of the 50,000
	 * limit committed, whatever the position column says.
	 *
	 * Only the side that would *increase* absolute exposure is counted. An order
	 * that reduces a position is always allowed through, because refusing
	 * somebody the ability to flatten a position they are already over the limit
	 * on is how a limit turns into a trap.
	 */
	const position = positionOf(state, check.accountId, check.instrumentId);
	const working = workingOf(state, check.accountId, check.instrumentId);

	const projected =
		check.side === 'buy'
			? position + working.buy + check.quantity
			: position - working.sell - check.quantity;

	const reduces = Math.abs(projected) <= Math.abs(position);

	if (!reduces && Math.abs(projected) > limits.maxPositionQuantity) {
		return {
			reason: 'exceeds_position_limit',
			detail: `Would take the position to ${projected}, past the limit of ${limits.maxPositionQuantity}`
		};
	}

	return undefined;
}

/**
 * The checks that can only be made once the book has been consulted.
 *
 * Separate from `checkOrder` because they need a dry run, and a dry run is the
 * most expensive thing in the pre-trade path. Doing it for every order — rather
 * than only for the two order types that need it — would put a book walk on the
 * critical path of orders that were never going to look at the book at all.
 */
export function checkAgainstBook(
	book: Book,
	check: OrderCheck & {
		timeInForce: string;
		selfTradePrevention: 'cancel_resting' | 'cancel_aggressing' | 'cancel_both';
	}
): Refusal | undefined {
	if (check.timeInForce === 'fok') {
		const request = {
			side: check.side,
			quantity: check.quantity,
			firmId: check.firmId,
			selfTradePrevention: check.selfTradePrevention,
			...(check.price !== undefined ? { limitPrice: check.price } : {})
		};

		if (fillableQuantity(book, request) < check.quantity) {
			return {
				reason: 'insufficient_liquidity',
				detail: 'Fill-or-kill: the book could not fill the whole order'
			};
		}
	}

	/*
	 * A market order against an empty book.
	 *
	 * Without this it would be accepted, match nothing, and be cancelled as an
	 * unfilled immediate-or-cancel — technically correct and useless as feedback.
	 * "There was nothing to trade against" is a different problem from "your
	 * order expired", and an algorithm reacts to them differently.
	 */
	if (check.price === undefined) {
		const opposite = check.side === 'buy' ? book.asks : book.bids;
		if (opposite.length === 0) {
			return {
				reason: 'no_opposing_liquidity',
				detail: 'A market order needs something on the other side of the book'
			};
		}
	}

	return undefined;
}
