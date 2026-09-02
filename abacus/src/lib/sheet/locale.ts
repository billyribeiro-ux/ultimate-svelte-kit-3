/**
 * WHAT A PERSON TYPED
 * ===================
 *
 * A German types `1.234,56` and means one thousand two hundred and
 * thirty-four and a bit; an American types `1,234.56` and means the same
 * number. `12%` means twelve hundredths and should *look* like a percentage
 * from then on. `2026-09-02` is a date everywhere; `02/09/2026` is the second
 * of September in London and the ninth of February in New York.
 *
 * This module turns typed text into a value and, when the text implies one,
 * a format. Nothing in it knows any locale: it asks `Intl` how the locale
 * writes a number and a date, and reads the answer backwards.
 */

import type { Scalar } from '#lib/formula/values.ts';
import { serialFromParts } from './dates.ts';
import { numberFormatter, dateFormatter, type CellFormat } from './format.ts';

export interface Separators {
	decimal: string;
	group: string;
}

const separatorCache = new Map<string, Separators>();

/** The decimal and grouping characters a locale uses, read from `Intl` itself. */
export function separators(locale: string): Separators {
	let found = separatorCache.get(locale);
	if (!found) {
		const parts = numberFormatter(locale, { useGrouping: true }).formatToParts(-12345.6);
		found = {
			decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
			group: parts.find((p) => p.type === 'group')?.value ?? ','
		};
		separatorCache.set(locale, found);
	}
	return found;
}

export type DateOrder = 'ymd' | 'dmy' | 'mdy';

const orderCache = new Map<string, DateOrder>();

/** Which of day, month and year a locale writes first — again, asked rather than assumed. */
export function dateOrder(locale: string): DateOrder {
	let found = orderCache.get(locale);
	if (!found) {
		const parts = dateFormatter(locale, { year: 'numeric', month: 'numeric', day: 'numeric' })
			.formatToParts(new Date(Date.UTC(2001, 1, 3)))
			.filter((p) => p.type === 'year' || p.type === 'month' || p.type === 'day')
			.map((p) => p.type[0]);
		const order = parts.join('');
		found = order === 'ymd' ? 'ymd' : order === 'mdy' ? 'mdy' : 'dmy';
		orderCache.set(locale, found);
	}
	return found;
}

/**
 * A number in the locale's notation, or `null`. Group separators are
 * optional but, if present, must be *consistent* — `1,2,3` is not a number
 * in any locale, and the point of the check is that a typo becomes text
 * rather than a silently wrong number.
 */
export function parseNumber(text: string, locale: string): number | null {
	const { decimal, group } = separators(locale);
	let t = text.trim();
	if (t === '') return null;

	let sign = 1;
	if (t.startsWith('-') || t.startsWith('−')) {
		sign = -1;
		t = t.slice(1).trim();
	} else if (t.startsWith('+')) {
		t = t.slice(1).trim();
	}
	// Accounting negative: (1,234.56)
	if (t.startsWith('(') && t.endsWith(')')) {
		sign = -sign;
		t = t.slice(1, -1).trim();
	}

	// Split off the fraction on the locale's decimal mark; a lone `.` in a
	// locale that uses `,` is not a decimal mark, and vice versa.
	const dot = t.lastIndexOf(decimal);
	const whole = dot === -1 ? t : t.slice(0, dot);
	const fraction = dot === -1 ? '' : t.slice(dot + decimal.length);
	if (fraction !== '' && !/^\d+$/.test(fraction)) return null;

	// The whole part: digits, optionally grouped in threes. A narrow no-break
	// space (fr-FR) and a regular space are both accepted as the group mark.
	const groups = whole.split(
		group === '\u202f' || group === '\u00a0' || group === ' ' ? /[\s\u202f\u00a0]/ : group
	);
	if (groups.length === 1) {
		if (!/^\d*$/.test(whole)) return null;
	} else {
		if (!/^\d{1,3}$/.test(groups[0]!)) return null;
		if (!groups.slice(1).every((g) => /^\d{3}$/.test(g))) return null;
	}
	const digits = groups.join('');
	if (digits === '' && fraction === '') return null;

	const n = Number(`${digits || '0'}.${fraction || '0'}`);
	return Number.isFinite(n) ? sign * n : null;
}

/**
 * A date in ISO form or in the locale's short form, as a serial, or `null`.
 * Two-digit years are read as 2000–2069 and 1970–1999, which is what the
 * people typing them mean.
 */
export function parseDate(text: string, locale: string): number | null {
	const t = text.trim();
	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
	if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

	const local = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(t);
	if (!local) return null;
	const a = Number(local[1]);
	const b = Number(local[2]);
	const c = Number(local[3]);
	const order = dateOrder(locale);
	if (local[1]!.length === 4) return validDate(a, b, c); // a year first is a year first anywhere
	const year = c < 100 ? (c < 70 ? 2000 + c : 1900 + c) : c;
	return order === 'mdy' ? validDate(year, a, b) : validDate(year, b, a);
}

function validDate(year: number, month: number, day: number): number | null {
	if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 9999) return null;
	const serial = serialFromParts(year, month, day);
	// Reject 31 February: the serial rolled over into March.
	const check = new Date(Date.UTC(year, month - 1, day));
	if (check.getUTCMonth() !== month - 1) return null;
	return serial;
}

export interface Parsed {
	value: Scalar;
	/** A format the text implied — `12%` implies percent — or `undefined` to keep the cell's. */
	format?: CellFormat;
}

/**
 * The entry point: what a typed string means. Formulas are not handled here
 * — anything starting with `=` is the engine's — and a leading apostrophe
 * forces text, which is how a person keeps a phone number from becoming a
 * number.
 */
export function parseInput(text: string, locale: string): Parsed {
	if (text === '') return { value: null };
	if (text.startsWith("'")) return { value: text.slice(1), format: { kind: 'text' } };

	const t = text.trim();
	const upper = t.toUpperCase();
	if (upper === 'TRUE') return { value: true };
	if (upper === 'FALSE') return { value: false };

	if (t.endsWith('%')) {
		const n = parseNumber(t.slice(0, -1), locale);
		if (n !== null) return { value: n / 100, format: { kind: 'percent', decimals: 0 } };
	}

	const currency = /^([$€£¥])\s?(.+)$/.exec(t) ?? /^(.+?)\s?([$€£¥])$/.exec(t);
	if (currency) {
		const symbol = currency[1]!.length === 1 ? currency[1]! : currency[2]!;
		const rest = currency[1]!.length === 1 ? currency[2]! : currency[1]!;
		const n = parseNumber(rest, locale);
		if (n !== null) {
			const codes: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
			return { value: n, format: { kind: 'currency', currency: codes[symbol]!, decimals: 2 } };
		}
	}

	const n = parseNumber(t, locale);
	if (n !== null) return { value: n };

	const date = parseDate(t, locale);
	if (date !== null) return { value: date, format: { kind: 'date', style: 'short' } };

	return { value: text };
}
