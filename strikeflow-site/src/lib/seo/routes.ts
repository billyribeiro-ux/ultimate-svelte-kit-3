/**
 * THE INDEXABLE ROUTE MANIFEST
 *
 * A single, typed list of every page we want in the sitemap.
 *
 * You could auto-discover these with `import.meta.glob('/src/routes/**\/+page.svelte')`,
 * and plenty of projects do. We don't, because auto-discovery has no opinion: it happily
 * lists the thank-you page you deliberately noindexed, and it can't distinguish a real
 * page from a route you're halfway through building.
 *
 * An explicit list means putting a page in the sitemap is a decision. And because the
 * `path` is typed as `StaticRoute`, deleting a route turns this file into a compile
 * error rather than a sitemap full of 404s — which is one of the few SEO problems that
 * is purely mechanical and therefore inexcusable.
 */

import type { StaticRoute } from '#lib/data/nav.ts';

export interface SitemapEntry {
	readonly path: StaticRoute;
	/**
	 * ISO date of the last *meaningful* content change.
	 *
	 * Omit it unless you genuinely track it. Google's documented guidance is that it
	 * uses `lastmod` only when it appears consistently accurate — and a site that
	 * stamps today's date on every page at every deploy teaches it to ignore the field
	 * entirely. Blog posts have real dates, so they get one. Marketing pages don't
	 * track edits, so they don't.
	 */
	readonly lastmod?: string;
}

/**
 * Static pages that belong in the index.
 *
 * Deliberately excluded:
 *   /guide/thank-you  — gated confirmation page, noindexed
 */
export const staticSitemapEntries: readonly SitemapEntry[] = [
	{ path: '/' },
	{ path: '/features' },
	{ path: '/pricing' },
	{ path: '/guide' },
	{ path: '/blog' },
	{ path: '/about' },
	{ path: '/contact' },
	{ path: '/legal/risk-disclosure' },
	{ path: '/legal/privacy' },
	{ path: '/legal/terms' }
];
