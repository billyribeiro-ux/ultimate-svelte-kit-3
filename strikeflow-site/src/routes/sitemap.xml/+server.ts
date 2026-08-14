/**
 * SITEMAP
 *
 * A sitemap does not make you rank. What it does is tell a crawler which URLs you
 * consider canonical and worth its time — which matters most for pages that aren't
 * well linked internally, and for a new site with no crawl history at all.
 *
 * Two decisions here that differ from most tutorials:
 *
 * 1. NO <changefreq> AND NO <priority>.
 *    Google has stated plainly that it ignores both. They were part of the original
 *    2005 sitemaps protocol and never worked as intended — every site declared
 *    everything "daily" and "1.0", so the fields became meaningless. Emitting them
 *    adds bytes and implies a precision we don't have.
 *
 * 2. <lastmod> ONLY WHERE IT'S TRUE.
 *    See the note in `seo/routes.ts`. An inaccurate lastmod is worse than none,
 *    because it trains the crawler to distrust the field across your whole site.
 *
 * This route is prerendered, so the XML is generated once at build time and served
 * as a static file — no server work per request.
 */

import type { RequestHandler } from './$types';
import { absoluteUrl } from '#lib/data/site.ts';
import { staticSitemapEntries, type SitemapEntry } from '#lib/seo/routes.ts';
import { postsByDate } from '#lib/data/posts.ts';

export const prerender = true;

/**
 * Escape the five XML predefined entities.
 *
 * A single raw `&` in a URL makes the entire sitemap a parse error, and the crawler
 * discards the whole file rather than the offending line. Cheap insurance.
 */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function toUrlElement(entry: SitemapEntry | { path: string; lastmod?: string }): string {
	const loc = escapeXml(absoluteUrl(entry.path));
	const lastmod = entry.lastmod ? `\n\t\t<lastmod>${entry.lastmod}</lastmod>` : '';
	return `\t<url>\n\t\t<loc>${loc}</loc>${lastmod}\n\t</url>`;
}

export const GET: RequestHandler = () => {
	const blogEntries = postsByDate.map((post) => ({
		path: `/blog/${post.slug}`,
		lastmod: post.updated ?? post.published
	}));

	const urls = [...staticSitemapEntries, ...blogEntries].map(toUrlElement).join('\n');

	// The namespace must be exactly this. A wrong or missing xmlns means the file
	// parses as generic XML and every crawler rejects it as "not a sitemap".
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			// One hour at the CDN, with a day of stale-while-revalidate. A sitemap that
			// is an hour out of date has never harmed anyone; an origin hit per crawl has.
			'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
			// The sitemap itself should never appear as a search result.
			'X-Robots-Tag': 'noindex'
		}
	});
};
