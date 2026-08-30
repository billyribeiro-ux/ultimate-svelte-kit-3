/**
 * The occupancy grid.
 *
 * The diary is not continuous. It is a row of five-minute cells, and every
 * appointment is a run of consecutive cells. That single decision is what turns
 * "does this booking overlap another one" — a question with an embarrassing
 * number of off-by-one edge cases — into "is this cell taken", which is a set
 * lookup and cannot be got wrong.
 *
 * A cell is identified by the instant it starts, in milliseconds since 1970 UTC.
 * Because 5 minutes divides evenly into an hour and epoch zero is on the hour,
 * every cell boundary is a clean multiple of `SLOT_MS` in every time zone on
 * Earth — including the ones offset by 30 or 45 minutes. Nothing here needs to
 * know about time zones at all, which is exactly why it is reliable.
 */

/** Occupancy granularity. Every duration, buffer and interval must divide by it. */
export const SLOT_MINUTES = 5;

/** The same number, in milliseconds, because that is the unit instants use. */
export const SLOT_MS = SLOT_MINUTES * 60 * 1000;

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Minutes in a day of wall-clock time. Not a duration — see `wall-clock` below. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * The start of the cell containing `instant`.
 *
 * `Math.floor` rather than `Math.trunc`, because instants before 1970 are
 * negative and `trunc` rounds those the wrong way — towards zero, i.e. forwards
 * in time. Nobody will book a haircut in 1969, but the day someone feeds this a
 * negative number by accident, flooring is the behaviour that stays consistent.
 */
export function floorToSlot(instant: number): number {
	return Math.floor(instant / SLOT_MS) * SLOT_MS;
}

/** The start of the first cell at or after `instant`. */
export function ceilToSlot(instant: number): number {
	return Math.ceil(instant / SLOT_MS) * SLOT_MS;
}

/** Whether an instant sits exactly on a cell boundary. */
export function isSlotAligned(instant: number): boolean {
	return instant % SLOT_MS === 0;
}

/** Whether a number of minutes is a whole number of cells. */
export function isWholeSlots(minutes: number): boolean {
	return Number.isInteger(minutes) && minutes % SLOT_MINUTES === 0;
}

/** A half-open span of real time: `start` is inside it, `end` is not. */
export interface Interval {
	readonly start: number;
	readonly end: number;
}

/**
 * Every cell touched by the half-open interval `[start, end)`.
 *
 * Half-open is the whole trick. An appointment ending at 09:45 and one starting
 * at 09:45 do not clash, and expressing that with inclusive bounds means writing
 * `end - 1` somewhere and getting it wrong eventually. Here the rule is simply:
 * the cell containing `end` is not included unless the interval reaches into it.
 *
 * The bounds are widened outwards first. An interval that starts at 09:02 still
 * consumes the 09:00 cell, because half of that cell is genuinely unusable.
 */
export function slotsIn({ start, end }: Interval): number[] {
	if (!(end > start)) return [];

	const first = floorToSlot(start);
	const last = ceilToSlot(end);
	const cells: number[] = [];

	for (let cell = first; cell < last; cell += SLOT_MS) cells.push(cell);

	return cells;
}

/** How many cells `[start, end)` occupies, without building the array. */
export function slotCount({ start, end }: Interval): number {
	if (!(end > start)) return 0;
	return (ceilToSlot(end) - floorToSlot(start)) / SLOT_MS;
}

/**
 * Whether an interval is completely free.
 *
 * `occupied` is a `Set` of cell start instants — exactly what a range query
 * against `slot_claim` produces. Membership is O(1), so checking a 60-minute
 * appointment is twelve hash lookups. That is fast enough to check every
 * candidate start time in a fortnight without thinking about it.
 */
export function isFree(interval: Interval, occupied: ReadonlySet<number>): boolean {
	const last = ceilToSlot(interval.end);
	for (let cell = floorToSlot(interval.start); cell < last; cell += SLOT_MS) {
		if (occupied.has(cell)) return false;
	}
	return true;
}

/**
 * Collapse a list of intervals into the smallest set of non-overlapping ones.
 *
 * Used for turning a staff member's scattered working windows — which may be
 * written as overlapping rows by a well-meaning owner — into a tidy list before
 * offering slots inside them. Sort by start, then either extend the interval
 * you are holding or begin a new one.
 *
 * `<=` rather than `<` on the comparison merges touching intervals too: 09:00–12:00
 * and 12:00–17:00 become one 09:00–17:00 window rather than two, which matters
 * because an appointment is allowed to straddle that seam.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
	const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);

	const merged: Interval[] = [];
	for (const next of sorted) {
		const current = merged[merged.length - 1];
		if (current && next.start <= current.end) {
			// Overlapping or touching — widen the one we are holding. `Math.max` is
			// needed because the next interval may be entirely inside the current one.
			merged[merged.length - 1] = { start: current.start, end: Math.max(current.end, next.end) };
		} else {
			merged.push({ start: next.start, end: next.end });
		}
	}

	return merged;
}
