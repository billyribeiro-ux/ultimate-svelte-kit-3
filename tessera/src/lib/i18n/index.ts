/**
 * TRANSLATION
 * ===========
 *
 * No library, no message compiler, no ICU parser. A catalogue is an object, a
 * message is a value or a function, and `t` is the catalogue for the current
 * language.
 *
 * That is not minimalism for its own sake — it buys three things a runtime
 * interpolator cannot:
 *
 *   - `t.board.nodes(3)` is checked. Passing a string, or forgetting the
 *     argument, is a build error rather than `{count}` on somebody's screen.
 *   - Renaming a key is a rename, across every catalogue, with the compiler
 *     listing what is left.
 *   - Plurals are expressed in the language's own terms. Japanese has none, and
 *     its catalogue simply does not branch — which no `one{}/other{}` scheme can
 *     represent without lying.
 *
 * The cost is that translators edit TypeScript. For an application with three
 * languages maintained by the team that writes the code, that is the right
 * trade. It stops being right the moment translation is outsourced, and at that
 * point these files export to JSON and the accessors stay identical.
 */

import { en, type Messages } from './messages/en';
import { fr } from './messages/fr';
import { ja } from './messages/ja';
import { DEFAULT_LOCALE, type Locale } from './locales';

const CATALOGUES: Record<Locale, Messages> = { en, fr, ja };

/** The catalogue for a language. Falls back rather than throwing. */
export function messages(locale: Locale | undefined): Messages {
	return CATALOGUES[locale ?? DEFAULT_LOCALE] ?? en;
}

/**
 * Locale-aware formatters, built once per language.
 *
 * `Intl.DateTimeFormat` is expensive to construct and cheap to reuse, and a
 * board list rebuilding one per row per render is a measurable cost on a slow
 * phone. The cache is keyed by locale and never invalidated, because the set of
 * locales is fixed at build time.
 */
const relative = new Map<Locale, Intl.RelativeTimeFormat>();
const dates = new Map<Locale, Intl.DateTimeFormat>();

const UNITS: [limit: number, divisor: number, unit: Intl.RelativeTimeFormatUnit][] = [
	[60_000, 1_000, 'second'],
	[3_600_000, 60_000, 'minute'],
	[86_400_000, 3_600_000, 'hour'],
	[604_800_000, 86_400_000, 'day']
];

/**
 * "3 minutes ago", in the viewer's language.
 *
 * Anything older than a week becomes an absolute date. "47 weeks ago" is a
 * number people have to convert; "12 October" is one they can read.
 */
export function ago(locale: Locale, when: Date, now: Date = new Date()): string {
	const elapsed = when.getTime() - now.getTime();
	const magnitude = Math.abs(elapsed);

	for (const [limit, divisor, unit] of UNITS) {
		if (magnitude < limit) {
			const formatter =
				relative.get(locale) ?? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
			relative.set(locale, formatter);
			return formatter.format(Math.round(elapsed / divisor), unit);
		}
	}

	const formatter =
		dates.get(locale) ?? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
	dates.set(locale, formatter);
	return formatter.format(when);
}

export { DEFAULT_LOCALE, ENDONYM, HTML_LANG, LOCALES, isLocale, negotiate } from './locales';
export type { Locale } from './locales';
export type { Messages } from './messages/en';
