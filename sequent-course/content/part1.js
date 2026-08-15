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
/** Fields every command carries. */
interface CommandMeta {
	/** Whose command this is. Overwritten by the gateway; never trusted. */
	readonly firmId: FirmId;
	/** Which human or key sent it. For the audit trail. */
	readonly actorId: UserId;
}

export interface PlaceOrder extends CommandMeta {
	readonly kind: 'place_order';
	readonly accountId: AccountId;
	readonly instrumentId: InstrumentId;
	/** The client's own name for this order. Unique per firm. */
	readonly clientOrderId: ClientOrderId;
	readonly side: Side;
	readonly orderType: OrderType;
	/** Absent for a market order, which takes whatever the book offers. */
	readonly price?: Price;
	readonly quantity: Quantity;
	readonly timeInForce: TimeInForce;
	readonly selfTradePrevention: SelfTradePrevention;
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

const identifier = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64));
const scaledInteger = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1e15));

export const placeOrderSchema = v.object({
	kind: v.literal('place_order'),
	...meta,
	accountId: identifier,
	instrumentId: identifier,
	clientOrderId: identifier,
	side: v.picklist(['buy', 'sell'] as const),
	orderType: v.picklist(['limit', 'market'] as const),
	price: v.optional(scaledInteger),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1e12)),
	timeInForce: v.picklist(['gtc', 'day', 'ioc', 'fok'] as const),
	selfTradePrevention: v.picklist(['cancel_resting', 'cancel_aggressor', 'cancel_both'] as const)
});

/**
 * Parse anything into a Command, or throw.
 *
 * The one door. Nothing becomes a \`Command\` without passing through here, so
 * "is this validated" has one answer rather than fourteen.
 */
export function parseCommand(input: unknown): Command {
	return v.parse(commandSchema, input);
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
 * A command, plus what the venue stamped on it when it arrived.
 *
 * The engine reads \`receivedAt\` instead of calling a clock. That single choice
 * is what makes replay reproduce history: replaying a command from March uses
 * March's timestamp, because the timestamp travels with the command rather than
 * being read when the command is processed.
 */
export interface Sequenced<T> {
	/** Its position in the total order. Assigned by the sequencer, never reused. */
	readonly seq: number;
	/** The venue's clock reading when it arrived. */
	readonly receivedAt: number;
	/** Which version of the rules was in force. */
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
	 * **Absent** for an auction trade, because an auction has no aggressor —
	 * everybody crossed at one price simultaneously.
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
 * Every reason an order can be refused.
 *
 * A closed list, so a client can branch on it. The free-text \`detail\` field
 * next to it is for a human and is explicitly not stable — the moment a client
 * matches on prose, a copy-edit becomes an outage at somebody else's firm.
 */
export const REJECT_REASONS = [
	'unknown_instrument',
	'instrument_not_trading',
	'firm_stopped',
	'price_off_tick',
	'quantity_off_lot',
	'quantity_too_large',
	'price_outside_collar',
	'notional_too_large',
	'position_limit',
	'duplicate_client_order_id',
	'no_such_order',
	'market_order_no_liquidity',
	'fok_not_fillable'
] as const;`
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
export interface RestingOrder {
	readonly orderId: OrderId;
	readonly firmId: FirmId;
	readonly accountId: AccountId;
	readonly clientOrderId: ClientOrderId;
	readonly side: Side;
	readonly price: Price;
	readonly quantity: Quantity;
	/** How much has traded. Never exceeds \`quantity\`. */
	filled: Quantity;
	/** The command that created it — this is the time in price-time priority. */
	readonly seq: number;
	readonly selfTradePrevention: SelfTradePrevention;
}

export interface PriceLevel {
	readonly price: Price;
	/** In arrival order. Position 0 trades first. */
	readonly orders: RestingOrder[];
	/**
	 * The unfilled quantity across the whole level, kept up to date.
	 *
	 * Denormalised deliberately. Summing the orders on every read is O(n) and
	 * happens on every single depth query; maintaining it here is O(1) per
	 * change. The cost is that every mutation must remember to update it, so
	 * every mutation goes through the two functions below and nothing touches
	 * \`orders\` directly.
	 */
	total: Quantity;
}

export interface Book {
	readonly instrumentId: InstrumentId;
	/** Descending: bids[0] is the best bid. */
	readonly bids: PriceLevel[];
	/** Ascending: asks[0] is the best ask. */
	readonly asks: PriceLevel[];
}`
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
 * Where a price sits, or where it would go.
 *
 * A binary search, because a busy instrument has hundreds of levels and this
 * runs on every single order. Returns the index and whether it is a hit, so the
 * caller can insert at the same place it looked without searching twice.
 *
 * The comparison flips with the side, which is the only fiddly part: bids
 * descend, asks ascend, and one function handles both so there is one place for
 * the off-by-one to be rather than two.
 */
function locate(levels: PriceLevel[], price: Price, side: Side): { index: number; found: boolean } {
	let low = 0;
	let high = levels.length;

	while (low < high) {
		const middle = (low + high) >>> 1;
		const at = levels[middle]!.price;

		if (at === price) return { index: middle, found: true };

		const before = side === 'buy' ? at > price : at < price;
		if (before) low = middle + 1;
		else high = middle;
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
/** Put an order on the book, at the back of its price level's queue. */
export function rest(book: Book, order: RestingOrder): void {
	const levels = order.side === 'buy' ? book.bids : book.asks;
	const { index, found } = locate(levels, order.price, order.side);

	const remaining = (order.quantity - order.filled) as Quantity;

	if (found) {
		const level = levels[index]!;
		// The back of the queue. \`push\`, never \`unshift\` — arrival order *is* the
		// fairness rule, and putting a late order at the front is queue-jumping.
		level.orders.push(order);
		level.total = (level.total + remaining) as Quantity;
		return;
	}

	levels.splice(index, 0, { price: order.price, orders: [order], total: remaining });
}`
			},

			{ type: 'h3', id: 'matching', text: 'Matching' },
			{
				type: 'p',
				text: 'The core loop. An aggressive order walks the opposite side, taking whatever it can, best price first.'
			},
			{
				type: 'code',
				file: 'packages/core/src/book.ts (simplified)',
				lang: 'ts',
				code: `
export function match(book: Book, request: MatchRequest): MatchResult {
	const opposite = request.side === 'buy' ? book.asks : book.bids;
	const fills: Fill[] = [];

	let remaining = request.quantity;

	while (remaining > 0 && opposite.length > 0) {
		const level = opposite[0]!;

		// Would this level cross? A buy crosses an ask at or below its limit.
		const crosses =
			request.price === undefined ||
			(request.side === 'buy' ? level.price <= request.price : level.price >= request.price);

		if (!crosses) break;

		while (remaining > 0 && level.orders.length > 0) {
			const resting = level.orders[0]!;
			const available = (resting.quantity - resting.filled) as Quantity;
			const traded = Math.min(remaining, available) as Quantity;

			/*
			 * The trade happens at the **resting** order's price, not the
			 * aggressor's.
			 *
			 * A buy limit at £45.60 hitting an ask at £45.50 trades at £45.50 —
			 * the buyer gets price improvement. Trading at the aggressor's price
			 * would let anybody extract value by sending a deliberately terrible
			 * limit, and would mean the resting order got worse than it asked for.
			 */
			fills.push({ resting, price: level.price, quantity: traded });

			resting.filled = (resting.filled + traded) as Quantity;
			level.total = (level.total - traded) as Quantity;
			remaining = (remaining - traded) as Quantity;

			if (resting.filled >= resting.quantity) level.orders.shift();
		}

		if (level.orders.length === 0) opposite.shift();
	}

	return { fills, remaining };
}`
			},
			{
				type: 'why',
				title: 'Price improvement, and why it is not generosity',
				text: 'The trade printing at the resting order\'s price is not a courtesy — it is what makes a limit order safe to leave on the book. If aggressors set the price, resting a bid at £45.50 would mean any seller could take it at £45.50 having offered at £45.20, and nobody would ever rest anything.'
			},

			{ type: 'h3', id: 'crossed', text: 'The invariant to check' },
			{
				type: 'code',
				file: 'packages/core/src/book.ts',
				lang: 'ts',
				code: `
/**
 * Is the best bid at or above the best ask?
 *
 * During continuous trading this must **never** be true. If it is, two orders
 * that should have traded are both sitting on the book — which means somebody
 * can buy from one and sell to the other for free, and the venue has printed
 * money.
 *
 * Cheap to check, catastrophic to miss, so a property test asserts it after
 * every operation.
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
				text: 'Here is the whole engine, as a type:'
			},
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
export function apply(state: EngineState, sequenced: Sequenced<Command>): Event[];`
			},
			{
				type: 'p',
				text: 'Give it the current state and one command, and it returns the events that command caused. It mutates `state` in place for speed, and it touches nothing else. No `await`, because there is nothing to wait for.'
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
export function apply(state: EngineState, sequenced: Sequenced<Command>): Event[] {
	// The venue's clock, taken from the command rather than read.
	state.now = sequenced.receivedAt;

	const command = sequenced.body;

	switch (command.kind) {
		case 'place_order':
			return placeOrder(state, command, sequenced.seq);
		case 'cancel_order':
			return cancelOrder(state, command, sequenced.seq);
		case 'replace_order':
			return replaceOrder(state, command, sequenced.seq);
		case 'cancel_all':
			return cancelAll(state, command, sequenced.seq);
		case 'set_risk_limits':
			return setRiskLimits(state, command);
		case 'set_kill_switch':
			return setKillSwitch(state, command, sequenced.seq);
		case 'list_instrument':
			return listInstrument(state, command);
		case 'set_phase':
			return setPhase(state, command, sequenced.seq);
		case 'tick':
			return tick(state, sequenced.seq);
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
function placeOrder(state: EngineState, command: PlaceOrder, seq: number): Event[] {
	// 1. Every pre-trade check, in one place, before anything is mutated.
	const refused = checkOrder(state, command);
	if (refused) {
		return [{ kind: 'order_rejected', ...refused, /* ... */ }];
	}

	const orderId = orderIdFor(seq);
	const book = state.books.get(command.instrumentId)!;

	// 2. FOK needs to know whether it *would* fill before anything moves.
	const blocked = checkAgainstBook(state, command, book);
	if (blocked) return [{ kind: 'order_rejected', ...blocked }];

	// 3. Match.
	const result = match(book, { /* ... */ });

	const events: Event[] = [{ kind: 'order_accepted', orderId, /* ... */ }];

	// 4. Report the trades, in the order they happened.
	result.fills.forEach((fill, index) => {
		events.push(tradeEventFor(fill, tradeIdFor(seq, index), command, orderId));
	});

	// 5. Rest whatever is left, unless the time-in-force forbids it.
	if (result.remaining > 0 && (command.timeInForce === 'gtc' || command.timeInForce === 'day')) {
		rest(book, { orderId, /* ... */ });
	} else if (result.remaining > 0) {
		events.push({ kind: 'order_cancelled', reason: 'ioc_remainder', /* ... */ });
	}

	return events;
}`
			},

			{ type: 'h3', id: 'tif', text: 'Time in force' },
			{
				type: 'p',
				text: 'Four values, and each one is a different answer to "what if I cannot fill all of it right now?"'
			},
			{
				type: 'ul',
				items: [
					'**gtc** — good till cancelled. Rest the remainder. The default.',
					'**day** — rest it, but cancel at the close.',
					'**ioc** — immediate or cancel. Take what you can, cancel the rest. Never rests.',
					'**fok** — fill or kill. All of it right now, or none of it. Nothing rests, and nothing partially fills.'
				]
			},
			{
				type: 'p',
				text: '`fok` is the interesting one, because it needs an answer *before* anything moves. You cannot match and then decide you should not have.'
			},
			{
				type: 'code',
				file: 'packages/core/src/risk.ts',
				lang: 'ts',
				code: `
/**
 * A dry run, for fill-or-kill.
 *
 * \`fillableQuantity\` walks the book and returns how much *would* trade,
 * without touching anything. If it is less than the order, the order is refused
 * and the book is exactly as it was.
 *
 * The alternative — match, notice the shortfall, undo — means writing an undo
 * for every mutation and getting it right. A read-only pass is much smaller and
 * cannot be half-applied.
 */
export function checkAgainstBook(state: EngineState, command: PlaceOrder, book: Book) {
	if (command.timeInForce === 'fok') {
		const fillable = fillableQuantity(book, command.side, command.price);
		if (fillable < command.quantity) {
			return { reason: 'fok_not_fillable' as const, detail: \`Only \${fillable} available\` };
		}
	}

	if (command.orderType === 'market' && depthOf(book, command.side) === 0) {
		// A market order with nothing to buy from would otherwise rest with no
		// price, which is not a thing an order book can hold.
		return { reason: 'market_order_no_liquidity' as const, detail: 'The other side is empty' };
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
 * Every pre-trade check, in order.
 *
 * The sequence is a design decision, not an accident:
 *
 *   1. Does the instrument exist?      — cheapest, and everything else assumes it
 *   2. Is it trading?                  — phase check
 *   3. Is the firm stopped?            — the kill switch beats everything below
 *   4. Is the price on a tick?         — pure arithmetic, no state
 *   5. Is the quantity a whole lot?    — same
 *   6. Is the quantity within limits?  — per-account, one lookup
 *   7. Is the price within the collar? — needs the reference price
 *   8. Is the notional within limits?  — needs price × quantity
 *   9. Would the position breach?      — needs the current position AND working orders
 *
 * Cheap and certain first, expensive and stateful last. A malformed order is
 * refused by arithmetic before it costs a single lookup, and the kill switch
 * sits above every business rule because "stop" must mean stop.
 */
export function checkOrder(state: EngineState, command: PlaceOrder): Refusal | undefined {`
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
	if (command.price !== undefined && !isOnTick(command.price, instrument.tickSize)) {
		return {
			reason: 'price_off_tick',
			detail: \`\${formatPrice(command.price)} is not a multiple of the \${instrument.tickSize} tick\`
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
	 * The collar is anchored on the **last trade** if there has been one, and on
	 * the listing reference price if not.
	 *
	 * Using the last trade means the band follows a genuinely moving market
	 * rather than a stale number set at listing — an instrument that has run 30%
	 * over a week should not have every order refused because the anchor is a
	 * week old.
	 */
	const anchor = instrument.lastTradePrice ?? instrument.referencePrice;
	const band = Math.floor((anchor * instrument.collarBasisPoints) / 10_000);

	if (command.price !== undefined && Math.abs(command.price - anchor) > band) {
		return {
			reason: 'price_outside_collar',
			detail: \`\${formatPrice(command.price)} is more than \${
				instrument.collarBasisPoints / 100
			}% from \${formatPrice(anchor)}\`
		};
	}`
			},
			{
				type: 'note',
				text: 'A collar refuses *good* orders too — a genuine 20% move gets blocked until an operator widens the band or the reference catches up. That is the trade every venue makes: a few refused orders in a fast market, against one catastrophic fill. Nobody has ever regretted the collar.'
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
	 * The check includes orders that are still **working**, not just the
	 * position.
	 *
	 * An account at zero with 49,000 shares of resting bids is one fill away from
	 * 49,000 long. Checking only the position would let it rest another 49,000,
	 * and if both fill it is 98,000 long against a 50,000 limit — with every
	 * individual order having passed the check.
	 *
	 * This is the shape of nearly every limit bug: the limit is checked against
	 * what has happened rather than against what has been *promised*.
	 */
	const position = state.positions.get(positionKey(command.accountId, command.instrumentId)) ?? 0;
	const working = workingExposure(state, command.accountId, command.instrumentId, command.side);
	const after = position + working + signedQuantity;

	if (Math.abs(after) > limits.maxPosition) {
		return {
			reason: 'position_limit',
			detail: \`Would take the position to \${after}, past the \${limits.maxPosition} limit\`
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
function setKillSwitch(state: EngineState, command: SetKillSwitch, seq: number): Event[] {
	const events: Event[] = [];

	if (command.engaged) {
		state.killed.add(command.targetFirmId);

		// Pull everything the firm has resting. All of it, atomically, before the
		// event that says the switch was engaged.
		for (const order of ordersOf(state, command.targetFirmId)) {
			remove(state.books.get(order.instrumentId)!, order);
			events.push({ kind: 'order_cancelled', reason: 'kill_switch', /* ... */ });
		}
	} else {
		state.killed.delete(command.targetFirmId);
	}

	/*
	 * The change is reported **after** the cancellations it caused, so a consumer
	 * reading the stream in order sees the orders go and then learns why.
	 *
	 * The other order would have consumers seeing "trading stopped" followed by
	 * a burst of cancellations they cannot attribute to it.
	 */
	events.push({ kind: 'kill_switch_changed', /* ... */, ordersCancelled: events.length });

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
					'**cancel_aggressor** — refuse the incoming order, leave the book alone',
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
				text: 'Now consider what has already happened by the time we reach it. The aggressive order may have walked through **two other price levels** first, trading against genuine counterparties, and `match` mutated the book as it went — `resting.filled` was incremented, `level.total` was reduced, exhausted orders were shifted off.'
			},
			{
				type: 'warn',
				text: 'So the book has changed, real trades have occurred, and the function returns an empty list of fills. The engine emits no `traded` events for them. Quantity has vanished: shares left the book and nobody was told. The ledger balances, the book looks fine, and two firms\' positions are silently wrong.'
			},

			{ type: 'h3', id: 'how-found', text: 'How it was found' },
			{
				type: 'p',
				text: 'Not by an example test. Every example test anybody wrote had the self-trade as the *first* thing the order met, because that is how you naturally write the test — set up the scenario you are testing, minimally.'
			},
			{
				type: 'p',
				text: 'It was found by a property test that generates random order sequences and asserts an invariant after every one:'
			},
			{
				type: 'code',
				file: 'packages/core/src/invariants.spec.ts',
				lang: 'ts',
				code: `
it('conserves quantity', () => {
	fc.assert(
		fc.property(fc.array(orderArbitrary, { maxLength: 40 }), (orders) => {
			const state = freshVenue();
			let traded = 0;

			for (const [index, order] of orders.entries()) {
				for (const event of apply(state, sequence(order, index))) {
					if (event.kind === 'traded') traded += event.quantity;
				}
			}

			/*
			 * Everything that entered the venue is either resting, filled, or
			 * cancelled. Nothing simply stops existing.
			 */
			expect(restingQuantity(state) + traded + cancelledQuantity)
				.toBe(submittedQuantity(orders));
		}),
		{ numRuns: 400 }
	);
});`
			},
			{
				type: 'p',
				text: 'Somewhere in four hundred random sequences was one where a firm\'s own order sat two levels deep, behind two genuine counterparties. The quantity did not add up, and the shrinker reduced it to a four-order case you could read.'
			},

			{ type: 'h3', id: 'the-fix', text: 'The fix, and the shape it took' },
			{
				type: 'code',
				file: 'packages/core/src/book.ts',
				lang: 'ts',
				code: `
/**
 * Pull the orders self-trade prevention marked, once, on the way out.
 *
 * A single exit point, and it exists because the first version removed orders
 * at each of the three branches — which meant \`dryRun\` was honoured in two of
 * them and forgotten in the third, and the reported "pulled" list did not match
 * what had actually been removed.
 */
const settlePulls = (): Pulled[] => {
	if (request.dryRun) return [];

	for (const order of toPull) {
		const left = remove(book, order);
		if (left !== undefined) pulled.push({ order, remaining: left });
	}

	return pulled;
};

// ...and every STP branch now returns the fills it has actually applied:
case 'cancel_both':
	toPull.push(resting);
	return { fills, remaining, pulled: settlePulls(), aggressorCancelled: true };`
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
 * The auction price: four rules, applied in order.
 *
 * 1. **Maximum executable volume.** The price that trades the most shares. That
 *    is the point of an auction — it exists to clear as much as possible.
 *
 * 2. **Minimum imbalance.** If several prices trade the same volume, prefer the
 *    one leaving the least unfilled. A price that clears 10,000 with 500 left
 *    over is better than one that clears 10,000 with 4,000 left over.
 *
 * 3. **Surplus direction.** Still tied? If the remaining imbalance is on the buy
 *    side, take the higher price; if on the sell side, the lower. The unfilled
 *    pressure is telling you which way the market wants to go.
 *
 * 4. **Nearest the reference.** Still tied? The price closest to the previous
 *    close. The most conservative answer, and the one nobody can accuse you of
 *    choosing.
 *
 * Real venues use exactly this cascade. It is not arbitrary — each rule is what
 * you reach for when the one above it does not discriminate.
 */
export function findAuctionPrice(book: Book, reference: Price): AuctionPrice | undefined {`
			},
			{
				type: 'p',
				text: 'The candidate prices are just the distinct prices already on the book. There is no point evaluating a price nobody bid or offered at — it would trade nothing.'
			},
			{
				type: 'code',
				file: 'packages/core/src/auction.ts',
				lang: 'ts',
				code: `
	const candidates = [...new Set([...book.bids, ...book.asks].map((l) => l.price))].sort(
		(a, b) => a - b
	);

	let best: AuctionPrice | undefined;

	for (const candidate of candidates) {
		// How much would trade here? Everything bid at or above, matched against
		// everything offered at or below.
		const demand = quantityAtOrBetter(book.bids, candidate, 'buy');
		const supply = quantityAtOrBetter(book.asks, candidate, 'sell');
		const volume = Math.min(demand, supply);

		if (volume === 0) continue;

		const imbalance = Math.abs(demand - supply);
		const surplus: Side | undefined =
			demand > supply ? 'buy' : supply > demand ? 'sell' : undefined;

		if (best === undefined || better({ candidate, volume, imbalance, surplus }, best, reference)) {
			best = { price: candidate as Price, volume, imbalance, surplus };
		}
	}

	return best;`
			},

			{ type: 'h3', id: 'uncross', text: 'Uncrossing' },
			{
				type: 'p',
				text: 'Once you have the price, every order that can trade does, at that price. A bid at £46.00 in an auction that clears at £45.50 gets filled at £45.50 — better than it asked for. That is the same price-improvement principle as continuous trading, applied to everybody at once.'
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
				text: 'Reasonable-looking. And wrong whenever an auction produces more than one trade involving the same account, because `tradeEventFor` looks the order up in the live registry to build the event — and the previous iteration had just removed it.'
			},
			{
				type: 'p',
				text: 'The second trade\'s lookup failed, and the fill was silently dropped.'
			},
			{
				type: 'code',
				file: 'packages/core/src/apply.ts',
				lang: 'ts',
				code: `
/*
 * Collect first, untrack after.
 *
 * Every trade is reported while every order is still findable, and the
 * bookkeeping happens once the reporting is finished. Interleaving them means
 * a later step depends on state an earlier step has already destroyed.
 */
const touched = new Set<RestingOrder>();

for (const fill of uncrossed.fills) {
	events.push(tradeEventFor(fill));
	touched.add(fill.resting);
}

for (const order of touched) {
	if (order.filled >= order.quantity) untrackLive(state, order);
}`
			},
			{
				type: 'p',
				text: 'Found by the same quantity-conservation property test. An example test with one buyer and one seller can never produce two trades for one account, so it could not have found it.'
			},

			{ type: 'h3', id: 'bug-two', text: 'Bug found: continuous trading began on a crossed book' },
			{
				type: 'p',
				text: 'The phase handler ran the uncross when leaving an auction:'
			},
			{
				type: 'code',
				file: 'the wrong version',
				lang: 'ts',
				code: `
if (command.from === 'auction') {
	events.push(...runAuction(state, instrument, seq));
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
/*
 * Uncross whenever we are **entering trading from a phase that accumulated
 * orders**, not only when leaving an auction.
 *
 * The rule to state is the invariant — "continuous trading never begins on a
 * crossed book" — rather than the happy path, "uncross when the auction ends".
 * The first is true of every transition; the second is true of one of them.
 */
const wasAccumulating = command.from === 'pre_open' || command.from === 'auction';
const opensTrading = command.phase === 'continuous';

if (command.from === 'auction' || (wasAccumulating && opensTrading)) {
	events.push(...runAuction(state, instrument, seq));
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
