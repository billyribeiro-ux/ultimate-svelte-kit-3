/**
 * HOW A VALUE LOOKS
 * =================
 *
 * A cell holds `1234.5`; a person sees `1,234.50`, or `1.234,50`, or `$1,234.50`,
 * or `2 Sep 2026` if the format says the number is a date. This module is the
 * whole of that translation, and it has one rule: every locale-dependent
 * decision is made by `Intl`, never by hand. The browser already knows that
 * German groups with a dot and decimals with a comma; a table of separators in
 * this file would be a table that is wrong for the locale nobody tested.
 *
 * FORMATTERS ARE CACHED
 * ---------------------
 * `new Intl.NumberFormat()` costs tens of microseconds — it loads locale data.
 * A grid formats every visible cell on every scroll, and ten thousand of
 * those per second is a hundred milliseconds of building the same formatter.
 * One formatter per (locale, options) pair, kept in a `Map`, is the difference
 * between a grid that scrolls and one that stutters.
 */

import { ErrorValue, plainNumber, type Scalar } from '#lib/formula/values.ts';
import { dateFromSerial, isPlausibleDate, partsFromSerial } from './dates.ts';

export type CellFormat =
	| { kind: 'general' }
	| { kind: 'number'; decimals: number; grouping: boolean }
	| { kind: 'percent'; decimals: number }
	| { kind: 'currency'; currency: string; decimals: number }
	| { kind: 'date'; style: 'short' | 'medium' | 'long' | 'iso' }
	| { kind: 'datetime' }
	| { kind: 'time' }
	| { kind: 'text' };

export const GENERAL: CellFormat = { kind: 'general' };

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function numberFormatter(
	locale: string,
	options: Intl.NumberFormatOptions
): Intl.NumberFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let formatter = numberFormatters.get(key);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, options);
		numberFormatters.set(key, formatter);
	}
	return formatter;
}

export function dateFormatter(
	locale: string,
	options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let formatter = dateFormatters.get(key);
	if (!formatter) {
		// Serials are UTC-based (see dates.ts); formatting in UTC is what keeps a
		// date from shifting by a day between two people in two zones.
		formatter = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
		dateFormatters.set(key, formatter);
	}
	return formatter;
}

/** The text a cell shows for a value under a format. Never throws; an error shows its code. */
export function formatScalar(value: Scalar, format: CellFormat, locale: string): string {
	if (value === null) return '';
	if (value instanceof ErrorValue) return value.code;
	if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

	if (typeof value === 'string') {
		// A number typed as text stays text; a text format on a number shows the
		// number's plain form.
		return value;
	}

	if (!Number.isFinite(value)) return '#NUM!';

	switch (format.kind) {
		case 'general':
			return numberFormatter(locale, { maximumSignificantDigits: 15, useGrouping: false }).format(
				value
			);
		case 'text':
			return plainNumber(value);
		case 'number':
			return numberFormatter(locale, {
				minimumFractionDigits: format.decimals,
				maximumFractionDigits: format.decimals,
				useGrouping: format.grouping
			}).format(value);
		case 'percent':
			return numberFormatter(locale, {
				style: 'percent',
				minimumFractionDigits: format.decimals,
				maximumFractionDigits: format.decimals
			}).format(value);
		case 'currency':
			return numberFormatter(locale, {
				style: 'currency',
				currency: format.currency,
				minimumFractionDigits: format.decimals,
				maximumFractionDigits: format.decimals
			}).format(value);
		case 'date':
			return formatDate(value, format.style, locale);
		case 'datetime':
			if (!isPlausibleDate(value)) return plainNumber(value);
			return dateFormatter(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
				dateFromSerial(value)
			);
		case 'time':
			return dateFormatter(locale, { timeStyle: 'short' }).format(dateFromSerial(value));
		default:
			format satisfies never;
			return plainNumber(value);
	}
}

function formatDate(
	serial: number,
	style: 'short' | 'medium' | 'long' | 'iso',
	locale: string
): string {
	if (!isPlausibleDate(serial)) return plainNumber(serial);
	if (style === 'iso') {
		const { year, month, day } = partsFromSerial(serial);
		return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}
	return dateFormatter(locale, { dateStyle: style }).format(dateFromSerial(serial));
}

/**
 * The patterns people know from other spreadsheets — `0.00`, `#,##0`, `0%`,
 * `$#,##0.00`, `yyyy-mm-dd` — mapped onto the formats above. `TEXT()` uses
 * this; so does the paste handler when it meets a formatted number. Anything
 * unrecognised is `null`, and the caller decides what that means.
 */
export function formatFromPattern(pattern: string): CellFormat | null {
	const p = pattern.trim();
	const lower = p.toLowerCase();

	if (lower === '' || lower === 'general') return GENERAL;
	if (lower === '@') return { kind: 'text' };

	const decimalsOf = (text: string) => {
		const dot = text.indexOf('.');
		return dot === -1 ? 0 : text.length - dot - 1;
	};

	if (/^0(\.0+)?%$/.test(p)) return { kind: 'percent', decimals: decimalsOf(p.slice(0, -1)) };
	if (/^#,##0(\.0+)?$/.test(p)) return { kind: 'number', decimals: decimalsOf(p), grouping: true };
	if (/^0(\.0+)?$/.test(p)) return { kind: 'number', decimals: decimalsOf(p), grouping: false };

	const currency = /^([$€£¥])#,##0(\.0+)?$/.exec(p);
	if (currency) {
		const codes: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
		return { kind: 'currency', currency: codes[currency[1]!]!, decimals: decimalsOf(p) };
	}

	if (lower === 'yyyy-mm-dd') return { kind: 'date', style: 'iso' };
	if (/^(dd?\/mm?\/yyyy|mm?\/dd?\/yyyy|d\/m\/yy|m\/d\/yy)$/.test(lower))
		return { kind: 'date', style: 'short' };
	if (/^(mmm d,? yyyy|d mmm yyyy|dd mmm yyyy)$/.test(lower))
		return { kind: 'date', style: 'medium' };
	if (/^(mmmm d,? yyyy|d mmmm yyyy)$/.test(lower)) return { kind: 'date', style: 'long' };
	if (/^h+:mm(:ss)?( am\/pm)?$/.test(lower)) return { kind: 'time' };
	if (/^yyyy-mm-dd hh?:mm$/.test(lower)) return { kind: 'datetime' };

	return null;
}

/** A serial's date parts as text pieces, for the fill handle's series detection and tests. */
export { partsFromSerial };
