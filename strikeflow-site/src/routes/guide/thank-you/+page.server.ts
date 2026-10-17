/**
 * THANK-YOU PAGE — server load
 *
 * The one page on this site that cannot be prerendered, because its output depends
 * on a per-request query parameter.
 *
 * Validation happens HERE, on the server, not in the component. A component could
 * decode the token and read its expiry, but it could never verify the signature —
 * that requires the secret, and anything the browser can read is not a secret. So
 * the server decides, and the page just renders the verdict.
 */

import type { PageServerLoad } from './$types';
import { verifyDownloadToken } from '#lib/server/tokens.ts';

/**
 * Opt out of the site-wide prerender set in `src/routes/+layout.ts`.
 *
 * Options exported from a page override the layout's, which is how you punch a
 * single dynamic hole in an otherwise static site.
 */
export const prerender = false;

export const load: PageServerLoad = ({ url, setHeaders }) => {
	// A missing `t` becomes '', which verifies as 'malformed' like any other bad
	// token — and keeps `token` a plain string for the valid branch below.
	const token = url.searchParams.get('t') ?? '';
	const result = verifyDownloadToken(token);

	/*
	 * Belt and braces on top of the `noindex` meta tag the page renders.
	 *
	 * The meta tag is in the HTML, so only a crawler that parses the HTML sees it.
	 * An `X-Robots-Tag` header is read from the response itself, before any parsing.
	 * Two mechanisms, because a gated page leaking into the index is embarrassing
	 * and slow to undo. Both need the crawler to fetch the page, which is why
	 * robots.txt deliberately does NOT disallow it — see `robots.txt/+server.ts`.
	 */
	setHeaders({
		'X-Robots-Tag': 'noindex, nofollow',
		'Cache-Control': 'private, no-store'
	});

	if (!result.valid) {
		return {
			// Never echo the raw token back into the page — that's how a bad token ends
			// up in an analytics URL, a referrer header, or a support screenshot.
			status: 'invalid' as const,
			reason: result.reason,
			token: null,
			email: null
		};
	}

	return {
		status: 'valid' as const,
		reason: null,
		// The token is re-used for the download route, which verifies it again.
		// Every entry point validates independently — never trust that an earlier
		// step in the flow did its job.
		//
		// We return the token, not a finished URL, and the page builds the link with
		// `resolve()` as it renders. On the server `resolve()` returns a path relative
		// to the request: `../guide/download?t=…` for a full page load, but
		// `../../guide/download?t=…` for the `__data.json` request a client-side
		// navigation makes, which is one level deeper. Serialised from here, that
		// second answer reaches a page that is NOT one level deeper; it only lands
		// on the right file today because a surplus `..` stops at the site root,
		// and under a base path it would climb out of the base.
		token,
		email: result.email
	};
};
