/**
 * ROBOTS.TXT
 *
 * Generated as a route rather than dropped in `static/`, for one reason: the
 * `Sitemap:` line must be an absolute URL, and the correct origin is only known
 * from `PUBLIC_SITE_URL`. A hardcoded static file would point staging crawlers at
 * production, or worse, production crawlers at localhost.
 *
 * WHAT ROBOTS.TXT DOES AND DOESN'T DO
 * -----------------------------------
 * It controls *crawling*, not *indexing*. That distinction trips up almost everyone.
 * A URL blocked here can still appear in search results — Google just shows it
 * without a description, because it was told not to look. If you want a page kept
 * out of the index, use a `noindex` robots meta tag and let the crawler in to read
 * it. Blocking a page you also noindexed is self-defeating: the crawler can never
 * see the noindex.
 *
 * So: `Disallow` is for pages you don't want crawl budget spent on. `noindex` is
 * for pages you don't want found. We use each for its own job — which is why the
 * noindexed thank-you page is NOT listed below.
 *
 * Nor is `/_app/`. It holds no pages, but it holds the CSS and JavaScript every
 * page links to, and Google renders a page with them to see what a visitor sees.
 * Google's own guidance is to block a resource only if pages are not significantly
 * affected without it; a page without its stylesheet is.
 */

import type { RequestHandler } from './$types';
import { absoluteUrl } from '#lib/data/site.ts';

export const prerender = true;

export const GET: RequestHandler = () => {
	const body = `# https://www.robotstxt.org/robotstxt.html
# Crawling is allowed. See the <meta name="robots"> tag on individual pages
# for indexing directives — that's the mechanism that actually controls the index.

User-agent: *
Allow: /

# Signed, expiring download links. Never useful to a crawler, so this saves the
# crawl. It is not what keeps the PDF out of the index: the only page that links
# to it is the thank-you page, which is noindex, nofollow.
Disallow: /guide/download

Sitemap: ${absoluteUrl('/sitemap.xml')}
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
		}
	});
};
