/**
 * Observability: the four questions worth answering at 3am.
 *
 * ## Not a metrics library
 *
 * There is no Prometheus client here and no OpenTelemetry SDK, and that is not
 * because they are bad — they are the right answer in production. It is because
 * installing one teaches you an API, and what is worth teaching is *which
 * numbers matter*, which is a decision no library makes for you.
 *
 * A venue with forty dashboards and no answer to "is anything stuck" is worse
 * off than one with these four.
 *
 * ## The four
 *
 *   **Is the engine keeping up?** The gap between the highest sequenced command
 *   and the engine's checkpoint. Not throughput — a venue processing ten
 *   thousand commands a second while falling two thousand behind is not healthy,
 *   and a throughput graph makes it look magnificent.
 *
 *   **Are the read models current?** The projector's lag. This is what makes a
 *   terminal show a stale book, and it is invisible from the outside because
 *   every request succeeds.
 *
 *   **Is anything being ignored?** The age of the oldest undelivered outbox
 *   message. Again age, not depth.
 *
 *   **Do the books balance?** The trial balance total. It is zero by
 *   construction, so a non-zero value means something wrote to the ledger
 *   outside the one function that may — and finding out which *day* that
 *   started is much easier than finding out which year.
 *
 * Every one of these is a **derived** number: nothing increments a counter, so
 * nothing can drift, and a process that restarts loses no history.
 */

import type { Client } from '@libsql/client';

export interface Health {
	/** Commands sequenced but not yet applied by the engine. */
	readonly engineLag: number;
	/** Events written but not yet projected. */
	readonly projectorLag: number;
	/** Milliseconds the oldest undelivered outbox message has waited. */
	readonly outboxAgeMs: number;
	readonly outboxPending: number;
	readonly outboxDead: number;
	/** Must be zero. Anything else is a ledger that has been written to directly. */
	readonly trialBalance: number;
	/** Highest command sequence the venue has accepted. */
	readonly lastSeq: number;
	readonly checkedAt: number;
}

/**
 * The venue's health, in one query round.
 *
 * Cheap enough to call on a `/healthz` endpoint every few seconds: every figure
 * is an index lookup or an aggregate over a small table, and none of them scans
 * the log.
 */
export async function health(client: Client, now = Date.now()): Promise<Health> {
	const [commands, engine, events, projector, outbox, ledger] = await Promise.all([
		client.execute('SELECT COALESCE(MAX(seq), 0) AS n FROM command_log'),
		client.execute({
			sql: 'SELECT COALESCE(last_seq, 0) AS n FROM consumer_checkpoint WHERE consumer = ?',
			args: ['engine']
		}),
		client.execute('SELECT COALESCE(MAX(seq), 0) AS n FROM event_log'),
		client.execute({
			sql: 'SELECT COALESCE(last_seq, 0) AS n FROM consumer_checkpoint WHERE consumer = ?',
			args: ['projections']
		}),
		client.execute({
			sql: `SELECT
			        COUNT(*) FILTER (WHERE delivered_at IS NULL AND failed_at IS NULL) AS pending,
			        COUNT(*) FILTER (WHERE failed_at IS NOT NULL) AS dead,
			        MIN(created_at) FILTER (WHERE delivered_at IS NULL AND failed_at IS NULL) AS oldest
			      FROM outbox`,
			args: []
		}),
		client.execute('SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_posting')
	]);

	const lastSeq = Number(commands.rows[0]?.['n'] ?? 0);
	const oldest = outbox.rows[0]?.['oldest'];

	return {
		lastSeq,
		engineLag: lastSeq - Number(engine.rows[0]?.['n'] ?? 0),
		projectorLag: Number(events.rows[0]?.['n'] ?? 0) - Number(projector.rows[0]?.['n'] ?? 0),
		outboxPending: Number(outbox.rows[0]?.['pending'] ?? 0),
		outboxDead: Number(outbox.rows[0]?.['dead'] ?? 0),
		outboxAgeMs: oldest === null || oldest === undefined ? 0 : now - Number(oldest),
		/*
		 * Summed straight from the postings rather than through `trialBalance()`.
		 *
		 * The function groups by account, which is what a human wants to read; a
		 * health check only needs the total, and one aggregate is cheaper than a
		 * group-by over every account the venue has.
		 */
		trialBalance: Number(ledger.rows[0]?.['total'] ?? 0),
		checkedAt: now
	};
}

/* -------------------------------------------------------------------------- */
/* Verdicts                                                                    */
/* -------------------------------------------------------------------------- */

export type Level = 'ok' | 'degraded' | 'down';

/**
 * Named `HealthVerdict` rather than `Verdict`, because the rate limiter already
 * owns that word for a different thing.
 *
 * Two modules exporting `Verdict` from one package is a name collision the
 * compiler catches — but the version that gets fixed by renaming the import at
 * every call site leaves two unrelated concepts sharing a name in people's
 * heads, which the compiler cannot catch at all.
 */
export interface HealthVerdict {
	readonly level: Level;
	readonly summary: string;
	readonly problems: readonly string[];
}

/**
 * The thresholds, in one place, as data.
 *
 * Named rather than inlined into the comparisons, because the numbers *are* the
 * policy. Somebody arguing about whether 500 is the right engine lag should be
 * able to find and change one line, not read a function.
 */
export const THRESHOLDS = {
	/** The engine is a single writer; a few hundred behind is a busy second. */
	engineLagDegraded: 500,
	engineLagDown: 5_000,
	/** Read models lag by design; seconds are fine, thousands of events are not. */
	projectorLagDegraded: 1_000,
	projectorLagDown: 20_000,
	/** Age, not depth. Two minutes unacknowledged is a broken receiver. */
	outboxAgeDegradedMs: 120_000,
	outboxAgeDownMs: 900_000
} as const;

/**
 * Turn the numbers into a verdict.
 *
 * ## Why `down` and `degraded` are different
 *
 * A load balancer removing an instance and a human being woken up are different
 * responses, and a health check with one boolean cannot ask for either
 * specifically. `degraded` means "look at this in the morning"; `down` means
 * "stop sending traffic here".
 *
 * An unbalanced ledger is **always** `down`, whatever the number. Every other
 * threshold is a judgement about how much lag is tolerable; that one is not a
 * matter of degree, because a ledger that does not balance means money has been
 * created or destroyed and no amount of it is acceptable.
 */
export function verdict(status: Health): HealthVerdict {
	const problems: string[] = [];
	let level: Level = 'ok';

	const raise = (next: Level) => {
		if (next === 'down' || (next === 'degraded' && level === 'ok')) level = next;
	};

	if (status.trialBalance !== 0) {
		problems.push(
			`The ledger does not balance: postings sum to ${status.trialBalance}. Something has written to it outside postTransaction.`
		);
		raise('down');
	}

	if (status.engineLag >= THRESHOLDS.engineLagDown) {
		problems.push(`The engine is ${status.engineLag} commands behind.`);
		raise('down');
	} else if (status.engineLag >= THRESHOLDS.engineLagDegraded) {
		problems.push(`The engine is ${status.engineLag} commands behind.`);
		raise('degraded');
	}

	if (status.projectorLag >= THRESHOLDS.projectorLagDown) {
		problems.push(`Read models are ${status.projectorLag} events behind.`);
		raise('down');
	} else if (status.projectorLag >= THRESHOLDS.projectorLagDegraded) {
		problems.push(`Read models are ${status.projectorLag} events behind.`);
		raise('degraded');
	}

	if (status.outboxAgeMs >= THRESHOLDS.outboxAgeDownMs) {
		problems.push(`Nothing has been delivered for ${Math.round(status.outboxAgeMs / 1000)}s.`);
		raise('down');
	} else if (status.outboxAgeMs >= THRESHOLDS.outboxAgeDegradedMs) {
		problems.push(`The oldest queued message is ${Math.round(status.outboxAgeMs / 1000)}s old.`);
		raise('degraded');
	}

	// Dead letters never change the level. They are a backlog for somebody to
	// look at, not a reason to take a machine out of rotation — and a health
	// check that goes red because one member's URL is wrong is a health check
	// people learn to ignore.
	if (status.outboxDead > 0) {
		problems.push(`${status.outboxDead} messages have been given up on.`);
	}

	return {
		level,
		summary:
			level === 'ok'
				? 'Everything is keeping up.'
				: problems[0] ?? 'Something is wrong but nothing said what.',
		problems
	};
}

/* -------------------------------------------------------------------------- */
/* Structured logs                                                             */
/* -------------------------------------------------------------------------- */

export interface LogFields {
	readonly [key: string]: string | number | boolean | null | undefined;
}

/**
 * One line of JSON per event.
 *
 * ## Why JSON and not a sentence
 *
 * `console.log('order ' + id + ' rejected: ' + reason)` is readable by a human
 * reading one line and useless to anything reading a million. The moment you
 * want "how many orders were rejected for breaching a position limit last
 * Tuesday", a prose log means a regular expression that breaks the first time
 * somebody rewords the message.
 *
 * Structured fields survive rewording. The message is for the human; the fields
 * are the data.
 *
 * ## What must never be in here
 *
 * No secrets, and the risk is not that somebody logs `password` — it is that
 * somebody logs the whole request object because it was convenient. Logs go to
 * places with weaker access control than the database, are retained longer than
 * anybody remembers, and are read by more people than can name them.
 */
export function logLine(
	level: 'debug' | 'info' | 'warn' | 'error',
	message: string,
	fields: LogFields = {}
): string {
	const safe: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined) continue;

		/*
		 * A last line of defence, not a security control.
		 *
		 * It catches the accidental `{ ...request }` spread. It does not catch a
		 * secret in a field called `note`, and pretending otherwise would be
		 * worse than not having it — the real control is not putting them there.
		 */
		if (/secret|password|token|authorization|cookie|key_hash/i.test(key)) {
			safe[key] = '[redacted]';
			continue;
		}

		safe[key] = value;
	}

	return JSON.stringify({ level, message, ...safe });
}
