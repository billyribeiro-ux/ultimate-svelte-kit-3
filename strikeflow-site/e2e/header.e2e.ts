/**
 * HEADER AND DRAWER
 *
 * Two promises the header makes that no other test would notice breaking: the
 * "you are here" marker is in the HTML the server sends, not added later by
 * JavaScript, and the mobile drawer closes the way people expect a drawer to.
 */

import { test, expect } from '@playwright/test';

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the server-rendered nav marks the current page', async ({ page }) => {
		// `includeHidden`, because below 64em the desktop nav is `display: none` — but
		// its markup, and the attribute a crawler or screen reader reads, are there.
		const nav = page.getByRole('navigation', { name: 'Main', includeHidden: true });
		const link = (name: string) => nav.getByRole('link', { name, includeHidden: true });

		await page.goto('/features');
		await expect(link('Features')).toHaveAttribute('aria-current', 'page');
		await expect(link('Pricing')).not.toHaveAttribute('aria-current');

		// Section highlighting: an article keeps its section marked.
		await page.goto('/blog/how-to-read-an-options-sweep');
		await expect(link('Insights')).toHaveAttribute('aria-current', 'page');
		await expect(link('Features')).not.toHaveAttribute('aria-current');
	});
});

test.describe('mobile drawer', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('a tap on the backdrop closes it', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		// The chart's canvas is drawn by an attachment, and attachments only run once
		// the page has hydrated — so its arrival means the menu button is live.
		await expect(page.locator('.chart__canvas canvas').first()).toBeAttached();

		const toggle = page.getByRole('button', { name: 'Open navigation menu' });
		const drawer = page.getByRole('dialog', { name: 'Navigation menu' });

		await toggle.click();
		await expect(drawer).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');

		// The drawer is pinned to the right edge, so the left edge is backdrop.
		await page.mouse.click(16, 420);

		await expect(drawer).toBeHidden();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	});
});
