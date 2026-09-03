/**
 * THE ALERT STATE MACHINE
 * =======================
 *
 * When does a number crossing a line become somebody's phone ringing at 3am?
 *
 * The naive answer — "when value > threshold" — produces an alerting system
 * people turn off. Three things go wrong with it, and each needs a different
 * piece of state:
 *
 *   **Flapping.** A metric oscillating either side of the line fires and
 *   resolves every evaluation. Ten pages in ten minutes for one problem, and
 *   after the third nobody reads them.
 *
 *   **Spikes.** A single bad sample is usually a scrape hiccup, a GC pause, or
 *   one unlucky request. Paging on it trains people to wait and see, which is
 *   the opposite of what an alert is for.
 *
 *   **No memory.** Without knowing it already fired, an alert cannot say "still
 *   firing" or "resolved after 14 minutes" — and "resolved" is the message that
 *   lets somebody stop looking.
 *
 * So: four states, a `for` duration before firing, and a separate `clearsAt`
 * threshold with hysteresis.
 *
 *      ┌──────┐  above       ┌─────────┐  above for `for`   ┌────────┐
 *      │  ok  │─────────────▶│ pending │───────────────────▶│ firing │
 *      └──────┘              └─────────┘                    └────────┘
 *          ▲                      │                              │
 *          │  below clearsAt      │  below clearsAt              │
 *          └──────────────────────┴──────────────────────────────┘
 *
 * WHY THIS IS A PURE FUNCTION
 * ---------------------------
 * `step(state, sample) -> state` takes the clock as an argument and touches
 * nothing else. That makes the whole of alerting exhaustively testable in
 * milliseconds — every transition, every boundary, every ordering — without a
 * database, a scheduler or a fake timer. The evaluator that calls it is the only
 * part that needs either, and it is thirty lines.
 */

export type AlertState = 'ok' | 'pending' | 'firing';

export interface AlertRule {
	readonly id: string;
	/** Fire when the value is above this. */
	readonly threshold: number;
	/**
	 * Resolve when the value falls below this. Defaults to `threshold`.
	 *
	 * HYSTERESIS, AND WHY IT IS NOT OPTIONAL
	 *
	 * With one threshold, a metric sitting at exactly the line fires and resolves
	 * on alternate evaluations forever. Two thresholds give the metric somewhere
	 * to be that is neither firing nor resolving, and the gap only has to be
	 * bigger than the metric's noise — which for a p95 latency is a few percent.
	 *
	 * It is separate from `for` and does a different job: `for` stops a *brief*
	 * excursion from paging, and `clearsAt` stops a *sustained* value near the
	 * line from paging repeatedly.
	 */
	readonly clearsAt?: number;
	/**
	 * How long the value must stay above the threshold before firing.
	 *
	 * Zero means fire on the first sample, which is right for a rule on something
	 * that is never briefly true — "the certificate expires in under a day" — and
	 * wrong for anything sampled.
	 */
	readonly forMs: number;
	/** Direction. `below` for "throughput dropped", which is the same machine mirrored. */
	readonly direction?: 'above' | 'below';
}

export interface AlertStatus {
	readonly state: AlertState;
	/** When the value first crossed, or `null` in `ok`. Drives the `for` countdown. */
	readonly since: number | null;
	/** When it started firing, for "firing for 12 minutes". */
	readonly firingSince: number | null;
	/** The most recent value, for the notification body. */
	readonly value: number | null;
	/** When this status was last updated, so a stale evaluator is visible. */
	readonly at: number;
}

export const INITIAL: AlertStatus = {
	state: 'ok',
	since: null,
	firingSince: null,
	value: null,
	at: 0
};

/**
 * What a transition means to the outside world.
 *
 * Returned rather than performed, so `step` stays pure and the caller decides
 * whether to write a row, send a webhook, or — during a backfill — do neither.
 */
export type AlertEffect =
	| { readonly kind: 'none' }
	| { readonly kind: 'fired'; readonly value: number; readonly at: number }
	| {
			readonly kind: 'resolved';
			readonly value: number | null;
			readonly at: number;
			readonly firedFor: number;
	  };

export interface StepResult {
	readonly status: AlertStatus;
	readonly effect: AlertEffect;
}

/**
 * Advance the machine by one evaluation.
 *
 * `value` is `null` when the query returned no data, which is a case worth
 * naming: it is *not* the same as zero. A rule on error rate whose query returns
 * nothing means no requests were made, not that the error rate is fine — and
 * treating it as zero silently resolves an alert during a total outage, which is
 * the single worst failure an alerting system can have.
 */
export function step(
	rule: AlertRule,
	status: AlertStatus,
	value: number | null,
	at: number
): StepResult {
	if (value === null) {
		/*
		 * No data. Hold the current state and record that nothing was seen.
		 *
		 * Holding rather than resolving is the safe direction: an alert that stays
		 * firing when its query breaks is noisy, and one that resolves is silent
		 * during exactly the outage it exists to report. `at` still advances, so a
		 * separate staleness check can see the rule is not getting data.
		 */
		return { status: { ...status, value: null, at }, effect: { kind: 'none' } };
	}

	const breaching = isBreaching(rule, value);
	const clearing = isClearing(rule, value);

	switch (status.state) {
		case 'ok': {
			if (!breaching) return { status: { ...status, value, at }, effect: { kind: 'none' } };

			// `forMs` of zero fires immediately, without a pointless pass through
			// `pending` that would delay by one evaluation interval.
			if (rule.forMs === 0) {
				return {
					status: { state: 'firing', since: at, firingSince: at, value, at },
					effect: { kind: 'fired', value, at }
				};
			}

			return {
				status: { state: 'pending', since: at, firingSince: null, value, at },
				effect: { kind: 'none' }
			};
		}

		case 'pending': {
			/*
			 * Clearing while pending goes straight back to `ok` with no notification,
			 * because nothing was ever announced. That is the whole point of the
			 * state: a brief excursion is absorbed silently.
			 */
			if (clearing) {
				return {
					status: { state: 'ok', since: null, firingSince: null, value, at },
					effect: { kind: 'none' }
				};
			}

			/*
			 * Between the two thresholds while pending: neither firing nor clearing.
			 * The `for` countdown keeps running rather than resetting, because the
			 * value has not recovered — resetting here would mean a metric hovering
			 * in the hysteresis band never fires at all.
			 */
			if (!breaching) return { status: { ...status, value, at }, effect: { kind: 'none' } };

			const elapsed = at - (status.since ?? at);
			if (elapsed < rule.forMs) {
				return { status: { ...status, value, at }, effect: { kind: 'none' } };
			}

			return {
				status: { state: 'firing', since: status.since, firingSince: at, value, at },
				effect: { kind: 'fired', value, at }
			};
		}

		case 'firing': {
			if (!clearing) return { status: { ...status, value, at }, effect: { kind: 'none' } };

			return {
				status: { state: 'ok', since: null, firingSince: null, value, at },
				effect: {
					kind: 'resolved',
					value,
					at,
					firedFor: at - (status.firingSince ?? at)
				}
			};
		}
	}
}

/** Is the value on the wrong side of the firing threshold? */
function isBreaching(rule: AlertRule, value: number): boolean {
	return rule.direction === 'below' ? value < rule.threshold : value > rule.threshold;
}

/**
 * Is the value far enough back that the alert should clear?
 *
 * Strictly inside the clear threshold, so a value sitting *exactly* on it does
 * not clear — which is the boundary a metric parked on a round number lands on,
 * and clearing there reintroduces the flapping the threshold exists to prevent.
 */
function isClearing(rule: AlertRule, value: number): boolean {
	const clearsAt = rule.clearsAt ?? rule.threshold;
	return rule.direction === 'below' ? value > clearsAt : value < clearsAt;
}

/**
 * A human sentence for a transition.
 *
 * Here rather than in the notification sender, because the same words go to a
 * webhook, an email and the activity list, and three copies drift. It is also
 * the only part of alerting that is trivially reviewable by somebody who will be
 * woken by it.
 */
export function describe(rule: AlertRule, name: string, effect: AlertEffect): string | null {
	const unit = rule.direction === 'below' ? 'below' : 'above';

	switch (effect.kind) {
		case 'fired':
			return `${name} is ${unit} ${rule.threshold} (currently ${round(effect.value)})`;
		case 'resolved':
			return `${name} recovered after ${humanise(effect.firedFor)}`;
		case 'none':
			return null;
	}
}

function round(value: number): string {
	// Two significant decimals at most: an alert body reading "currently
	// 203.99999999999997" is the kind of detail that makes people distrust the
	// whole message.
	return String(Math.round(value * 100) / 100);
}

function humanise(ms: number): string {
	if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
	if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
	return `${Math.round((ms / 3_600_000) * 10) / 10}h`;
}
