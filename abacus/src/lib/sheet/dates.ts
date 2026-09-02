/**
 * SERIAL DATES
 * ============
 *
 * A date is a number: whole days since the epoch, with the time of day as a
 * fraction. The epoch is 30 December 1899, so that serial 1 is 31 December
 * 1899 and 2 is 1 January 1900 — the convention Google Sheets uses, and the
 * one Excel *agrees with* from 1 March 1900 onwards. (Excel's serial 60 is 29
 * February 1900, a day that never happened, kept for compatibility with
 * Lotus 1-2-3 in 1987. This project declines to inherit the bug.)
 *
 * Everything here is in UTC on purpose. A date in a cell has no time zone: 2
 * September is 2 September whoever opens the sheet, and a serial computed in
 * one zone and displayed in another must not shift by a day.
 */

const EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/** `(2026, 9, 2)` → 46267. Months are 1-based, like a person writes them; overflow rolls over like `Date` does. */
export function serialFromParts(year: number, month: number, day: number): number {
	return (Date.UTC(year, month - 1, day) - EPOCH_MS) / DAY_MS;
}

export function serialFromDate(date: Date): number {
	return (date.getTime() - EPOCH_MS) / DAY_MS;
}

/** The moment a serial names, in UTC. */
export function dateFromSerial(serial: number): Date {
	return new Date(EPOCH_MS + serial * DAY_MS);
}

export function partsFromSerial(serial: number): {
	year: number;
	month: number;
	day: number;
	hours: number;
	minutes: number;
	seconds: number;
} {
	const date = dateFromSerial(serial);
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate(),
		hours: date.getUTCHours(),
		minutes: date.getUTCMinutes(),
		seconds: date.getUTCSeconds()
	};
}

/** Today, as a whole-day serial, in the person's own zone: the date they would write down. */
export function todaySerial(now = new Date()): number {
	return serialFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Now, with the fraction, in the person's own zone. */
export function nowSerial(now = new Date()): number {
	const wall = Date.UTC(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		now.getHours(),
		now.getMinutes(),
		now.getSeconds()
	);
	return (wall - EPOCH_MS) / DAY_MS;
}

/** A serial that names a date a person could plausibly mean: 1900 to 9999. */
export function isPlausibleDate(serial: number): boolean {
	return serial >= 1 && serial < 2_958_466;
}
