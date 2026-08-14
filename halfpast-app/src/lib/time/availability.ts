import { isFree, mergeIntervals, slotsIn, MINUTE_MS, type Interval, isWholeSlots } from './grid.ts';
import {
	datesBetween,
	instantToIsoDate,
	wallClockToInstant,
	weekdayOf,
	type IsoDate,
	type TimeZone,
	type Weekday
} from './zone.ts';

/**
 * The availability engine.
 *
 * Given a person's recurring hours, the things already in their diary, and the
 * shape of a service, produce every start time a customer may actually pick.
 *
 * It is a pure function. No database, no clock, no network — every input is an
 * argument, including `now`. That is not purism: it is the only way to write a
 * test for "what happens on the morning the clocks go back", because you cannot
 * wait six months for the answer.
 */

/** A recurring weekly window, in wall-clock minutes past local midnight. */
export interface WeeklyRule {
	readonly weekday: Weekday;
	readonly startMinute: number;
	/** May exceed 1440 for a window that runs past midnight. */
	readonly endMinute: number;
	/** Inclusive `YYYY-MM-DD` bounds on when this rule applies. */
	readonly effectiveFrom?: string | null;
	readonly effectiveTo?: string | null;
}

/** The shape of the thing being booked. */
export interface ServiceShape {
	readonly durationMinutes: number;
	readonly bufferBeforeMinutes: number;
	readonly bufferAfterMinutes: number;
	/** How often a start time is offered. Merchandising, not physics. */
	readonly slotIntervalMinutes: number;
}

export interface AvailabilityQuery {
	/** The zone the rules' wall-clock times are written in: the business's own. */
	readonly timeZone: TimeZone;
	/** Inclusive range of local calendar days to compute. */
	readonly from: IsoDate;
	readonly to: IsoDate;
	readonly rules: readonly WeeklyRule[];
	readonly service: ServiceShape;
	/**
	 * Occupied grid cells, as start instants. Comes straight from a range query
	 * against `slot_claim`, plus any time off expanded onto the same grid.
	 */
	readonly occupied: ReadonlySet<number>;
	/** Now, as an instant. Passed in so tests can choose it. */
	readonly now: number;
	/** Minutes of notice required before an appointment may be booked. */
	readonly minNoticeMinutes: number;
	/** How far ahead the diary is open, in days. */
	readonly maxAdvanceDays: number;
}

/** One bookable start time. */
export interface Slot {
	/** When the customer's appointment begins. */
	readonly start: number;
	/** When it ends, from the customer's point of view. */
	readonly end: number;
	/** What the diary actually loses, buffers included. */
	readonly blockStart: number;
	readonly blockEnd: number;
}

/**
 * Turn recurring wall-clock rules into real working windows, as instants.
 *
 * This is where the twice-yearly weirdness lives, and it is worth being precise
 * about what happens, because the naive version is wrong in a way nobody notices
 * until a Sunday in October.
 *
 * A rule says "Monday, 09:00 to 17:00". Those two readings are converted to
 * instants *independently*, and everything downstream walks real time between
 * them. On an ordinary Monday that is eight hours. On the Sunday clocks go
 * forward it would be seven; on the Sunday they go back, nine.
 *
 * That is correct, and it is the answer a shop owner would give if you asked
 * them: the door opens when the clock says nine and closes when it says five,
 * and on one Sunday a year they are genuinely there an hour longer. The
 * tempting alternative — "the window is 480 minutes long" — quietly produces a
 * salon that closes at four in the afternoon on one day a year and at six on
 * another, which is a bug report written in a language nobody can decode.
 *
 * `wallClockToInstant` uses `compatible` disambiguation, so a rule starting at
 * an hour that does not exist that morning shifts forward to the first hour that
 * does, rather than throwing at a customer who did nothing wrong.
 */
export function windowsForDay(
	day: IsoDate,
	rules: readonly WeeklyRule[],
	zone: TimeZone
): Interval[] {
	const weekday = weekdayOf(day);

	const windows = rules
		.filter((rule) => rule.weekday === weekday && ruleAppliesOn(rule, day))
		.map((rule) => ({
			start: wallClockToInstant(day, rule.startMinute, zone),
			end: wallClockToInstant(day, rule.endMinute, zone)
		}));

	// Two rows that touch or overlap become one window, so an appointment may sit
	// across the seam between them.
	return mergeIntervals(windows);
}

/**
 * Whether a rule's validity window covers a given local date.
 *
 * Plain string comparison is safe here and only here: `YYYY-MM-DD` is fixed
 * width, zero padded, and ordered most-significant first, so lexicographic order
 * and chronological order are the same. That is the entire reason ISO 8601 is
 * written that way.
 */
function ruleAppliesOn(rule: WeeklyRule, day: IsoDate): boolean {
	if (rule.effectiveFrom && day < rule.effectiveFrom) return false;
	if (rule.effectiveTo && day > rule.effectiveTo) return false;
	return true;
}

/**
 * Every start time a customer may pick.
 *
 * The shape of the algorithm:
 *
 *   1. Work out the bookable horizon — not before now plus the notice period,
 *      not after the advance limit.
 *   2. For each local day, turn the rules into real working windows.
 *   3. Inside each window, walk forward one `slotIntervalMinutes` at a time.
 *   4. Keep a candidate only if its *block* — appointment plus buffers — fits
 *      inside the window and touches no occupied cell.
 *
 * Steps 3 and 4 are deliberately separate. The interval decides which start
 * times are *offered*; the grid decides which are *possible*. Conflating them
 * gives you either a diary full of unfillable seven-minute gaps or a customer
 * being offered 09:07.
 */
export function availableSlots(query: AvailabilityQuery): Slot[] {
	const { timeZone, service, occupied, now, minNoticeMinutes, maxAdvanceDays } = query;

	assertServiceFitsGrid(service);

	const earliest = now + minNoticeMinutes * MINUTE_MS;
	const latest = now + maxAdvanceDays * 24 * 60 * MINUTE_MS;

	const durationMs = service.durationMinutes * MINUTE_MS;
	const beforeMs = service.bufferBeforeMinutes * MINUTE_MS;
	const afterMs = service.bufferAfterMinutes * MINUTE_MS;
	const stepMs = service.slotIntervalMinutes * MINUTE_MS;

	const slots: Slot[] = [];

	for (const day of datesBetween(query.from, query.to)) {
		for (const window of windowsForDay(day, query.rules, timeZone)) {
			/*
			 * Candidates are laid out from the window's own start, not from midnight.
			 * A salon opening at 09:30 with a 15-minute interval offers 09:30, 09:45,
			 * 10:00 — not 09:45 onwards because midnight-relative arithmetic decided
			 * 09:30 was off-grid.
			 */
			for (let start = window.start; start < window.end; start += stepMs) {
				const end = start + durationMs;
				const blockStart = start - beforeMs;
				const blockEnd = end + afterMs;

				// The whole block — setup, appointment, tidy-up — must fit between the
				// door opening and the door closing.
				if (blockStart < window.start) continue;
				if (blockEnd > window.end) break; // every later start is worse; stop.

				if (start < earliest) continue;
				if (start > latest) break;

				if (!isFree({ start: blockStart, end: blockEnd }, occupied)) continue;

				slots.push({ start, end, blockStart, blockEnd });
			}
		}
	}

	// Windows are produced per rule and per day, so the list is nearly sorted but
	// not guaranteed to be. Sorting once here means every consumer can rely on it.
	return slots.sort((a, b) => a.start - b.start);
}

/**
 * Group slots by the local calendar day they fall on, ready for a day picker.
 *
 * Pass the *viewer's* zone, not the business's. A customer in Los Angeles
 * looking at a London salon should see a 01:00 slot filed under the day it is
 * for them, because that is the day they will have to be awake on. It also means
 * the first and last day of a range can come back partly empty, which is why the
 * caller queries a day either side of what it intends to show.
 */
export function groupByLocalDay(slots: readonly Slot[], zone: TimeZone): Map<IsoDate, Slot[]> {
	const groups = new Map<IsoDate, Slot[]>();

	for (const slot of slots) {
		const day = instantToIsoDate(slot.start, zone);
		const existing = groups.get(day);
		if (existing) existing.push(slot);
		else groups.set(day, [slot]);
	}

	return groups;
}

/**
 * Expand arbitrary busy intervals — time off, holidays — onto the occupancy grid.
 *
 * Time off is written by a human ("away from 12:20 until 13:10") and does not
 * respect five-minute boundaries. Widening it outwards to whole cells is the
 * conservative direction: a partly-blocked cell becomes fully blocked, so we
 * never sell a slot that overlaps somebody's dentist appointment by four minutes.
 */
export function occupiedCellsFrom(intervals: readonly Interval[]): Set<number> {
	const cells = new Set<number>();
	for (const interval of intervals) {
		for (const cell of slotsIn(interval)) cells.add(cell);
	}
	return cells;
}

/**
 * Fail loudly if a service cannot be represented on the grid.
 *
 * A 47-minute service is not slightly wrong, it is unrepresentable: its block
 * would end mid-cell, and the cell it half-occupies would either be sold twice
 * or wasted. Better to refuse at the point of use than to silently round and
 * have a barber wonder why they keep running four minutes late.
 */
function assertServiceFitsGrid(service: ServiceShape): void {
	const problems: string[] = [];

	if (!isWholeSlots(service.durationMinutes)) problems.push(`duration ${service.durationMinutes}`);
	if (!isWholeSlots(service.bufferBeforeMinutes))
		problems.push(`buffer before ${service.bufferBeforeMinutes}`);
	if (!isWholeSlots(service.bufferAfterMinutes))
		problems.push(`buffer after ${service.bufferAfterMinutes}`);
	if (!isWholeSlots(service.slotIntervalMinutes))
		problems.push(`slot interval ${service.slotIntervalMinutes}`);
	if (service.durationMinutes <= 0) problems.push('duration must be positive');
	if (service.slotIntervalMinutes <= 0) problems.push('slot interval must be positive');

	if (problems.length > 0) {
		throw new Error(
			`Service does not fit the 5-minute grid: ${problems.join(', ')}. ` +
				'Durations, buffers and intervals must be positive multiples of 5 minutes.'
		);
	}
}
