import { expect, test } from '@playwright/test';

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
