/**
 * The transactional outbox, and the problem that has no other solution.
 *
 * ## The dual-write problem
 *
 * A trade happens. Two things must follow: the projections update, and the
 * firm's webhook fires. The obvious code is:
 *
 *     await database.commit();
 *     await fetch(theirWebhook, { ... });
 *
 * There is no ordering of those two lines that is correct.
 *
 *   - **Commit first, then send.** The process dies in between. The trade
 *     happened and nobody was told, forever. There is no retry, because nothing
 *     recorded that a send was owed.
 *
 *   - **Send first, then commit.** The commit fails — a constraint, a
 *     disk-full, a rollback further up. You have told a firm about a trade that
 *     did not happen, and you cannot un-tell them.
 *
 * The trap is that both work in development, where the process does not die and
 * the commit does not fail. This is a bug you find in production, at 3am, once.
 *
 * ## What the outbox does
 *
 * Write the **intent to send** into the same database, in the **same
 * transaction** as the fact. Now there is exactly one commit, and it either
 * contains both or neither. A separate process reads the outbox afterwards and
 * does the sending.
 *
 * The dual write has not been eliminated — it has been moved somewhere it can
 * be retried, because the row is still there until delivery succeeds.
 *
 * ## What this buys, and what it does not
 *
 * It buys **at-least-once** delivery. It does not buy exactly-once, and nothing
 * does: the moment after a receiver processes a webhook and before it answers
 * 200, the network can drop the response, and we will send again. Every
 * delivery therefore carries a stable id, and receivers are told to
 * de-duplicate on it.
 *
 * Anybody promising exactly-once delivery over a network is either wrong or
 * quietly means "at-least-once plus idempotent receivers", which is this.
 */

import type { Client } from '@libsql/client';
import type { Executor } from './client.ts';

/* -------------------------------------------------------------------------- */
/* Enqueuing                                                                   */
/* -------------------------------------------------------------------------- */

export interface OutboxMessage {
	/** What kind of side effect this is: 'webhook', 'email'. */
	readonly kind: string;
	/** The event sequence that caused it, for ordering and for debugging. */
	readonly seq: number;
	/** Whose message this is. Null for venue-wide messages. */
	readonly firmId?: string | undefined;
	/** A stable identifier for what happened, so a receiver can de-duplicate. */
	readonly idempotencyKey: string;
	readonly payload: unknown;
}

/**
 * Add a message to the outbox, inside a transaction the caller owns.
 *
 * Taking an `Executor` rather than a `Client` is the entire design, expressed
 * in the type. A function that opened its own transaction could not be atomic
 * with the caller's work, and this signature makes it impossible to use wrongly:
 * there is no way to call it outside a transaction.
 *
 * `ON CONFLICT DO NOTHING` on the idempotency key means a projector replaying
 * the same event does not enqueue a second copy. Projectors are idempotent by
 * design and are re-run after any crash, so without this every restart would
 * re-notify every firm about the last batch of trades.
 */
export async function enqueue(tx: Executor, message: OutboxMessage, now: number): Promise<void> {
	await tx.execute({
		sql: `INSERT INTO outbox (kind, seq, firm_id, idempotency_key, payload, created_at, available_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?)
		      ON CONFLICT (idempotency_key) DO NOTHING`,
		args: [
			message.kind,
			message.seq,
			message.firmId ?? null,
			message.idempotencyKey,
			JSON.stringify(message.payload),
			now,
			now
		]
	});
}

/* -------------------------------------------------------------------------- */
/* Claiming                                                                    */
/* -------------------------------------------------------------------------- */

export interface ClaimedMessage {
	readonly outboxId: number;
	readonly kind: string;
	readonly seq: number;
	readonly firmId: string | null;
	readonly idempotencyKey: string;
	readonly payload: unknown;
	readonly attempts: number;
	readonly createdAt: number;
}

/**
 * Take some work, with a lease.
 *
 * ## Why a lease rather than a lock
 *
 * A worker that `SELECT`s a row and then crashes holding a lock blocks the
 * queue until somebody notices. A **lease** is a lock with an expiry written
 * into the row: claim it until `now + leaseMs`, and if the worker dies, the
 * lease simply runs out and the next worker picks the message up.
 *
 * Nothing has to detect the crash. There is no heartbeat, no health check, no
 * "reap dead workers" job — the recovery is the absence of an update.
 *
 * The cost is that a lease which expires while the worker is *still alive*
 * (a long GC pause, a slow receiver) produces a duplicate delivery. Which is
 * fine, because the contract was at-least-once from the start. Choosing the
 * lease length is choosing how often that happens: too short and slow
 * receivers get doubles, too long and a crashed worker's messages sit idle.
 *
 * ## The `UPDATE ... RETURNING` is not a style choice
 *
 * Selecting candidates and then updating them is two statements, and between
 * them another worker can claim the same rows. Doing it in one statement means
 * the database's own row locking decides who wins, which is the one place that
 * decision can be made without a race.
 */
export async function claim(
	client: Client,
	worker: string,
	options: { limit?: number; leaseMs?: number; now?: number; kind?: string } = {}
): Promise<ClaimedMessage[]> {
	const { limit = 20, leaseMs = 30_000, now = Date.now(), kind } = options;

	const result = await client.execute({
		sql: `UPDATE outbox
		      SET leased_until = ?, leased_by = ?, attempts = attempts + 1
		      WHERE outbox_id IN (
		          SELECT outbox_id FROM outbox
		          WHERE delivered_at IS NULL
		            AND failed_at IS NULL
		            AND available_at <= ?
		            AND (leased_until IS NULL OR leased_until <= ?)
		            ${kind ? 'AND kind = ?' : ''}
		          ORDER BY available_at, outbox_id
		          LIMIT ?
		      )
		      RETURNING outbox_id, kind, seq, firm_id, idempotency_key, payload, attempts, created_at`,
		args: kind
			? [now + leaseMs, worker, now, now, kind, limit]
			: [now + leaseMs, worker, now, now, limit]
	});

	return result.rows.map((row) => ({
		outboxId: Number(row['outbox_id']),
		kind: String(row['kind']),
		seq: Number(row['seq']),
		firmId: row['firm_id'] === null ? null : String(row['firm_id']),
		idempotencyKey: String(row['idempotency_key']),
		payload: JSON.parse(String(row['payload'])),
		attempts: Number(row['attempts']),
		createdAt: Number(row['created_at'])
	}));
}

/* -------------------------------------------------------------------------- */
/* Finishing                                                                   */
/* -------------------------------------------------------------------------- */

export async function succeed(client: Client, outboxId: number, now = Date.now()): Promise<void> {
	await client.execute({
		sql: `UPDATE outbox SET delivered_at = ?, leased_until = NULL, last_error = NULL
		      WHERE outbox_id = ?`,
		args: [now, outboxId]
	});
}

export const MAX_ATTEMPTS = 8;

/**
 * How long to wait before trying again.
 *
 * Exponential, capped, **with jitter** — and the jitter is the part that is
 * usually missing and usually matters most.
 *
 * Without it, a receiver that goes down for a minute causes every one of its
 * pending messages to fail at once, back off by exactly the same amount, and
 * retry at exactly the same instant. The receiver comes back up, is hit by the
 * entire backlog in one burst, falls over again, and the cycle repeats — a
 * thundering herd that the retry logic created rather than survived.
 *
 * Full jitter (a random point in `[0, backoff]`) spreads the same messages
 * across the whole window. It is one line and it is the difference between a
 * retry policy and an outage amplifier.
 */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
	const ceiling = Math.min(60 * 60_000, 1000 * 2 ** Math.min(attempts, 12));
	return Math.floor(random() * ceiling);
}

/**
 * Record a failure and schedule a retry, or give up.
 *
 * Giving up is a real state, not an infinite retry with a long delay. A message
 * that has failed eight times is not going to succeed on the ninth — the URL is
 * wrong, or the receiver has been decommissioned — and a queue that retries it
 * forever spends its budget on a firm that is not listening while the ones that
 * are wait behind it.
 *
 * `failed_at` is set, the row stays, and somebody can look at `last_error` and
 * see why. Deleting it would destroy the only evidence.
 */
export async function fail(
	client: Client,
	message: { outboxId: number; attempts: number },
	error: string,
	options: { now?: number; random?: () => number; maxAttempts?: number } = {}
): Promise<{ retrying: boolean; nextAttemptAt: number | null }> {
	const { now = Date.now(), random = Math.random, maxAttempts = MAX_ATTEMPTS } = options;

	// Truncated: an HTML error page from a misconfigured receiver can be
	// megabytes, and storing it per attempt per message fills the disk with
	// somebody else's stack trace.
	const reason = error.slice(0, 1000);

	if (message.attempts >= maxAttempts) {
		await client.execute({
			sql: `UPDATE outbox SET failed_at = ?, leased_until = NULL, last_error = ?
			      WHERE outbox_id = ?`,
			args: [now, reason, message.outboxId]
		});
		return { retrying: false, nextAttemptAt: null };
	}

	const nextAttemptAt = now + backoffMs(message.attempts, random);

	await client.execute({
		sql: `UPDATE outbox SET available_at = ?, leased_until = NULL, last_error = ?
		      WHERE outbox_id = ?`,
		args: [nextAttemptAt, reason, message.outboxId]
	});

	return { retrying: true, nextAttemptAt };
}

/* -------------------------------------------------------------------------- */
/* Looking at it                                                               */
/* -------------------------------------------------------------------------- */

export interface OutboxStats {
	readonly pending: number;
	readonly delivered: number;
	readonly dead: number;
	readonly leased: number;
	/** Age in ms of the oldest undelivered message. The number to alert on. */
	readonly oldestPendingAgeMs: number;
}

/**
 * The queue's health, in five numbers.
 *
 * `oldestPendingAgeMs` is the one worth an alert. Depth is a bad signal — a
 * queue of ten thousand that drains in a second is healthy, and a queue of one
 * that has been stuck for an hour is not. Age answers the question anybody
 * actually has, which is "is anything being ignored?"
 */
export async function stats(client: Client, now = Date.now()): Promise<OutboxStats> {
	const result = await client.execute({
		sql: `SELECT
		          COUNT(*) FILTER (WHERE delivered_at IS NULL AND failed_at IS NULL) AS pending,
		          COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
		          COUNT(*) FILTER (WHERE failed_at IS NOT NULL) AS dead,
		          COUNT(*) FILTER (WHERE leased_until > ?) AS leased,
		          MIN(created_at) FILTER (WHERE delivered_at IS NULL AND failed_at IS NULL) AS oldest
		      FROM outbox`,
		args: [now]
	});

	const row = result.rows[0];
	const oldest = row?.['oldest'];

	return {
		pending: Number(row?.['pending'] ?? 0),
		delivered: Number(row?.['delivered'] ?? 0),
		dead: Number(row?.['dead'] ?? 0),
		leased: Number(row?.['leased'] ?? 0),
		oldestPendingAgeMs: oldest === null || oldest === undefined ? 0 : now - Number(oldest)
	};
}

/**
 * Put dead messages back in the queue.
 *
 * The manual repair after somebody fixes a broken webhook URL. Resetting
 * `attempts` matters: without it the message is immediately dead again on its
 * first failure, and the operator concludes the retry button is broken.
 */
export async function revive(
	client: Client,
	outboxIds: readonly number[],
	now = Date.now()
): Promise<number> {
	if (outboxIds.length === 0) return 0;

	const result = await client.execute({
		sql: `UPDATE outbox
		      SET failed_at = NULL, attempts = 0, available_at = ?, leased_until = NULL
		      WHERE failed_at IS NOT NULL AND outbox_id IN (${outboxIds.map(() => '?').join(',')})`,
		args: [now, ...outboxIds]
	});

	return result.rowsAffected;
}

/** Dead messages, for the admin screen and for the operator at 3am. */
export async function deadLetters(
	client: Client,
	limit = 50
): Promise<
	Array<{
		outboxId: number;
		kind: string;
		firmId: string | null;
		idempotencyKey: string;
		attempts: number;
		lastError: string | null;
		failedAt: number;
	}>
> {
	const result = await client.execute({
		sql: `SELECT outbox_id, kind, firm_id, idempotency_key, attempts, last_error, failed_at
		      FROM outbox WHERE failed_at IS NOT NULL ORDER BY failed_at DESC LIMIT ?`,
		args: [limit]
	});

	return result.rows.map((row) => ({
		outboxId: Number(row['outbox_id']),
		kind: String(row['kind']),
		firmId: row['firm_id'] === null ? null : String(row['firm_id']),
		idempotencyKey: String(row['idempotency_key']),
		attempts: Number(row['attempts']),
		lastError: row['last_error'] === null ? null : String(row['last_error']),
		failedAt: Number(row['failed_at'])
	}));
}

/**
 * Delete delivered messages older than a cutoff.
 *
 * The outbox is a queue, not an archive. Delivered rows are already recorded in
 * `webhook_delivery` and in the event log they came from, so keeping them here
 * only makes the `claim` index bigger and every claim slower.
 *
 * Undelivered and dead rows are never touched, however old. Those are the ones
 * somebody still needs.
 */
export async function prune(client: Client, olderThan: number): Promise<number> {
	const result = await client.execute({
		sql: 'DELETE FROM outbox WHERE delivered_at IS NOT NULL AND delivered_at < ?',
		args: [olderThan]
	});

	return result.rowsAffected;
}
