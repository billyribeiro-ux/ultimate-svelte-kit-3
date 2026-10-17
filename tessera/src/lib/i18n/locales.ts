/**
 * The languages Tessera ships.
 *
 * Three, chosen to cover the three shapes that break a naive interface: English
 * as the source, French because its words are reliably longer than the English
 * ones and burst any layout that was measured against them, and Japanese because
 * it has no spaces to wrap at and no plural forms at all.
 *
 * A fourth would be a data change. That is the test of an i18n layer: adding a
 * language should touch one folder.
 */
export const LOCALES = ['en', 'fr', 'ja'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * The value of the `[[lang=locale]]` route parameter for a link in this language.
 *
 * English is the unprefixed default — `/boards`, not `/en/boards` — and the
 * segment is *optional*, so `resolve()` leaves it out when the parameter is
 * `undefined`. One call yields `/boards` for English and `/fr/boards` for French,
 * and the "is this the default?" question is asked here, once, instead of at
 * every link and every redirect.
 */
export function langParam(locale: Locale): Locale | undefined {
	return locale === DEFAULT_LOCALE ? undefined : locale;
}

export function isLocale(value: string | undefined): value is Locale {
	return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** The `lang` and `dir` attributes for `<html>`. */
export const HTML_LANG: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR', ja: 'ja-JP' };

/** What each language calls itself. Never translated — a language picker in a
 * language you cannot read is useless. */
export const ENDONYM: Record<Locale, string> = { en: 'English', fr: 'Français', ja: '日本語' };

/**
 * Pick the best supported language from an `Accept-Language` header.
 *
 * Quality values are honoured, and a bare tag matches a regional one, so
 * `fr-CA` finds `fr`. Anything unrecognised falls through to the default rather
 * than erroring: a visitor with an exotic locale should get the app in English,
 * not a 406.
 */
export function negotiate(header: string | null): Locale {
	if (!header) return DEFAULT_LOCALE;

	const ranked = header
		.split(',')
		.map((part) => {
			const [tag = '', ...parameters] = part.trim().split(';');
			const quality = parameters
				.map((parameter) => parameter.trim())
				.find((parameter) => parameter.startsWith('q='));
			return { tag: tag.toLowerCase(), quality: quality ? Number(quality.slice(2)) : 1 };
		})
		.filter((entry) => entry.tag.length > 0 && Number.isFinite(entry.quality))
		.sort((a, b) => b.quality - a.quality);

	for (const { tag } of ranked) {
		const base = tag.split('-')[0];
		if (isLocale(base)) return base;
	}

	return DEFAULT_LOCALE;
}
