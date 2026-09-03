import { expect, test } from '@playwright/test';

/**
 * The landing page is prerendered, which is a claim about *how it is served*:
 * a file, with a hash-based CSP, with the featured strip baked in. A test that
 * only looked at the DOM would pass against a dynamic page too.
 */

test('is served as a prerendered page with a hashed policy', async ({ page }) => {
	const response = await page.goto('/');
	expect(response?.status()).toBe(200);

	// A prerendered page is a file, and a file cannot carry a response header
	// of its own — so SvelteKit writes the policy into a `<meta http-equiv>`
	// tag, which browsers honour the same way. `mode: 'auto'`: hashes here,
	// never a nonce.
	expect(response?.headers()['content-security-policy']).toBeUndefined();
	const policy =
		(await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content')) ??
		'';
	expect(policy).toContain('sha256-');
	expect(policy).not.toContain('nonce-');
	// `style-src` allows inline styles on purpose (see vite.config.ts); scripts never do.
	const scriptSrc = policy.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
	expect(scriptSrc).not.toContain("'unsafe-inline'");

	await expect(page.getByRole('heading', { level: 1 })).toContainText('groovebox');
});

test('shows the featured grooves that were prerendered with it', async ({ page }) => {
	await page.goto('/');

	const cards = page.locator('.pattern-card');
	await expect(cards).toHaveCount(3);
	await expect(cards.first()).toContainText('@ostinato');
	await expect(page.getByRole('link', { name: 'Open the studio' })).toHaveAttribute(
		'href',
		'/studio?preset=four-on-the-floor'
	);
});

test('navigation highlights the current section', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Gallery' }).click();
	await expect(page).toHaveURL(/\/gallery$/);
	await expect(page.getByRole('link', { name: 'Gallery' })).toHaveAttribute('aria-current', 'page');
});
