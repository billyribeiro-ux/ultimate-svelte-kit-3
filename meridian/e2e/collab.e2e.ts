import { expect, test } from '@playwright/test';
import { signIn, TRIPS, USERS } from './helpers.ts';

/**
 * TWO PEOPLE, ONE TRIP
 * ====================
 *
 * Ana and Ben each have a browser context — a separate cookie jar, a
 * separate session — on the same trip. Ben adds a stop — Faro, which the seed does not have — and Ana's page shows it
 * without a reload, because both pages hold the same `query.live` open and
 * the server publishes to the room when the trip changes. Ana also sees Ben
 * arrive: presence rides on the same stream.
 */
test('a change by one person reaches the other through the live query', async ({ browser }) => {
	const anaContext = await browser.newContext();
	const benContext = await browser.newContext();
	const ana = await anaContext.newPage();
	const ben = await benContext.newPage();

	await signIn(ana, USERS.ana, `/t/${TRIPS.iberia}`);
	await signIn(ben, USERS.ben, `/t/${TRIPS.iberia}`);
	await expect(ana.getByText('Live')).toBeVisible();
	await expect(ben.getByText('Live')).toBeVisible();

	// Ben is here: the presence chip on Ana's page says so.
	await expect(ana.getByRole('list', { name: 'here now' })).toContainText('Ben Okafor', {
		timeout: 20_000
	});

	await ben.getByRole('button', { name: 'Add a stop' }).first().click();
	const dialog = ben.getByRole('dialog');
	await dialog.getByPlaceholder('Search a place').pressSequentially('Faro');
	await ben.getByRole('option', { name: 'Faro' }).click();
	await dialog.getByRole('button', { name: 'Save stop' }).click();
	await expect(ben.getByText('Stop added')).toBeVisible();

	// No reload on Ana's side.
	await expect(ana.getByRole('button', { name: 'Faro' })).toBeVisible({ timeout: 15_000 });

	// Saving a stop selects it, so Ana already sees Ben looking at Faro. Then
	// Ben looks at Alfama instead, and the chip on Ana's page moves with him.
	await expect(ana.locator('article.stop', { hasText: 'Faro' })).toContainText('Ben', {
		timeout: 20_000
	});
	await ben.getByRole('button', { name: 'Alfama', exact: true }).click();
	await expect(ana.locator('article.stop', { hasText: 'Alfama' })).toContainText('Ben', {
		timeout: 20_000
	});
	await expect(ana.locator('article.stop', { hasText: 'Faro' })).not.toContainText('Ben');

	// Tidy up, so the other suites start from the seed.
	await ana
		.locator('article.stop', { hasText: 'Faro' })
		.getByRole('button', { name: 'Remove' })
		.click();
	await expect(ben.getByRole('button', { name: 'Faro' })).toHaveCount(0, { timeout: 15_000 });

	await anaContext.close();
	await benContext.close();
});
