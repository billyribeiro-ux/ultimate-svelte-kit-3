/**
 * DATES WITHOUT TIMES
 * ===================
 *
 * A trip runs from the 10th to the 17th. Not from 00:00 on the 10th in
 * Lisbon to 23:59 on the 17th in Tokyo — the *dates*, wherever you happen to
 * be reading them. `Date` cannot say that: it is an instant, and an instant
 * has a time zone the moment you format it, which is how a trip that starts
 * on the 10th is shown starting on the 9th to somebody in California.
 *
 * So a trip date is a string, `YYYY-MM-DD`, in the database and on the wire,
 * and a `CalendarDate` from `@internationalized/date` when arithmetic is
 * needed. The same library drives Bits UI's date pickers, so the value a
 * person picks is the value that is stored, with no conversion in between.
 * `src/hooks.ts` teaches SvelteKit to carry a `CalendarDate` across the wire
 * intact (`transport`), for the one place that sends one.
 */

import {
	CalendarDate,
	DateFormatter,
	getLocalTimeZone,
	parseDate,
	today
} from '@internationalized/date';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date, not just four-two-two digits. */
export function isIsoDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;
	try {
		parseDate(value);
		return true;
	} catch {
		return false;
	}
}

export function fromIso(value: string): CalendarDate {
	return parseDate(value);
}

export function toIso(date: CalendarDate): string {
	return date.toString();
}

/** Today, where this code is running. Only the seed and the "new trip" default use it. */
export function todayIso(): string {
	return today(getLocalTimeZone()).toString();
}

/** Inclusive: the 10th to the 10th is one day. */
export function dayCount(start: string, end: string): number {
	return Math.max(0, fromIso(end).compare(fromIso(start)) + 1);
}

/** Every date from `start` to `end`, inclusive, in order. */
export function eachDay(start: string, end: string): string[] {
	const days: string[] = [];
	const last = fromIso(end);
	for (let day = fromIso(start); day.compare(last) <= 0; day = day.add({ days: 1 })) {
		days.push(day.toString());
	}
	return days;
}

export function isWithin(date: string, start: string, end: string): boolean {
	const d = fromIso(date);
	return d.compare(fromIso(start)) >= 0 && d.compare(fromIso(end)) <= 0;
}

/** Strings sort the way dates do, which is the point of the ISO format. */
export function compareIso(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/*
 * FORMATTING, CACHED
 * ------------------
 * An `Intl.DateTimeFormat` costs a few hundred microseconds to build — it
 * loads locale data — and an itinerary formats forty dates per render. The
 * cache key includes the locale, because project 5 once cached by options
 * alone and served German dates to an English page.
 */
const formatters = new Map<string, DateFormatter>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): DateFormatter {
	const key = `${locale}|${JSON.stringify(options)}`;
	let f = formatters.get(key);
	if (!f) {
		f = new DateFormatter(locale, { ...options, timeZone: 'UTC' });
		formatters.set(key, f);
	}
	return f;
}

export type DateStyle = 'day' | 'short' | 'long';

const STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
	day: { weekday: 'short', day: 'numeric' },
	short: { day: 'numeric', month: 'short' },
	long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
};

/**
 * `toDate('UTC')` plus a UTC formatter: the calendar date becomes midnight
 * UTC and is formatted in UTC, so it comes back out as the same date
 * wherever the formatting happens.
 */
export function formatDate(date: string, locale: string, style: DateStyle = 'short'): string {
	return formatter(locale, STYLES[style]).format(fromIso(date).toDate('UTC'));
}

/** "10 – 17 May 2026", collapsing what the two ends share. */
export function formatRange(start: string, end: string, locale: string): string {
	return formatter(locale, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
		fromIso(start).toDate('UTC'),
		fromIso(end).toDate('UTC')
	);
}
