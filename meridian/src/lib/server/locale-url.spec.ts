import { describe, expect, it } from 'vitest';
import { localeUrl } from './locale-url.ts';

/*
 * The three kinds of request the locale middleware sees, as SvelteKit hands
 * them over: `url` is `event.url`, `request` is what the browser sent.
 */
const ORIGIN = 'http://localhost:4173';
const ENDPOINT = `${ORIGIN}/_app/remote/1blflfo/tripBySlug?payload=WzEyM10`;

const get = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

describe('localeUrl', () => {
	it('is the page’s own URL for a page', () => {
		const url = new URL(`${ORIGIN}/de/trips`);
		expect(localeUrl({ url, request: get(url.href), isRemoteRequest: false })).toBe(url);
	});

	it('is the calling page for a form or command, which SvelteKit has put back', () => {
		const url = new URL(`${ORIGIN}/de/signin`);
		const request = get(ENDPOINT, { cookie: 'meridian_locale=pt-br' });
		expect(localeUrl({ url, request, isRemoteRequest: true })).toBe(url);
	});

	it('carries the cookie’s language for a query, which comes from no page', () => {
		const request = get(ENDPOINT, { cookie: 'meridian_locale=de' });
		const url = localeUrl({ url: new URL(ENDPOINT), request, isRemoteRequest: true });
		expect(url.pathname).toBe('/de/_app/remote/1blflfo/tripBySlug');
		expect(url.search).toBe('?payload=WzEyM10');
	});

	it('falls back to Accept-Language, then English, for a query with no cookie', () => {
		const brazil = get(ENDPOINT, { 'accept-language': 'pt-BR,pt;q=0.9' });
		expect(
			localeUrl({ url: new URL(ENDPOINT), request: brazil, isRemoteRequest: true }).pathname
		).toBe('/pt-br/_app/remote/1blflfo/tripBySlug');

		const nobody = get(ENDPOINT);
		expect(
			localeUrl({ url: new URL(ENDPOINT), request: nobody, isRemoteRequest: true }).pathname
		).toBe('/_app/remote/1blflfo/tripBySlug');
	});
});
