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
 * for pages you don't want found. We use each for its own job.
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

# SvelteKit's internal asset directory. Nothing here is a page; letting crawlers
# walk it just burns crawl budget on hashed JS chunks.
Disallow: /_app/

# Gated confirmation page. Also carries a noindex meta tag, which is what actually
# keeps it out of the index — this line just saves the crawl.
Disallow: /guide/thank-you

# Signed, single-use download links. Never useful to a crawler.
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
