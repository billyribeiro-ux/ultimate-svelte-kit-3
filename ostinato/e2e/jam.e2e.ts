import { expect, test, type Page } from '@playwright/test';

/** The header's handle chip says `…` until the page has hydrated (see `gallery.e2e.ts`). */
const hydrated = (page: Page) => expect(page.locator('.topbar__end .chip')).not.toHaveText('…');

/**
 * Two browsers, one room. Playwright gives each test a context; a second one
 * is opened by hand, and both are torn down at the end.
 */

test('a toggle in one browser is heard in another', async ({ page, browser }) => {
	const other = await browser.newContext();
	const second = await other.newPage();

	try {
		await page.goto('/jam/lobby');
		await second.goto('/jam/lobby');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('The lobby');
		await expect(page.getByText('live')).toBeVisible();

		// Two connections, two chips — anonymous, but counted.
		await expect(page.locator('.presence .chip')).toHaveCount(2, { timeout: 10_000 });

		const pad = (p: typeof page) =>
			p
				.locator('.track')
				.first()
				.getByRole('button', { name: /^Step 3(,|$)/ });

		// A pad cycles off → accent → soft → off. Whatever state the room was
		// left in, three clicks — from alternating browsers — bring it round once,
		// and after each one both browsers must agree.
		for (const clicker of [page, second, page]) {
			const before = await pad(page).getAttribute('aria-label');
			await pad(clicker).click();
			await expect(pad(clicker)).not.toHaveAttribute('aria-label', before!, { timeout: 10_000 });
			const after = await pad(clicker).getAttribute('aria-label');
			await expect(pad(page)).toHaveAttribute('aria-label', after!, { timeout: 10_000 });
			await expect(pad(second)).toHaveAttribute('aria-label', after!, { timeout: 10_000 });
		}
	} finally {
		await other.close();
	}
});

test('choosing a handle in the room reconnects the stream with the new name', async ({
	page
}, info) => {
	const handle = `jam_${info.project.name}_${Date.now().toString(36).slice(-5)}`;

	await page.goto('/jam/lobby');
	await expect(page.locator('.presence')).toContainText('@someone');

	await page.getByLabel('Play as').fill(handle);
	await page.getByRole('button', { name: /Join as/ }).click();

	// The stream was reconnected by the form handler and now knows the name…
	await expect(page.locator('.presence')).toContainText(`@${handle}`, { timeout: 10_000 });
	// …and the header's `whoAmI()` was refreshed in the same response.
	await expect(page.getByRole('link', { name: `@${handle}` })).toBeVisible();
});

test('the longest handle does not push the page sideways', async ({ page }, info) => {
	// Twenty characters, the most a handle may have, and wide ones.
	const handle = `${info.project.name}_${Date.now().toString(36)}_`.padEnd(20, 'm');

	await page.goto('/jam/lobby');
	await page.getByLabel('Play as').fill(handle);
	await page.getByRole('button', { name: /Join as/ }).click();
	await expect(page.getByRole('link', { name: `@${handle}` })).toBeVisible();

	// The header shows the handle on every page; on a phone it must fit.
	await page.goto('/gallery');
	await expect(page.getByRole('link', { name: `@${handle}` })).toBeVisible();
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth
	}));
	expect(scroll, 'the page is wider than the screen').toBeLessThanOrEqual(client);
});

test('a preset replaces the room for everybody', async ({ page }) => {
	await page.goto('/jam/lobby');
	await expect(page.getByText('live')).toBeVisible();
	const version = page.locator('.hint.mono', { hasText: /^v\d+$/ });
	const before = Number((await version.textContent())?.slice(1));

	await page.getByRole('button', { name: 'Boom bap' }).click();
	await expect(version).toHaveText(`v${before + 1}`, { timeout: 10_000 });
	await expect(page.locator('.track')).toHaveCount(4);
	await expect(page.locator('.track').nth(3)).toContainText('Lead');

	// Leave it as it was found.
	await page.getByRole('button', { name: 'Four on the floor' }).click();
	await expect(version).toHaveText(`v${before + 2}`, { timeout: 10_000 });
});

/*
 * WHAT A FAILURE SAYS
 * -------------------
 * Two shapes, one per test. The error page is handed the `App.Error` that
 * `handleError` made — as a boundary's `failed` snippet would be — so it
 * reads `error.message`. An awaited command rejects with an `HttpError`,
 * whose sentence is on `body.message` — and `(e as Error).message` on one of
 * those is `undefined`, which is what this page used to put in its toast.
 */

test('a room that does not exist is a 404, served or navigated to', async ({ page }) => {
	// Served: the page's `load` asks whether the room exists before anything
	// renders, so the server can answer with the status. (The live room is
	// inside a boundary with a `pending` snippet, which the server never
	// renders past — it could not have known.)
	const response = await page.goto('/jam/nowhere');
	expect(response?.status()).toBe(404);
	await expect(page.locator('.error__message')).toHaveText('No such room');

	// Navigated to: the same `load` runs in the browser, and its query is
	// refused there. The marker on `window` survives only a client-side
	// navigation, so it proves which path this was.
	await page.goto('/gallery');
	await hydrated(page);
	await page.evaluate(() => {
		(window as { stayed?: boolean }).stayed = true;
		const link = document.createElement('a');
		link.href = '/jam/nowhere';
		link.textContent = 'a room that is not there';
		document.body.append(link);
	});
	await page.getByRole('link', { name: 'a room that is not there' }).click();
	await expect(page.locator('.error__message')).toHaveText('No such room');
	expect(await page.evaluate(() => (window as { stayed?: boolean }).stayed)).toBe(true);
});

test('an edit the room refuses says why', async ({ page }) => {
	await page.goto('/jam/lobby');
	await expect(page.getByText('live')).toBeVisible();

	// Freeze this browser's view of the room: drop the stream, and fail every
	// attempt to reopen it. SvelteKit keeps the last snapshot on screen and
	// retries, so what is drawn stops following the server.
	// The address is SvelteKit's, not this app's: remote calls go to
	// `/_app/remote/<hash>/<name>`, an internal shape that may change. It is
	// matched by the function's name, the one part this project chose.
	await page.route(/\/_app\/remote\/[^/]+\/watchRoom/, (route) => route.abort());
	await page.getByRole('button', { name: 'Reconnect' }).click();
	await expect(page.getByText('reconnecting…')).toBeVisible();

	// Replace the room's pattern. A preset arrives with new track ids, and this
	// browser does not hear about it…
	const loaded = page.waitForResponse((r) => r.url().includes('/loadRoomPreset'));
	await page.getByRole('button', { name: 'Boom bap' }).click();
	expect((await loaded).ok()).toBe(true);

	// …so muting a track it still shows names a track the room no longer has,
	// and the command is refused with the server's own sentence.
	await page.locator('button.chip[aria-pressed]').first().click();
	await expect(page.locator('.toast')).toHaveText('No such track in this room');

	// Leave the room as the other tests expect to find it.
	const restored = page.waitForResponse((r) => r.url().includes('/loadRoomPreset'));
	await page.getByRole('button', { name: 'Four on the floor' }).click();
	expect((await restored).ok()).toBe(true);
});
