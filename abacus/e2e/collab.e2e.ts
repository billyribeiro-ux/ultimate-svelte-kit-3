import { expect, test, type Page } from '@playwright/test';
import { attachAuthenticator, register } from './passkeys.ts';

/**
 * TWO PEOPLE, ONE SHEET
 * =====================
 *
 * Two browser contexts — two people, two sessions, two passkeys — on the
 * same sheet. What one types the other sees; where one is, the other can
 * tell. The traffic underneath is a `query.live` stream in each direction
 * and a `command` carrying batches of operations, and the test knows none
 * of that: it reads the cells.
 */

const cell = (page: Page, row: number, col: number) => page.locator(`#cell-${row}-${col}`);

async function type(page: Page, row: number, col: number, text: string) {
	await cell(page, row, col).click();
	await page.keyboard.type(text);
	await page.keyboard.press('Enter');
}

test('edits and presence flow both ways', async ({ browser, contextOptions }) => {
	const contextA = await browser.newContext(contextOptions);
	const contextB = await browser.newContext(contextOptions);
	const ada = await contextA.newPage();
	const bob = await contextB.newPage();
	const deviceA = await attachAuthenticator(ada);
	const deviceB = await attachAuthenticator(bob);

	// Ada makes a sheet and opens it to anybody signed in with the link.
	await register(ada, 'Ada');
	await ada.getByLabel('Title').fill('Shared');
	await ada.getByRole('button', { name: 'New sheet' }).click();
	await ada.waitForURL(/\/sheet\/[a-z0-9]{8}$/);
	const path = new URL(ada.url()).pathname;

	await ada.getByRole('button', { name: 'Share' }).click();
	const link = ada.getByLabel('Anyone signed in with the link can edit');
	await link.check();
	await expect(link).toBeChecked();
	// The setting is a form: it is on the server before the page says so.
	await ada.reload();
	await ada.getByRole('button', { name: 'Share' }).click();
	await expect(ada.getByLabel('Anyone signed in with the link can edit')).toBeChecked();
	await ada.keyboard.press('Escape');

	// Bob signs up and lands on the sheet.
	await register(bob, 'Bob', path);
	await expect(bob.getByLabel('Sheet title')).toHaveText('Shared');

	// Each sees the other in the room: a chip in the header with the name.
	const present = (page: Page, name: string) => page.locator('header .chip', { hasText: name });
	await expect(present(ada, 'Bob')).toBeVisible();
	await expect(present(bob, 'Ada')).toBeVisible();

	// A cell typed on one side appears on the other, and a formula over it computes there.
	await type(ada, 0, 0, 'hello');
	await expect(cell(bob, 0, 0)).toHaveText('hello');

	await type(bob, 0, 1, '=LEN(A1)&" letters"');
	await expect(cell(ada, 0, 1)).toHaveText('5 letters');

	// Where Ada is, Bob can see: her name sits on the cell she selected.
	await cell(ada, 2, 0).click();
	await expect(cell(bob, 2, 0).locator('.cursor-name')).toHaveText('Ada');

	// A rename is an operation like any other.
	const title = ada.getByLabel('Sheet title');
	await title.fill('Shared and renamed');
	await title.press('Enter');
	await expect(bob.getByLabel('Sheet title')).toHaveText('Shared and renamed');

	// Leaving is noticed.
	await bob.close();
	await expect(present(ada, 'Bob')).toHaveCount(0);

	await deviceA.detach();
	await deviceB.detach().catch(() => {});
	await contextA.close();
	await contextB.close();
});
