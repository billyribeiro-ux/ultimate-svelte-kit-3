import { expect, test, type Locator, type Page } from '@playwright/test';
import { attachAuthenticator, register } from './passkeys.ts';

/**
 * WHAT A FAILURE SAYS
 * ===================
 *
 * A browser meets two shapes of error, and a page has to read the right one.
 *
 *   A remote call awaited in a handler — a command, a form's `submit()`, a
 *   query outside the markup — rejects with an `HttpError`: `{ status, body }`.
 *   The server's sentence is `body.message`; `(e as Error).message` is
 *   `undefined`, which is an empty toast.
 *
 *   A boundary — `+error.svelte` is one — receives an `App.Error` that has
 *   been through `handleError`: `{ status, message }`. The client hook decides
 *   what that message is, and a hook that answers every kind with the same
 *   sentence hides what a `load` meant to say.
 *
 * Each test makes the server, or a load, refuse something on purpose and
 * checks that the person reads the refusal itself.
 */

const cell = (page: Page, row: number, col: number) => page.locator(`#cell-${row}-${col}`);

test('a query awaited in the page says what the server said', async ({ page }) => {
	// `?from=` names a published sheet to copy; this one does not exist, so
	// `getPublished` throws `error(404, 'No such published sheet')`.
	await page.goto('/sheet/local?from=nosuchsheet');
	await expect(page.getByText('No such published sheet')).toBeVisible();
	// The person still gets a sheet to work in.
	await expect(page.getByLabel('Sheet title')).toHaveText('My sheet');
});

test('a refused form and a refused command say what the server said', async ({ page }) => {
	const device = await attachAuthenticator(page);
	await register(page, 'Hedy', '/settings');
	await expect(page.locator('.key')).toHaveCount(1);

	// The form: `removePasskey` answers a 409 rather than lock the account.
	await page.getByRole('button', { name: /^Remove / }).click();
	await expect(
		page.getByText('That is your only passkey. Add another before removing it.')
	).toBeVisible();
	await expect(page.locator('.key')).toHaveCount(1);

	// The command: the device offers a passkey this server never issued, and
	// `finishAuthentication` refuses it by name.
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	await device.detach();
	const stranger = await attachAuthenticator(page);
	await stranger.addUnknownPasskey();
	await page.goto('/signin');
	await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
	await expect(page.getByText('That passkey is not registered here')).toBeVisible();
	await expect(page).toHaveURL(/\/signin$/);
	await stranger.detach();
});

test('a load that fails in the browser shows its own message on the error page', async ({
	page
}) => {
	await page.goto('/templates');
	// The router is listening once it has taken over scroll restoration — the
	// first thing SvelteKit does when it starts. Before that a click is an
	// ordinary page load, and the server would be the one answering.
	await page.waitForFunction(() => history.scrollRestoration === 'manual');

	// A link to a template that does not exist, as a typo in a page would make.
	// Following it is a client-side navigation: the template page's universal
	// `load` runs here, in the browser, and throws `error(404, 'No such template')`.
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/templates/nosuch';
		link.textContent = 'A template that is not there';
		document.querySelector('main')!.append(link);
	});
	await page.getByRole('link', { name: 'A template that is not there' }).click();

	await expect(page).toHaveURL(/\/templates\/nosuch$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeVisible();
	await expect(page.getByText('No such template')).toBeVisible();
	// A 404 is not a bug, so there is no reference to quote.
	await expect(page.getByText(/^Reference /)).toHaveCount(0);
});

test('a session that ends while a page is open: every refusal says why', async ({ page }) => {
	const device = await attachAuthenticator(page);
	await register(page, 'Barbara');
	await page.getByLabel('Title').fill('Kept');
	await page.getByRole('button', { name: 'New sheet' }).click();
	await page.waitForURL(/\/sheet\/[a-z0-9]{8}$/);
	const sheet = new URL(page.url()).pathname;
	const session = await page.context().cookies();

	/**
	 * Open a page signed in and wait until what it shows has arrived — the
	 * lists and the profile are queries the browser asks for after hydration —
	 * then end the session the way an expiry would: the cookie goes, the page
	 * stays. Every page load here is a fresh one, so the toast on screen is
	 * always the latest action's and never the one before.
	 */
	async function openThenExpire(path: string, ready: Locator) {
		await page.context().addCookies(session);
		await page.goto(path);
		await expect(ready).toBeVisible();
		await page.context().clearCookies();
	}

	// `create` — an enhanced form, so the refusal is a toast, not a page.
	await openThenExpire('/sheets', page.getByRole('link', { name: 'Kept' }));
	await page.getByLabel('Title').fill('Never made');
	await page.getByRole('button', { name: 'New sheet' }).click();
	await expect(page.getByText('Sign in with a passkey first')).toBeVisible();

	// `remove` — the optimistic override takes the card away, and the refusal
	// brings it back.
	await openThenExpire('/sheets', page.getByRole('link', { name: 'Kept' }));
	page.once('dialog', (dialog) => void dialog.accept());
	await page.getByRole('button', { name: 'Delete Kept' }).click();
	await expect(page.getByText('Sign in with a passkey first')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Kept' })).toBeVisible();

	// `publish` — a command awaited in a click handler.
	await openThenExpire(sheet, page.getByText('Saved', { exact: true }));
	await page.getByRole('button', { name: 'Share' }).click();
	await page.getByRole('button', { name: 'Publish', exact: true }).click();
	await expect(page.getByText('Sign in with a passkey first')).toBeVisible();

	// `updateProfile` — the settings form.
	await openThenExpire('/settings', page.getByRole('button', { name: 'Save' }));
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Sign in with a passkey first')).toBeVisible();

	await device.detach();
});

test('a batch the server refuses stops the saving, says why, and a reload shows what was kept', async ({
	page
}) => {
	const device = await attachAuthenticator(page);
	await register(page, 'Annie');
	await page.getByLabel('Title').fill('Too big');
	await page.getByRole('button', { name: 'New sheet' }).click();
	await page.waitForURL(/\/sheet\/[a-z0-9]{8}$/);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// One cell the server keeps.
	await cell(page, 0, 0).click();
	await page.keyboard.type('42');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// Thirty rows of forty: 1,200 cells, past the suite's limit of a thousand
	// (see `playwright.config.ts`). The server answers 413 with its own sentence.
	const rows = Array.from({ length: 30 }, (_, r) =>
		Array.from({ length: 40 }, (_, c) => r * 40 + c).join(',')
	);
	await cell(page, 2, 0).click();
	await page.getByLabel('Import a CSV file').setInputFiles({
		name: 'big.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(rows.join('\n'))
	});
	await expect(page.getByText('Not saved', { exact: true })).toBeVisible();
	const refusal = page
		.getByRole('alert')
		.filter({ hasText: 'A sheet may hold at most 1,000 cells' });
	await expect(refusal).toContainText('your last changes were not saved');

	// A later edit is not sent on top of the refusal, and does not paper over it.
	await cell(page, 0, 1).click();
	await page.keyboard.type('after');
	await page.keyboard.press('Enter');
	await expect(cell(page, 0, 1)).toHaveText('after');
	await expect(page.getByText('Not saved', { exact: true })).toBeVisible();

	// The reload is the stored sheet, read again: what was saved is there, the
	// refused import and the edit after it are not.
	await page.getByRole('button', { name: 'Reload', exact: true }).click();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await expect(cell(page, 0, 0)).toHaveText('42');
	await expect(cell(page, 2, 0)).toHaveText('');
	await expect(cell(page, 0, 1)).toHaveText('');

	await device.detach();
});
