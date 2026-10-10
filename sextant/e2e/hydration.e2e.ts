import { expect, test, type Page } from '@playwright/test';

/**
 * BEFORE AND AFTER HYDRATION
 * ==========================
 *
 * One claim, from `src/lib/forms/keep-typed.ts`: what somebody types into a
 * server-rendered form before the JavaScript arrives is still there after it
 * does. It is the claim the read API's tests lean on without saying so — they
 * mint their keys by typing into the settings form straight after the page
 * loads.
 *
 * And the claim those tests stand on: the root layout's `data-hydrated`
 * marker appears on every page, and only once the page is live.
 */

/**
 * Hold the client bundle back, so for a while the page is exactly what a slow
 * connection sees: the server's HTML, and no JavaScript yet.
 */
async function holdTheBundle(page: Page): Promise<() => void> {
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
		await held;
		await route.continue();
	});
	return release;
}

const hydrated = (page: Page) => page.locator('html[data-hydrated]');

/*
 * Every workspace page, because they differ in the one way that matters here.
 * Three have a top-level `await` and one does not, and the first version of the
 * marker only ever appeared on the one that did not.
 */
for (const path of ['/demo/explore', '/demo/traces', '/demo/alerts', '/demo/settings']) {
	test(`${path} says when it has hydrated, and not before`, async ({ page }) => {
		const release = await holdTheBundle(page);

		await page.goto(path);
		await expect(hydrated(page)).toHaveCount(0);

		release();
		await expect(hydrated(page)).toHaveCount(1);
	});
}

test('a key typed before the page has hydrated is the key that is made', async ({ page }) => {
	/*
	 * The marker is checked on both sides. Without the first check this could
	 * type after hydration and prove nothing; without the second it could pass by
	 * looking before hydration had a chance to throw anything away.
	 */
	const release = await holdTheBundle(page);
	const name = `typed early ${Date.now()}`;

	await page.goto('/demo/settings');
	await page.getByLabel('Name').fill(name);
	// `read`, not the default, so a scope that hydration reset would show.
	await page.getByLabel('Scope').selectOption('read');
	await expect(hydrated(page)).toHaveCount(0);

	release();
	await expect(hydrated(page)).toHaveCount(1);
	await expect(page.getByLabel('Name')).toHaveValue(name);
	await expect(page.getByLabel('Scope')).toHaveValue('read');

	// And it is what gets submitted: the key is minted and shown once, and the
	// server — asked again from scratch — lists it with the scope that was chosen
	// before the page woke up.
	await page.getByRole('button', { name: 'Create key' }).click();
	await expect(page.getByRole('alert').getByText(/^sxt_/)).toBeVisible();

	await page.reload();
	await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('· read');
});

test('a view name typed before the page has hydrated is the name it is saved under', async ({
	page
}) => {
	const release = await holdTheBundle(page);
	const name = `typed early ${Date.now()}`;

	await page.goto(`/demo/explore?q=${encodeURIComponent('from logs | take 20')}&range=-6h`);
	const field = page.getByLabel('Name for the saved view');
	await field.fill(name);
	await expect(hydrated(page)).toHaveCount(0);

	release();
	await expect(hydrated(page)).toHaveCount(1);
	// The page's own first write, which only its effects make, so by now the
	// template under the field has certainly hydrated.
	await expect(page).toHaveURL(/view=table/);
	await expect(field).toHaveValue(name);

	// A remote form clears itself once the server has accepted it, and the
	// settings page, asked from scratch, lists the view by the name typed early.
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(field).toHaveValue('');

	await page.goto('/demo/settings');
	await expect(page.getByText(name, { exact: true })).toBeVisible();
});
