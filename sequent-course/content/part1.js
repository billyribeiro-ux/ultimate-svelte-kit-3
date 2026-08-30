/**
 * PART 1 — The protocol, and the engine as a pure function (chapters 06–11)
 *
 * The heart of the project. Everything here is a pure function with no I/O, no
 * clock and no randomness — which is what makes it testable exhaustively and
 * what makes replay reproduce history exactly.
 */

export const part1 = [
	{
		slug: 'the-vocabulary',
		title: 'The vocabulary: commands and events',
		summary:
			'Two discriminated unions, validated with valibot, versioned from the first line.',
		goal: 'Define every command and every event the venue understands, and understand why the version number is there from day one.',
		blocks: [
			{
				type: 'p',
				text: 'Before the engine can decide anything, we need words for what it can be asked and what it can report. Both are **discriminated unions** — a set of shapes distinguished by a `kind` field — because that is the shape TypeScript narrows best and the shape a `switch` can be checked exhaustively against.'
			},

			{ type: 'h3', id: 'commands', text: 'What the venue can be asked' },
			{
				type: 'code',
				file: 'packages/protocol/src/commands.ts',
				lang: 'ts',
				code: `
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
	 * Absent for a market order, and that is why \`exactOptionalPropertyTypes\` is
	 * switched on: without it, \`{ price: undefined }\` type-checks against
	 * \`{ price?: Price }\`, and a market order and a limit order with a missing
	 * price become indistinguishable at exactly the wrong moment.
	 */
	readonly price?: Price;
	readonly quantity: Quantity;
	readonly timeInForce: TimeInForce;
	readonly selfTradePrevention: SelfTradePrevention;
}

// …

export type Command =
	| PlaceOrder
	| CancelOrder
	| ReplaceOrder
	| CancelAll
	| SetRiskLimits
	| SetKillSwitch
	| ListInstrument
	| SetPhase
	| Tick;`
			},
			{
				type: 'p',
				text: 'Nine commands, and that is the complete list of things anybody can ask this venue to do. A closed set is a feature: it means "what can happen here" is a question with a short answer, and adding a tenth is a decision somebody makes deliberately.'
			},

			{ type: 'h3', id: 'validation', text: 'Validating what arrives' },
			{
				type: 'p',
				text: 'A `Command` is a TypeScript type, and TypeScript types do not exist at runtime. Something arriving over HTTP claiming to be a command needs checking, and we use **valibot** for it.'
			},
			{
				type: 'code',
				file: 'packages/protocol/src/commands.ts',
				lang: 'ts',
				code: `
import * as v from 'valibot';

// …

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
	 * and \`v.check\` on the whole object is the only place a rule about two
	 * fields at once can live.
	 */
	v.check(
		(order) => (order.orderType === 'limit') === (order.price !== undefined),
		'A limit order needs a price, and a market order must not have one'
	),
	// …
);

// …

/** Parse an untrusted payload into a command, or throw with a real message. */
export function parseCommand(input: unknown): Command {
	return v.parse(commandSchema, input) as Command;
}`
			},
			{
				type: 'note',
				text: 'valibot rather than Zod, throughout this project. The API is very similar; the difference is that valibot is modular — you import only the validators you use, and the bundle carries only those. For a schema library that ends up in client bundles, that adds up.'
			},

			{ type: 'h3', id: 'envelope', text: 'The envelope' },
			{
				type: 'code',
				file: 'packages/protocol/src/commands.ts',
				lang: 'ts',
				code: `
/**
 * A command as it appears in the log, once the sequencer has stamped it.
 *
 * Three fields are added, and each one is a deliberate transfer of a decision
 * from the engine to the sequencer:
 *
 *   \`seq\`        — the position in the total order. The engine never chooses
 *                  this; being handed it is what makes the engine a function.
 *   \`receivedAt\` — the venue's clock reading when the command arrived. The
 *                  engine uses this instead of calling \`Date.now()\`, which is
 *                  what lets a replay four years later reproduce a timestamp.
 *   \`version\`    — which rules applied. When matching logic changes, old
 *                  commands must still replay under the rules that were in
 *                  force when they ran, or the log stops describing what
 *                  actually happened.
 */
export interface Sequenced<T> {
	readonly seq: number;
	readonly receivedAt: number;
	readonly version: number;
	readonly body: T;
}`
			},
			{
				type: 'why',
				title: 'Why the version is there on day one',
				text: 'You will change how matching works. Everybody does. When you do, replaying last March\'s log with this March\'s rules would produce a *different history* — different fills, different fees, different positions. The version number lets replay dispatch on the rules that were actually in force, so a change to the engine cannot rewrite the past. Adding it later means every command already in the log has no version, and you have to guess.'
			},

			{ type: 'h3', id: 'events', text: 'What the venue reports' },
			{
				type: 'code',
				file: 'packages/protocol/src/events.ts',
				lang: 'ts',
				code: `
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
	 *
	 * In a call auction there is no aggressor — both sides rested, and both are
	 * charged the maker rate. Modelling that as an absent field rather than
	 * inventing a side is the honest option: a consumer that assumes every trade
	 * has an aggressor should fail loudly on the open rather than quietly
	 * attributing the whole auction to whichever side we picked.
	 */
	readonly aggressor?: Side;

	readonly buyerFee: Amount;
	readonly sellerFee: Amount;
}`
			},
			{
				type: 'p',
				text: 'Note that the event carries the **fees**, not just the price. The engine computes them, and they become facts. If the fee schedule changes next year, last year\'s trades still say what was actually charged — because it is written down rather than recomputed from a table that has since been edited.'
			},

			{ type: 'h3', id: 'reasons', text: 'Reasons are a closed list' },
			{
				type: 'code',
				file: 'packages/protocol/src/events.ts',
				lang: 'ts',
				code: `
/**
 * Rejection reasons, as codes rather than sentences.
 *
 * The code is for machines — an algorithmic trader retries on
 * \`price_outside_collar\` after re-reading the reference, and gives up entirely
 * on \`kill_switch_engaged\`. The human sentence lives next to it and can be
 * rewritten without breaking anybody's error handling, which is the point of
 * separating them.
 */
export const REJECT_REASONS = [
	/** The venue has never heard of this instrument. */
	'unknown_instrument',
	/** Trading is not open for this instrument right now. */
	'instrument_not_trading',
	/** A duplicate \`clientOrderId\` — almost always a retry, and safe to ignore. */
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
] as const;`
			},
			{
				type: 'p',
				text: 'Fourteen codes. The free-text `detail` that travels beside each one is for a human and is deliberately not stable — the moment a client matches on prose, a copy-edit becomes an outage at somebody else\'s firm.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can list the nine commands and say what each asks for',
					'You can explain why `receivedAt` travels with the command instead of being read by the engine',
					'You can explain why the version number has to exist before the first command is written',
					'You know why `aggressor` is optional'
				]
			}
		]
	},

	{
		slug: 'the-order-book',
		title: 'The order book',
		summary:
			'Price-time priority, a binary search, and why the depth bar is a `scaleX` rather than a width.',
		goal: 'Build the data structure the whole engine sits on, and understand its two invariants.',
		blocks: [
			{
				type: 'p',
				text: 'An order book is two sorted lists: bids descending, asks ascending. Each price has a **queue** of orders at that price, in arrival order. That combination is called **price-time priority**, and it is the fairness rule almost every exchange uses.'
			},
			{
				type: 'ul',
				items: [
					'A better price always wins. £45.51 buys before £45.50, however long the £45.50 has been waiting.',
					'At the same price, whoever arrived first wins.'
				]
			},

			{ type: 'h3', id: 'shape', text: 'The shape' },
			{
				type: 'code',
				file: 'packages/core/src/book.ts',
				lang: 'ts',
				code: `
/**
 * An order sitting on the book.
 *
 * \`remaining\` is mutable and everything else is not, which is exactly the
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
	/** Cancelled at the close, if \`true\`. Carried here so expiry is a book walk. */
	readonly expiresAtClose: boolean;
}

/* … */

/**
 * Every order resting at one price, in arrival order.
 *
 * \`total\` is maintained alongside the queue rather than summed on demand. The
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
}`
			},
			{
				type: 'note',
				text: 'No `clientOrderId` and no instrument id on `RestingOrder` — the book *is* one instrument, and the participant\'s reference is only needed to answer a cancel. Both live on `LiveOrder`, a separate index in `packages/core/src/state.ts`, so every entry in every price level stays small.'
			},
			{
				type: 'why',
				title: 'The two invariants',
				text: '**Bids are sorted descending and asks ascending**, so the best price on each side is always at index 0 — the hot path is an array lookup rather than a scan. And **`level.total` always equals the sum of unfilled quantity on that level**. Every function below exists to keep those two true.'
			},

			{ type: 'h3', id: 'locate', text: 'Finding a price level' },
			{
				type: 'code',
				file: 'packages/core/src/book.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'note',
				text: '`(low + high) >>> 1` rather than `Math.floor((low + high) / 2)`. Same answer, and the unsigned shift cannot overflow into a negative index — the bug that famously sat in the JDK\'s binary search for nine years.'
			},

			{ type: 'h3', id: 'resting', text: 'Resting an order' },
			{
				type: 'code',
				file: 'packages/core/src/book.ts',
				lang: 'ts',
				code: `
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
}`
			},

			{ type: 'h3', id: 'matching', text: 'Matching' },
			{
				type: 'p',
				text: 'The core loop. An aggressive order walks the opposite side, taking whatever it can, best price first. A `MatchRequest` carries the side, the quantity, an optional `limitPrice` — absent for a market order — the sender\'s `firmId` and self-trade-prevention choice, and a `dryRun` flag the fill-or-kill check uses. Self-trade prevention is elided here; it gets its own chapter.'
			},
			{
				type: 'code',
				file: 'packages/core/src/book.ts (simplified)',
				lang: 'ts',
				code: `
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

/* … */

export function match(book: Book, request: MatchRequest): MatchResult {
	const opposite = request.side === 'buy' ? book.asks : book.bids;
	const fills: Fill[] = [];
	const pulled: Pulled[] = [];

	let remaining: number = request.quantity;
	let levelIndex = 0;

	// … (self-trade-prevention bookkeeping — the next chapter's subject)

	outer: while (remaining > 0 && levelIndex < opposite.length) {
		const level = opposite[levelIndex]!;

		if (!crosses(level.price, request.side, request.limitPrice)) break;

		for (let i = 0; i < level.orders.length && remaining > 0;) {
			const resting = level.orders[i]!;

			// … (the self-trade check lives here)

			const traded = Math.min(remaining, resting.remaining);
			fills.push({ restingOrder: resting, price: level.price, quantity: traded as Quantity });
			remaining -= traded;

			// … (a dry run moves on without touching anything)

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
}`
			},
			{
				type: 'why',
				title: 'Price improvement, and why it is not generosity',
				text: 'Every fill happens at `level.price` — the **resting** order\'s price, never the aggressor\'s. A buy limit at £45.60 hitting an ask at £45.50 trades at £45.50, and the buyer keeps the penny. That is not a courtesy — it is what makes a limit order safe to leave on the book. If aggressors set the price, resting a bid at £45.50 would mean any seller could take it at £45.50 having offered at £45.20, and nobody would ever rest anything.'
			},

			{ type: 'h3', id: 'crossed', text: 'The invariant to check' },
			{
				type: 'code',
				file: 'packages/core/src/book.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'checkpoint',
				items: [
					'You can state price-time priority in one sentence',
					'You can explain why a trade prints at the resting price',
					'You know the two invariants of the book, and why `total` is denormalised',
					'You understand why a crossed book is a bug rather than an oddity'
				]
			}
		]
	},

	{
		slug: 'apply-as-a-pure-function',
		title: '`apply` as a pure function',
		summary:
			'One function, `(state, command) → events`, with no clock, no database and no randomness. Everything else in the venue is a consequence of it.',
		goal: 'Write the engine\'s entry point and understand why its purity is worth every constraint it imposes.',
		blocks: [
			{
				type: 'p',
				text: 'Here is the whole engine, in one signature:'
			},
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
export function apply(state: EngineState, sequenced: SequencedCommand): Event[] {
	// …
}`
			},
			{
				type: 'p',
				text: 'Give it the current state and one command, and it returns the events that command caused. (`SequencedCommand` is the protocol\'s alias for `Sequenced<Command>`.) It mutates `state` in place for speed, and it touches nothing else. No `await`, because there is nothing to wait for.'
			},

			{ type: 'h3', id: 'forbidden', text: 'What it is forbidden to do' },
			{
				type: 'ul',
				items: [
					'**No clock.** Time comes from `sequenced.receivedAt`, stamped when the command arrived.',
					'**No randomness.** Ids come from `sequenced.seq`.',
					'**No I/O.** It cannot read a database or make a request, because `packages/core` does not depend on anything that can.',
					'**No throwing for business reasons.** A rejected order returns an `order_rejected` **event**, not an exception. Rejection is something that happened, and it goes in the log like everything else.'
				]
			},
			{
				type: 'why',
				title: 'What purity buys, concretely',
				text: 'Replay the log and you get the same events, byte for byte. That is what makes "what did the book look like at 14:32" answerable, what makes the crash-recovery tests possible, and what lets a property test run four hundred random sessions in a second without a database. Every one of those things disappears the moment a `Date.now()` sneaks in.'
			},

			{ type: 'h3', id: 'shape', text: 'The shape' },
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'note',
				text: 'No `default` case. With a discriminated union and `strict` on, TypeScript checks the switch is exhaustive — so adding a tenth command produces a compile error here rather than being silently ignored at runtime. That is the entire reason for using a union with a `kind` field.'
			},

			{ type: 'h3', id: 'place', text: 'Placing an order' },
			{
				type: 'code',
				file: 'packages/core/src/apply.ts (abridged)',
				lang: 'ts',
				code: `
function placeOrder(
	state: EngineState,
	seq: number,
	command: Extract<Command, { kind: 'place_order' }>
): Event[] {
	const instrument = state.instruments.get(command.instrumentId);

	// … (a \`refuse\` helper wraps a Refusal in an \`order_rejected\` event)

	if (findLive(state, command.firmId, command.clientOrderId)) {
		return refuse({
			reason: 'duplicate_client_order_id',
			detail: \`\${command.clientOrderId} is already working\`
		});
	}

	const failed = checkOrder(state, instrument, command);
	if (failed) return refuse(failed);

	// \`checkOrder\` proved this, but the compiler has not been told.
	const found = instrument!;

	// … (a market order outside continuous trading is refused here)

	if (found.phase === 'continuous') {
		const bookRefusal = checkAgainstBook(found.book, {
			...command,
			timeInForce: command.timeInForce,
			selfTradePrevention: command.selfTradePrevention
		});
		if (bookRefusal) return refuse(bookRefusal);
	}

	const orderId = orderIdFor(seq);
	// … (build the order; a market order gets a sentinel price that never rests)

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

	// … (report the pulls and the fills, then rest or cancel the remainder)
}`
			},
			{
				type: 'p',
				text: 'The duplicate check comes first, and it is idempotency rather than tidiness: a participant whose connection dropped mid-order does not know whether it arrived, so the only safe thing they can do is send it again — and the venue\'s job is to recognise the second copy rather than work it twice. Notice also where the book lives: each instrument owns its own, on `state.instruments.get(…).book`.'
			},

			{ type: 'h3', id: 'tif', text: 'Time in force' },
			{
				type: 'p',
				text: 'Four values, and each one is a different answer to "what if I cannot fill all of it right now?"'
			},
			{
				type: 'ul',
				items: [
					'**gtc** — good till cancelled. Rest the remainder.',
					'**day** — rest it, but cancel at the close.',
					'**ioc** — immediate or cancel. Take what you can, cancel the rest. Never rests.',
					'**fok** — fill or kill. All of it right now, or none of it. Nothing rests, and nothing partially fills.'
				]
			},
			{
				type: 'p',
				text: '`fok` is the interesting one, because it needs an answer *before* anything moves. You cannot match and then decide you should not have — so the book is walked with `dryRun` set, which fills nothing and reports what would have traded.'
			},
			{
				type: 'code',
				file: 'packages/core/src/risk.ts',
				lang: 'ts',
				code: `
/**
 * The checks that can only be made once the book has been consulted.
 *
 * Separate from \`checkOrder\` because they need a dry run, and a dry run is the
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
}`
			},
			{
				type: 'checkpoint',
				items: [
					'You can state the signature of `apply` from memory',
					'You can list four things it is forbidden to do, and why each one matters',
					'You can explain why a rejection is an event rather than an exception',
					'You understand why fill-or-kill needs a dry run'
				]
			}
		]
	},

	{
		slug: 'pre-trade-risk',
		title: 'Pre-trade risk',
		summary:
			'Nine checks in a deliberate order, a fat-finger collar, and a kill switch that stops a firm dead.',
		goal: 'Build the layer that refuses orders, and understand why the order of the checks is itself a design decision.',
		blocks: [
			{
				type: 'p',
				text: 'Before an order touches the book it passes nine checks. They run in a specific order, and the order matters.'
			},
			{
				type: 'code',
				file: 'packages/core/src/risk.ts',
				lang: 'ts',
				code: `
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
): Refusal | undefined {`
			},
			{
				type: 'ul',
				items: [
					'1. Does the instrument exist? — everything else assumes it',
					'2. Is it in a phase that accepts orders?',
					'3. Is the firm stopped? — the kill switch beats every business rule below',
					'4. Is the price on the tick ladder? — pure arithmetic, no state',
					'5. Is the quantity a whole number of lots? — same',
					'6. Is the quantity within the account\'s order-size limit?',
					'7. Is the price inside the collar? — needs the reference price',
					'8. Is the notional within limits? — needs price × quantity',
					'9. Would the position limit be breached? — needs the position AND the working orders'
				]
			},

			{ type: 'h3', id: 'ticks', text: 'Ticks and lots' },
			{
				type: 'p',
				text: 'A **tick** is the smallest price increment an instrument trades in. If the tick is 25 scaled units (a quarter of a penny), then £45.5025 is a valid price and £45.5030 is not.'
			},
			{
				type: 'code',
				file: 'packages/core/src/risk.ts',
				lang: 'ts',
				code: `
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
			detail: \`Price must be a multiple of \${instrument.tickSize}\`
		};
	}

	if (check.quantity % instrument.lotSize !== 0) {
		return {
			reason: 'quantity_off_lot',
			detail: \`Quantity must be a multiple of \${instrument.lotSize}\`
		};
	}`
			},
			{
				type: 'why',
				title: 'Why ticks exist at all',
				text: 'Without them, somebody can always outbid you by one ten-thousandth of a penny. Price-time priority stops meaning anything, because nobody ever has to wait in a queue — they just improve by a rounding error. Ticks force the queue to be real.'
			},

			{ type: 'h3', id: 'collar', text: 'The fat-finger collar' },
			{
				type: 'p',
				text: 'Somebody types 4550 when they meant 45.50. Without a check, that order sweeps the entire book and prints a trade at a hundred times the market. It has happened, repeatedly, at real venues, and it is why every exchange has a **collar**: a band around the reference price outside which orders are simply refused.'
			},
			{
				type: 'code',
				file: 'packages/core/src/risk.ts',
				lang: 'ts',
				code: `
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
				detail: \`Price is more than \${limits.priceCollarBps / 100}% from the reference of \${instrument.referencePrice}\`
			};
		}
	}`
			},
			{
				type: 'p',
				text: 'The band\'s width comes from the account\'s risk limits (`limits.priceCollarBps`), and it is anchored on `instrument.referencePrice` — which starts as the listing reference and then follows the market, because the engine moves it on every fill:'
			},
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
		// The reference price follows the market. Every collar from here on is
		// measured against where the instrument actually traded.
		found.referencePrice = fill.price;`
			},
			{
				type: 'note',
				text: 'An anchor that moves with the market is the point: a collar fixed at yesterday\'s close would reject perfectly ordinary orders by the afternoon of a volatile day. A collar still refuses *good* orders too — a genuine 20% gap gets blocked until the limits are widened or the reference catches up. That is the trade every venue makes: a few refused orders in a fast market, against one catastrophic fill. Nobody has ever regretted the collar.'
			},

			{ type: 'h3', id: 'working-exposure', text: 'Position limits, including what is still working' },
			{
				type: 'p',
				text: 'A position limit says "this account may not be more than 50,000 shares long". The naive check compares the current position against the limit. It is wrong, and the way it is wrong is instructive.'
			},
			{
				type: 'code',
				file: 'packages/core/src/risk.ts',
				lang: 'ts',
				code: `
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
			detail: \`Would take the position to \${projected}, past the limit of \${limits.maxPositionQuantity}\`
		};
	}`
			},

			{ type: 'h3', id: 'kill', text: 'The kill switch' },
			{
				type: 'p',
				text: 'A risk manager watching a firm behave badly needs one button that stops it dead. Not "reject new orders" — that leaves the existing ones working and the exposure growing.'
			},
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
/**
 * The kill switch.
 *
 * Engaging it does two things at once, and both are necessary: it stops new
 * orders, and it pulls every order the firm already has resting. Doing only the
 * first would leave an algorithm that has already flooded the book with
 * mispriced liquidity exposed to everyone who noticed.
 */
function setKillSwitch(
	state: EngineState,
	command: Extract<Command, { kind: 'set_kill_switch' }>
): Event[] {
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
}`
			},
			{
				type: 'why',
				title: 'Why there is no window',
				text: 'Because this happens inside `apply`, which processes one command at a time in a total order, there is no instant at which some of the firm\'s orders are cancelled and others are not. The next command the engine reads sees a firm with no resting orders and a stop in place. A version that cancelled orders with separate commands would leave exactly that window, and it is the window an algorithm going wrong would trade through.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the nine checks are in that order',
					'You can explain what a tick is for beyond tidiness',
					'You can explain why a position limit must count working orders',
					'You understand why the kill switch has no window'
				]
			}
		]
	},

	{
		slug: 'self-trade-prevention',
		title: 'Self-trade prevention',
		summary:
			'Stopping a firm trading with itself — and the bug where the fix threw away fills it had already applied.',
		goal: 'Implement STP, and see a real bug that only a property test could have found.',
		blocks: [
			{
				type: 'p',
				text: 'Northgate has two desks. The equities desk bids £45.50; the systematic desk offers £45.50. They match. Northgate has bought from itself.'
			},
			{
				type: 'p',
				text: 'That is called a **wash trade**, and it is a problem for two reasons. It costs the firm two lots of fees for a trade that moved nothing, and — much more seriously — it prints on the public tape as real volume. A firm doing it deliberately is manipulating the market; a firm doing it accidentally still looks like it is.'
			},

			{ type: 'h3', id: 'three-answers', text: 'Three answers' },
			{
				type: 'ul',
				items: [
					'**cancel_resting** — pull the resting order, let the aggressor continue past it',
					'**cancel_aggressing** — refuse the incoming order, leave the book alone',
					'**cancel_both** — pull both. The safest, and the default here.'
				]
			},
			{
				type: 'p',
				text: 'The client chooses per order, because which one is right depends on what the desks are doing and only the firm knows.'
			},

			{ type: 'h3', id: 'the-bug', text: 'The bug' },
			{
				type: 'p',
				text: 'Here is roughly what the first implementation looked like, inside the matching loop:'
			},
			{
				type: 'code',
				file: 'the wrong version',
				lang: 'ts',
				code: `
if (resting.firmId === request.firmId) {
	switch (request.selfTradePrevention) {
		case 'cancel_both':
			toPull.push(resting);
			// Stop matching, cancel the aggressor too.
			return { fills: [], remaining, aggressorCancelled: true };
		// ...
	}
}`
			},
			{
				type: 'p',
				text: 'Read the return statement. It returns `fills: []`.'
			},
			{
				type: 'p',
				text: 'Now consider what has already happened by the time we reach it. The aggressive order may have walked through **two other price levels** first, trading against genuine counterparties, and `match` mutated the book as it went — `resting.remaining` was decremented, `level.total` was reduced, exhausted orders were spliced out.'
			},
			{
				type: 'warn',
				text: 'So the book has changed, real trades have occurred, and the function returns an empty list of fills. The engine emits no `traded` events for them: the venue has consumed liquidity without reporting a trade for it, and the book and the participants\' records disagree from that moment on — silently, forever.'
			},

			{ type: 'h3', id: 'how-found', text: 'How it was found' },
			{
				type: 'p',
				text: 'Not by an example test. Every example test anybody wrote had the self-trade as the *first* thing the order met, because that is how you naturally write the test — set up the scenario you are testing, minimally.'
			},
			{
				type: 'p',
				text: 'It was found by a property test that generates whole random sessions — places, cancels, kill switches, phase changes — runs each one through `apply`, and then asserts that quantity was conserved:'
			},
			{
				type: 'code',
				file: 'packages/core/src/invariants.spec.ts',
				lang: 'ts',
				code: `
it('conserves quantity: every share bought was sold by somebody', () => {
	fc.assert(
		fc.property(arbSession, (steps) => {
			const { state, events } = run(steps);

			// Positions are signed, so the whole venue must net to zero. If it
			// does not, the engine has created or destroyed shares.
			const total = [...state.positions.values()].reduce((sum, n) => sum + n, 0);
			expect(total).toBe(0);

			// And the same total reached from the other direction: the sum of
			// traded quantity has to match what the positions say changed.
			const traded = trades(events).reduce((sum, t) => sum + t.quantity, 0);
			const longs = [...state.positions.values()].filter((n) => n > 0).reduce((a, b) => a + b, 0);
			expect(longs).toBeLessThanOrEqual(traded);
		}),
		{ numRuns: 400 }
	);
});`
			},
			{
				type: 'note',
				text: '`arbSession` generates up to 120 weighted random commands; `run` feeds them through `apply` one `seq` at a time and collects every event, exactly as the log would. The same file asserts five more properties over every generated session: an uncrossed book during continuous trading, no negative or over-filled orders, the index and the book agreeing, working exposure matching what is resting, and byte-identical replay.'
			},
			{
				type: 'p',
				text: 'Somewhere in four hundred random sequences was one where a firm\'s own order sat two levels deep, behind two genuine counterparties. The quantity did not add up, and the shrinker reduced it to a four-order case you could read.'
			},

			{ type: 'h3', id: 'the-fix', text: 'The fix, and the shape it took' },
			{
				type: 'p',
				text: 'The fix has two parts: every branch now returns the `fills` it has actually applied, and the pulls are settled through a single exit point. The shipped code keeps a comment on the branch — returning `fills: []` "was a genuine bug and a nasty one", found by property-based testing "in about four seconds".'
			},
			{
				type: 'code',
				file: 'packages/core/src/book.ts',
				lang: 'ts',
				code: `
/**
 * Take the collected self-trade-prevention cancels off the book.
 *
 * Every exit from the walk goes through here, and that is the point. An
 * earlier version returned directly from the \`cancel_both\` branch and skipped
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

// …

		case 'cancel_both':
			toPull.push(resting);
			return {
				fills,
				remaining: remaining as Quantity,
				pulled: settlePulls(),
				aggressorCancelled: true
			};`
			},
			{
				type: 'why',
				title: 'The general lesson',
				text: 'An early return in the middle of a function that has already mutated something is where this class of bug lives. If you find yourself returning from inside a loop that has been changing state, ask what has already happened — and prefer a single exit that reports everything.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain what a wash trade is and why it matters',
					'You can explain why example tests structurally could not find this bug',
					'You can state the invariant "quantity is conserved" precisely'
				]
			}
		]
	},

	{
		slug: 'the-opening-auction',
		title: 'The opening auction',
		summary:
			'Finding the one price that trades the most, four tie-breaks deep — and the bug where multi-trade auctions dropped fills.',
		goal: 'Implement the uncross algorithm, and understand why a market opens with an auction rather than just starting.',
		blocks: [
			{
				type: 'p',
				text: 'A market does not open by switching on continuous trading. It opens with an **auction**.'
			},
			{
				type: 'p',
				text: 'Overnight, news happens. When the venue opens there is a pile of orders that all arrived while it was shut, and no meaningful "who was first" — they were all sitting in a queue. Matching them one at a time in arrival order would hand the first order in the queue the entire benefit of the overnight move, which is arbitrary and would make the opening a lottery worth gaming.'
			},
			{
				type: 'p',
				text: 'So instead: accumulate orders without matching (**pre-open**), then find the single price at which the most shares can trade, and trade **everything** at that one price.'
			},

			{ type: 'h3', id: 'finding', text: 'Finding the price' },
			{
				type: 'code',
				file: 'packages/core/src/auction.ts',
				lang: 'ts',
				code: `
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
export function findAuctionPrice(book: Book, referencePrice: Price): Candidate | undefined {`
			},
			{
				type: 'p',
				text: 'Where do the candidates come from? Only from prices somebody actually quoted, and only inside the crossed region — a price nobody named cannot be the auction price, and a price outside the cross cannot trade. When the book is not crossed at all, the list is empty and there is nothing to do. Each candidate is then priced by `evaluate`: everything bid at or above it against everything offered at or below, trading the smaller of the two.'
			},
			{
				type: 'code',
				file: 'packages/core/src/auction.ts',
				lang: 'ts',
				code: `
interface Candidate {
	readonly price: Price;
	readonly executable: number;
	readonly imbalance: number;
}

// …

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

// …

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
}`
			},

			{ type: 'h3', id: 'uncross', text: 'Uncrossing' },
			{
				type: 'p',
				text: 'Once you have the price, every order that can trade does, at that price. Everybody trades at the auction price regardless of what they quoted — a bid at £46.00 in an auction that clears at £45.50 pays £45.50 along with everyone else. Note that this is the *opposite* of the continuous rule, where the resting order\'s price wins: here there is no resting side and no aggressing side, just one price and every participant on the right side of it.'
			},
			{
				type: 'note',
				text: 'Auction trades have **no aggressor**. Nobody crossed the spread; everybody met in the middle simultaneously. That is why `Traded.aggressor` is optional, and why the fee for an auction trade is a single symmetric rate rather than a taker charge and a maker rebate.'
			},

			{ type: 'h3', id: 'bug-one', text: 'Bug found: the auction dropped trades' },
			{
				type: 'p',
				text: 'The first `runAuction` looked like this:'
			},
			{
				type: 'code',
				file: 'the wrong version',
				lang: 'ts',
				code: `
for (const fill of uncrossed.fills) {
	events.push(tradeEventFor(fill));

	// Tidy up: if this order is done, stop tracking it.
	if (fill.resting.filled >= fill.resting.quantity) {
		untrackLive(state, fill.resting);   // ← here
	}
}`
			},
			{
				type: 'p',
				text: 'Reasonable-looking. And wrong whenever the same resting order appears in more than one of the auction\'s trades — which happens every time one order fills against two counterparties. The uncross has already decremented every order\'s `remaining` before this loop runs, so the bookkeeping sat inside the reporting: the first trade that saw an order finished untracked it, and the next trade naming the same order failed its lookup and was silently skipped.'
			},
			{
				type: 'p',
				text: 'The shares still moved — the uncross had already done that. They would simply never have been reported, and the venue\'s own event stream would understate the volume of its own opening auction.'
			},
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
	/*
	 * Bookkeeping happens after every trade has been reported, not during.
	 *
	 * \`uncross\` has already decremented every order's \`remaining\` — it clears the
	 * whole book in one pass — so a single resting order can appear in several of
	 * the trades below with a final remaining of zero. Untracking it the first
	 * time zero is seen removes it from the index, and every later trade that
	 * names it then fails its lookup and is skipped.
	 *
	 * The shares still moved: \`uncross\` did that. They would simply never have
	 * been reported, and the venue's own event stream would understate the
	 * volume of its own opening auction. A property test found this; no example
	 * test would have, because it needs one order filling against two others in
	 * a single auction.
	 */
	const touched = new Set<LiveOrder>();

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

		reduceWorking(state, buy, trade.quantity);
		reduceWorking(state, sell, trade.quantity);
		touched.add(buy);
		touched.add(sell);
	}

	for (const order of touched) {
		if (order.remaining === 0) untrackLive(state, order);
	}`
			},
			{
				type: 'p',
				text: 'Found by the same quantity-conservation property. An example test with one buyer and one seller cannot produce one order filling against two others in a single auction, so it could not have found it.'
			},

			{ type: 'h3', id: 'bug-two', text: 'Bug found: continuous trading began on a crossed book' },
			{
				type: 'p',
				text: 'The phase handler ran the uncross when leaving an auction (`from` is a local — the phase the instrument was in when the command arrived):'
			},
			{
				type: 'code',
				file: 'the wrong version',
				lang: 'ts',
				code: `
if (from === 'auction') {
	events.push(...runAuction(state, seq, instrument));
}`
			},
			{
				type: 'p',
				text: 'Which is correct for the sequence the tests used: `pre_open → auction → continuous`. And wrong for `pre_open → continuous`, which an operator can perfectly well do — orders accumulated in pre-open without matching, and continuous trading began with a crossed book sitting there. Free money for whoever noticed first.'
			},
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
	const from = instrument.phase;
	// …

	/*
	 * When the book has to be cleared before trading resumes.
	 *
	 * Two cases, and the second one was missing until a property test opened
	 * trading on a crossed book and the "never crossed during continuous"
	 * invariant caught it.
	 *
	 *   - **The auction phase ending.** That is what an auction is for.
	 *   - **Going straight from pre-open to continuous.** Orders accumulate in
	 *     pre-open without matching, so the book is very likely crossed. A venue
	 *     that opened continuous trading on a crossed book would hand the first
	 *     participant to send anything a free trade against every order that
	 *     should already have been matched.
	 *
	 * The real lesson is about where the rule lives. "Uncross when the auction
	 * ends" describes the intended path; "never begin continuous trading with a
	 * crossed book" describes the *invariant*, and only the second one is still
	 * true when somebody adds a phase transition nobody had thought about.
	 */
	const wasAccumulating = from === 'pre_open' || from === 'auction';
	const opensTrading = command.phase === 'continuous';

	if (from === 'auction' || (wasAccumulating && opensTrading)) {
		events.push(...runAuction(state, seq, instrument));
	}`
			},
			{
				type: 'why',
				title: 'The pattern behind both bugs',
				text: 'Write tests that assert the **invariant**, not the happy path. "The book is never crossed during continuous trading" catches every transition, including the ones you did not think of. "The auction uncrosses when it ends" only catches the one you were thinking about when you wrote it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why a market opens with an auction',
					'You can state the four tie-break rules in order',
					'You can explain why an auction trade has no aggressor',
					'You can explain the difference between testing an invariant and testing a path'
				]
			}
		]
	}
];
