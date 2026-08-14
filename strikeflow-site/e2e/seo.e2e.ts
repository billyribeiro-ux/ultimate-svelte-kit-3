/**
 * SEO END-TO-END TESTS
 *
 * These assert the things that silently break and cost you rankings: a missing
 * canonical, a duplicated h1, a sitemap full of 404s, structured data that stopped
 * parsing.
 *
 * None of it is visible in the UI, so nobody notices by using the site. That's
 * precisely why it belongs in an automated test.
 */

import { test, expect } from '@playwright/test';

/** Every page that should be indexed. */
const INDEXABLE_PAGES = [
	'/',
	'/features',
	'/pricing',
	'/guide',
	'/blog',
	'/about',
	'/contact',
	'/legal/risk-disclosure',
	'/legal/privacy',
	'/legal/terms',
	'/blog/how-to-read-an-options-sweep',
	'/blog/dealer-gamma-explained',
	'/blog/volume-vs-open-interest'
];

test.describe('page-level SEO', () => {
	for (const path of INDEXABLE_PAGES) {
		test(`${path} has complete, valid metadata`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);

			// --- Title ---
			const title = await page.title();
			expect(title.length).toBeGreaterThan(10);
			// Google truncates around 60 characters. Longer isn't an error, but it
			// means the end of your title is invisible in the results page.
			expect(title.length).toBeLessThanOrEqual(70);

			// --- Description ---
			const description = await page
				.locator('head meta[name="description"]')
				.getAttribute('content');
			expect(description).toBeTruthy();
			expect((description ?? '').length).toBeGreaterThan(50);
			expect((description ?? '').length).toBeLessThanOrEqual(200);

			// --- Canonical: exactly one, absolute, matching this path ---
			const canonicals = page.locator('head link[rel="canonical"]');
			await expect(canonicals).toHaveCount(1);
			const canonical = await canonicals.getAttribute('href');
			expect(canonical).toMatch(/^https?:\/\//);
			expect(new URL(canonical ?? '').pathname).toBe(path);

			// --- Exactly one h1 ---
			// More than one is a document-outline bug; zero means the page has no
			// stated subject. Both are common and both are avoidable.
			await expect(page.locator('h1')).toHaveCount(1);

			// --- Indexable ---
			const robots = await page.locator('head meta[name="robots"]').getAttribute('content');
			expect(robots).toContain('index');
			expect(robots).not.toContain('noindex');
			// The directive that unlocks large thumbnails, and Discover eligibility.
			expect(robots).toContain('max-image-preview:large');

			// --- Open Graph ---
			for (const property of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
				await expect(page.locator(`head meta[property="${property}"]`)).toHaveCount(1);
			}

			// --- Structured data parses and is a graph ---
			const ldJson = await page.locator('head script[type="application/ld+json"]').textContent();
			expect(ldJson).toBeTruthy();
			const graph = JSON.parse(ldJson ?? '{}');
			expect(graph['@context']).toBe('https://schema.org');
			expect(Array.isArray(graph['@graph'])).toBe(true);
			// Organization and WebSite appear on every page, cross-referenced by @id.
			const types = graph['@graph'].map((node: { '@type': string }) => node['@type']);
			expect(types).toContain('Organization');
			expect(types).toContain('WebSite');
			expect(types).toContain('WebPage');
		});
	}
});

test.describe('gated pages stay out of the index', () => {
	test('thank-you page is noindex', async ({ page }) => {
		await page.goto('/guide/thank-you?t=obviously-not-valid');
		const robots = await page.locator('head meta[name="robots"]').getAttribute('content');
		expect(robots).toContain('noindex');
	});
});

test.describe('crawl infrastructure', () => {
	test('robots.txt is served and points at the sitemap', async ({ request }) => {
		const response = await request.get('/robots.txt');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('text/plain');

		const body = await response.text();
		expect(body).toContain('User-agent: *');
		expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
		// The gated page should not be worth crawl budget.
		expect(body).toContain('Disallow: /guide/thank-you');
	});

	test('sitemap is valid XML with the correct namespace', async ({ request }) => {
		const response = await request.get('/sitemap.xml');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('xml');

		const body = await response.text();
		// A wrong namespace makes every crawler reject the file as "not a sitemap",
		// and it is a genuinely easy typo to make.
		expect(body).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
		expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
	});

	test('every sitemap URL returns 200', async ({ request }) => {
		const body = await request.get('/sitemap.xml').then((r) => r.text());
		const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');

		expect(locs.length).toBeGreaterThanOrEqual(13);

		for (const loc of locs) {
			// Compare by path — the sitemap carries the configured production origin,
			// which is not the origin this test server runs on.
			const response = await request.get(new URL(loc).pathname);
			expect(response.status(), `${loc} should return 200`).toBe(200);
		}
	});

	test('sitemap excludes the gated thank-you page', async ({ request }) => {
		const body = await request.get('/sitemap.xml').then((r) => r.text());
		expect(body).not.toContain('/guide/thank-you');
	});

	test('llms.txt is served', async ({ request }) => {
		const response = await request.get('/llms.txt');
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).toContain('# StrikeFlow');
		// The disclaimer that we are not an advisory service must survive into the
		// AI-readable summary too — that's the whole point of writing one by hand.
		expect(body).toContain('not** an advisory service');
	});
});
