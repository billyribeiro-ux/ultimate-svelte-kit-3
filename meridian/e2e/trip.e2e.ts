import { expect, test } from '@playwright/test';
import { openTab, signIn, TRIPS, USERS } from './helpers.ts';

/**
 * ONE TRIP, EVERY TAB
 * ===================
 *
 * Ana owns "Iberia by rail". The itinerary, the palette, a stop added
 * through the place search and edited, an expense that changes the
 * settle-up, a note that saves itself, and the two renderings of the route:
 * the map and the globe.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page, USERS.ana, `/t/${TRIPS.iberia}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Iberia by rail' })).toBeVisible();
});

test('the itinerary shows the seeded days and the palette jumps between tabs', async ({ page }) => {
	await expect(page.getByRole('button', { name: 'Alfama' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Train to Porto' })).toBeVisible();
	await expect(page.getByText('Live')).toBeVisible();

	await page.keyboard.press('ControlOrMeta+k');
	const palette = page.getByRole('dialog');
	await palette.getByPlaceholder('Jump to a stop or an action…').fill('Expen');
	await palette.getByRole('option', { name: 'Expenses' }).click();
	await expect(page).toHaveURL(/tab=expenses/);
	await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
});

test('a stop is added from the place search, edited, and removed', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a stop' }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'New stop' })).toBeVisible();

	// The combobox: type, pick, and the name and coordinates follow.
	await dialog.getByPlaceholder('Search a place').pressSequentially('Sintra');
	await page.getByRole('option', { name: 'Sintra' }).click();
	await expect(dialog.getByLabel('Name')).toHaveValue('Sintra');
	await dialog.getByRole('button', { name: 'Save stop' }).click();

	await expect(page.getByText('Stop added')).toBeVisible();
	const stop = page.locator('article.stop', { hasText: 'Sintra' });
	await expect(stop).toBeVisible();

	await stop.getByRole('button', { name: 'Edit stop' }).click();
	await dialog.getByLabel('Name').fill('Sintra and the palace');
	await dialog.getByRole('button', { name: 'Save stop' }).click();
	await expect(page.getByRole('button', { name: 'Sintra and the palace' })).toBeVisible();

	await page
		.locator('article.stop', { hasText: 'Sintra and the palace' })
		.getByRole('button', { name: 'Remove' })
		.click();
	await expect(page.getByText('Stop removed')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sintra and the palace' })).toHaveCount(0);
});

test('an expense is added and the settle-up follows', async ({ page }) => {
	await openTab(page, 'Expenses');
	await expect(page.getByRole('heading', { name: 'Settle up' })).toBeVisible();

	await page.getByLabel('What for').fill('Pastéis de nata');
	await page.getByLabel(/Amount/).fill('12.60');
	await page.getByLabel('Date').fill('2026-05-10');
	await page.getByRole('button', { name: 'Add an expense' }).click();

	await expect(page.getByRole('cell', { name: 'Pastéis de nata' })).toBeVisible();
	// Paid by Ana, shared three ways: the others owe her.
	await expect(page.getByText(/Ben Okafor pays Ana Ribeiro/)).toBeVisible();

	await page
		.getByRole('row', { name: /Pastéis de nata/ })
		.getByRole('button', { name: 'Remove' })
		.click();
	await expect(page.getByRole('cell', { name: 'Pastéis de nata' })).toHaveCount(0);
});

test('a note saves itself as it is typed, and is there after a reload', async ({ page }) => {
	await openTab(page, 'Notes');
	const editor = page.locator('.notes__page');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' Remember the tram at seven.');
	await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 10_000 });

	await page.reload();
	await expect(page.locator('.notes__page')).toContainText('Remember the tram at seven.');
});

test('the map and the globe both draw the route', async ({ page }) => {
	await openTab(page, 'Map');
	await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Fit the route' })).toBeVisible();

	await openTab(page, 'Globe');
	// three.js arrives on demand; the button lives outside the boundary and shows first.
	await expect(page.getByRole('button', { name: 'Fly the route' })).toBeVisible();
	await expect(page.locator('.globe canvas')).toBeVisible({ timeout: 30_000 });
});
