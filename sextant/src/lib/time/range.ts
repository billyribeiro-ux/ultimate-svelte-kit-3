/**
 * TIME RANGES, AS TEXT
 * ====================
 *
 * A range in Sextant is stored and shared as the *expression* — `-6h`, not two
 * timestamps — and resolved against the clock at the moment it is used.
 *
 * WHY THIS MATTERS MORE THAN IT SOUNDS
 * ------------------------------------
 * A link is the primary way one person hands a screen to another during an
 * incident: "look at this". If the URL carried absolute timestamps, then:
 *
 *   - a saved view called "last hour" is frozen to the hour it was saved in,
 *     and shows a flat line forever afterwards
 *   - a dashboard bookmarked on Monday shows Monday on Friday
 *   - refreshing does not move the window, so a live view is not live
 *
 * And if it carried *only* relative expressions, the opposite fails: pasting a
 * link to "the last 15 minutes" during an incident gives the recipient a
 * different 15 minutes, which is precisely the moment when both people must be
 * looking at the same thing.
 *
 * So both forms exist, they are distinguishable at a glance, and the interface
 * has an explicit "pin this range" action that converts one to the other. That
 * conversion is the feature — not a fallback.
 */

import { DAY, HOUR, MINUTE, SECOND } from '#lib/series/bucket.ts';

export interface Resolved {
	readonly from: number;
	readonly to: number;
	/** True for a relative range, which the interface renders as still moving. */
	readonly live: boolean;
	/** The expression this came from, so a round trip is exact. */
	readonly expression: string;
}

const UNITS: Readonly<Record<string, number>> = {
	s: SECOND,
	m: MINUTE,
	h: HOUR,
	d: DAY,
	w: 7 * DAY
};

/** `-15m`, `-6h`, `-7d`. The leading minus is required and says "ago". */
const RELATIVE = /^-(\d+)([smhdw])$/;

/** `1764547200000..1764550800000`. Absolute, in epoch milliseconds. */
const ABSOLUTE = /^(\d{10,16})\.\.(\d{10,16})$/;

export const DEFAULT_RANGE = '-1h';

/**
 * The presets the range picker offers.
 *
 * Deliberately short. A picker with twenty options is one nobody reads, and the
 * three that matter during an incident — fifteen minutes, an hour, a day — are
 * the ones a person reaches for without looking.
 */
export const PRESETS: readonly { readonly expression: string; readonly label: string }[] = [
	{ expression: '-5m', label: 'Last 5 minutes' },
	{ expression: '-15m', label: 'Last 15 minutes' },
	{ expression: '-1h', label: 'Last hour' },
	{ expression: '-6h', label: 'Last 6 hours' },
	{ expression: '-24h', label: 'Last 24 hours' },
	{ expression: '-7d', label: 'Last 7 days' }
];

/**
 * Resolve an expression against a clock.
 *
 * Never throws. An unparseable expression falls back to the default rather than
 * erroring, because this value comes from a URL — which means it comes from a
 * chat message that a client wrapped, an email that added a full stop, or
 * somebody editing the address bar. Showing the last hour is a better answer to
 * a malformed range than an error page, and the interface says which range it
 * settled on so the fallback is visible rather than silent.
 */
export function resolve(expression: string | null | undefined, now = Date.now()): Resolved {
	const text = (expression ?? '').trim();

	const relative = RELATIVE.exec(text);
	if (relative) {
		const amount = Number(relative[1]);
		const unit = UNITS[relative[2]!]!;
		const span = amount * unit;

		// A zero-width range renders as a division by zero in every chart. Treat it
		// as the default rather than propagating a degenerate window.
		if (span > 0) return { from: now - span, to: now, live: true, expression: text };
	}

	const absolute = ABSOLUTE.exec(text);
	if (absolute) {
		const from = Number(absolute[1]);
		const to = Number(absolute[2]);
		// Reversed bounds are a dragged selection that went right to left, which is
		// a perfectly ordinary gesture. Swapping is friendlier than refusing.
		if (Number.isFinite(from) && Number.isFinite(to) && from !== to) {
			return {
				from: Math.min(from, to),
				to: Math.max(from, to),
				live: false,
				expression: text
			};
		}
	}

	return resolve(DEFAULT_RANGE, now);
}

/** Freeze a live range into the window it currently covers. The "pin" action. */
export function pin(range: Resolved): string {
	return `${Math.round(range.from)}..${Math.round(range.to)}`;
}

/**
 * A range as a person would say it.
 *
 * A relative range keeps its own words — "Last 6 hours" — because that is what
 * it *is*, and rendering it as two timestamps would hide the fact that it moves.
 * An absolute one is rendered as a span with dates, because "1764547200000 to
 * 1764550800000" is not a sentence.
 */
export function describeRange(range: Resolved, locale = 'en-GB'): string {
	if (range.live) {
		const preset = PRESETS.find((option) => option.expression === range.expression);
		if (preset) return preset.label;

		const relative = RELATIVE.exec(range.expression);
		if (relative) return `Last ${relative[1]}${relative[2]}`;
	}

	const format = new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	});

	return `${format.format(range.from)} — ${format.format(range.to)}`;
}

/** How wide the range is, in milliseconds. */
export function spanOf(range: Resolved): number {
	return range.to - range.from;
}

/**
 * Shift a range by a fraction of its own width.
 *
 * Used by the "earlier"/"later" buttons and by dragging a chart. Shifting a
 * *live* range pins it first: "an hour ago, moving" is not a thing, and silently
 * keeping it live would make the shift undo itself on the next refresh.
 */
export function shift(range: Resolved, fraction: number): string {
	const span = spanOf(range);
	const delta = Math.round(span * fraction);
	return `${Math.round(range.from) + delta}..${Math.round(range.to) + delta}`;
}

/**
 * Zoom about the centre.
 *
 * `factor` above 1 widens. Clamped at both ends: below a second every chart has
 * one bucket, and above about ten years the bucket ladder runs out and the query
 * scans everything a tenant has.
 */
export function zoom(range: Resolved, factor: number): string {
	const span = spanOf(range);
	const centre = range.from + span / 2;
	const next = Math.min(Math.max(span * factor, SECOND), 3650 * DAY);

	return `${Math.round(centre - next / 2)}..${Math.round(centre + next / 2)}`;
}

/**
 * A short, absolute timestamp for a table cell.
 *
 * Includes milliseconds, because log lines within one second are common and a
 * table where six rows share a timestamp cannot be read in order. Omits the date
 * when the range is inside one day, because repeating it on every row is noise
 * that pushes the message out of view — which is the column people are reading.
 */
export function formatTimestamp(at: number, range: Resolved, locale = 'en-GB'): string {
	const sameDay = spanOf(range) < DAY;

	const time = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
		timeZone: 'UTC'
	}).format(at);

	const ms = String(Math.floor(at) % 1000).padStart(3, '0');
	if (sameDay) return `${time}.${ms}`;

	const date = new Intl.DateTimeFormat(locale, {
		day: '2-digit',
		month: 'short',
		timeZone: 'UTC'
	}).format(at);

	return `${date} ${time}.${ms}`;
}

/**
 * A duration, at a precision that suits its size.
 *
 * `1.23ms`, `450ms`, `1.2s`, `2m 5s`. Three significant figures at most: a
 * latency column reading `203.99999999999997ms` is the kind of detail that makes
 * people stop trusting the whole table, and a column of numbers with different
 * decimal counts cannot be scanned.
 */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms)) return '—';
	if (ms < 1) return `${round(ms, 2)}ms`;
	if (ms < 1_000) return `${round(ms, ms < 10 ? 1 : 0)}ms`;
	if (ms < 60_000) return `${round(ms / 1_000, 2)}s`;

	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1_000);
	return `${minutes}m ${seconds}s`;
}

function round(value: number, places: number): number {
	const scale = 10 ** places;
	return Math.round(value * scale) / scale;
}
