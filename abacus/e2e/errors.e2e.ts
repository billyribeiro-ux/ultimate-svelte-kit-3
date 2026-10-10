import { expect, test } from '@playwright/test';
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
