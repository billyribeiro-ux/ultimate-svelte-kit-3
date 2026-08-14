import {
	CalendarDateTime,
	DateFormatter,
	fromAbsolute,
	getDayOfWeek,
	getHoursInDay,
	getLocalTimeZone,
	parseDate,
	toCalendarDate,
	toZoned,
	type CalendarDate
} from '@internationalized/date';
import { MINUTES_PER_DAY } from './grid.ts';

/**
 * Turning wall-clock time into real time, and back.
 *
 * Three ideas have to stay apart in your head, and this file is where they meet:
 *
 *   **An instant** is a moment. Everyone on Earth experiences it simultaneously.
 *   We store instants as milliseconds since 1970 UTC. `Date` is one of these.
 *
 *   **A local date** is a page in a calendar: `2026-08-14`. It is not a moment —
 *   it is a different length of time depending on where you are, and it starts
 *   at different instants in Auckland and in Vancouver.
 *
 *   **A wall-clock time** is a reading on a clock: `09:00`. Also not a moment.
 *   "Nine in the morning" happens 24-odd times a day across the world.
 *
 * Opening hours are wall-clock. Appointments are instants. Converting between
 * them requires a time zone, and — twice a year — a decision about what to do
 * when the conversion has no answer or two.
 */

/** IANA identifier, e.g. `Europe/London`. Aliased for readability, not safety. */
export type TimeZone = string;

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A local calendar day as `YYYY-MM-DD`. */
export type IsoDate = string;

export const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

/**
 * What to do when a wall-clock time is impossible or ambiguous.
 *
 * On the morning clocks spring forward, 01:30 simply does not occur — the hour
 * is deleted. On the morning they fall back, 01:30 occurs twice.
 *
 *   `compatible` — the behaviour every other date library and every operating
 *                  system has settled on: skip forward past a gap, take the
 *                  first of a repeat. Right for opening hours.
 *   `earlier` / `later` — take a side of an ambiguous time deliberately.
 *   `reject`    — throw. Right for a time a human typed and must be asked about.
 */
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

/** Whether a string is a time zone this runtime actually knows. */
export function isValidTimeZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-GB', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/**
 * The visitor's own time zone, as their browser reports it.
 *
 * Only meaningful in a browser. On the server this returns whatever the server
 * is set to — which is almost always UTC and almost never what you want to show
 * anybody. Every caller must have a fallback.
 */
export function detectTimeZone(): TimeZone {
	return getLocalTimeZone();
}

/**
 * Which day of the week a calendar date falls on, 0 = Sunday.
 *
 * The locale is pinned to `en-US` on purpose. `getDayOfWeek` returns a number
 * relative to whichever day that locale treats as the first of the week — Sunday
 * in the US, Monday in most of Europe, Saturday in much of the Middle East. Left
 * to the visitor's locale, a rule stored as "weekday 1" would mean Monday for a
 * customer in London and Tuesday for one in Riyadh, and the salon's Monday hours
 * would appear on the wrong day. Pinning it makes the number mean one thing.
 */
export function weekdayOf(date: IsoDate | CalendarDate): Weekday {
	const calendar = typeof date === 'string' ? parseDate(date) : date;
	return getDayOfWeek(calendar, 'en-US') as Weekday;
}

/**
 * The instant at which `minuteOfDay` on the local date `day` occurs in `zone`.
 *
 * `minuteOfDay` is minutes past local midnight and may exceed 1440, which is how
 * a window that runs past midnight is expressed: a bar open until 2am closes at
 * minute 1560 on the day it opened, not minute 120 on the next one. Modelling it
 * that way keeps "Friday night" a single row rather than two that have to be
 * stitched back together.
 */
export function wallClockToInstant(
	day: IsoDate,
	minuteOfDay: number,
	zone: TimeZone,
	disambiguation: Disambiguation = 'compatible'
): number {
	const dayOffset = Math.floor(minuteOfDay / MINUTES_PER_DAY);
	const minute = minuteOfDay - dayOffset * MINUTES_PER_DAY;

	const date = parseDate(day).add({ days: dayOffset });
	const local = new CalendarDateTime(
		date.year,
		date.month,
		date.day,
		Math.floor(minute / 60),
		minute % 60
	);

	return toZoned(local, zone, disambiguation).toDate().getTime();
}

/** The instant local midnight begins on `day` in `zone`. */
export function startOfDayInstant(day: IsoDate, zone: TimeZone): number {
	return wallClockToInstant(day, 0, zone);
}

/**
 * The instant the *next* local midnight begins.
 *
 * Deliberately not "start of day plus 24 hours". On the day clocks change, a
 * local day is 23 or 25 hours long, and adding a fixed 24 would either miss an
 * hour of the diary or leak an hour of the next day into it.
 */
export function endOfDayInstant(day: IsoDate, zone: TimeZone): number {
	return wallClockToInstant(day, MINUTES_PER_DAY, zone);
}

/** How many real hours the local day `day` lasts: 23, 24 or 25. */
export function hoursInLocalDay(day: IsoDate, zone: TimeZone): number {
	return getHoursInDay(parseDate(day), zone);
}

/** The local calendar date an instant falls on, in `zone`. */
export function instantToIsoDate(instant: number, zone: TimeZone): IsoDate {
	return toCalendarDate(fromAbsolute(instant, zone)).toString();
}

/** Minutes past local midnight, for an instant, in `zone`. */
export function instantToMinuteOfDay(instant: number, zone: TimeZone): number {
	const zoned = fromAbsolute(instant, zone);
	return zoned.hour * 60 + zoned.minute;
}

/** Today's local date in `zone`, as `YYYY-MM-DD`. */
export function todayIn(zone: TimeZone, now: number = Date.now()): IsoDate {
	return instantToIsoDate(now, zone);
}

/** `day` shifted by whole calendar days — never by a fixed number of hours. */
export function addDays(day: IsoDate, days: number): IsoDate {
	return parseDate(day).add({ days }).toString();
}

/** Every local date from `from` to `to`, inclusive. */
export function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
	const out: IsoDate[] = [];
	let cursor = parseDate(from);
	const end = parseDate(to);

	// `compare` returns a negative number while `cursor` is still before `end`.
	// Comparing the string forms would work for ISO dates too, but only by
	// accident of formatting; this stays correct if the shape ever changes.
	while (cursor.compare(end) <= 0) {
		out.push(cursor.toString());
		cursor = cursor.add({ days: 1 });
	}

	return out;
}

/** Whole days from `from` to `to`. Negative if `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
	// Both are converted at UTC midnight, so no zone or DST is involved: this is
	// arithmetic on calendar pages, not on elapsed time.
	const a = Date.UTC(...isoParts(from));
	const b = Date.UTC(...isoParts(to));
	return Math.round((b - a) / 86_400_000);
}

function isoParts(day: IsoDate): [number, number, number] {
	const date = parseDate(day);
	return [date.year, date.month - 1, date.day];
}

/* -------------------------------------------------------------------------- */
/* Zone naming                                                                 */
/* -------------------------------------------------------------------------- */

/*
 * `DateFormatter` wraps `Intl.DateTimeFormat` with a cache. Constructing an
 * `Intl.DateTimeFormat` is genuinely expensive — it loads locale data — and a
 * booking grid formats a few hundred times per render. Without the cache this is
 * the slowest code in the app; with it, it does not register.
 */
const shortZoneFormatters = new Map<string, DateFormatter>();

function zoneFormatter(zone: TimeZone, locale: string): DateFormatter {
	const key = `${zone}|${locale}`;
	let formatter = shortZoneFormatters.get(key);
	if (!formatter) {
		formatter = new DateFormatter(locale, { timeZone: zone, timeZoneName: 'short' });
		shortZoneFormatters.set(key, formatter);
	}
	return formatter;
}

/**
 * The short zone name in force at an instant: `BST`, `GMT`, `EST`.
 *
 * This is the label that makes a fall-back morning readable. Two slots both
 * showing "01:30" is confusing; "01:30 BST" and "01:30 GMT" is simply the truth.
 */
export function zoneAbbreviation(
	instant: number,
	zone: TimeZone,
	locale: string = 'en-GB'
): string {
	const parts = zoneFormatter(zone, locale).formatToParts(new Date(instant));
	return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/** The UTC offset at an instant, in minutes. `+60` for BST. */
export function offsetMinutesAt(instant: number, zone: TimeZone): number {
	return fromAbsolute(instant, zone).offset / 60_000;
}

/** That offset written the way people read it: `UTC+01:00`. */
export function offsetLabel(instant: number, zone: TimeZone): string {
	const minutes = offsetMinutesAt(instant, zone);
	const sign = minutes < 0 ? '-' : '+';
	const abs = Math.abs(minutes);
	const hh = String(Math.floor(abs / 60)).padStart(2, '0');
	const mm = String(abs % 60).padStart(2, '0');
	return `UTC${sign}${hh}:${mm}`;
}

/**
 * Whether two zones show the same wall clock at a given instant.
 *
 * Used to decide whether to bother telling a customer that a time is "3pm your
 * time, 4pm at the salon". If the answer is no, saying it is noise.
 */
export function sameWallClock(instant: number, a: TimeZone, b: TimeZone): boolean {
	return offsetMinutesAt(instant, a) === offsetMinutesAt(instant, b);
}

/**
 * A modest, curated list of zones for the settings dropdown.
 *
 * `Intl.supportedValuesOf('timeZone')` returns well over four hundred, which is
 * a correct answer to a question nobody asked. A small business owner picks
 * their own city once; they do not need `America/Argentina/Catamarca` in the way.
 * The field still accepts any valid IANA name — this list is the shortcut, not
 * the boundary.
 */
export const COMMON_TIME_ZONES = [
	'Europe/London',
	'Europe/Dublin',
	'Europe/Lisbon',
	'Europe/Madrid',
	'Europe/Paris',
	'Europe/Berlin',
	'Europe/Amsterdam',
	'Europe/Rome',
	'Europe/Stockholm',
	'Europe/Warsaw',
	'Europe/Athens',
	'Europe/Istanbul',
	'America/New_York',
	'America/Toronto',
	'America/Chicago',
	'America/Denver',
	'America/Los_Angeles',
	'America/Vancouver',
	'America/Sao_Paulo',
	'Africa/Lagos',
	'Africa/Johannesburg',
	'Africa/Nairobi',
	'Asia/Dubai',
	'Asia/Kolkata',
	'Asia/Singapore',
	'Asia/Hong_Kong',
	'Asia/Tokyo',
	'Asia/Seoul',
	'Australia/Perth',
	'Australia/Sydney',
	'Pacific/Auckland'
] as const;
