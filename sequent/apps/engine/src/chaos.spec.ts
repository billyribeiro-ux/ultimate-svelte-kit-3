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
	assertNoGaps,
	catchUp,
	openStore,
	readCheckpoint,
	Sequencer,
	trialBalance
} from '@sequent/store';
import { runEngine } from './loop.ts';
import { recover, verifyRecovery } from './recover.ts';
import { fingerprint, loadSnapshot } from './snapshot.ts';

/**
 * Fault injection.
 *
 * Everything else in this suite tests the venue doing its job. This file tests
 * it being **interrupted** — killed mid-session, restarted twice at once,
 * handed a corrupt snapshot, made to replay from nothing.
 *
 * Those are the only failures that matter in production, and they are the only
 * ones a developer never sees, because a developer's machine does not lose
 * power and does not run two copies of the engine by accident during a deploy.
 *
 * ## The invariant every test here checks
 *
 * However the venue is interrupted, **replaying the log produces the same
 * state**. Not similar; identical, down to a fingerprint. That is the property
 * event sourcing is *for*, and it is worth nothing unless something proves it
 * survives contact with a crash.
 */

let client: Client;
let directory: string;
let file: string;

const VOD = asInstrumentId('VOD.L');
const NORTH = asFirmId('northgate');
const LOW = asFirmId('lowfield');
const OPERATOR = asUserId('ops');

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-chaos-'));
	file = `file:${join(directory, 'venue.db')}`;
	client = await openStore({ url: file });
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* A session to interrupt                                                      */
/* -------------------------------------------------------------------------- */

let clientOrderCounter = 0;

function order(input: {
	firm: string;
	account: string;
	side: 'buy' | 'sell';
	at: number;
	qty: number;
}): Command {
	clientOrderCounter += 1;

	return {
		kind: 'place_order',
		firmId: asFirmId(input.firm),
		actorId: OPERATOR,
		accountId: asAccountId(input.account),
		instrumentId: VOD,
		clientOrderId: asClientOrderId(`C-${clientOrderCounter}`),
		side: input.side,
		orderType: 'limit',
		price: price(input.at),
		quantity: quantity(input.qty),
		timeInForce: 'gtc',
		selfTradePrevention: 'cancel_both'
	};
}

/**
 * Write a session's worth of commands without running the engine.
 *
 * Deliberately deterministic — a fixed sequence rather than random — because
 * these tests are about *interruption*, and a test that varies its input as
 * well as its failure point cannot tell you which one broke it. The property
 * tests in `packages/core` cover randomised input; this file holds it still.
 */
async function writeSession(count: number): Promise<number> {
	const sequencer = new Sequencer(client);
	await sequencer.start();

	let at = 1_700_000_000_000;
	const send = (body: Command) => sequencer.append(body, (at += 10), CURRENT_VERSION);

	await send({
		kind: 'list_instrument',
		firmId: asFirmId('venue'),
		actorId: OPERATOR,
		instrumentId: VOD,
		name: 'Vodafone',
		currency: 'GBP',
		tickSize: 25,
		lotSize: 1,
		referencePrice: price(455_000)
	});

	await send({
		kind: 'set_phase',
		firmId: asFirmId('venue'),
		actorId: OPERATOR,
		instrumentId: VOD,
		phase: 'continuous',
		reason: 'open'
	});

	for (let index = 0; index < count; index += 1) {
		// Alternating sides that cross often enough to produce trades, fills and
		// partial fills — the states that make replay non-trivial.
		const buying = index % 2 === 0;

		await send(
			order({
				firm: buying ? NORTH : LOW,
				account: buying ? 'northgate-equities' : 'lowfield-main',
				side: buying ? 'buy' : 'sell',
				at: 455_000 + (index % 5) * 25 - (buying ? 0 : 50),
				qty: 100 + (index % 7) * 10
			})
		);
	}

	return sequencer.nextSeq - 1;
}

/**
 * Run the engine until it has applied up to `target`, then stop.
 *
 * ## Two details that took a failing test to find
 *
 * `batchSize: 1`, because `onProgress` fires once per **batch**. At the default
 * of 200 the first callback already reports the whole session applied, and
 * "stop half way" stops at the end — a test that looked like it was exercising
 * an interruption and was exercising nothing.
 *
 * And the early return, because `runEngine` only calls `onProgress` when it
 * actually applied something. Ask it to run to a target already passed and it
 * finds no commands, sleeps, finds none again, and never fires the callback
 * that would abort it. The loop is behaving correctly; the caller is waiting
 * for an event that cannot happen.
 */
async function runUntil(target: number, on: Client = client): Promise<void> {
	if ((await readCheckpoint(on, 'engine')) >= target) return;

	const controller = new AbortController();

	await runEngine(on, {
		signal: controller.signal,
		idleMs: 1,
		batchSize: 1,
		onProgress: ({ lastSeq }) => {
			if (lastSeq >= target) controller.abort();
		}
	});
}

/* -------------------------------------------------------------------------- */
/* Killed mid-session                                                          */
/* -------------------------------------------------------------------------- */

describe('an engine killed part way through', () => {
	it('resumes from its checkpoint and misses nothing', async () => {
		const last = await writeSession(40);

		// Stop half way, as if the process were killed.
		await runUntil(20);
		const halfway = await readCheckpoint(client, 'engine');
		expect(halfway).toBeGreaterThanOrEqual(20);
		expect(halfway).toBeLessThan(last);

		// A fresh engine, same database.
		await runUntil(last);

		expect(await readCheckpoint(client, 'engine')).toBe(last);
		await expect(assertNoGaps(client)).resolves.toBeUndefined();
	});

	it('arrives at the same state as one that was never interrupted', async () => {
		const last = await writeSession(40);

		// Interrupted twice.
		await runUntil(12);
		await runUntil(31);
		await runUntil(last);

		const interrupted = fingerprint((await recover(client)).state);

		/*
		 * A second venue, same commands, no interruption.
		 *
		 * The fingerprints must match exactly. "Roughly the same book" is not a
		 * property — it is the absence of one.
		 */
		const other = await openStore({ url: `file:${join(directory, 'other.db')}` });
		await copyCommands(client, other);
		await runOn(other, last);

		expect(fingerprint((await recover(other)).state)).toBe(interrupted);
		other.close();
	});

	it('never applies a command twice, however often it is interrupted', async () => {
		const last = await writeSession(30);

		/*
		 * Stop and start on every single command — the worst case for a checkpoint
		 * written outside the transaction that produced its events.
		 *
		 * Deliberately a small session: this is 30 full engine starts, each with a
		 * recovery, and the point is the *number of interruptions* rather than the
		 * volume of trading.
		 */
		for (let target = 1; target <= last; target += 1) await runUntil(target);

		await catchUp(client);

		/*
		 * Every order id is derived from its command's sequence number, so a
		 * command applied twice would produce a duplicate order id — and the
		 * primary key would have caught it. What this actually proves is that
		 * `filled` was not double counted, which nothing structural prevents.
		 */
		const orders = await client.execute(
			'SELECT COUNT(*) AS n, SUM(filled > quantity) AS overfilled FROM order_record'
		);

		expect(Number(orders.rows[0]?.['overfilled'] ?? 0)).toBe(0);
		expect((await trialBalance(client)).total).toBe(0);
	});
});

/* -------------------------------------------------------------------------- */
/* Snapshots                                                                   */
/* -------------------------------------------------------------------------- */

describe('the snapshot is an optimisation, not a source of truth', () => {
	it('recovers with no snapshot at all', async () => {
		const last = await writeSession(30);
		await runUntil(last);

		const withSnapshot = fingerprint((await recover(client)).state);

		await client.execute('DELETE FROM engine_snapshot');

		expect(fingerprint((await recover(client)).state)).toBe(withSnapshot);
	});

	it('recovers when the snapshot is corrupt', async () => {
		const last = await writeSession(30);
		await runUntil(last);

		const expected = fingerprint((await recover(client)).state);

		await client.execute({
			sql: `INSERT INTO engine_snapshot (seq, taken_at, version, fingerprint, body)
			      VALUES (?, ?, ?, ?, ?)
			      ON CONFLICT (seq) DO UPDATE SET body = excluded.body`,
			args: [last, 0, CURRENT_VERSION, 'not-the-real-fingerprint', '{"books":"nonsense"}']
		});

		/*
		 * The whole promise of "the log is the system of record" is that a bad
		 * snapshot costs replay time rather than correctness. If this test can be
		 * made to fail, the venue has quietly started depending on its cache.
		 */
		expect(fingerprint((await recover(client)).state)).toBe(expected);
	});

	it('proves the replay matches, rather than assuming it', async () => {
		const last = await writeSession(25);
		await runUntil(last);

		const check = await verifyRecovery(client);

		expect(check.ok, `${check.fromSnapshot} vs ${check.fromGenesis}`).toBe(true);
	});

	it('has a snapshot to ignore in the first place', async () => {
		const last = await writeSession(30);
		await runUntil(last);

		/*
		 * Without this, the two tests above pass trivially: if the engine never
		 * wrote a snapshot, "recovers without one" and "recovers from a corrupt
		 * one" are both testing the same empty path, and the suite is green while
		 * proving nothing.
		 *
		 * `runEngine` writes one on clean shutdown, so there must be one here.
		 */
		const snapshot = await loadSnapshot(client);

		expect(snapshot).toBeDefined();
		expect(snapshot!.fingerprint).toMatch(/^[0-9a-f]+$/);
	});
});

/* -------------------------------------------------------------------------- */
/* Two writers                                                                 */
/* -------------------------------------------------------------------------- */

describe('a second sequencer', () => {
	it('is caught rather than silently interleaving', async () => {
		const mine = new Sequencer(client);
		await mine.start();
		await mine.append(
			order({ firm: NORTH, account: 'northgate-equities', side: 'buy', at: 455_000, qty: 100 }),
			1_000,
			CURRENT_VERSION
		);

		/*
		 * The botched deploy: the new process starts before the old one has
		 * finished shutting down, and for a few seconds both hold a sequencer.
		 *
		 * Two writers assigning sequence numbers means the log interleaves two
		 * ideas of the order, and no replay reproduces either. It is the one
		 * failure this architecture cannot survive, so it is checked on every
		 * append rather than at startup — the failure appears mid-life.
		 */
		const theirs = new Sequencer(client);
		await theirs.start();
		await theirs.append(
			order({ firm: LOW, account: 'lowfield-main', side: 'sell', at: 454_000, qty: 100 }),
			1_001,
			CURRENT_VERSION
		);

		await expect(mine.assertSoleWriter()).rejects.toThrow(/Two sequencers are running/);
	});
});

/* -------------------------------------------------------------------------- */
/* The projector                                                               */
/* -------------------------------------------------------------------------- */

describe('a projector that keeps being restarted', () => {
	it('arrives at the same read models as one that ran straight through', async () => {
		const last = await writeSession(30);
		await runUntil(last);

		// One batch at a time, as if killed after every batch.
		let applied: number;
		do {
			applied = await catchUp(client, 3);
		} while (applied > 0);

		const stuttered = await snapshotOfReadModels(client);

		// A clean venue, same commands, projected in one go.
		const other = await openStore({ url: `file:${join(directory, 'clean.db')}` });
		await copyCommands(client, other);
		await runOn(other, last);
		await catchUp(other);

		expect(await snapshotOfReadModels(other)).toEqual(stuttered);
		other.close();
	});

	it('leaves the books balanced whatever the batch size', async () => {
		const last = await writeSession(40);
		await runUntil(last);

		for (const size of [1, 2, 7, 500]) {
			await client.execute({
				sql: 'DELETE FROM consumer_checkpoint WHERE consumer = ?',
				args: ['projections']
			});
			for (const table of [
				'ledger_posting',
				'ledger_transaction',
				'ledger_account',
				'position',
				'trade',
				'order_record'
			]) {
				await client.execute(`DELETE FROM ${table}`);
			}

			let applied: number;
			do {
				applied = await catchUp(client, size);
			} while (applied > 0);

			expect((await trialBalance(client)).total, `batch size ${size}`).toBe(0);
		}
	});
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Copy the command log verbatim into a second venue. */
async function copyCommands(from: Client, to: Client): Promise<void> {
	const rows = await from.execute(
		'SELECT seq, received_at, version, kind, firm_id, body FROM command_log ORDER BY seq'
	);

	for (const row of rows.rows) {
		await to.execute({
			sql: `INSERT INTO command_log (seq, received_at, version, kind, firm_id, body)
			      VALUES (?, ?, ?, ?, ?, ?)`,
			args: [
				Number(row['seq']),
				Number(row['received_at']),
				Number(row['version']),
				String(row['kind']),
				String(row['firm_id']),
				String(row['body'])
			]
		});
	}
}

const runOn = (target: Client, upTo: number) => runUntil(upTo, target);

/** Everything the read models hold, in a comparable shape. */
async function snapshotOfReadModels(target: Client) {
	const tables = ['trade', 'position', 'order_record', 'ledger_transaction', 'ledger_posting'];
	const out: Record<string, unknown[]> = {};

	for (const table of tables) {
		const order = table === 'ledger_posting' ? 'transaction_id, account_id, amount' : 'rowid';
		const result = await target.execute(`SELECT * FROM ${table} ORDER BY ${order}`);

		out[table] = result.rows.map((row) => {
			// The autoincrement surrogate differs between runs and means nothing.
			// Compare meaning, not identity — unless the identity is derived, which
			// is why order and trade ids come from the sequence number.
			const { posting_id: _ignored, ...rest } = { ...row } as Record<string, unknown>;
			return rest;
		});
	}

	return out;
}
