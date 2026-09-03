import { expect, test } from '@playwright/test';
import { openTab, PASSWORD, signIn, TRIPS, USERS } from './helpers.ts';

/**
 * COMPANIONS, INVITES AND THE THINGS AN OWNER CAN SET
 * ===================================================
 *
 * Ana makes an invite link; a brand-new person follows it, signs up on the
 * way (the guard remembers where they were going), and joins. Then the
 * settings page: visibility by link turns the embed on, and the custom
 * element renders the trip inside its shadow root.
 */

test('an invite link brings a new companion onto the trip', async ({ browser, page }) => {
	await signIn(page, USERS.ana, `/t/${TRIPS.iberia}`);
	await openTab(page, 'Companions');
	await expect(page.getByText('Ana Ribeiro')).toBeVisible();
	await expect(page.getByText('Cal Nguyen')).toBeVisible();

	await page.getByLabel('They may').selectOption('viewer');
	await page.getByRole('button', { name: 'Make a link' }).click();
	const link = await page.locator('.invite__url').textContent();
	expect(link).toMatch(/\/join\/[A-Za-z0-9_-]+$/);
	const joinPath = new URL(link!).pathname;

	// A stranger with the link: sign up first, then the join page.
	const guestContext = await browser.newContext();
	const guest = await guestContext.newPage();
	await guest.goto(joinPath);
	await expect(guest).toHaveURL(/\/signin\?redirectTo=%2Fjoin%2F/);
	await guest.getByRole('link', { name: 'Create an account' }).click();
	// A unique person per run: the desktop and phone projects share one database,
	// and a second "Eve Marchetti" on the trip would make the members list ambiguous.
	const stamp = Date.now().toString(36);
	const name = `Eve ${stamp}`;
	await guest.getByLabel('Your name').fill(name);
	await guest.getByLabel('Email').fill(`eve-${stamp}@meridian.test`);
	await guest.getByLabel('Password').fill(PASSWORD);
	await guest.getByRole('button', { name: 'Create an account' }).click();

	await expect(guest).toHaveURL(new RegExp(`${joinPath}$`));
	await expect(guest.getByText('You have been invited to plan Iberia by rail.')).toBeVisible();
	await guest.getByRole('button', { name: 'Join the trip' }).click();
	await expect(guest).toHaveURL(new RegExp(`/t/${TRIPS.iberia}$`));
	// A viewer: can look, cannot add.
	await expect(guest.getByRole('button', { name: 'Alfama' })).toBeVisible();
	await expect(guest.getByRole('button', { name: 'Add a stop' })).toHaveCount(0);

	// Ana's companions list follows, live. (Scoped to the list: Eve is also a
	// presence chip by now, and a bare text locator would match both.)
	await expect(page.locator('.members').getByText(name)).toBeVisible({
		timeout: 15_000
	});

	// The link was for one person.
	const again = await guestContext.newPage();
	await again.goto(joinPath);
	await expect(again.getByText('You are already on this trip.')).toBeVisible();

	await guestContext.close();
});

test('visibility by link switches the embed on, and the custom element renders the trip', async ({
	page,
	request
}) => {
	await signIn(page, USERS.ana, `/t/${TRIPS.iberia}/settings`);
	await expect(page.getByText('Only a trip visible by link can be embedded.')).toBeVisible();

	try {
		await page.getByLabel('Anyone with the link').check();
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByText('Saved', { exact: true })).toBeVisible();

		await expect(page.getByRole('heading', { name: 'As a custom element' })).toBeVisible();
		// The element fetches the route API and draws inside its shadow root;
		// Playwright's locators pierce shadow DOM.
		await expect(page.locator('meridian-route').getByText('Iberia by rail')).toBeVisible({
			timeout: 15_000
		});
		await expect(page.locator('meridian-route').getByText('Alfama')).toBeVisible();

		const api = await request.get(`/api/route/${TRIPS.iberia}.json`);
		expect(api.ok()).toBeTruthy();
	} finally {
		// Back to private whatever happened above, so the public suite still finds a 404.
		await page.getByLabel('Companions only').check();
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByText('Only a trip visible by link can be embedded.')).toBeVisible();
	}
	const closed = await request.get(`/api/route/${TRIPS.iberia}.json`);
	expect(closed.status()).toBe(404);
});
