/**
 * THE EVALUATION LOOP
 * ===================
 *
 * Rules are evaluated on a timer, their state is advanced by the pure machine in
 * `#lib/alert/machine.ts`, and any notification is written to the outbox **in
 * the same transaction as the state change**.
 *
 * WHY THE TRANSACTION IS THE WHOLE DESIGN
 * ---------------------------------------
 * There are two facts that must never disagree: "this rule is firing" and
 * "somebody was told". Every ordering that puts them in separate operations gets
 * one of them wrong when the process dies in between:
 *
 *   - write the status, then send → a crash means the alert is firing and nobody
 *     was told, and because the status now says `firing`, the next evaluation
 *     sees no transition and never sends. The alert is permanently silent.
 *   - send, then write the status → a crash means the page went out and the
 *     status still says `ok`, so the next evaluation fires again. Duplicate
 *     pages, forever, until somebody notices.
 *
 * The transactional outbox is the only ordering with neither failure: the row
 * that says "tell somebody" is committed atomically with the row that says "it
 * is firing", and a separate worker delivers it. A crash before delivery leaves
 * an undelivered row, which the worker picks up on restart. A crash *during*
 * delivery may deliver twice — at-least-once — which is why the payload carries
 * a stable key that a receiver can deduplicate on.
 *
 * WHY THIS IS NOT A CRON
 * ----------------------
 * Rules have their own intervals — a check on certificate expiry runs hourly, a
 * check on error rate every thirty seconds — so a single cron would either run
 * everything at the fastest interval or need one schedule per rule. Instead one
 * timer ticks, and each tick evaluates the rules whose `intervalMs` has elapsed.
 */

import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from './db/index.ts';
import { alertRule, alertStatus, outbox } from './db/schema.ts';
import { INITIAL, describe, step, type AlertStatus } from '#lib/alert/machine.ts';
import { check } from '#lib/sqf/check.ts';
import { parse } from '#lib/sqf/parser.ts';
import { run } from './storage.ts';

/**
 * How often the loop wakes.
 *
 * The floor on how precisely a rule's own interval can be honoured: a rule set
 * to thirty seconds is evaluated every thirty *or sixty*, depending on where the
 * tick lands. Ten seconds would be more precise and would wake the process six
 * times as often for no benefit anybody can perceive in an alert.
 */
const TICK_MS = 15_000;

let timer: ReturnType<typeof setInterval> | null = null;
/** Stops two ticks overlapping when an evaluation runs long. */
let running = false;

export function startAlertLoop(): () => void {
	if (timer) return stopAlertLoop;

	timer = setInterval(() => {
		void tick();
	}, TICK_MS);

	// `unref` so the timer never holds the process open. Without it, a graceful
	// shutdown waits fifteen seconds for a timer that has nothing to do, and every
	// integration test hangs at the end.
	timer.unref?.();

	return stopAlertLoop;
}

export function stopAlertLoop(): void {
	if (timer) clearInterval(timer);
	timer = null;
}

/**
 * Evaluate everything that is due.
 *
 * Sequential rather than `Promise.all`. Each evaluation is a query against the
 * same SQLite file, and running three hundred of them at once turns a
 * single-writer database into a queue with three hundred things in it —
 * including the ingest writes that are the actual product. Slower and steady is
 * the right trade for a background job.
 */
export async function tick(now = Date.now()): Promise<number> {
	if (running) return 0;
	running = true;

	try {
		const due = await db
			.select({
				rule: alertRule,
				status: alertStatus
			})
			.from(alertRule)
			.leftJoin(alertStatus, eq(alertStatus.ruleId, alertRule.id))
			.where(eq(alertRule.enabled, true));

		let evaluated = 0;

		for (const row of due) {
			const last = row.status?.evaluatedAt ?? 0;
			if (now - last < row.rule.intervalMs) continue;

			await evaluateRule(row.rule, toStatus(row.status), now);
			evaluated += 1;
		}

		return evaluated;
	} finally {
		running = false;
	}
}

function toStatus(row: typeof alertStatus.$inferSelect | null): AlertStatus {
	if (!row) return INITIAL;
	return {
		state: row.state,
		since: row.since,
		firingSince: row.firingSince,
		value: row.value,
		at: row.evaluatedAt
	};
}

/**
 * One rule, one evaluation.
 *
 * Exported so a test can drive it directly with a fixed clock rather than
 * waiting for a timer — which is the difference between an alerting test suite
 * that runs in milliseconds and one that sleeps.
 */
export async function evaluateRule(
	rule: typeof alertRule.$inferSelect,
	status: AlertStatus,
	now: number
): Promise<void> {
	const value = await valueFor(rule, now);

	const result = step(
		{
			id: rule.id,
			threshold: rule.threshold,
			clearsAt: rule.clearsAt ?? undefined,
			forMs: rule.forMs,
			direction: rule.direction
		},
		status,
		value,
		now
	);

	const message = describe(
		{
			id: rule.id,
			threshold: rule.threshold,
			clearsAt: rule.clearsAt ?? undefined,
			forMs: rule.forMs,
			direction: rule.direction
		},
		rule.name,
		result.effect
	);

	await db.transaction(async (tx) => {
		await tx
			.insert(alertStatus)
			.values({
				ruleId: rule.id,
				state: result.status.state,
				since: result.status.since,
				firingSince: result.status.firingSince,
				value: result.status.value,
				evaluatedAt: now
			})
			.onConflictDoUpdate({
				target: alertStatus.ruleId,
				set: {
					state: result.status.state,
					since: result.status.since,
					firingSince: result.status.firingSince,
					value: result.status.value,
					evaluatedAt: now
				}
			});

		if (result.effect.kind === 'none' || !message) return;

		await tx.insert(outbox).values({
			id: crypto.randomUUID(),
			tenantId: rule.tenantId,
			kind: `alert.${result.effect.kind}`,
			payload: JSON.stringify({
				/*
				 * A stable deduplication key.
				 *
				 * Delivery is at-least-once, so a receiver *will* occasionally see the
				 * same notification twice. `rule + transition + when it started` is the
				 * same string for both copies and a different one for the next
				 * transition, which is exactly what a receiver needs to collapse them.
				 */
				key: `${rule.id}:${result.effect.kind}:${result.status.firingSince ?? now}`,
				ruleId: rule.id,
				rule: rule.name,
				state: result.status.state,
				value: result.effect.kind === 'fired' ? result.effect.value : result.effect.value,
				message,
				at: now
			}),
			nextAttemptAt: now
		});
	});
}

/**
 * Run a rule's query and pull one number out of it.
 *
 * **The first numeric column of the first row.** That is a convention rather
 * than a configuration field, and the reason is that every alternative is worse:
 * naming a column means a rule breaks silently when somebody renames it in the
 * query, and an expression evaluated over the result is a second language.
 *
 * A query that returns nothing gives `null`, and `null` is not zero. The machine
 * treats it as "no data" and holds its state — because a rule on error rate whose
 * query returns nothing means no requests were served, which during a total
 * outage would otherwise resolve the alert at the worst possible moment.
 */
async function valueFor(rule: typeof alertRule.$inferSelect, now: number): Promise<number | null> {
	const parsed = parse(rule.query);
	if (!parsed.query || parsed.errors.length > 0) return null;
	if (check(parsed.query).errors.length > 0) return null;

	const result = await run(parsed.query, {
		tenantId: rule.tenantId,
		from: now - rule.windowMs,
		to: now
	});

	const first = result.rows[0];
	if (!first) return null;

	for (const column of result.columns) {
		const value = first[column];
		if (typeof value === 'number' && Number.isFinite(value)) return value;
	}

	return null;
}

/* ------------------------------------------------------------------ */
/* The outbox worker                                                   */
/* ------------------------------------------------------------------ */

/**
 * How many attempts before a row is left alone.
 *
 * Not deleted, and not retried forever. A row that has failed eight times has a
 * real problem — a webhook pointing at a host that no longer exists — and
 * retrying it every minute for eternity is a background job that never empties.
 * Keeping the row with its `lastError` is what makes the failure visible on the
 * alerts page instead of only in a log.
 */
const MAX_ATTEMPTS = 8;

/** Exponential, capped. Doubling from ten seconds reaches twenty minutes at attempt seven. */
function backoffFor(attempts: number): number {
	return Math.min(20 * 60_000, 10_000 * 2 ** attempts);
}

let outboxTimer: ReturnType<typeof setInterval> | null = null;

export function startOutboxWorker(deliver = defaultDeliver): () => void {
	if (outboxTimer) return stopOutboxWorker;

	outboxTimer = setInterval(() => {
		void drain(deliver);
	}, 5_000);
	outboxTimer.unref?.();

	return stopOutboxWorker;
}

export function stopOutboxWorker(): void {
	if (outboxTimer) clearInterval(outboxTimer);
	outboxTimer = null;
}

export type Deliver = (row: typeof outbox.$inferSelect) => Promise<void>;

/**
 * Send what is due.
 *
 * Exported and taking its delivery function as an argument, so the test suite
 * can hand it one that fails on demand and assert the backoff — which is the
 * part of an outbox that is easy to get wrong and impossible to observe in
 * production until it matters.
 */
export async function drain(deliver: Deliver = defaultDeliver, now = Date.now()): Promise<number> {
	const rows = await db
		.select()
		.from(outbox)
		/*
		 * `isNull`, not `eq(..., null)`.
		 *
		 * In SQL, `x = NULL` is not false — it is NULL, which is not true, so the row
		 * never matches and the outbox silently never sends anything. Drizzle will
		 * happily build that comparison if you hand it a null, which is why this is
		 * the single most common way an outbox ends up doing nothing at all.
		 */
		.where(and(isNull(outbox.deliveredAt), lte(outbox.nextAttemptAt, now)))
		.limit(25);

	let sent = 0;

	for (const row of rows) {
		if (row.attempts >= MAX_ATTEMPTS) continue;

		try {
			await deliver(row);
			await db
				.update(outbox)
				.set({ deliveredAt: new Date(now), lastError: null })
				.where(eq(outbox.id, row.id));
			sent += 1;
		} catch (cause) {
			const attempts = row.attempts + 1;
			await db
				.update(outbox)
				.set({
					attempts,
					nextAttemptAt: now + backoffFor(attempts),
					lastError: cause instanceof Error ? cause.message : String(cause)
				})
				.where(eq(outbox.id, row.id));
		}
	}

	return sent;
}

/**
 * The default delivery: write it to the log.
 *
 * A real deployment swaps this for a webhook, an email or a pager integration —
 * which is why `startOutboxWorker` takes it as an argument. Logging is the
 * honest default for a self-hosted tool with no configured destination: it is
 * visible, it is somewhere, and it does not pretend a notification went out.
 */
async function defaultDeliver(row: typeof outbox.$inferSelect): Promise<void> {
	const payload = JSON.parse(row.payload) as { message?: string };
	console.info(`[alert] ${payload.message ?? row.kind}`);
	await Promise.resolve();
}
