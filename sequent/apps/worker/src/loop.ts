/**
 * The worker loop: claim, deliver, settle, repeat.
 *
 * Small on purpose. Everything hard has been pushed into the outbox (leases,
 * backoff, dead-lettering) and into the delivery functions (signing, timeouts,
 * partial success), which leaves this file as the part that decides *when* to
 * do things — and that is the only thing it should be responsible for.
 */

import type { Client } from '@libsql/client';
import { claim, fail, prune, stats, succeed, type ClaimedMessage } from '@sequent/store';
import { deliverEmail, deliverWebhook, type DeliverOptions } from './deliver.ts';

export interface WorkerOptions extends DeliverOptions {
	readonly signal: AbortSignal;
	/** Identifies this worker in the lease. Useful when several are running. */
	readonly name?: string;
	readonly batchSize?: number;
	/** How long a claimed message is held before another worker may take it. */
	readonly leaseMs?: number;
	readonly idleMs?: number;
	/** Delivered messages older than this are deleted. */
	readonly keepDeliveredMs?: number;
	readonly onProgress?: (progress: Progress) => void;
}

export interface Progress {
	readonly claimed: number;
	readonly delivered: number;
	readonly retried: number;
	readonly dead: number;
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
	new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});

/**
 * Deliver one message, whatever kind it is.
 *
 * A `switch` rather than a registry of handlers, because there are two kinds
 * and a registry would be indirection with nothing to hide. When there are six,
 * a registry earns its keep; at two it costs a jump to nowhere on every read.
 */
async function deliver(
	client: Client,
	message: ClaimedMessage,
	options: DeliverOptions
): Promise<{ retry: boolean; permanent?: boolean; error?: string }> {
	switch (message.kind) {
		case 'webhook':
			return deliverWebhook(client, message, options);
		case 'email':
			return deliverEmail(client, message, options);
		default:
			/*
			 * An unknown kind is a bug, not a transient failure, and retrying it
			 * eight times before dead-lettering wastes an hour proving that. But it
			 * is still not thrown: one bad row must not stop the loop, because the
			 * loop is also delivering everybody else's messages.
			 */
			return { retry: false, permanent: true, error: `Unknown outbox kind: ${message.kind}` };
	}
}

/**
 * Run until the signal aborts.
 *
 * ## The messages are delivered concurrently, and that is deliberate
 *
 * Sequentially, one slow receiver adds its full timeout to every message behind
 * it in the batch: twenty messages and one ten-second timeout is a batch that
 * takes ten seconds no matter how fast the other nineteen were. `Promise.all`
 * over the batch means the batch costs the *slowest* message rather than the
 * sum.
 *
 * Ordering is not sacrificed by this, because the outbox never promised any.
 * Webhooks arrive out of order — over a network they would anyway — which is
 * why every payload carries the venue sequence number that produced it.
 */
export async function runWorker(client: Client, options: WorkerOptions): Promise<void> {
	const {
		signal,
		name = `worker-${process.pid}`,
		batchSize = 20,
		leaseMs = 30_000,
		idleMs = 200,
		keepDeliveredMs = 7 * 24 * 60 * 60_000,
		onProgress
	} = options;

	let lastPrune = Date.now();

	while (!signal.aborted) {
		let claimed: ClaimedMessage[];

		try {
			claimed = await claim(client, name, { limit: batchSize, leaseMs });
		} catch (thrown) {
			console.error('[worker] could not claim', thrown);
			await sleep(1000, signal);
			continue;
		}

		if (claimed.length === 0) {
			// Housekeeping happens when there is nothing better to do, so pruning
			// never competes with delivery for the database.
			if (Date.now() - lastPrune > 60 * 60_000) {
				lastPrune = Date.now();
				const removed = await prune(client, Date.now() - keepDeliveredMs);
				if (removed > 0) console.log(`[worker] pruned ${removed} delivered messages`);
			}

			await sleep(idleMs, signal);
			continue;
		}

		let delivered = 0;
		let retried = 0;
		let dead = 0;

		await Promise.all(
			claimed.map(async (message) => {
				let outcome: { retry: boolean; permanent?: boolean; error?: string };

				try {
					outcome = await deliver(client, message, options);
				} catch (thrown) {
					/*
					 * A throw here is a bug in the delivery code rather than a receiver
					 * being down — but it is treated as a retryable failure anyway, and
					 * caught rather than allowed to escape.
					 *
					 * An uncaught rejection inside `Promise.all` abandons the *other*
					 * messages in the batch mid-flight: their leases stay held until
					 * they expire, and the whole batch stalls because of one bad row.
					 */
					outcome = {
						retry: true,
						error: thrown instanceof Error ? thrown.message : String(thrown)
					};
				}

				if (outcome.permanent) {
					// `maxAttempts: 0` forces the dead letter now. Backing off eight
					// times first would spend an hour proving what the first attempt
					// already established, and bury the real error under seven copies.
					await fail(client, message, outcome.error ?? 'permanent failure', {
						maxAttempts: 0
					});
					dead += 1;
					return;
				}

				if (!outcome.retry) {
					await succeed(client, message.outboxId);
					delivered += 1;
					return;
				}

				const result = await fail(client, message, outcome.error ?? 'delivery failed');
				if (result.retrying) retried += 1;
				else dead += 1;
			})
		);

		onProgress?.({ claimed: claimed.length, delivered, retried, dead });
	}
}

export { stats };
