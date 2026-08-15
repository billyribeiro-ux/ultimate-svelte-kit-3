import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { openStore, withTransaction } from './client.ts';
import {
	backoffMs,
	claim,
	deadLetters,
	enqueue,
	fail,
	prune,
	revive,
	stats,
	succeed,
	type OutboxMessage
} from './outbox.ts';

/**
 * The outbox.
 *
 * The tests that matter most are the ones about *failure*: a worker that dies
 * holding messages, a receiver that is down, a message that will never succeed.
 * The happy path is four lines and works the first time; everything expensive
 * is in what happens when it does not.
 */

let client: Client;
let directory: string;

const T0 = 1_700_000_000_000;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-outbox-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

/** Enqueue outside a caller's transaction, for tests that do not need atomicity. */
async function add(message: Partial<OutboxMessage> & { idempotencyKey: string }, now = T0) {
	await withTransaction(client, (tx) =>
		enqueue(
			tx,
			{
				kind: 'webhook',
				seq: 1,
				firmId: 'firm-a',
				payload: { hello: 'world' },
				...message
			},
			now
		)
	);
}

describe('enqueuing', () => {
	it('makes a message claimable', async () => {
		await add({ idempotencyKey: 'k1' });

		const claimed = await claim(client, 'worker-1', { now: T0 });

		expect(claimed).toHaveLength(1);
		expect(claimed[0]?.payload).toEqual({ hello: 'world' });
	});

	it('ignores a duplicate idempotency key', async () => {
		await add({ idempotencyKey: 'same' });
		await add({ idempotencyKey: 'same' });

		/*
		 * The property the whole design rests on. A projector is re-run after every
		 * crash, so the same event is enqueued again — and without this, every
		 * restart re-notifies every firm about the last batch of trades.
		 */
		expect(await claim(client, 'worker-1', { now: T0 })).toHaveLength(1);
	});

	it('is atomic with the caller´s transaction', async () => {
		await withTransaction(client, async (tx) => {
			await enqueue(tx, { kind: 'webhook', seq: 1, idempotencyKey: 'rolled-back', payload: {} }, T0);
			throw new Error('deliberate rollback');
		}).catch(() => {});

		// The point of taking a Transaction rather than a Client: if the caller's
		// work does not commit, neither does the intent to notify about it.
		expect(await claim(client, 'worker-1', { now: T0 })).toHaveLength(0);
	});
});

describe('claiming', () => {
	it('does not hand the same message to two workers', async () => {
		await add({ idempotencyKey: 'k1' });

		const first = await claim(client, 'worker-1', { now: T0 });
		const second = await claim(client, 'worker-2', { now: T0 });

		expect(first).toHaveLength(1);
		expect(second).toHaveLength(0);
	});

	it('releases a dead worker´s messages when the lease expires', async () => {
		await add({ idempotencyKey: 'k1' });
		await claim(client, 'worker-1', { now: T0, leaseMs: 30_000 });

		// worker-1 has died. Nothing detected it, nothing reaped it — the lease
		// simply ran out, and that is the entire recovery mechanism.
		const recovered = await claim(client, 'worker-2', { now: T0 + 30_001 });

		expect(recovered).toHaveLength(1);
		expect(recovered[0]?.attempts).toBe(2);
	});

	it('does not release before the lease expires', async () => {
		await add({ idempotencyKey: 'k1' });
		await claim(client, 'worker-1', { now: T0, leaseMs: 30_000 });

		expect(await claim(client, 'worker-2', { now: T0 + 29_999 })).toHaveLength(0);
	});

	it('respects the limit', async () => {
		for (let index = 0; index < 10; index += 1) await add({ idempotencyKey: `k${index}` });

		expect(await claim(client, 'worker-1', { now: T0, limit: 3 })).toHaveLength(3);
	});

	it('filters by kind, so one sink cannot starve another', async () => {
		await add({ idempotencyKey: 'w1', kind: 'webhook' });
		await add({ idempotencyKey: 'e1', kind: 'email' });

		const emails = await claim(client, 'mailer', { now: T0, kind: 'email' });

		expect(emails).toHaveLength(1);
		expect(emails[0]?.kind).toBe('email');
	});

	it('will not claim a message that is not available yet', async () => {
		await add({ idempotencyKey: 'k1' });
		const [message] = await claim(client, 'worker-1', { now: T0 });
		await fail(client, message!, 'receiver down', { now: T0, random: () => 1 });

		// Backed off. A worker polling immediately must not pick it straight back
		// up, or the backoff is decorative.
		expect(await claim(client, 'worker-1', { now: T0 + 1 })).toHaveLength(0);
	});

	it('never claims a delivered message', async () => {
		await add({ idempotencyKey: 'k1' });
		const [message] = await claim(client, 'worker-1', { now: T0 });
		await succeed(client, message!.outboxId, T0);

		expect(await claim(client, 'worker-1', { now: T0 + 1_000_000 })).toHaveLength(0);
	});
});

describe('backoff', () => {
	it('grows exponentially', async () => {
		// `random: () => 1` takes the top of the jitter window, which is the
		// exponential value itself.
		expect(backoffMs(1, () => 1)).toBe(2000);
		expect(backoffMs(2, () => 1)).toBe(4000);
		expect(backoffMs(3, () => 1)).toBe(8000);
	});

	it('is capped', async () => {
		expect(backoffMs(50, () => 1)).toBe(60 * 60_000);
	});

	it('is jittered', async () => {
		/*
		 * Without jitter, every message that failed together retries together: the
		 * receiver comes back up, is hit by the entire backlog in one burst, falls
		 * over, and the cycle repeats. The retry policy becomes the outage.
		 */
		const samples = new Set(Array.from({ length: 50 }, () => backoffMs(5)));

		expect(samples.size).toBeGreaterThan(40);
		expect(Math.max(...samples)).toBeLessThanOrEqual(32_000);
	});
});

describe('failing', () => {
	it('schedules a retry', async () => {
		await add({ idempotencyKey: 'k1' });
		const [message] = await claim(client, 'worker-1', { now: T0 });

		const outcome = await fail(client, message!, 'HTTP 503', { now: T0, random: () => 1 });

		expect(outcome.retrying).toBe(true);
		expect(await claim(client, 'worker-1', { now: outcome.nextAttemptAt! })).toHaveLength(1);
	});

	it('gives up after the maximum, and says why', async () => {
		await add({ idempotencyKey: 'k1' });

		let attempts = 0;
		for (let round = 0; round < 9; round += 1) {
			const [message] = await claim(client, 'worker-1', { now: T0 + round * 3_600_000 });
			if (!message) break;
			attempts = message.attempts;
			await fail(client, message, `attempt ${message.attempts} failed`, {
				now: T0 + round * 3_600_000
			});
		}

		expect(attempts).toBe(8);

		const dead = await deadLetters(client);
		expect(dead).toHaveLength(1);
		expect(dead[0]?.lastError).toContain('attempt 8 failed');
	});

	it('keeps the row when it gives up', async () => {
		await add({ idempotencyKey: 'k1' });
		const [message] = await claim(client, 'worker-1', { now: T0 });
		await fail(client, { ...message!, attempts: 99 }, 'gone for good', { now: T0 });

		// Deleting it would destroy the only evidence of what was owed and why it
		// never arrived.
		const dead = await deadLetters(client);
		expect(dead[0]?.idempotencyKey).toBe('k1');
	});

	it('truncates a huge error, so one bad receiver cannot fill the disk', async () => {
		await add({ idempotencyKey: 'k1' });
		const [message] = await claim(client, 'worker-1', { now: T0 });
		await fail(client, { ...message!, attempts: 99 }, 'x'.repeat(50_000), { now: T0 });

		expect((await deadLetters(client))[0]?.lastError?.length).toBe(1000);
	});

	it('does not block the queue behind a poison message', async () => {
		await add({ idempotencyKey: 'poison' });
		await add({ idempotencyKey: 'fine' });

		const [poison] = await claim(client, 'worker-1', { now: T0, limit: 1 });
		await fail(client, poison!, 'always fails', { now: T0, random: () => 1 });

		// The healthy message is still available. A queue that stops at its first
		// failure is a queue one broken receiver can take down for everybody.
		const next = await claim(client, 'worker-1', { now: T0 });
		expect(next[0]?.idempotencyKey).toBe('fine');
	});
});

describe('reviving', () => {
	it('puts a dead message back and resets its attempts', async () => {
		await add({ idempotencyKey: 'k1' });
		const [message] = await claim(client, 'worker-1', { now: T0 });
		await fail(client, { ...message!, attempts: 99 }, 'wrong url', { now: T0 });

		expect(await revive(client, [message!.outboxId], T0)).toBe(1);

		const again = await claim(client, 'worker-1', { now: T0 });

		// Attempts back to zero, so the message is not immediately dead again on
		// its first failure — which would make the operator conclude the retry
		// button is broken.
		expect(again[0]?.attempts).toBe(1);
	});

	it('does nothing to a live message', async () => {
		await add({ idempotencyKey: 'k1' });
		expect(await revive(client, [1], T0)).toBe(0);
	});

	it('handles an empty list without building broken SQL', async () => {
		expect(await revive(client, [], T0)).toBe(0);
	});
});

describe('watching it', () => {
	it('reports the age of the oldest pending message', async () => {
		await add({ idempotencyKey: 'old' }, T0 - 60_000);
		await add({ idempotencyKey: 'new' }, T0);

		const health = await stats(client, T0);

		/*
		 * Age, not depth, is the number to alert on. A queue of ten thousand that
		 * drains in a second is healthy; a queue of one that has been stuck for an
		 * hour is not.
		 */
		expect(health.oldestPendingAgeMs).toBe(60_000);
		expect(health.pending).toBe(2);
	});

	it('reports zero age on an empty queue', async () => {
		expect((await stats(client, T0)).oldestPendingAgeMs).toBe(0);
	});

	it('counts delivered, dead and leased separately', async () => {
		await add({ idempotencyKey: 'a' });
		await add({ idempotencyKey: 'b' });
		await add({ idempotencyKey: 'c' });

		const claimed = await claim(client, 'worker-1', { now: T0, limit: 3, leaseMs: 60_000 });
		await succeed(client, claimed[0]!.outboxId, T0);
		await fail(client, { ...claimed[1]!, attempts: 99 }, 'dead', { now: T0 });

		const health = await stats(client, T0);

		expect(health.delivered).toBe(1);
		expect(health.dead).toBe(1);
		expect(health.leased).toBe(1);
	});
});

describe('pruning', () => {
	it('removes old delivered messages', async () => {
		await add({ idempotencyKey: 'k1' });
		const [message] = await claim(client, 'worker-1', { now: T0 });
		await succeed(client, message!.outboxId, T0);

		expect(await prune(client, T0 + 1)).toBe(1);
	});

	it('never removes a pending or a dead one, however old', async () => {
		await add({ idempotencyKey: 'pending' }, T0 - 999_999_999);
		await add({ idempotencyKey: 'dead' }, T0 - 999_999_999);

		const claimed = await claim(client, 'worker-1', { now: T0, limit: 2 });
		const dead = claimed.find((m) => m.idempotencyKey === 'dead')!;
		await fail(client, { ...dead, attempts: 99 }, 'gone', { now: T0 });

		expect(await prune(client, T0 + 999_999_999)).toBe(0);
	});
});
