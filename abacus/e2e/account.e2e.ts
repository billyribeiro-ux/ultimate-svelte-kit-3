import { expect, test, type Page } from '@playwright/test';
import { attachAuthenticator, register } from './passkeys.ts';

/**
 * AN ACCOUNT, A STORED SHEET, AND PUBLISHING
 * ==========================================
 *
 * Real passkey ceremonies on a virtual device (see `passkeys.ts`), then the
 * things an account is for: a sheet that is saved as it is typed, a public
 * copy of it, and the settings page.
 */

const cell = (page: Page, row: number, col: number) => page.locator(`#cell-${row}-${col}`);

async function createSheet(page: Page, title: string): Promise<string> {
	await page.goto('/sheets');
	await page.getByLabel('Title').fill(title);
	await page.getByRole('button', { name: 'New sheet' }).click();
	await page.waitForURL(/\/sheet\/[a-z0-9]{8}$/);
	// Live before anything is typed: the status chip says so once the stream is open.
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	return new URL(page.url()).pathname.split('/').pop()!;
}

test('a stored sheet is protected, saved as it is typed, and listed', async ({ page }) => {
	// Nobody signed in: sent to sign in, and brought back afterwards.
	await page.goto('/sheets');
	await expect(page).toHaveURL(/\/signin\?next=%2Fsheets/);

	const device = await attachAuthenticator(page);
	await register(page, 'Ada');
	await expect(page.getByRole('link', { name: 'Ada' })).toBeVisible();
	expect(await device.credentials()).toHaveLength(1);

	const id = await createSheet(page, 'Trip');
	await expect(page.getByLabel('Sheet title')).toHaveText('Trip');

	await cell(page, 0, 0).click();
	await page.keyboard.type('=2*21');
	await page.keyboard.press('Enter');
	await expect(cell(page, 0, 0)).toHaveText('42');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// It came back from the database, not from memory.
	await page.reload();
	await expect(cell(page, 0, 0)).toHaveText('42');

	await page.goto('/sheets');
	await expect(page.getByRole('link', { name: 'Trip' })).toHaveAttribute('href', `/sheet/${id}`);

	// Another browser with no session cannot open it by its address.
	const stranger = await page.context().browser()!.newContext();
	const other = await stranger.newPage();
	await other.goto(`/sheet/${id}`);
	await expect(other).toHaveURL(/\/signin/);
	await stranger.close();

	await device.detach();
});

test('publishing makes a read-only copy anybody can open', async ({ page }) => {
	const device = await attachAuthenticator(page);
	await register(page, 'Grace');
	const id = await createSheet(page, 'Published numbers');

	await cell(page, 0, 0).click();
	await page.keyboard.type('Total');
	await page.keyboard.press('Tab');
	await page.keyboard.type('=1234.5');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Share' }).click();
	await page.getByRole('button', { name: 'Publish', exact: true }).click();
	await expect(page.getByText('Published at')).toBeVisible();
	// The share menu is a native popover: Escape dismisses it.
	await page.keyboard.press('Escape');

	// Anybody: a context with no cookies, and a page with no JavaScript.
	const anybody = await page.context().browser()!.newContext({ javaScriptEnabled: false });
	const reader = await anybody.newPage();
	await reader.goto(`/s/${id}`);
	await expect(reader.getByRole('heading', { level: 1, name: 'Published numbers' })).toBeVisible();
	await expect(reader.getByRole('table')).toContainText('Total');
	await expect(reader.getByRole('table')).toContainText('1234.5');
	await expect(reader.getByText('by Grace')).toBeVisible();

	// The published copy is frozen: a later edit does not reach it until the next publish.
	await cell(page, 1, 0).click();
	await page.keyboard.type('later');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await reader.reload();
	await expect(reader.getByRole('table')).not.toContainText('later');

	// Unpublish, and the address stops answering.
	await page.getByRole('button', { name: 'Share' }).click();
	await page.getByRole('button', { name: 'Unpublish' }).click();
	await expect(page.getByText('No longer published')).toBeVisible();
	const gone = await reader.goto(`/s/${id}`);
	expect(gone?.status()).toBe(404);

	await anybody.close();
	await device.detach();
});

test('settings: rename, a second passkey, sign out and back in', async ({ page }) => {
	const first = await attachAuthenticator(page);
	await register(page, 'Linus', '/settings');
	await expect(page.getByRole('heading', { name: 'Linus' })).toBeVisible();
	await expect(page.locator('.key')).toHaveCount(1);

	await page.getByLabel('Name').fill('Linus Torvalds');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('link', { name: 'Linus Torvalds' })).toBeVisible();

	// The same device again is refused: the server lists the credentials it
	// already holds, and the authenticator declines to make a second one.
	await page.getByRole('button', { name: 'Add a passkey on this device' }).click();
	await expect(page.getByText('This device already has a passkey for that account.')).toBeVisible();

	// A second device — a phone, say — can.
	await first.detach();
	const second = await attachAuthenticator(page);
	await page.getByRole('button', { name: 'Add a passkey on this device' }).click();
	await expect(page.locator('.key')).toHaveCount(2);

	// Removing one leaves the other; the account survives a lost device.
	await page
		.getByRole('button', { name: /^Remove / })
		.first()
		.click();
	await expect(page.getByText('Passkey removed')).toBeVisible();
	await expect(page.locator('.key')).toHaveCount(1);

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

	// Back in with the remaining device — no name typed, the browser finds the account.
	await page.goto('/signin');
	await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
	await page.waitForURL(/\/sheets$/);
	await expect(page.getByRole('link', { name: 'Linus Torvalds' })).toBeVisible();

	await second.detach();
});

test('a template can be saved straight into an account', async ({ page }) => {
	const device = await attachAuthenticator(page);
	await register(page, 'Margaret', '/templates/loan');
	await page.getByRole('button', { name: 'Save to my account' }).click();
	await page.waitForURL(/\/sheet\/[a-z0-9]{8}$/);
	await expect(page.getByLabel('Sheet title')).toHaveText('Loan schedule');
	await device.detach();
});
