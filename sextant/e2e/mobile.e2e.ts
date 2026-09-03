import { expect, test } from '@playwright/test';

/**
 * WHAT IS DIFFERENT ON A PHONE
 * ============================
 *
 * This application genuinely renders different DOM at different widths, and
 * those branches are the ones nobody looks at. Each test here names the branch
 * and the reason it exists.
 *
 * Skipped on the desktop project, because asserting "the header is visible" at
 * 1280px proves nothing about the phone layout.
 */

test.describe('phone layout', () => {
	test.skip(({ viewport }) => (viewport?.width ?? 0) > 640, 'phone project only');

	test('the results table drops its header row and stacks each row', async ({ page }) => {
		/*
		 * A six-column grid at 390px gives each column sixty pixels, which is
		 * narrower than a timestamp. Stacked, each row is a small record — which is
		 * how a log line reads on a phone anyway.
		 */
		await page.goto(`/demo/explore?q=${encodeURIComponent('from logs | take 20')}&range=-6h`);

		await expect(page.getByRole('grid')).toBeVisible();
		const header = page.locator('.table__head');
		await expect(header).toBeHidden();
	});

	test('the trace drawer is a bottom sheet, not a side panel', async ({ page }) => {
		await page.goto(
			`/demo/explore?q=${encodeURIComponent('from spans | sort duration desc | take 20')}&range=-6h`
		);
		await page.getByRole('row').first().click();

		const drawer = page.getByRole('dialog');
		await expect(drawer).toBeVisible();

		const box = await drawer.boundingBox();
		const viewport = page.viewportSize();

		// Full width, anchored to the bottom: a side panel at 390px would be four
		// centimetres across.
		expect(box?.width).toBeGreaterThan((viewport?.width ?? 0) * 0.95);
	});

	test('the skip link is the first thing a keyboard reaches', async ({ page }) => {
		await page.goto('/demo/explore?range=-6h');
		await page.keyboard.press('Tab');

		await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
	});

	test('the waterfall stacks its name, bar and timing', async ({ page }) => {
		await page.goto('/demo/traces');
		await page.getByRole('list', { name: 'Recent traces' }).getByRole('link').first().click();

		const tree = page.getByRole('tree', { name: 'Spans' });
		await expect(tree).toBeVisible();

		const row = tree.getByRole('treeitem').first();
		const box = await row.boundingBox();

		// Two lines rather than one: the name gets the full width and the bar sits
		// under it, because a track ninety pixels wide is a smear rather than a chart.
		expect(box?.height ?? 0).toBeGreaterThan(28);
	});
});
