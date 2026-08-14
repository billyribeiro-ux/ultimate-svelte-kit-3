/**
 * LEAD CAPTURE END-TO-END TESTS
 *
 * The signup form is the single most valuable interaction on the site, so it gets
 * the most thorough test — including the case almost nobody tests: submitting with
 * JavaScript switched off.
 */

import { test, expect } from '@playwright/test';

/** Unique per run, so repeat runs don't collide in the lead store. */
function uniqueEmail(): string {
	return `e2e-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

test.describe('ebook signup', () => {
	test('happy path issues a working download', async ({ page }) => {
		await page.goto('/guide');

		await page.getByLabel('Email address').fill(uniqueEmail());
		await page.getByLabel('Which best describes you?').selectOption('some');
		await page.getByRole('checkbox').check();

		await page.getByRole('button', { name: /send me the guide/i }).click();

		// Post/Redirect/Get: we should land on the thank-you page with a token.
		await page.waitForURL(/\/guide\/thank-you\?t=/);
		await expect(page.getByRole('heading', { name: /your guide is ready/i })).toBeVisible();

		const downloadLink = page.getByRole('link', { name: /download the pdf/i });
		await expect(downloadLink).toBeVisible();

		// Follow the link and confirm we get an actual PDF, not an error page.
		const href = await downloadLink.getAttribute('href');
		const response = await page.request.get(href ?? '');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('application/pdf');
		expect(response.headers()['content-disposition']).toContain('attachment');

		// %PDF is the file's magic number. If the bytes don't start with it, we've
		// served something that merely claims to be a PDF.
		const body = await response.body();
		expect(body.subarray(0, 4).toString()).toBe('%PDF');
		expect(body.byteLength).toBeGreaterThan(10_000);
	});

	test('rejects an invalid email', async ({ page }) => {
		await page.goto('/guide');

		// `novalidate` is not set, so the browser's own validation would block a
		// malformed address before it reaches us. Fill a value the browser accepts
		// but our schema does not.
		await page.getByLabel('Email address').fill('not-an-email@');
		await page.getByLabel('Which best describes you?').selectOption('new');
		await page.getByRole('checkbox').check();
		await page.getByRole('button', { name: /send me the guide/i }).click();

		// We must still be on /guide — no redirect happened.
		await expect(page).toHaveURL(/\/guide$/);
	});

	test('requires the consent checkbox', async ({ page }) => {
		await page.goto('/guide');

		await page.getByLabel('Email address').fill(uniqueEmail());
		await page.getByLabel('Which best describes you?').selectOption('experienced');
		// Deliberately do not check consent.
		await page.getByRole('button', { name: /send me the guide/i }).click();

		await expect(page.getByText(/please confirm you would like to receive/i)).toBeVisible();
		await expect(page).toHaveURL(/\/guide$/);
	});

	test('an invalid token is refused', async ({ page }) => {
		await page.goto('/guide/thank-you?t=forged.token');
		await expect(page.getByRole('heading', { name: /not valid|missing|expired/i })).toBeVisible();
		await expect(page.getByRole('link', { name: /download/i })).toHaveCount(0);
	});

	test('the download endpoint refuses a forged token', async ({ request }) => {
		const response = await request.get('/guide/download?t=forged.token');
		expect(response.status()).toBe(403);
	});

	test('the download endpoint refuses a missing token', async ({ request }) => {
		const response = await request.get('/guide/download');
		expect(response.status()).toBe(403);
	});
});

/**
 * PROGRESSIVE ENHANCEMENT.
 *
 * This is the test that justifies using a remote `form()` rather than a `command()`.
 * With JavaScript disabled the page is inert HTML — no hydration, no fetch, no
 * client-side handler. If the form still works, it works for people on flaky
 * connections, on locked-down corporate browsers, and in the window before your
 * JavaScript has finished loading.
 */
test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the signup form still works', async ({ page }) => {
		await page.goto('/guide');

		await page.getByLabel('Email address').fill(uniqueEmail());
		await page.getByLabel('Which best describes you?').selectOption('professional');
		await page.getByRole('checkbox').check();
		await page.getByRole('button', { name: /send me the guide/i }).click();

		await page.waitForURL(/\/guide\/thank-you/);
		await expect(page.getByRole('heading', { name: /your guide is ready/i })).toBeVisible();
	});

	test('marketing pages render their content server-side', async ({ page }) => {
		await page.goto('/');
		// Real text in the initial HTML — which is also what a crawler sees.
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/options flow/i);
		await expect(page.getByRole('link', { name: /free guide/i }).first()).toBeVisible();
	});
});
