/**
 * The engine, as one function.
 *
 *     apply(state, sequencedCommand) → events
 *
 * That signature is the entire contract, and everything the architecture
 * promises rests on it holding literally. Feed the same state the same command
 * and you get the same events — on this machine, on a replay in four years,
 * during an investigation, forever.
 *
 * Three rules keep it true, and they are worth checking against every line
 * below:
 *
 *   1. **Nothing is read that the command did not carry.** No clock, no
 *      environment, no filesystem, no network. `packages/core` compiles with
 *      `"types": []`, so most of those are not even nameable here.
 *   2. **Nothing is generated.** Identifiers are derived from the sequence
 *      number. `newId()` lives at a subpath this package cannot import.
 *   3. **Nothing iterates in an unspecified order.** `Map` preserves insertion
 *      order and every ladder walk is index-based, so two runs visit the same
 *      things in the same order.
 *
 * Break any one of them and the log stops describing what happened. It will not
 * throw. It will simply, quietly, be fiction.
 */

import {
	feeOf,
	negate,
	notional,
	orderIdFor,
	positionKey,
	tradeIdFor,
	type ClientOrderId,
	type Command,
	type Event,
	type OrderId,
	type Price,
	type Quantity,
	type SequencedCommand,
	type Side,
	type Traded
} from '@sequent/protocol';
import { match, remove, rest, type RestingOrder } from './book.ts';
import { uncross } from './auction.ts';
import { checkAgainstBook, checkOrder, type Refusal } from './risk.ts';
import {
	applyFill,
	findLive,
	newInstrument,
	reduceWorking,
	trackLive,
	untrackLive,
	type EngineState,
	type Instrument,
	type LiveOrder
} from './state.ts';

/* -------------------------------------------------------------------------- */
/* Fees                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The fee schedule, in basis points of the traded notional.
 *
 * The taker pays; the maker is **paid**. That looks like the venue giving money
 * away, and it is: a venue with no resting orders has nothing to trade against,
 * so it buys liquidity from the participants willing to post it and recovers the
 * cost from the participants who consume it. The venue keeps the difference —
 * two basis points here.
 *
 * The rebate is why `Amount` is signed. A negative fee is money moving the other
 * way, and representing it as a sign rather than a separate "rebate" field means
 * the ledger's balancing check works on both without a special case.
 */
export const FEES = {
	takerBps: 3,
	/** Paid to the resting side. Applied as a negative fee. */
	makerRebateBps: 1,
	/** Both sides of an auction rested, so both get the maker rate. */
	auctionBps: 1
} as const;

/* -------------------------------------------------------------------------- */
/* Applying a command                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Apply one command and return everything that happened because of it.
 *
 * The events come back rather than being written anywhere. That is what keeps
 * this testable without a database, and it is what lets the same function serve
 * both live trading and replay — the caller decides whether to persist the
 * result or merely compare it with what the log already says.
 */
export function apply(state: EngineState, sequenced: SequencedCommand): Event[] {
	const { seq, receivedAt, body } = sequenced;

	// The venue's clock only ever moves forward, and only because a command told
	// it to. Nothing in this file may call a clock of its own.
	state.lastSeq = seq;
	state.now = receivedAt;

	switch (body.kind) {
		case 'place_order':
			return placeOrder(state, seq, body);
		case 'cancel_order':
			return cancelOrder(state, body);
		case 'replace_order':
			return replaceOrder(state, seq, body);
		case 'cancel_all':
			return cancelAll(state, body);
		case 'set_risk_limits':
			return setRiskLimits(state, body);
		case 'set_kill_switch':
			return setKillSwitch(state, body);
		case 'list_instrument':
			return listInstrument(state, body);
		case 'set_phase':
			return setPhase(state, seq, body);
		case 'tick':
			return tick(state, body);
	}
}

/* -------------------------------------------------------------------------- */
/* Placing                                                                     */
/* -------------------------------------------------------------------------- */

function placeOrder(
	state: EngineState,
	seq: number,
	command: Extract<Command, { kind: 'place_order' }>
): Event[] {
	const instrument = state.instruments.get(command.instrumentId);

	const refuse = (refusal: Refusal): Event[] => [
		{
			kind: 'order_rejected',
			firmId: command.firmId,
			accountId: command.accountId,
			instrumentId: command.instrumentId,
			clientOrderId: command.clientOrderId,
			reason: refusal.reason,
			detail: refusal.detail
		}
	];

	/*
	 * Idempotency, and it comes first for a reason.
	 *
	 * A participant whose connection dropped between sending an order and
	 * receiving the acknowledgement does not know whether it arrived. The only
	 * safe thing they can do is send it again — and the venue's job is to
	 * recognise the second copy rather than work it twice. "We filled your
	 * retry as a second order" is how a hedge becomes a position.
	 *
	 * A rejection rather than a silent success, because the two are genuinely
	 * different: silently succeeding would leave the client believing it has two
	 * orders working when it has one.
	 */
	if (findLive(state, command.firmId, command.clientOrderId)) {
		return refuse({
			reason: 'duplicate_client_order_id',
			detail: `${command.clientOrderId} is already working`
		});
	}

	const failed = checkOrder(state, instrument, command);
	if (failed) return refuse(failed);

	// `checkOrder` proved this, but the compiler has not been told.
	const found = instrument!;

	/*
	 * A market order outside continuous trading has nowhere to go.
	 *
	 * It cannot rest — market orders are immediate-or-cancel by construction —
	 * and there is nothing to match against during an auction because nothing
	 * matches during an auction. Refusing with a clear message beats accepting it
	 * and cancelling it a microsecond later.
	 */
	if (command.orderType === 'market' && found.phase !== 'continuous') {
		return refuse({
			reason: 'instrument_not_trading',
			detail: 'Market orders are only accepted during continuous trading'
		});
	}

	if (found.phase === 'continuous') {
		const bookRefusal = checkAgainstBook(found.book, {
			...command,
			timeInForce: command.timeInForce,
			selfTradePrevention: command.selfTradePrevention
		});
		if (bookRefusal) return refuse(bookRefusal);
	}

	const orderId = orderIdFor(seq);
	const order: LiveOrder = {
		orderId,
		firmId: command.firmId,
		accountId: command.accountId,
		instrumentId: command.instrumentId,
		clientOrderId: command.clientOrderId,
		side: command.side,
		/*
		 * A market order is stored at the extreme of its side so that a single
		 * comparison in the book handles both kinds. It never rests, so the
		 * fictional price is never published — but it means the matching walk has
		 * one code path instead of two, and one code path cannot disagree with
		 * itself.
		 */
		price: command.price ?? ((command.side === 'buy' ? Number.MAX_SAFE_INTEGER : 1) as Price),
		originalQuantity: command.quantity,
		remaining: command.quantity,
		seq,
		expiresAtClose: command.timeInForce === 'day'
	};

	const events: Event[] = [];

	// During pre-open and auction the book accumulates and nothing matches. The
	// book is allowed to cross, which is the one moment in its life it may.
	if (found.phase !== 'continuous') {
		const position = rest(found.book, order);
		trackLive(state, order);
		events.push(accepted(order, command, position));
		return events;
	}

	const result = match(found.book, {
		side: command.side,
		quantity: command.quantity,
		firmId: command.firmId,
		selfTradePrevention: command.selfTradePrevention,
		...(command.price !== undefined ? { limitPrice: command.price } : {})
	});

	// Self-trade prevention may have pulled resting orders even when it then
	// refused the aggressor, so those cancellations are reported either way.
	for (const pulled of result.pulled) {
		const live = state.orders.get(pulled.order.orderId);
		if (live) {
			untrackLive(state, live);
			events.push({
				kind: 'order_cancelled',
				firmId: live.firmId,
				accountId: live.accountId,
				instrumentId: live.instrumentId,
				orderId: live.orderId,
				clientOrderId: live.clientOrderId,
				remainingQuantity: pulled.remaining,
				reason: 'self_trade_prevention'
			});
		}
	}

	/*
	 * Self-trade prevention that stopped the walk before anything traded is a
	 * plain rejection: nothing happened, and saying so is the clearest answer.
	 *
	 * If it traded first, the story is different — those fills are real, against
	 * other firms, and cannot be taken back. The order is accepted, the trades
	 * are reported, and the remainder is cancelled below with a reason that says
	 * why. Reporting that as a rejection would tell the participant nothing
	 * happened while their position quietly moved.
	 */
	if (result.aggressorCancelled && result.fills.length === 0) {
		events.push(...refuse({
			reason: 'self_trade_prevented',
			detail: 'This order would have traded against your own resting order'
		}));
		return events;
	}

	events.push(accepted(order, command, 0));

	let tradeIndex = 0;
	for (const fill of result.fills) {
		const resting = state.orders.get(fill.restingOrder.orderId);
		if (!resting) continue;

		events.push(
			tradeOf(state, {
				seq,
				index: tradeIndex,
				instrumentId: command.instrumentId,
				price: fill.price,
				quantity: fill.quantity,
				buyOrder: command.side === 'buy' ? order : resting,
				sellOrder: command.side === 'buy' ? resting : order,
				aggressor: command.side
			})
		);
		tradeIndex += 1;

		reduceWorking(state, resting, fill.quantity);
		if (resting.remaining === 0) untrackLive(state, resting);

		// The reference price follows the market. Every collar from here on is
		// measured against where the instrument actually traded.
		found.referencePrice = fill.price;
	}

	const remaining = result.remaining;

	if (remaining === 0) return events;

	if (result.aggressorCancelled) {
		events.push({
			kind: 'order_cancelled',
			firmId: order.firmId,
			accountId: order.accountId,
			instrumentId: order.instrumentId,
			orderId: order.orderId,
			clientOrderId: order.clientOrderId,
			remainingQuantity: remaining,
			reason: 'self_trade_prevention'
		});
		return events;
	}

	if (command.timeInForce === 'ioc' || command.timeInForce === 'fok' || command.orderType === 'market') {
		events.push({
			kind: 'order_cancelled',
			firmId: order.firmId,
			accountId: order.accountId,
			instrumentId: order.instrumentId,
			orderId: order.orderId,
			clientOrderId: order.clientOrderId,
			remainingQuantity: remaining,
			reason: 'ioc_remainder'
		});
		return events;
	}

	order.remaining = remaining;
	const position = rest(found.book, order);
	trackLive(state, order);

	/*
	 * The acceptance event was already pushed with a queue position of zero,
	 * because at that point the order had not rested and might never have. Now
	 * that it has, correct it — the events array has not left this function, so
	 * amending it here is amending a draft rather than rewriting history.
	 */
	const acceptance = events.find((event) => event.kind === 'order_accepted');
	if (acceptance && acceptance.kind === 'order_accepted') {
		(acceptance as { queuePosition: number }).queuePosition = position;
	}

	return events;
}

/**
 * The acceptance event.
 *
 * `price` is passed in rather than read off the order, because a market order
 * is stored at a sentinel price so the book has one comparison instead of two.
 * Publishing that sentinel would tell participants a market order was a limit
 * order at nine quadrillion — reading a field for a purpose it was not written
 * for is how invented data reaches an audit trail.
 */
function accepted(
	order: LiveOrder,
	command: Extract<Command, { kind: 'place_order' }>,
	queuePosition: number
): Event {
	return {
		kind: 'order_accepted',
		firmId: order.firmId,
		accountId: order.accountId,
		instrumentId: order.instrumentId,
		orderId: order.orderId,
		clientOrderId: order.clientOrderId,
		side: order.side,
		...(command.price !== undefined ? { price: command.price } : {}),
		quantity: order.originalQuantity,
		timeInForce: command.timeInForce,
		queuePosition
	};
}

/* -------------------------------------------------------------------------- */
/* Trades                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Build a trade event and move both sides' positions.
 *
 * The position update happens here rather than in a projection because the risk
 * check on the *next* order needs it. A position that is only correct once a
 * downstream consumer has caught up is a position that lets a firm exceed its
 * limit for as long as the lag lasts.
 */
function tradeOf(
	state: EngineState,
	input: {
		seq: number;
		index: number;
		instrumentId: Traded['instrumentId'];
		price: Price;
		quantity: Quantity;
		buyOrder: LiveOrder;
		sellOrder: LiveOrder;
		/** Absent for an auction, where neither side aggressed. */
		aggressor?: Side;
	}
): Traded {
	const value = notional(input.price, input.quantity);
	const isAuction = input.aggressor === undefined;

	/*
	 * Who pays what.
	 *
	 * Continuous: the aggressor crossed the spread and pays the taker rate; the
	 * resting side supplied the liquidity and is *paid* the maker rebate, which
	 * is why its fee is negative.
	 *
	 * Auction: nobody aggressed. Both sides rested, so both pay the maker rate
	 * and neither is rebated — charging one of them the taker rate would mean
	 * picking a loser for a trade that had no aggressor.
	 */
	const aggressorFee = isAuction ? feeOf(value, FEES.auctionBps) : feeOf(value, FEES.takerBps);
	const restingFee = isAuction
		? feeOf(value, FEES.auctionBps)
		: negate(feeOf(value, FEES.makerRebateBps));

	const buyerIsAggressor = input.aggressor === 'buy';

	applyFill(state, input.buyOrder.accountId, input.instrumentId, 'buy', input.quantity);
	applyFill(state, input.sellOrder.accountId, input.instrumentId, 'sell', input.quantity);

	return {
		kind: 'traded',
		tradeId: tradeIdFor(input.seq, input.index),
		instrumentId: input.instrumentId,
		price: input.price,
		quantity: input.quantity,
		buyOrderId: input.buyOrder.orderId,
		buyFirmId: input.buyOrder.firmId,
		buyAccountId: input.buyOrder.accountId,
		sellOrderId: input.sellOrder.orderId,
		sellFirmId: input.sellOrder.firmId,
		sellAccountId: input.sellOrder.accountId,
		...(input.aggressor !== undefined ? { aggressor: input.aggressor } : {}),
		buyerFee: isAuction || buyerIsAggressor ? aggressorFee : restingFee,
		sellerFee: isAuction || !buyerIsAggressor ? aggressorFee : restingFee
	};
}

/* -------------------------------------------------------------------------- */
/* Cancelling                                                                  */
/* -------------------------------------------------------------------------- */

function cancelOrder(state: EngineState, command: Extract<Command, { kind: 'cancel_order' }>): Event[] {
	const live = findLive(state, command.firmId, command.clientOrderId);

	/*
	 * Not found is not an error, and the wording of the rejection matters.
	 *
	 * A cancel that arrives after the order filled is completely ordinary — the
	 * participant decided to pull it at the same moment somebody else decided to
	 * take it, and one of them was earlier. The venue reports what it knows
	 * without implying anybody did anything wrong.
	 */
	if (!live) {
		return [
			{
				kind: 'order_rejected',
				firmId: command.firmId,
				accountId: '' as LiveOrder['accountId'],
				instrumentId: '' as LiveOrder['instrumentId'],
				clientOrderId: command.clientOrderId,
				reason: 'unknown_order',
				detail: 'No working order with that reference — it may already have filled'
			}
		];
	}

	return [pull(state, live, 'requested')];
}

/** Take an order off the book and off the indexes, and report it. */
function pull(state: EngineState, live: LiveOrder, reason: Parameters<typeof cancelEvent>[1]): Event {
	const instrument = state.instruments.get(live.instrumentId);
	if (instrument) remove(instrument.book, live);
	untrackLive(state, live);
	return cancelEvent(live, reason);
}

function cancelEvent(
	live: LiveOrder,
	reason: 'requested' | 'replaced' | 'ioc_remainder' | 'day_expired' | 'self_trade_prevention' | 'kill_switch' | 'instrument_halted'
): Event {
	return {
		kind: 'order_cancelled',
		firmId: live.firmId,
		accountId: live.accountId,
		instrumentId: live.instrumentId,
		orderId: live.orderId,
		clientOrderId: live.clientOrderId,
		remainingQuantity: live.remaining,
		reason
	};
}

function cancelAll(state: EngineState, command: Extract<Command, { kind: 'cancel_all' }>): Event[] {
	const events: Event[] = [];

	// A copy, because pulling mutates the map being walked.
	for (const live of [...state.orders.values()]) {
		if (live.firmId !== command.firmId) continue;
		if (command.accountId !== undefined && live.accountId !== command.accountId) continue;
		if (command.instrumentId !== undefined && live.instrumentId !== command.instrumentId) continue;
		events.push(pull(state, live, 'requested'));
	}

	return events;
}

/* -------------------------------------------------------------------------- */
/* Replacing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Cancel and replace, with the queue-priority rule made explicit.
 *
 * Reducing the quantity keeps the order's place in the queue; anything else
 * loses it. The reasoning is about what other participants are entitled to
 * assume: an order ahead of yours getting smaller cannot hurt you, but one that
 * grows or moves is a new intention and has to go to the back.
 *
 * A venue that let orders grow without losing priority would be handing
 * whoever posted first a permanent option on the front of the queue.
 */
function replaceOrder(
	state: EngineState,
	seq: number,
	command: Extract<Command, { kind: 'replace_order' }>
): Event[] {
	const live = findLive(state, command.firmId, command.clientOrderId);

	if (!live) {
		return [
			{
				kind: 'order_rejected',
				firmId: command.firmId,
				accountId: '' as LiveOrder['accountId'],
				instrumentId: '' as LiveOrder['instrumentId'],
				clientOrderId: command.newClientOrderId,
				reason: 'unknown_order',
				detail: 'No working order with that reference'
			}
		];
	}

	const instrument = state.instruments.get(live.instrumentId);
	if (!instrument) {
		return [
			{
				kind: 'order_rejected',
				firmId: command.firmId,
				accountId: live.accountId,
				instrumentId: live.instrumentId,
				clientOrderId: command.newClientOrderId,
				reason: 'unknown_instrument',
				detail: 'The instrument has been delisted'
			}
		];
	}

	const priceUnchanged = command.price === undefined || command.price === live.price;
	const keepsPriority = priceUnchanged && command.quantity < live.remaining;

	if (keepsPriority) {
		// Shrink in place. The order does not move, so the ladder total has to be
		// adjusted by hand — the book has no idea this happened.
		const shrink = live.remaining - command.quantity;
		const levels = live.side === 'buy' ? instrument.book.bids : instrument.book.asks;
		const level = levels.find((candidate) => candidate.price === live.price);
		if (level) level.total -= shrink;

		reduceWorking(state, live, shrink);
		live.remaining = command.quantity;

		return [
			{
				kind: 'order_replaced',
				firmId: live.firmId,
				accountId: live.accountId,
				instrumentId: live.instrumentId,
				orderId: live.orderId,
				clientOrderId: live.clientOrderId,
				newOrderId: live.orderId,
				newClientOrderId: command.newClientOrderId,
				...(command.price !== undefined ? { price: command.price } : {}),
				quantity: command.quantity,
				keptPriority: true
			}
		];
	}

	// Otherwise: off the book, and back on at the end of the new queue.
	remove(instrument.book, live);
	untrackLive(state, live);

	const replacement: LiveOrder = {
		...live,
		orderId: orderIdFor(seq),
		clientOrderId: command.newClientOrderId,
		price: command.price ?? live.price,
		originalQuantity: command.quantity,
		remaining: command.quantity,
		seq
	};

	rest(instrument.book, replacement);
	trackLive(state, replacement);

	return [
		{
			kind: 'order_replaced',
			firmId: live.firmId,
			accountId: live.accountId,
			instrumentId: live.instrumentId,
			orderId: live.orderId,
			clientOrderId: live.clientOrderId,
			newOrderId: replacement.orderId,
			newClientOrderId: command.newClientOrderId,
			...(command.price !== undefined ? { price: command.price } : {}),
			quantity: command.quantity,
			keptPriority: false
		}
	];
}

/* -------------------------------------------------------------------------- */
/* Venue and risk administration                                               */
/* -------------------------------------------------------------------------- */

function setRiskLimits(state: EngineState, command: Extract<Command, { kind: 'set_risk_limits' }>): Event[] {
	state.limits.set(command.accountId, {
		maxOrderQuantity: command.maxOrderQuantity,
		maxOrderNotional: command.maxOrderNotional,
		maxPositionQuantity: command.maxPositionQuantity,
		priceCollarBps: command.priceCollarBps
	});

	return [
		{
			kind: 'risk_limits_set',
			firmId: command.firmId,
			accountId: command.accountId,
			maxOrderQuantity: command.maxOrderQuantity,
			maxOrderNotional: command.maxOrderNotional,
			maxPositionQuantity: command.maxPositionQuantity,
			priceCollarBps: command.priceCollarBps,
			setBy: command.actorId
		}
	];
}

/**
 * The kill switch.
 *
 * Engaging it does two things at once, and both are necessary: it stops new
 * orders, and it pulls every order the firm already has resting. Doing only the
 * first would leave an algorithm that has already flooded the book with
 * mispriced liquidity exposed to everyone who noticed.
 */
function setKillSwitch(state: EngineState, command: Extract<Command, { kind: 'set_kill_switch' }>): Event[] {
	const events: Event[] = [];
	let cancelled = 0;

	if (command.engaged) {
		state.killed.add(command.targetFirmId);

		for (const live of [...state.orders.values()]) {
			if (live.firmId !== command.targetFirmId) continue;
			events.push(pull(state, live, 'kill_switch'));
			cancelled += 1;
		}
	} else {
		state.killed.delete(command.targetFirmId);
	}

	// The change is reported *after* the cancellations it caused, so a consumer
	// reading the stream in order sees the orders go and then learns why.
	events.push({
		kind: 'kill_switch_changed',
		firmId: command.targetFirmId,
		engaged: command.engaged,
		reason: command.reason,
		setBy: command.actorId,
		ordersCancelled: cancelled
	});

	return events;
}

function listInstrument(state: EngineState, command: Extract<Command, { kind: 'list_instrument' }>): Event[] {
	// Listing an instrument that already exists is a no-op rather than an error:
	// replay must be able to apply the same command twice without diverging.
	if (!state.instruments.has(command.instrumentId)) {
		state.instruments.set(command.instrumentId, newInstrument(command));
	}

	return [
		{
			kind: 'instrument_listed',
			instrumentId: command.instrumentId,
			name: command.name,
			currency: command.currency,
			tickSize: command.tickSize,
			lotSize: command.lotSize,
			referencePrice: command.referencePrice
		}
	];
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Move an instrument between phases, running the auction when one ends.
 *
 * The uncross happens on the transition *out* of `auction`, not on the way in.
 * That ordering is what gives participants a window in which the book is
 * crossed and the indicative price is published — the whole point of a call
 * auction is that everybody can see where it is heading before it clears.
 */
function setPhase(state: EngineState, seq: number, command: Extract<Command, { kind: 'set_phase' }>): Event[] {
	const instrument = state.instruments.get(command.instrumentId);
	if (!instrument) return [];

	const from = instrument.phase;
	if (from === command.phase) return [];

	const events: Event[] = [];

	if (from === 'auction') {
		events.push(...runAuction(state, seq, instrument));
	}

	instrument.phase = command.phase;

	events.push({
		kind: 'phase_changed',
		instrumentId: command.instrumentId,
		from,
		to: command.phase,
		reason: command.reason
	});

	/*
	 * Halting pulls the book.
	 *
	 * A halt is called because something has happened that makes the current
	 * prices meaningless — a profit warning, a takeover, a fat-finger cascade.
	 * Leaving orders resting through it means they are working against news
	 * their owners have not read yet, and they will be the first thing traded
	 * when the instrument reopens.
	 */
	if (command.phase === 'halted' || command.phase === 'closed') {
		for (const live of [...state.orders.values()]) {
			if (live.instrumentId !== command.instrumentId) continue;
			if (command.phase === 'closed' && !live.expiresAtClose) continue;
			events.push(pull(state, live, command.phase === 'halted' ? 'instrument_halted' : 'day_expired'));
		}
	}

	return events;
}

function runAuction(state: EngineState, seq: number, instrument: Instrument): Event[] {
	const result = uncross(instrument.book, instrument.referencePrice);
	if (result.price === undefined) return [];

	const events: Event[] = [
		{
			kind: 'auction_uncrossed',
			instrumentId: instrument.instrumentId,
			price: result.price,
			quantity: result.quantity as Quantity,
			imbalance: result.imbalance
		}
	];

	let index = 0;
	for (const trade of result.trades) {
		const buy = state.orders.get(trade.buy.orderId);
		const sell = state.orders.get(trade.sell.orderId);
		if (!buy || !sell) continue;

		events.push(
			tradeOf(state, {
				seq,
				index,
				instrumentId: instrument.instrumentId,
				price: result.price,
				quantity: trade.quantity,
				buyOrder: buy,
				sellOrder: sell
			})
		);
		index += 1;

		for (const [order, live] of [
			[trade.buy, buy],
			[trade.sell, sell]
		] as const) {
			reduceWorking(state, live, trade.quantity);
			if (order.remaining === 0) untrackLive(state, live);
		}
	}

	instrument.referencePrice = result.price;
	return events;
}

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A tick of the venue's clock.
 *
 * Nothing here reads a clock — the time arrives on the command. That is what
 * lets a replay four years from now expire exactly the orders that expired on
 * the day, at exactly the same points in the sequence.
 *
 * Day orders expire when the instrument closes rather than at a wall-clock
 * time, so this handler is currently quiet. It exists because time-driven
 * behaviour has to enter the system somewhere, and the place it enters is a
 * design decision worth making once rather than discovering later.
 */
function tick(state: EngineState, command: Extract<Command, { kind: 'tick' }>): Event[] {
	return [{ kind: 'ticked', at: command.at, ordersExpired: 0 }];
}
