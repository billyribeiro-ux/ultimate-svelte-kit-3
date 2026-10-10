import { expect, test, type Page } from '@playwright/test';

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
	}
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

	// Each tab is brought to the front before it is used. A background tab is
	// not painted, and on the phone profile a click aimed at one lands on
	// stale layout — the card's title, not its Delete button.
	await page.bringToFront();
	await page.goto('/gallery');
	await card(page).getByRole('button', { name: 'Delete' }).click();
	await expect(card(page)).toHaveCount(0);

	// The other tab still shows the card; the server no longer has it. The
	// optimistic removal is undone, and the toast is the server's sentence
	// from `body.message` rather than a guess of the page's own.
	await other.bringToFront();
	await other.waitForLoadState('networkidle');
	await card(other).getByRole('button', { name: 'Delete' }).click();
	await expect(other.locator('.toast')).toHaveText('Not yours, or not there');
	await expect(card(other)).toHaveCount(1);
	await other.close();
});
