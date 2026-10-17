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

test('a save the server refuses says what the server said', async ({ browser }) => {
	const anaContext = await browser.newContext();
	const benContext = await browser.newContext();
	const ana = await anaContext.newPage();
	const ben = await benContext.newPage();
	await signIn(ana, USERS.ana, `/t/${TRIPS.iberia}`);
	await signIn(ben, USERS.ben, `/t/${TRIPS.iberia}`);

	// Ben adds Bilbao, which the seed does not have, and starts renaming it.
	await ben.getByRole('button', { name: 'Add a stop' }).first().click();
	const dialog = ben.getByRole('dialog');
	await dialog.getByPlaceholder('Search a place').pressSequentially('Bilbao');
	await ben.getByRole('option', { name: 'Bilbao' }).click();
	await dialog.getByRole('button', { name: 'Save stop' }).click();
	await expect(ben.getByText('Stop added')).toBeVisible();
	await ben
		.locator('article.stop', { hasText: 'Bilbao' })
		.getByRole('button', { name: 'Edit stop' })
		.click();
	await dialog.getByLabel('Name').fill('Bilbao, two nights');

	// Meanwhile Ana removes it — after a reload, so nothing waits on the live query.
	await ana.reload();
	await ana
		.locator('article.stop', { hasText: 'Bilbao' })
		.getByRole('button', { name: 'Remove' })
		.click();
	await expect(ana.getByText('Stop removed')).toBeVisible();

	// The command rejects with the `HttpError` the browser rebuilt from the
	// answer; the toast prints its `body.message`, the server's own sentence.
	// The whole title, not a part of it: `String(error)` — what the toast
	// printed before `errorMessage` — is `{"status":404,"message":"…"}`, which
	// *contains* the sentence, and a `hasText` match passed against it.
	await dialog.getByRole('button', { name: 'Save stop' }).click();
	await expect(ben.locator('[data-sonner-toast][data-type="error"] [data-title]')).toHaveText(
		'That stop is no longer on the trip.'
	);

	await anaContext.close();
	await benContext.close();
});

/*
 * A NOTE THAT SURVIVES THE ROOM
 * =============================
 *
 * The note's editor is built by an attachment, and an attachment runs again
 * whenever state it read changes. It used to read the live document, which
 * is a new object with every snapshot — after this person's own save, and
 * whenever a companion arrives — so each one destroyed the editor and
 * built another: focus gone, the next keystrokes typed into nothing.
 *
 * A snapshot after a save cannot be waited for directly, but its effect
 * can: the presence chip is drawn from the same snapshot as the document,
 * so once Ben is on Ana's screen, Ana's page has applied a snapshot after
 * her save. Then she carries on typing without clicking anywhere.
 */
test('a note keeps its editor through a save and a companion arriving', async ({ browser }) => {
	const anaContext = await browser.newContext();
	const benContext = await browser.newContext();
	const ana = await anaContext.newPage();
	const ben = await benContext.newPage();

	await signIn(ana, USERS.ana, `/t/${TRIPS.iberia}?tab=notes`);
	await expect(ana.getByText('Live')).toBeVisible();
	const editor = ana.locator('.notes__page');
	await editor.click();
	await ana.keyboard.press('ControlOrMeta+End');
	await ana.keyboard.type(' Book the night train.');
	await expect(ana.getByRole('status')).toHaveText('Saved', { timeout: 10_000 });

	await signIn(ben, USERS.ben, `/t/${TRIPS.iberia}`);
	await expect(ana.getByRole('list', { name: 'here now' })).toContainText('Ben Okafor', {
		timeout: 20_000
	});

	// No click: the cursor is where Ana left it, or the test fails here.
	await expect(editor).toBeFocused();
	await ana.keyboard.type(' And the ferry back.');
	await expect(editor).toContainText('Book the night train. And the ferry back.');
	await expect(ana.getByRole('status')).toHaveText('Saved', { timeout: 10_000 });

	await ana.reload();
	await expect(ana.locator('.notes__page')).toContainText(
		'Book the night train. And the ferry back.'
	);

	await anaContext.close();
	await benContext.close();
});
