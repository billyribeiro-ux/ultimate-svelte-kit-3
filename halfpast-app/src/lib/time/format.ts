import { DateFormatter } from '@internationalized/date';
import { MINUTE_MS } from './grid.ts';
import { instantToIsoDate, todayIn, type IsoDate, type TimeZone } from './zone.ts';

/**
 * Turning instants into words.
 *
 * Every function here takes an explicit zone. There is no "format this in local
 * time" convenience, and that omission is the point: on the server "local" is
 * whatever the container is set to, and a helper that quietly uses it is a bug
 * that only shows up in production, only for some customers, and only twice a
 * year. Making the zone a required argument means the question gets answered
 * every time it is asked.
 */

/*
 * `Intl.DateTimeFormat` is expensive to construct — it loads locale data — and a
 * booking grid formats several hundred times per render. `DateFormatter` caches
 * by options, and this map caches by the string key we build, so the whole app
 * ends up with a handful of formatter objects rather than thousands.
 */
const cache = new Map<string, DateFormatter>();

function formatter(
	locale: string,
	zone: TimeZone,
	options: Intl.DateTimeFormatOptions
): DateFormatter {
	const key = `${locale}|${zone}|${JSON.stringify(options)}`;
	let found = cache.get(key);
	if (!found) {
		found = new DateFormatter(locale, { ...options, timeZone: zone });
		cache.set(key, found);
	}
	return found;
}

export interface FormatOptions {
	readonly locale?: string;
	/** Include the zone name — `14:30 BST`. Essential on a fall-back morning. */
	readonly withZone?: boolean;
}

/** `14:30`, or `14:30 BST` with `withZone`. */
export function formatTime(
	instant: number,
	zone: TimeZone,
	{ locale = 'en-GB', withZone = false }: FormatOptions = {}
): string {
	return formatter(locale, zone, {
		hour: '2-digit',
		minute: '2-digit',
		...(withZone ? { timeZoneName: 'short' as const } : {})
	}).format(new Date(instant));
}

/** `Fri 14 Aug`. */
export function formatDayShort(instant: number, zone: TimeZone, locale = 'en-GB'): string {
	return formatter(locale, zone, {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(new Date(instant));
}

/** `Friday 14 August 2026`. */
export function formatDayLong(instant: number, zone: TimeZone, locale = 'en-GB'): string {
	return formatter(locale, zone, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date(instant));
}

/** `Fri 14 Aug, 14:30` — one line for a confirmation. */
export function formatDateTime(
	instant: number,
	zone: TimeZone,
	{ locale = 'en-GB', withZone = true }: FormatOptions = {}
): string {
	return `${formatDayShort(instant, zone, locale)}, ${formatTime(instant, zone, { locale, withZone })}`;
}

/** `14:30 – 15:15`. An en dash, because it is a range and not a subtraction. */
export function formatTimeRange(
	start: number,
	end: number,
	zone: TimeZone,
	{ locale = 'en-GB', withZone = false }: FormatOptions = {}
): string {
	return `${formatTime(start, zone, { locale })} – ${formatTime(end, zone, { locale, withZone })}`;
}

/**
 * A duration in minutes, written the way a person says it.
 *
 * `45 min`, `1 hr`, `1 hr 30 min`. Not `0:45`, which reads like a time of day,
 * and not `45 minutes` in a layout where the word has to wrap.
 */
export function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;

	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	const hourPart = `${hours} hr`;

	return rest === 0 ? hourPart : `${hourPart} ${rest} min`;
}

/**
 * Money, from an integer number of minor units.
 *
 * The input is cents/pence precisely so that no float ever touches a price.
 * `Intl.NumberFormat` then applies the right symbol, separator and decimal count
 * for the currency — including the currencies that have no decimal places at all,
 * like the yen, where dividing by 100 would be wrong.
 */
const moneyCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(minorUnits: number, currency: string, locale = 'en-GB'): string {
	const key = `${locale}|${currency}`;
	let format = moneyCache.get(key);
	if (!format) {
		format = new Intl.NumberFormat(locale, { style: 'currency', currency });
		moneyCache.set(key, format);
	}

	// `formatToParts` would let us discover the currency's real precision, but
	// `Intl` already applies it when we divide by the standard 100 and let the
	// formatter round. For the zero-decimal currencies the division is undone by
	// `maximumFractionDigits: 0`, which the formatter sets from the currency.
	return format.format(minorUnits / 100);
}

/**
 * `Today`, `Tomorrow`, or the date — whichever a human would actually say.
 *
 * The comparison is on local calendar dates in the given zone, not on elapsed
 * milliseconds. Something happening in nine hours is "tomorrow" if it crosses
 * local midnight and "today" if it does not, and only the calendar knows which.
 */
export function formatRelativeDay(
	instant: number,
	zone: TimeZone,
	{ locale = 'en-GB', now = Date.now() }: { locale?: string; now?: number } = {}
): string {
	const day = instantToIsoDate(instant, zone);
	const today = todayIn(zone, now);
	const tomorrow = instantToIsoDate(now + 24 * 60 * MINUTE_MS, zone);

	if (day === today) return 'Today';
	if (day === tomorrow) return 'Tomorrow';
	return formatDayShort(instant, zone, locale);
}

/**
 * `2026-08-14` rendered as `Friday 14 August 2026`, without inventing a time.
 *
 * Takes no zone, and must not. A calendar date is not a moment, so there is
 * nothing to convert. It is parsed as UTC midnight and formatted in UTC purely
 * so the numbers survive the round trip — format it in a real zone and the label
 * can slip a day either side of the date line, which is the classic "my birthday
 * shows as the 13th" bug.
 */
export function formatIsoDate(day: IsoDate, locale = 'en-GB'): string {
	const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
	const instant = Date.UTC(year, month - 1, date);

	return formatter(locale, 'UTC', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date(instant));
}
