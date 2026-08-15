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
	price,
	quantity,
	CURRENT_VERSION,
	SUPPORTED_VERSIONS,
	type Command
} from '@sequent/protocol';
import { openStore, readCheckpoint, readEvents, Sequencer } from '@sequent/store';
import { implementedVersions, rulesFor } from './rules.ts';
import { fingerprint, loadSnapshot, writeSnapshot } from './snapshot.ts';
import { recover, replayFromGenesis, verifyRecovery } from './recover.ts';
import { runEngine } from './loop.ts';

/**
 * Recovery.
 *
 * These are the tests that decide whether the architecture is real. Everything
 * this system claims — replay any moment, prove any fill, survive a crash
 * without losing or duplicating a trade — is a claim about this file.
 */

let client: Client;
let directory: string;

const VOD = asInstrumentId('VOD.L');
const ADMIN = asUserId('venue-admin');
const FIRM_A = asFirmId('firm-a');
const FIRM_B = asFirmId('firm-b');

let clientOrderCounter = 0;

function orderCommand(side: 'buy' | 'sell', at: number, qty: number, firm = FIRM_A): Command {
	clientOrderCounter += 1;
	return {
		kind: 'place_order',
		firmId: firm,
		actorId: asUserId('trader'),
		accountId: asAccountId(`${firm}-main`),
		instrumentId: VOD,
		clientOrderId: asClientOrderId(`C${clientOrderCounter}`),
		side,
		orderType: 'limit',
		price: price(at),
		quantity: quantity(qty),
		timeInForce: 'gtc',
		selfTradePrevention: 'cancel_both'
	};
}

/** Write a realistic session to the command log, without running the engine. */
async function writeSession(): Promise<Sequencer> {
	const sequencer = new Sequencer(client);
	await sequencer.start();

	let at = 1_700_000_000_000;
	const send = (body: Command) => sequencer.append(body, (at += 1), CURRENT_VERSION);

	await send({
		kind: 'list_instrument',
		firmId: FIRM_A,
		actorId: ADMIN,
		instrumentId: VOD,
		name: 'Vodafone Group',
		currency: 'GBP',
		tickSize: 25,
		lotSize: 1,
		referencePrice: price(455_000)
	});
	await send({
		kind: 'set_phase',
		firmId: FIRM_A,
		actorId: ADMIN,
		instrumentId: VOD,
		phase: 'continuous',
		reason: 'open'
	});

	// A book with depth on both sides, and a trade through it.
	await send(orderCommand('sell', 455_100, 100));
	await send(orderCommand('sell', 455_050, 200));
	await send(orderCommand('buy', 454_900, 150, FIRM_B));
	await send(orderCommand('buy', 455_075, 250, FIRM_B));
	await send(orderCommand('sell', 455_000, 80));

	return sequencer;
}

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-engine-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });
	clientOrderCounter = 0;
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */

describe('versioned rules', () => {
	it('has an implementation for every version the protocol says is supported', () => {
		// Deleting a rule version makes a stretch of history unreplayable, which
		// is data loss with no error message. This turns it into a failing build.
		expect(implementedVersions()).toEqual([...SUPPORTED_VERSIONS]);
	});

	it('refuses to guess at an unknown version', () => {
		// Falling back to today's rules would produce a plausible, confident,
		// wrong replay. Refusing is the feature.
		expect(() => rulesFor(99)).toThrow(/cannot replay/);
	});
});

describe('replaying from genesis', () => {
	it('rebuilds the venue from the command log alone', async () => {
		await writeSession();

		const { state, replayed } = await replayFromGenesis(client);

		expect(replayed).toBe(7);
		expect(state.instruments.get(VOD)!.phase).toBe('continuous');
		// The 455,000 sell took the 455,075 bid, leaving the rest resting.
		expect(state.orders.size).toBeGreaterThan(0);
	});

	it('answers "what did the book look like at sequence N"', async () => {
		await writeSession();

		const early = await replayFromGenesis(client, 4);
		const late = await replayFromGenesis(client);

		// Not an approximation and not a reconstruction from projections — the
		// same objects the live engine held at that point in the sequence.
		expect(early.state.lastSeq).toBe(4);
		expect(early.state.orders.size).toBeLessThan(late.state.orders.size);
	});

	it('produces the same fingerprint every time', async () => {
		await writeSession();

		const first = await replayFromGenesis(client);
		const second = await replayFromGenesis(client);

		expect(first.fingerprint).toBe(second.fingerprint);
	});
});

describe('snapshots are only ever an optimisation', () => {
	it('recovers identically with and without one', async () => {
		await writeSession();

		const fromGenesis = await replayFromGenesis(client);
		await writeSnapshot(client, fromGenesis.state, CURRENT_VERSION, 1_700_000_000_100);

		const fromSnapshot = await recover(client);

		expect(fromSnapshot.fingerprint).toBe(fromGenesis.fingerprint);
		// And it really did take the short path.
		expect(fromSnapshot.from).toBeGreaterThan(0);
		expect(fromSnapshot.replayed).toBe(0);
	});

	it('still recovers when every snapshot is deleted', async () => {
		await writeSession();
		const before = await replayFromGenesis(client);
		await writeSnapshot(client, before.state, CURRENT_VERSION, 1_700_000_000_100);

		await client.execute('DELETE FROM engine_snapshot');

		// The log is sufficient on its own. This is the property that keeps the
		// snapshot from quietly becoming the system of record.
		const after = await recover(client);
		expect(after.fingerprint).toBe(before.fingerprint);
		expect(after.from).toBe(0);
	});

	it('ignores a corrupt snapshot and takes the slow path', async () => {
		await writeSession();
		const good = await replayFromGenesis(client);
		await writeSnapshot(client, good.state, CURRENT_VERSION, 1_700_000_000_100);

		// Tamper with the body so it no longer matches its own fingerprint.
		await client.execute({
			sql: `UPDATE engine_snapshot SET body = json_set(body, '$.now', 1) WHERE seq = ?`,
			args: [good.state.lastSeq]
		});

		const recovered = await recover(client);

		// Shrugged, threw it away, replayed. A system that treated the snapshot as
		// authoritative would have had to stop here and page somebody.
		expect(recovered.fingerprint).toBe(good.fingerprint);
		expect(recovered.from).toBe(0);
	});

	it('verifies the two paths agree', async () => {
		await writeSession();
		const state = (await replayFromGenesis(client)).state;
		await writeSnapshot(client, state, CURRENT_VERSION, 1_700_000_000_100);

		const check = await verifyRecovery(client);

		expect(check.ok).toBe(true);
		expect(check.fromSnapshot).toBe(check.fromGenesis);
	});

	it('rebuilds books with queue order intact', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		let at = 1_700_000_000_000;
		const send = (body: Command) => sequencer.append(body, (at += 1), CURRENT_VERSION);

		await send({
			kind: 'list_instrument',
			firmId: FIRM_A,
			actorId: ADMIN,
			instrumentId: VOD,
			name: 'Vodafone Group',
			currency: 'GBP',
			tickSize: 25,
			lotSize: 1,
			referencePrice: price(455_000)
		});
		await send({
			kind: 'set_phase',
			firmId: FIRM_A,
			actorId: ADMIN,
			instrumentId: VOD,
			phase: 'continuous',
			reason: 'open'
		});

		// Three orders at one price. Their order in the queue is the venue's
		// central promise, and it has to survive a restart.
		await send(orderCommand('buy', 455_000, 10));
		await send(orderCommand('buy', 455_000, 20));
		await send(orderCommand('buy', 455_000, 30));

		const live = await replayFromGenesis(client);
		await writeSnapshot(client, live.state, CURRENT_VERSION, at);

		const restored = await loadSnapshot(client);
		const queue = restored!.state.instruments.get(VOD)!.book.bids[0]!.orders;

		expect(queue.map((order) => order.remaining)).toEqual([10, 20, 30]);
		expect(fingerprint(restored!.state)).toBe(live.fingerprint);
	});
});

describe('the engine loop', () => {
	it('drains the command log into the event log', async () => {
		await writeSession();

		const controller = new AbortController();
		const engine = runEngine(client, {
			signal: controller.signal,
			idleMs: 1,
			onProgress: ({ lastSeq }) => {
				if (lastSeq >= 7) controller.abort();
			}
		});

		await engine;

		expect(await readCheckpoint(client, 'engine')).toBe(7);
		const events = await readEvents(client, 0);
		expect(events.length).toBeGreaterThan(0);
		// Every event points at the command that caused it.
		for (const event of events) expect(event.causedBy).toBeGreaterThan(0);
	});

	it('resumes where it left off without duplicating events', async () => {
		await writeSession();

		// First run: stop after the first batch.
		const first = new AbortController();
		await runEngine(client, {
			signal: first.signal,
			idleMs: 1,
			batchSize: 3,
			onProgress: () => first.abort()
		});

		const afterFirst = await readEvents(client, 0);
		const checkpointAfterFirst = await readCheckpoint(client, 'engine');
		expect(checkpointAfterFirst).toBeGreaterThan(0);
		expect(checkpointAfterFirst).toBeLessThan(7);

		// Second run: a fresh process, same log.
		const second = new AbortController();
		await runEngine(client, {
			signal: second.signal,
			idleMs: 1,
			onProgress: ({ lastSeq }) => {
				if (lastSeq >= 7) second.abort();
			}
		});

		const afterSecond = await readEvents(client, 0);

		expect(await readCheckpoint(client, 'engine')).toBe(7);
		// The events from the first run are still there, exactly once, and the
		// second run only added what came after them.
		expect(afterSecond.slice(0, afterFirst.length)).toEqual(afterFirst);
		expect(new Set(afterSecond.map((e) => e.seq)).size).toBe(afterSecond.length);
	});

	it('produces the same events whether it ran in one pass or several', async () => {
		await writeSession();

		const runToEnd = async (batchSize: number) => {
			const controller = new AbortController();
			await runEngine(client, {
				signal: controller.signal,
				idleMs: 1,
				batchSize,
				onProgress: ({ lastSeq }) => {
					if (lastSeq >= 7) controller.abort();
				}
			});
			return (await readEvents(client, 0)).map((record) => record.body);
		};

		const inChunks = await runToEnd(2);

		// Rebuild the same log in a second database and run it in one go.
		const otherDirectory = await mkdtemp(join(tmpdir(), 'sequent-engine-b-'));
		const other = await openStore({ url: `file:${join(otherDirectory, 'test.db')}` });

		try {
			const commands = await client.execute('SELECT seq, received_at, version, kind, firm_id, body FROM command_log ORDER BY seq');
			for (const row of commands.rows) {
				await other.execute({
					sql: `INSERT INTO command_log (seq, received_at, version, kind, firm_id, body) VALUES (?, ?, ?, ?, ?, ?)`,
					args: [row['seq'], row['received_at'], row['version'], row['kind'], row['firm_id'], row['body']] as never[]
				});
			}

			const controller = new AbortController();
			await runEngine(other, {
				signal: controller.signal,
				idleMs: 1,
				batchSize: 500,
				onProgress: ({ lastSeq }) => {
					if (lastSeq >= 7) controller.abort();
				}
			});

			const inOne = (await readEvents(other, 0)).map((record) => record.body);

			// Batch size is an efficiency knob and must not be observable in the
			// output. If it were, the venue's behaviour would depend on how busy it
			// happened to be.
			expect(JSON.stringify(inChunks)).toBe(JSON.stringify(inOne));
		} finally {
			other.close();
			await rm(otherDirectory, { recursive: true, force: true });
		}
	});
});
