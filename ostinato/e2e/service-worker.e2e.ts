import { expect, test } from '@playwright/test';

/**
 * The service worker is not *registered* in this suite — see the note in
 * `playwright.config.ts` — so this checks the worker as a document: that the
 * build produced it, that it is versioned, and that it refuses the two paths
 * it must never cache.
 */

test('the built service worker exists, is versioned, and refuses live data', async ({
	request
}) => {
	const response = await request.get('/service-worker.js');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('javascript');

	const script = await response.text();
	// A per-build cache name: the version string is inlined by `$app/env`.
	expect(script).toMatch(/ostinato-[a-z0-9.]+/);
	// The refusals, by path prefix, survive minification as string literals.
	expect(script).toContain('/_app/remote/');
	expect(script).toContain('/api/');
	expect(script).toContain('no-store');
});
