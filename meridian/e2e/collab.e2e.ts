import { expect, test } from '@playwright/test';
import { openTab, PASSWORD, signIn, TRIPS, USERS } from './helpers.ts';

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

/*
 * ACCESS IS ASKED AGAIN ON EVERY WAKE
 * ===================================
 *
 * The live query used to check access once, when the stream opened. A
 * companion removed while their tab stayed open, or somebody reading a trip
 * by its link after the owner made it private, went on receiving every
 * snapshot for as long as the tab lived. Now the generator asks again each
 * time the room wakes it, and a refusal ends the stream: the chip leaves
 * "Live", and nothing written after the refusal reaches the page.
 *
 * A new companion each run, joined through an invite link: the desktop and
 * phone projects share one database, and removing a seeded person would
 * leave the other suites a different trip.
 */
test('a companion who is removed stops receiving the trip', async ({ browser }) => {
	const anaContext = await browser.newContext();
	const guestContext = await browser.newContext();
	const ana = await anaContext.newPage();
	const guest = await guestContext.newPage();

	await signIn(ana, USERS.ana, `/t/${TRIPS.iberia}`);
	await openTab(ana, 'Companions');
	await ana.getByLabel('They may').selectOption('viewer');
	await ana.getByRole('button', { name: 'Make a link' }).click();
	const link = await ana.locator('.invite__url').textContent();
	const joinPath = new URL(link ?? '').pathname;

	const stamp = Date.now().toString(36);
	const name = `Fay ${stamp}`;
	await guest.goto(`/signup?redirectTo=${encodeURIComponent(joinPath)}`);
	await guest.getByLabel('Your name').fill(name);
	await guest.getByLabel('Email').fill(`fay-${stamp}@meridian.test`);
	await guest.getByLabel('Password').fill(PASSWORD);
	await guest.getByRole('button', { name: 'Create an account' }).click();
	await guest.getByRole('button', { name: 'Join the trip' }).click();
	await expect(guest).toHaveURL(new RegExp(`/t/${TRIPS.iberia}$`));
	await expect(guest.getByText('Live')).toBeVisible();
	await expect(ana.getByRole('list', { name: 'here now' })).toContainText(name);

	await ana.getByRole('button', { name: `Remove ${name}` }).click();
	await expect(ana.locator('.members').getByText(name)).toHaveCount(0);

	// The removal woke the room; asked again, the server refused, and the stream ended.
	await expect(guest.getByRole('button', { name: 'Reconnect' })).toBeVisible();
	// Removal is immediate everywhere: off the chips at once, not in thirty seconds.
	await expect(ana.getByRole('list', { name: 'here now' })).not.toContainText(name);

	// Something written afterwards reaches the owner and not the person removed.
	await openTab(ana, 'Itinerary');
	await ana.getByRole('button', { name: 'Add a stop' }).first().click();
	const dialog = ana.getByRole('dialog');
	await dialog.getByPlaceholder('Search a place').pressSequentially('Granada');
	await ana.getByRole('option', { name: 'Granada' }).click();
	await dialog.getByRole('button', { name: 'Save stop' }).click();
	await expect(ana.getByText('Stop added')).toBeVisible();
	await expect(ana.getByRole('button', { name: 'Granada', exact: true })).toBeVisible();
	await expect(guest.getByRole('button', { name: 'Granada', exact: true })).toHaveCount(0);
	await expect(guest.getByText('Live')).toHaveCount(0);

	// Tidy up, so the other suites start from the seed.
	await ana
		.locator('article.stop', { hasText: 'Granada' })
		.getByRole('button', { name: 'Remove' })
		.click();
	await expect(ana.getByText('Stop removed')).toBeVisible();

	await anaContext.close();
	await guestContext.close();
});

test('a trip made private stops the stream of somebody reading it by link', async ({ browser }) => {
	const benContext = await browser.newContext();
	const strangerContext = await browser.newContext();
	const ben = await benContext.newPage();
	const stranger = await strangerContext.newPage();

	// Nobody signed in: a reader with the link and nothing else.
	await stranger.goto(`/t/${TRIPS.japan}`);
	await expect(stranger.getByText('Live')).toBeVisible();

	await signIn(ben, USERS.ben, `/t/${TRIPS.japan}/settings`);
	try {
		await ben.getByLabel('Companions only').check();
		await ben.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(ben.getByText('Saved', { exact: true })).toBeVisible();

		// The save woke the room; asked again, the server refused the stranger.
		await expect(stranger.getByRole('button', { name: 'Reconnect' })).toBeVisible();

		await ben.goto(`/t/${TRIPS.japan}`);
		await ben.getByRole('button', { name: 'Add a stop' }).first().click();
		const dialog = ben.getByRole('dialog');
		await dialog.getByPlaceholder('Search a place').pressSequentially('Osaka');
		await ben.getByRole('option', { name: 'Osaka' }).click();
		await dialog.getByRole('button', { name: 'Save stop' }).click();
		await expect(ben.getByText('Stop added')).toBeVisible();
		await expect(ben.getByRole('button', { name: 'Osaka', exact: true })).toBeVisible();
		await expect(stranger.getByRole('button', { name: 'Osaka', exact: true })).toHaveCount(0);

		await ben
			.locator('article.stop', { hasText: 'Osaka' })
			.getByRole('button', { name: 'Remove' })
			.click();
		await expect(ben.getByText('Stop removed')).toBeVisible();
	} finally {
		// Visible by link again whatever happened above: the public suite reads this trip.
		await ben.goto(`/t/${TRIPS.japan}/settings`);
		await ben.getByLabel('Anyone with the link').check();
		await ben.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(ben.getByText('Saved', { exact: true })).toBeVisible();
	}

	await benContext.close();
	await strangerContext.close();
});
