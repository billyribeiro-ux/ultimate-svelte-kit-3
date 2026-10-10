import { extractLocaleFromRequestWithStrategies, localizeUrl } from '#lib/paraglide/runtime.js';

/**
 * WHICH URL SAYS THE LANGUAGE
 * ===========================
 *
 * Paraglide's middleware reads the locale from a URL first — `/de/trips` is
 * German — and this is the URL to give it, for any request.
 *
 * For a page it is the page's URL. For a remote form or command it is the
 * page the call came from: the browser posts those to `/_app/remote/…`, a
 * URL with no `/de` in it, but sends the calling page along in a header,
 * and SvelteKit puts it back into `event.url`. Read from the request
 * itself, a German sign-in form answered "Enter an email address".
 *
 * A `query` called from the browser sends no such header, so its
 * `event.url` is still the endpoint — and the URL strategy does not say "I
 * cannot tell" for a URL with no prefix, it says "English". So when
 * SvelteKit had no page to put back, the language comes from what the
 * browser does send: the cookie, which Paraglide's client runtime writes
 * as soon as a page reads its locale from its own URL, then
 * `Accept-Language`, then English. That locale is put into the URL, where
 * the middleware will find it first.
 */
export interface LocaleRequest {
	readonly url: URL;
	readonly request: Request;
	readonly isRemoteRequest: boolean;
}

export function localeUrl({ url, request, isRemoteRequest }: LocaleRequest): URL {
	// A remote call whose `event.url` is still its own endpoint: SvelteKit was not told the page.
	const pageless = isRemoteRequest && new URL(request.url).pathname === url.pathname;
	if (!pageless) return url;
	const locale = extractLocaleFromRequestWithStrategies(request, [
		'cookie',
		'preferredLanguage',
		'baseLocale'
	]);
	return localizeUrl(url, { locale });
}
