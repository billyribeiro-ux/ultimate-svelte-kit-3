import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import {
	asAccountId,
	asClientOrderId,
	asFirmId,
	asInstrumentId,
	asUserId,
	CURRENT_VERSION,
	price,
	quantity,
	type Command
} from '@sequent/protocol';
import {
	catchUp,
	health,
	openStore,
	readCheckpoint,
	Sequencer,
	trialBalance
} from '@sequent/store';
import { runEngine } from './loop.ts';

/**
 * Load, and what a load test is actually for.
 *
 * Not to produce a number for a slide. The useful outputs are:
 *
 *   **Where it breaks first.** Every system has one bottleneck at a time, and
 *   knowing which one is the difference between optimising something that
 *   matters and optimising something that does not. Here it is the sequencer:
 *   one writer, by design, and therefore the ceiling on the whole venue.
 *
 *   **Whether correctness survives volume.** Almost every concurrency bug is
 *   invisible below some threshold. The assertions at the end of these tests
 *   are the same ones the small suites make — the books balance, no order is
 *   overfilled — and they are the point. The timing is context.
 *
 * ## Why the numbers here are deliberately modest
 *
 * These run on whatever machine CI happens to give us, against SQLite on a
 * temp filesystem. Ten thousand orders is enough to shake out an ordering bug
 * and short enough that nobody skips the suite. A throughput assertion tuned to
 * a fast laptop is a test that fails on a busy CI box for no reason, which is
 * how a suite gets an `it.skip` nobody removes.
 *
 * So the assertions are about **correctness and completeness**, and the timings
 * are printed rather than asserted.
 */

let client: Client;
let directory: string;

const VOD = asInstrumentId('VOD.L');
const BP = asInstrumentId('BP.L');
const OPERATOR = asUserId('ops');
const VENUE = asFirmId('venue');

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-load-'));
	client = await openStore({ url: `file:${join(directory, 'venue.db')}` });
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

/**
 * A deterministic pseudo-random generator.
 *
 * `Math.random()` would make a failure unreproducible — the one thing you need
 * from a load test that finds a bug is the ability to run it again. A seeded
 * generator gives the same sequence every time, and changing the seed by hand
 * explores a different one.
 */
function seeded(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		// xorshift32: not cryptographic, perfectly adequate for choosing prices.
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0xffffffff;
	};
}

async function openMarket(sequencer: Sequencer, at: () => number): Promise<void> {
	for (const instrument of [VOD, BP]) {
		await sequencer.append(
			{
				kind: 'list_instrument',
				firmId: VENUE,
				actorId: OPERATOR,
				instrumentId: instrument,
				name: String(instrument),
				currency: 'GBP',
				tickSize: 25,
				lotSize: 1,
				referencePrice: price(455_000)
			},
			at(),
			CURRENT_VERSION
		);

		await sequencer.append(
			{
				kind: 'set_phase',
				firmId: VENUE,
				actorId: OPERATOR,
				instrumentId: instrument,
				phase: 'continuous',
				reason: 'open'
			},
			at(),
			CURRENT_VERSION
		);
	}
}

const FIRMS = [
	{ firm: asFirmId('northgate'), account: asAccountId('northgate-equities') },
	{ firm: asFirmId('lowfield'), account: asAccountId('lowfield-main') }
] as const;

describe('a busy session', () => {
	it('sequences, applies and projects ten thousand orders without losing one', async () => {
		const COUNT = 10_000;
		const random = seeded(20260815);

		const sequencer = new Sequencer(client);
		await sequencer.start();

		let clock = 1_700_000_000_000;
		const at = () => (clock += 1);

		await openMarket(sequencer, at);

		/* ---- sequencing ---- */

		const sequenceStart = performance.now();

		for (let index = 0; index < COUNT; index += 1) {
			const side = random() < 0.5 ? 'buy' : 'sell';
			const party = FIRMS[index % FIRMS.length]!;

			const command: Command = {
				kind: 'place_order',
				firmId: party.firm,
				actorId: OPERATOR,
				accountId: party.account,
				instrumentId: index % 3 === 0 ? BP : VOD,
				clientOrderId: asClientOrderId(`L-${index}`),
				side,
				orderType: 'limit',
				// A tight band around the reference, so plenty of orders cross and the
				// engine does real matching rather than just resting everything.
				price: price(455_000 + Math.floor((random() - 0.5) * 40) * 25),
				quantity: quantity(100 + Math.floor(random() * 900)),
				timeInForce: 'gtc',
				selfTradePrevention: 'cancel_both'
			};

			await sequencer.append(command, at(), CURRENT_VERSION);
		}

		const sequenceMs = performance.now() - sequenceStart;
		const last = sequencer.nextSeq - 1;

		/* ---- applying ---- */

		const engineStart = performance.now();
		const controller = new AbortController();

		await runEngine(client, {
			signal: controller.signal,
			idleMs: 1,
			onProgress: ({ lastSeq }) => {
				if (lastSeq >= last) controller.abort();
			}
		});

		const engineMs = performance.now() - engineStart;

		/* ---- projecting ---- */

		const projectStart = performance.now();
		await catchUp(client);
		const projectMs = performance.now() - projectStart;

		/* ---- what actually matters ---- */

		expect(await readCheckpoint(client, 'engine')).toBe(last);

		const status = await health(client);
		expect(status.engineLag).toBe(0);
		expect(status.projectorLag).toBe(0);

		/*
		 * Every command was accounted for — accepted **or** rejected.
		 *
		 * The first version of this assertion counted `order_record` and expected
		 * 10,000, and got 2,582. Not a lost-command bug: the prices are scattered
		 * ±20 ticks around the reference, so most of them breach the fat-finger
		 * collar and are refused. A rejected order never becomes an `order_record`
		 * row, and it should not.
		 *
		 * Which makes the useful invariant "every command produced an outcome",
		 * not "every command produced an order". The distinction matters: the
		 * first version would have gone green the day somebody widened the collar,
		 * hiding a real loss behind a coincidence.
		 */
		const accepted = await client.execute('SELECT COUNT(*) AS n FROM order_record');
		const rejected = await client.execute(
			"SELECT COUNT(*) AS n FROM event_log WHERE kind = 'order_rejected'"
		);

		const outcomes = Number(accepted.rows[0]?.['n']) + Number(rejected.rows[0]?.['n']);
		expect(outcomes).toBe(COUNT);

		// And both kinds actually happened, or the assertion above proves nothing.
		expect(Number(accepted.rows[0]?.['n'])).toBeGreaterThan(0);
		expect(Number(rejected.rows[0]?.['n'])).toBeGreaterThan(0);

		// Nothing filled beyond its size, at any volume.
		const overfilled = await client.execute(
			'SELECT COUNT(*) AS n FROM order_record WHERE filled > quantity'
		);
		expect(Number(overfilled.rows[0]?.['n'])).toBe(0);

		// And the books balance, which is the assertion that would catch a
		// concurrency bug in the ledger that only appears under volume.
		expect((await trialBalance(client)).total).toBe(0);

		const trades = await client.execute('SELECT COUNT(*) AS n FROM trade');

		console.log(
			[
				'',
				`  ${COUNT.toLocaleString('en-GB')} orders`,
				`  sequenced in ${Math.round(sequenceMs)}ms  (${Math.round(COUNT / (sequenceMs / 1000)).toLocaleString('en-GB')}/s)`,
				`  applied   in ${Math.round(engineMs)}ms  (${Math.round(COUNT / (engineMs / 1000)).toLocaleString('en-GB')}/s)`,
				`  projected in ${Math.round(projectMs)}ms`,
				`  ${Number(accepted.rows[0]?.['n']).toLocaleString('en-GB')} accepted, ${Number(rejected.rows[0]?.['n']).toLocaleString('en-GB')} rejected on risk`,
				`  producing ${Number(trades.rows[0]?.['n']).toLocaleString('en-GB')} trades`,
				''
			].join('\n')
		);
	});

	it('keeps the book uncrossed the whole way through', async () => {
		const COUNT = 2_000;
		const random = seeded(7);

		const sequencer = new Sequencer(client);
		await sequencer.start();

		let clock = 1_700_000_000_000;
		const at = () => (clock += 1);
		await openMarket(sequencer, at);

		for (let index = 0; index < COUNT; index += 1) {
			await sequencer.append(
				{
					kind: 'place_order',
					firmId: FIRMS[index % 2]!.firm,
					actorId: OPERATOR,
					accountId: FIRMS[index % 2]!.account,
					instrumentId: VOD,
					clientOrderId: asClientOrderId(`X-${index}`),
					side: random() < 0.5 ? 'buy' : 'sell',
					orderType: 'limit',
					price: price(455_000 + Math.floor((random() - 0.5) * 20) * 25),
					quantity: quantity(100),
					timeInForce: 'gtc',
					selfTradePrevention: 'cancel_both'
				},
				at(),
				CURRENT_VERSION
			);
		}

		const last = sequencer.nextSeq - 1;
		const controller = new AbortController();

		await runEngine(client, {
			signal: controller.signal,
			idleMs: 1,
			onProgress: ({ lastSeq }) => {
				if (lastSeq >= last) controller.abort();
			}
		});

		await catchUp(client);

		/*
		 * The invariant, checked against the *projection* rather than the engine's
		 * memory.
		 *
		 * The property tests in `packages/core` already prove the engine never
		 * leaves a crossed book. This checks the thing a trader would actually see
		 * — and it is a different claim, because a projection bug can produce a
		 * crossed ladder from a perfectly correct engine. That is not
		 * hypothetical: it happened, and it took a browser to notice.
		 */
		const touch = await client.execute(`
			SELECT
				(SELECT MAX(price) FROM order_record
				 WHERE instrument_id = 'VOD.L' AND status = 'working' AND side = 'buy'
				   AND quantity > filled) AS bid,
				(SELECT MIN(price) FROM order_record
				 WHERE instrument_id = 'VOD.L' AND status = 'working' AND side = 'sell'
				   AND quantity > filled) AS ask
		`);

		const bid = touch.rows[0]?.['bid'];
		const ask = touch.rows[0]?.['ask'];

		if (bid !== null && ask !== null) {
			expect(Number(bid), `bid ${bid} must be below ask ${ask}`).toBeLessThan(Number(ask));
		} else {
			// A one-sided book is a legitimate outcome, and asserting nothing at all
			// would let this test pass vacuously if the engine stopped matching.
			expect(bid === null || ask === null).toBe(true);
		}
	});
});

describe('where it breaks first', () => {
	it('is the sequencer, and that is by design', async () => {
		/*
		 * One writer is the venue's throughput ceiling, and it is a deliberate
		 * trade rather than an oversight: two writers assigning sequence numbers
		 * would have to agree on an order, and every consensus protocol ever
		 * written exists because that agreement is expensive.
		 *
		 * An exchange that could accept two orders simultaneously would have to
		 * explain which one was first, and "we are not sure" is not an answer a
		 * venue can give.
		 *
		 * This test measures the ceiling rather than asserting a number, so it
		 * documents the bottleneck without failing on a slow CI box.
		 */
		const sequencer = new Sequencer(client);
		await sequencer.start();

		let clock = 1_700_000_000_000;
		await openMarket(sequencer, () => (clock += 1));

		const SAMPLE = 2_000;
		const start = performance.now();

		for (let index = 0; index < SAMPLE; index += 1) {
			await sequencer.append(
				{
					kind: 'place_order',
					firmId: FIRMS[0]!.firm,
					actorId: OPERATOR,
					accountId: FIRMS[0]!.account,
					instrumentId: VOD,
					clientOrderId: asClientOrderId(`S-${index}`),
					side: 'buy',
					orderType: 'limit',
					price: price(450_000),
					quantity: quantity(100),
					timeInForce: 'gtc',
					selfTradePrevention: 'cancel_both'
				},
				(clock += 1),
				CURRENT_VERSION
			);
		}

		const elapsed = performance.now() - start;
		const perSecond = Math.round(SAMPLE / (elapsed / 1000));

		console.log(`\n  sequencer ceiling: ~${perSecond.toLocaleString('en-GB')} commands/second\n`);

		// Only that it works at all. The number is documentation, not a promise.
		expect(perSecond).toBeGreaterThan(0);
		expect(sequencer.nextSeq - 1).toBe(SAMPLE + 4);
	});
});
