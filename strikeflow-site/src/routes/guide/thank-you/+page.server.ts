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
	const token = url.searchParams.get('t');
	const result = verifyDownloadToken(token);

	/*
	 * Belt and braces on top of the `noindex` meta tag the page renders.
	 *
	 * The meta tag only works if a crawler executes far enough to read it. An
	 * `X-Robots-Tag` header is read from the response itself, so it also covers the
	 * PDF and any non-HTML response. Two mechanisms, because a gated page leaking
	 * into the index is embarrassing and slow to undo.
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
			downloadUrl: null,
			email: null
		};
	}

	return {
		status: 'valid' as const,
		reason: null,
		// The token is re-used for the download route, which verifies it again.
		// Every entry point validates independently — never trust that an earlier
		// step in the flow did its job.
		downloadUrl: `/guide/download?t=${encodeURIComponent(token ?? '')}`,
		email: result.email
	};
};
