import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	asAccountId,
	asClientOrderId,
	asFirmId,
	asInstrumentId,
	asUserId,
	positionKey,
	price,
	quantity,
	type Command,
	type Event,
	type SequencedCommand
} from '@sequent/protocol';
import { apply } from './apply.ts';
import { allOrders, isCrossed } from './book.ts';
import { newState, type EngineState } from './state.ts';

/**
 * Properties, not examples.
 *
 * The example tests next door say "given this book and this order, expect that
 * fill". They are precise and they only cover the situations somebody thought
 * of. A matching engine's interesting failures live in the situations nobody
 * thought of — the sixth cancel arriving while a fill-or-kill is being priced
 * against a book that a kill switch is halfway through emptying.
 *
 * So: generate thousands of random command sequences and assert the things that
 * must be true after **every** one of them, whatever it contained. When a
 * property fails, fast-check shrinks the sequence to the smallest one that
 * still breaks it, which usually turns a 200-command scenario into a four-line
 * bug report.
 *
 * The five properties below are the ones a venue can be sued over.
 */

const VOD = asInstrumentId('VOD.L');
const ADMIN = asUserId('venue-admin');
const FIRMS = ['firm-a', 'firm-b', 'firm-c'] as const;

/* -------------------------------------------------------------------------- */
/* Generators                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Prices are constrained to the tick ladder and to a band around the reference,
 * because generating prices the venue must reject would spend the whole budget
 * proving that rejections are rejected. The interesting states are the ones
 * where orders actually match.
 */
const TICK = 25;
const REFERENCE = 455_000;

const arbPrice = fc.integer({ min: -40, max: 40 }).map((steps) => REFERENCE + steps * TICK);

const arbFirm = fc.constantFrom(...FIRMS);

const arbPlace = fc.record({
	kind: fc.constant('place_order' as const),
	firm: arbFirm,
	side: fc.constantFrom('buy' as const, 'sell' as const),
	at: arbPrice,
	qty: fc.integer({ min: 1, max: 500 }),
	tif: fc.constantFrom('gtc' as const, 'day' as const, 'ioc' as const, 'fok' as const),
	stp: fc.constantFrom(
		'cancel_resting' as const,
		'cancel_aggressing' as const,
		'cancel_both' as const
	)
});

const arbCancel = fc.record({
	kind: fc.constant('cancel_order' as const),
	firm: arbFirm,
	/** Which of the already-placed references to try to pull. */
	pick: fc.nat({ max: 40 })
});

const arbKill = fc.record({
	kind: fc.constant('kill_switch' as const),
	firm: arbFirm,
	engaged: fc.boolean()
});

const arbPhase = fc.record({
	kind: fc.constant('phase' as const),
	phase: fc.constantFrom(
		'continuous' as const,
		'auction' as const,
		'pre_open' as const,
		'halted' as const
	)
});

const arbStep = fc.oneof(
	{ arbitrary: arbPlace, weight: 12 },
	{ arbitrary: arbCancel, weight: 4 },
	{ arbitrary: arbKill, weight: 1 },
	{ arbitrary: arbPhase, weight: 1 }
);

const arbSession = fc.array(arbStep, { minLength: 1, maxLength: 120 });

/* -------------------------------------------------------------------------- */
/* Running a generated session                                                 */
/* -------------------------------------------------------------------------- */

interface Session {
	state: EngineState;
	events: Event[];
}

function run(
	steps: readonly (typeof arbStep extends fc.Arbitrary<infer T> ? T : never)[]
): Session {
	const state = newState();
	const events: Event[] = [];
	const placed: { firm: string; clientOrderId: string }[] = [];
	let seq = 0;

	// Flatten as we go so `events` is a single stream, like the log.
	const push = (body: Command) => {
		seq += 1;
		events.push(
			...apply(state, {
				seq,
				receivedAt: 1_700_000_000_000 + seq,
				version: 1,
				body
			} as SequencedCommand)
		);
	};

	push({
		kind: 'list_instrument',
		firmId: asFirmId('firm-a'),
		actorId: ADMIN,
		instrumentId: VOD,
		name: 'Vodafone Group',
		currency: 'GBP',
		tickSize: TICK,
		lotSize: 1,
		referencePrice: price(REFERENCE)
	});
	push({
		kind: 'set_phase',
		firmId: asFirmId('firm-a'),
		actorId: ADMIN,
		instrumentId: VOD,
		phase: 'continuous',
		reason: 'open'
	});

	for (const step of steps) {
		switch (step.kind) {
			case 'place_order': {
				const clientOrderId = `C${placed.length}`;
				placed.push({ firm: step.firm, clientOrderId });
				push({
					kind: 'place_order',
					firmId: asFirmId(step.firm),
					actorId: asUserId('trader'),
					accountId: asAccountId(`${step.firm}-main`),
					instrumentId: VOD,
					clientOrderId: asClientOrderId(clientOrderId),
					side: step.side,
					orderType: 'limit',
					price: price(step.at),
					quantity: quantity(step.qty),
					timeInForce: step.tif,
					selfTradePrevention: step.stp
				});
				break;
			}

			case 'cancel_order': {
				const target = placed[step.pick % Math.max(placed.length, 1)];
				if (!target) break;
				push({
					kind: 'cancel_order',
					firmId: asFirmId(step.firm),
					actorId: asUserId('trader'),
					clientOrderId: asClientOrderId(target.clientOrderId)
				});
				break;
			}

			case 'kill_switch':
				push({
					kind: 'set_kill_switch',
					firmId: asFirmId('firm-a'),
					actorId: ADMIN,
					targetFirmId: asFirmId(step.firm),
					engaged: step.engaged,
					reason: 'generated'
				});
				break;

			case 'phase':
				push({
					kind: 'set_phase',
					firmId: asFirmId('firm-a'),
					actorId: ADMIN,
					instrumentId: VOD,
					phase: step.phase,
					reason: 'generated'
				});
				break;
		}
	}

	return { state, events };
}

const trades = (events: Event[]) =>
	events.filter((event): event is Extract<Event, { kind: 'traded' }> => event.kind === 'traded');

/* -------------------------------------------------------------------------- */
/* The properties                                                              */
/* -------------------------------------------------------------------------- */

describe('invariants that must survive any sequence of commands', () => {
	it('never leaves a crossed book during continuous trading', () => {
		fc.assert(
			fc.property(arbSession, (steps) => {
				const { state } = run(steps);
				const instrument = state.instruments.get(VOD)!;

				// A crossed book is two participants who agree on a price and have
				// not been matched. Outside an auction it must never happen.
				if (instrument.phase === 'continuous') {
					expect(isCrossed(instrument.book)).toBe(false);
				}
			}),
			{ numRuns: 400 }
		);
	});

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
	});

	it('never lets an order have negative or over-filled quantity', () => {
		fc.assert(
			fc.property(arbSession, (steps) => {
				const { state } = run(steps);
				const instrument = state.instruments.get(VOD)!;

				for (const order of allOrders(instrument.book)) {
					expect(order.remaining).toBeGreaterThan(0);
					expect(order.remaining).toBeLessThanOrEqual(order.originalQuantity);
				}
			}),
			{ numRuns: 400 }
		);
	});

	it('keeps the index and the book agreeing about what is live', () => {
		fc.assert(
			fc.property(arbSession, (steps) => {
				const { state } = run(steps);
				const instrument = state.instruments.get(VOD)!;

				const onBook = [...allOrders(instrument.book)].map((o) => o.orderId).sort();
				const indexed = [...state.orders.keys()].sort();

				/*
				 * The two must be the same set. A drift either way is a real bug with
				 * a nasty shape: an order on the book but not in the index cannot be
				 * cancelled by its owner, and one in the index but not on the book is
				 * a cancel that will report success and change nothing.
				 */
				expect(onBook).toEqual(indexed);
			}),
			{ numRuns: 400 }
		);
	});

	it('keeps working exposure equal to what is actually resting', () => {
		fc.assert(
			fc.property(arbSession, (steps) => {
				const { state } = run(steps);
				const instrument = state.instruments.get(VOD)!;

				const expected = new Map<string, { buy: number; sell: number }>();
				for (const order of allOrders(instrument.book)) {
					// One book is one instrument, so the key is built from VOD rather
					// than read off the order — `RestingOrder` deliberately does not
					// carry an instrument.
					const key = positionKey(order.accountId, VOD);
					const current = expected.get(key) ?? { buy: 0, sell: 0 };
					if (order.side === 'buy') current.buy += order.remaining;
					else current.sell += order.remaining;
					expected.set(key, current);
				}

				// The risk check reads this on every order. If it drifts, position
				// limits are enforced against a number nobody is maintaining.
				expect([...state.working.entries()].sort()).toEqual([...expected.entries()].sort());
			}),
			{ numRuns: 400 }
		);
	});

	it('replays byte-identically', () => {
		fc.assert(
			fc.property(arbSession, (steps) => {
				// The property the whole architecture exists to preserve. Two runs of
				// the same commands must produce the same events, including every
				// derived identifier and every fee.
				expect(JSON.stringify(run(steps).events)).toBe(JSON.stringify(run(steps).events));
			}),
			{ numRuns: 200 }
		);
	});
});
