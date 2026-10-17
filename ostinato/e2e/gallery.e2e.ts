import { expect, test, type Page } from '@playwright/test';

/**
 * The header's handle chip is a boundary with a `pending` snippet: the
 * server sends `…`, and the answer replaces it only once the page has
 * hydrated and run its effects — the same pass that enhances a form. Waiting
 * for it is waiting for hydration, rather than for the network to go quiet.
 */
const hydrated = (page: Page) => expect(page.locator('.topbar__end .chip')).not.toHaveText('…');

test('sorts from the URL and shows batched counts', async ({ page }) => {
	await page.goto('/gallery?sort=played');
	await expect(page.getByRole('link', { name: 'Most played' })).toHaveAttribute(
		'aria-current',
		'true'
	);

	const cards = page.locator('#main .pattern-card');
	await expect(cards.first()).toContainText('▶');
	await expect(cards.first()).toContainText('Four on the floor');
});

test('previews a pattern in place on a desktop, as a page on a phone', async ({ page }, info) => {
	await page.goto('/gallery');
	// Exact: 'Boom bap, slower' is newer and would match a substring first.
	await page
		.locator('.pattern-card', { has: page.getByRole('heading', { name: 'Boom bap', exact: true }) })
		.locator('.pattern-card__link')
		.click();

	await expect(page).toHaveURL(/\/p\/seedboom$/);

	if (info.project.name === 'phone') {
		// A plain navigation: the full page, with the share card section.
		await expect(page.getByRole('heading', { name: 'Share card' })).toBeVisible();
	} else {
		// Shallow: the gallery is still there underneath, the pattern is in a dialog.
		const dialog = page.getByRole('dialog', { name: 'Pattern preview' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { level: 1 })).toHaveText('Boom bap');
		await expect(page.getByRole('heading', { name: 'Published grooves' })).toBeVisible();

		await page.goBack();
		await expect(dialog).not.toBeVisible();
		await expect(page).toHaveURL(/\/gallery$/);

		// "Open the full page" links to the address already in the bar. That is
		// a client-side navigation out of shallow routing — the marker on
		// `window` survives it — and it replaces the preview's entry, so back
		// is the gallery again.
		await page.evaluate(() => ((window as { stayed?: boolean }).stayed = true));
		await page
			.locator('.pattern-card', {
				has: page.getByRole('heading', { name: 'Boom bap', exact: true })
			})
			.locator('.pattern-card__link')
			.click();
		await dialog.getByRole('link', { name: 'Open the full page' }).click();
		await expect(page.getByRole('heading', { name: 'Share card' })).toBeVisible();
		await expect(page).toHaveURL(/\/p\/seedboom$/);
		expect(await page.evaluate(() => (window as { stayed?: boolean }).stayed)).toBe(true);
		await page.goBack();
		await expect(page).toHaveURL(/\/gallery$/);
	}
});

test('the preview is a modal: focus goes in, stays in, and comes back', async ({ page }, info) => {
	await page.goto('/gallery');
	await hydrated(page);
	const link = page
		.locator('.pattern-card', { has: page.getByRole('heading', { name: 'Boom bap', exact: true }) })
		.locator('.pattern-card__link');

	await link.focus();
	await page.keyboard.press('Enter');

	if (info.project.name === 'phone') {
		// No preview on a phone: Enter follows the link, like a click.
		await expect(page.getByRole('heading', { name: 'Share card' })).toBeVisible();
		return;
	}

	const dialog = page.getByRole('dialog', { name: 'Pattern preview' });
	await expect(dialog.getByRole('heading', { level: 1 })).toHaveText('Boom bap');
	const focusInside = () => dialog.evaluate((node) => node.contains(document.activeElement));

	// `showModal()`: focus moves in, and the page behind is inert, so Tab
	// cannot leave for the gallery underneath.
	await expect.poll(focusInside).toBe(true);
	for (let i = 0; i < 6; i += 1) {
		await page.keyboard.press('Tab');
		await expect.poll(focusInside).toBe(true);
	}

	// Escape closes it, closing is going back, and focus returns to the card.
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(page).toHaveURL(/\/gallery$/);
	await expect(link).toBeFocused();
});

test('publish from the studio, find it in the gallery, delete it', async ({ page }, info) => {
	const handle = `e2e_${info.project.name}_${Date.now().toString(36).slice(-5)}`;

	await page.goto('/studio?preset=two-step');
	await page.getByLabel('Pattern title').fill(`Published by ${info.project.name}`);
	await page.getByRole('button', { name: 'Share' }).click();

	const dialog = page.getByRole('dialog', { name: 'Share' });
	await dialog.getByLabel('Handle').fill('no');
	await dialog.getByLabel('Handle').press('Tab');
	// Preflight: the client-side schema speaks before any request is made —
	// once the field has been left, which is when SvelteKit counts it as touched.
	await expect(dialog.getByText('Three to twenty')).toBeVisible();

	await dialog.getByLabel('Handle').fill(handle);
	await dialog.getByRole('button', { name: 'Publish', exact: true }).click();

	const live = dialog.getByRole('link', { name: new RegExp(`/@${handle}/`) });
	await expect(live).toBeVisible({ timeout: 10_000 });
	await expect(dialog.getByRole('img', { name: /Share card/ })).toBeVisible();

	// The header now knows who this browser is.
	await expect(page.getByRole('link', { name: `@${handle}` })).toBeVisible();

	await page.goto('/gallery');
	const yours = page.locator('#yours .pattern-card');
	await expect(yours).toHaveCount(1);
	await expect(yours.first()).toContainText(`Published by ${info.project.name}`);

	await yours.first().getByRole('button', { name: 'Delete' }).click();
	await expect(page.locator('#yours .pattern-card')).toHaveCount(0);
	await expect(page.locator('#yours')).toContainText('not published anything');
});

test('a delete the server refuses says why, and the card comes back', async ({ page }, info) => {
	const title = `Deleted twice by ${info.project.name}`;
	const handle = `twice_${info.project.name}_${Date.now().toString(36).slice(-5)}`;

	await page.goto('/studio?preset=two-step');
	await page.getByLabel('Pattern title').fill(title);
	await page.getByRole('button', { name: 'Share' }).click();
	const dialog = page.getByRole('dialog', { name: 'Share' });
	await dialog.getByLabel('Handle').fill(handle);
	// The submission, not one of the validation requests the form sends as the
	// fields change: only the submission's answer carries the new address.
	const published = page.waitForResponse(
		async (r) => r.url().includes('/publish') && (await r.text()).includes(`/@${handle}/`)
	);
	await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
	expect((await published).ok()).toBe(true);

	// Two tabs on the gallery, both loaded from the server, so both delete
	// forms are hydrated rather than mounted — the case that once went
	// unenhanced and fell back to a plain POST.
	const card = (p: Page) => p.locator('#yours .pattern-card', { hasText: title });
	const other = await page.context().newPage();
	await other.goto('/gallery');
	await expect(card(other)).toHaveCount(1);

	// Each tab is brought to the front before it is used, as a person would.
	// (On the phone profile a click here used to land on the card's title
	// instead of its button, and the tab switch took the blame. The cause was
	// the handle: seventeen characters of `twice_phone_…` in the header pushed
	// the page wider than the screen, and the browser's idea of where the
	// button was drifted from the page's. The header is fixed, and a test in
	// `jam.e2e.ts` holds it there.)
	await page.bringToFront();
	await page.goto('/gallery');
	await card(page).getByRole('button', { name: 'Delete' }).click();
	await expect(card(page)).toHaveCount(0);

	// The other tab still shows the card; the server no longer has it. The
	// optimistic removal is undone, and the toast is the server's sentence
	// from `body.message` rather than a guess of the page's own.
	await other.bringToFront();
	await hydrated(other);
	await card(other).getByRole('button', { name: 'Delete' }).click();
	await expect(other.locator('.toast')).toHaveText('Not yours, or not there');
	await expect(card(other)).toHaveCount(1);
	await other.close();
});
