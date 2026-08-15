import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { asClientOrderId, asFirmId, asInstrumentId, asUserId, asAccountId, price, quantity, type Command, type Event } from '@sequent/protocol';
import { openStore } from './client.ts';
import {
	appendEvents,
	assertNoGaps,
	checkpointIn,
	readCheckpoint,
	readCommands,
	readEvents,
	Sequencer,
	tailEvents
} from './log.ts';

/**
 * The log.
 *
 * These tests are about durability and ordering rather than trading. Every one
 * of them describes a failure that is silent in production: a gap nobody
 * notices, a checkpoint that moved without its rows, a second writer nobody
 * knew had started.
 */

let client: Client;
let directory: string;

const FIRM = asFirmId('firm-a');

const order = (n: number): Command => ({
	kind: 'place_order',
	firmId: FIRM,
	actorId: asUserId('trader'),
	accountId: asAccountId('acc-a'),
	instrumentId: asInstrumentId('VOD.L'),
	clientOrderId: asClientOrderId(`C${n}`),
	side: 'buy',
	orderType: 'limit',
	price: price(455_000),
	quantity: quantity(100),
	timeInForce: 'gtc',
	selfTradePrevention: 'cancel_both'
});

const accepted = (n: number): Event => ({
	kind: 'order_accepted',
	firmId: FIRM,
	accountId: asAccountId('acc-a'),
	instrumentId: asInstrumentId('VOD.L'),
	orderId: `O-${n}` as never,
	clientOrderId: asClientOrderId(`C${n}`),
	side: 'buy',
	price: price(455_000),
	quantity: quantity(100),
	timeInForce: 'gtc',
	queuePosition: 1
});

beforeEach(async () => {
	/*
	 * A temporary file, not `:memory:`.
	 *
	 * This cost an afternoon and is worth knowing. libSQL's `transaction()`
	 * checks out a **second connection**, and a second connection to
	 * `:memory:` is a different, empty database — so every test that opened a
	 * transaction failed with "no such table: event_log" while the tables were
	 * demonstrably there on the first connection.
	 *
	 * The symptom is confusing enough to be worth the extra four lines: the
	 * schema applies, simple queries work, and only the transactional paths
	 * fail. A file is shared by every connection and behaves like production.
	 */
	directory = await mkdtemp(join(tmpdir(), 'sequent-log-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

describe('the sequencer', () => {
	it('assigns sequence numbers from one, with no gaps', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();

		const first = await sequencer.append(order(1), 1_000, 1);
		const second = await sequencer.append(order(2), 1_001, 1);

		expect(first.seq).toBe(1);
		expect(second.seq).toBe(2);
		await expect(assertNoGaps(client)).resolves.toBeUndefined();
	});

	it('resumes from the high-water mark after a restart', async () => {
		const first = new Sequencer(client);
		await first.start();
		await first.append(order(1), 1_000, 1);
		await first.append(order(2), 1_001, 1);

		// A fresh process, same database.
		const second = new Sequencer(client);
		await second.start();

		expect((await second.append(order(3), 1_002, 1)).seq).toBe(3);
	});

	it('refuses to continue when a second writer has appended', async () => {
		const mine = new Sequencer(client);
		await mine.start();
		await mine.append(order(1), 1_000, 1);

		// Somebody else's process, writing to the same log — the classic botched
		// deploy where the new instance starts before the old one has stopped.
		const theirs = new Sequencer(client);
		await theirs.start();
		await theirs.append(order(2), 1_001, 1);

		await expect(mine.assertSoleWriter()).rejects.toThrow(/Two sequencers are running/);
	});

	it('reads commands back in order', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		for (let n = 1; n <= 5; n += 1) await sequencer.append(order(n), 1_000 + n, 1);

		const back = await readCommands(client, 0);

		expect(back.map((record) => record.seq)).toEqual([1, 2, 3, 4, 5]);
		expect(back[0]!.body.kind).toBe('place_order');
		expect(back[0]!.receivedAt).toBe(1_001);
	});

	it('reads only what a consumer has not seen', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		for (let n = 1; n <= 5; n += 1) await sequencer.append(order(n), 1_000 + n, 1);

		expect((await readCommands(client, 3)).map((r) => r.seq)).toEqual([4, 5]);
	});
});

describe('the sequencer refuses malformed commands', () => {
	/*
	 * The log is append-only and enforced by a trigger, so a bad row can never be
	 * corrected or deleted. It sits there being replayed by every recovery,
	 * forever. That asymmetry — cheap to check, impossible to undo — is why the
	 * command is parsed again here even though the gateway already parsed it.
	 *
	 * This is not hypothetical. A drill script sent `firmId` where the schema
	 * wanted `targetFirmId`; it wrote happily, the engine produced an event with
	 * an `undefined` field, and a worker three layers downstream retried it six
	 * times reporting "undefined cannot be passed as argument to the database".
	 */

	it('rejects a command missing a required field', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();

		// Exactly the drill script's mistake: the kill switch names its target as
		// `targetFirmId`, not `firmId`.
		const wrong = {
			kind: 'set_kill_switch',
			firmId: asFirmId('firm-a'),
			actorId: asUserId('u1'),
			engaged: true,
			reason: 'drill'
		} as unknown as Command;

		await expect(sequencer.append(wrong, 1_000, 1)).rejects.toThrow(/malformed command/);
	});

	it('leaves the log untouched when it refuses', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();

		await sequencer.append(order(1), 1_000, 1);
		await expect(
			sequencer.append({ kind: 'nonsense' } as unknown as Command, 1_001, 1)
		).rejects.toThrow();

		// And the sequence number is not burnt: the next good command takes 2.
		expect((await sequencer.append(order(2), 1_002, 1)).seq).toBe(2);
		await expect(assertNoGaps(client)).resolves.toBeUndefined();
	});

	it('still accepts a valid command', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();

		await expect(sequencer.append(order(1), 1_000, 1)).resolves.toMatchObject({ seq: 1 });
	});
});

describe('the log is append-only', () => {
	it('refuses an update', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		await sequencer.append(order(1), 1_000, 1);

		// Not a policy — a trigger. "We agreed not to" is not an enforcement
		// mechanism, and the one time it matters is during an outage at 3am.
		await expect(
			client.execute({ sql: 'UPDATE command_log SET received_at = ? WHERE seq = 1', args: [9] })
		).rejects.toThrow(/append-only/);
	});

	it('refuses a delete', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		await sequencer.append(order(1), 1_000, 1);

		await expect(client.execute('DELETE FROM command_log WHERE seq = 1')).rejects.toThrow(
			/append-only/
		);
	});

	it('notices a gap in the sequence', async () => {
		// Reach past the sequencer to create the hole a crash between assigning a
		// number and committing it would leave.
		await client.execute({
			sql: `INSERT INTO command_log (seq, received_at, version, kind, firm_id, body) VALUES (1, 1, 1, 'tick', 'f', '{}')`
		});
		await client.execute({
			sql: `INSERT INTO command_log (seq, received_at, version, kind, firm_id, body) VALUES (3, 1, 1, 'tick', 'f', '{}')`
		});

		await expect(assertNoGaps(client)).rejects.toThrow(/gaps/);
	});
});

describe('events and checkpoints', () => {
	it('writes events and the checkpoint in one transaction', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		const command = await sequencer.append(order(1), 1_000, 1);

		await appendEvents(client, 'engine', command.seq, 1_000, 1, [accepted(1), accepted(2)]);

		expect((await readEvents(client, 0)).map((r) => r.causedBy)).toEqual([1, 1]);
		expect(await readCheckpoint(client, 'engine')).toBe(1);
	});

	it('leaves nothing behind when the transaction fails', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		await sequencer.append(order(1), 1_000, 1);

		// `caused_by` has a foreign key, so an event pointing at a command that
		// does not exist cannot commit. The point of the test is what happens to
		// the *checkpoint*: it must not move either.
		await expect(
			appendEvents(client, 'engine', 999, 1_000, 1, [accepted(1)])
		).rejects.toThrow();

		expect(await readEvents(client, 0)).toHaveLength(0);
		expect(await readCheckpoint(client, 'engine')).toBe(0);
	});

	it('lets a projector checkpoint alongside its own writes', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		await sequencer.append(order(1), 1_000, 1);

		const tx = await client.transaction('write');
		await tx.execute(`CREATE TABLE IF NOT EXISTS demo_projection (id INTEGER PRIMARY KEY)`);
		await tx.execute(`INSERT INTO demo_projection (id) VALUES (1)`);
		await checkpointIn(tx, 'demo', 1, 1_000);
		await tx.commit();

		expect(await readCheckpoint(client, 'demo')).toBe(1);
	});

	it('starts a consumer that has never run at zero', async () => {
		expect(await readCheckpoint(client, 'never-seen')).toBe(0);
	});

	it('advances a checkpoint rather than duplicating it', async () => {
		const tx1 = await client.transaction('write');
		await checkpointIn(tx1, 'demo', 5, 1);
		await tx1.commit();

		const tx2 = await client.transaction('write');
		await checkpointIn(tx2, 'demo', 9, 2);
		await tx2.commit();

		expect(await readCheckpoint(client, 'demo')).toBe(9);
	});
});

describe('tailing', () => {
	it('yields batches and stops when the caller gives up', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();
		const command = await sequencer.append(order(1), 1_000, 1);
		await appendEvents(client, 'engine', command.seq, 1_000, 1, [accepted(1), accepted(2)]);

		const controller = new AbortController();
		const seen: number[] = [];

		for await (const batch of tailEvents(client, 0, { signal: controller.signal, idleMs: 1 })) {
			seen.push(...batch.map((record) => record.seq));
			// One batch is enough for the assertion; abort ends the generator's
			// `finally` and the loop.
			controller.abort();
		}

		expect(seen).toEqual([1, 2]);
	});

	it('picks up events appended after it started following', async () => {
		const sequencer = new Sequencer(client);
		await sequencer.start();

		const controller = new AbortController();
		const seen: number[] = [];

		const following = (async () => {
			for await (const batch of tailEvents(client, 0, { signal: controller.signal, idleMs: 1 })) {
				seen.push(...batch.map((record) => record.seq));
				if (seen.length >= 2) controller.abort();
			}
		})();

		const first = await sequencer.append(order(1), 1_000, 1);
		await appendEvents(client, 'engine', first.seq, 1_000, 1, [accepted(1)]);
		const second = await sequencer.append(order(2), 1_001, 1);
		await appendEvents(client, 'engine', second.seq, 1_001, 1, [accepted(2)]);

		await following;

		expect(seen).toEqual([1, 2]);
	});
});
