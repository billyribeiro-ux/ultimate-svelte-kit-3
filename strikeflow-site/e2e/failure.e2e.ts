/**
 * WHEN THE SERVER FAILS
 *
 * Every other spec runs against a healthy server. These run against the second
 * web server in `playwright.config.ts`: the same build, with `LEADS_DIR` pointed
 * at a file, so saving a lead really throws. They pin what a visitor sees when
 * that happens: the site's own error page, inside the layout, with a way forward
 * — and never the real error.
 */

import { test, expect, type Page } from '@playwright/test';

test.use({ baseURL: 'http://localhost:4174' });

async function submitSignup(page: Page): Promise<void> {
	await page.goto('/guide');
	await page
		.getByLabel('Email address')
		.fill(`e2e-${Math.random().toString(36).slice(2, 10)}@example.com`);
	await page.getByLabel('Which best describes you?').selectOption('some');
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: /send me the guide/i }).click();
}

async function expectErrorPage(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
	// SvelteKit's default `handleError` has replaced the real message — ENOTDIR and
	// a file path — with a safe one before it reached the page.
	await expect(page.getByText('Internal Error')).toBeVisible();
	await expect(page.getByText(/ENOTDIR|package\.json/)).toHaveCount(0);
	// Inside the site's layout, with a way forward rather than a dead end.
	await expect(page.getByRole('banner')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible();
}

test.describe('a signup the server cannot save', () => {
	test('shows the error page', async ({ page }) => {
		await submitSignup(page);
		await expectErrorPage(page);
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false });

		test('shows the same error page', async ({ page }) => {
			await submitSignup(page);
			await expectErrorPage(page);
		});
	});
});
