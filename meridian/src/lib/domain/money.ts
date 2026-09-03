/**
 * MONEY IS AN INTEGER
 * ===================
 *
 * An amount is stored in *minor units* — cents, pence, centavos — as an
 * integer, and a currency code. `0.1 + 0.2` is not `0.3` in floating point,
 * and a settle-up that is a cent off is a settle-up nobody trusts. The only
 * places a decimal number exists are the input box and the screen, and both
 * go through `Intl`, which knows that yen have no cents and that Germans
 * write a comma.
 */

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'BRL', 'JPY', 'CHF', 'CAD', 'AUD', 'MXN'] as const;
export type Currency = (typeof CURRENCIES)[number];

const digitsByCurrency = new Map<string, number>();

/** How many decimal places the currency has — 2 for most, 0 for JPY. Asked of `Intl`, not a table. */
export function fractionDigits(currency: string): number {
	let digits = digitsByCurrency.get(currency);
	if (digits === undefined) {
		// `maximumFractionDigits` is optional in the type; every real currency has one.
		digits =
			new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
				.maximumFractionDigits ?? 2;
		digitsByCurrency.set(currency, digits);
	}
	return digits;
}

export function toMinor(amount: number, currency: string): number {
	return Math.round(amount * 10 ** fractionDigits(currency));
}

export function fromMinor(minor: number, currency: string): number {
	return minor / 10 ** fractionDigits(currency);
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number, currency: string, locale: string): string {
	const key = `${locale}|${currency}`;
	let f = formatters.get(key);
	if (!f) {
		f = new Intl.NumberFormat(locale, { style: 'currency', currency });
		formatters.set(key, f);
	}
	return f.format(fromMinor(minor, currency));
}

/**
 * A typed amount in the person's own notation, as a number, or `null`.
 *
 * The separators are *discovered* by formatting a known number with the
 * locale and reading the parts back, so "1.234,50" parses in German and
 * "1,234.50" in English without a table of locales in the code. Anything
 * that is not a digit or one of those separators — a currency sign, a
 * space, a stray letter — is dropped before parsing.
 */
export function parseAmount(text: string, locale: string): number | null {
	const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
	const group = parts.find((p) => p.type === 'group')?.value ?? ',';
	const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';

	let s = text.trim();
	s = s.split(group).join('');
	s = s.split(decimal).join('.');
	s = s.replace(/[^\d.-]/g, '');

	if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(s)) return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}
