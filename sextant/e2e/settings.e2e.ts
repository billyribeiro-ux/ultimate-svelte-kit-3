import { expect, test, type Page } from '@playwright/test';

/**
 * THE SETTINGS LISTS
 * ==================
 *
 * One claim, from `src/lib/remote/settings.remote.ts`: every form that changes a
 * key or a saved view refreshes the list it changed, in the same request, so the
 * page shows the change without being reloaded. The handlers make that promise
 * by calling `.refresh()`; these tests check that the page keeps it.
 *
 * The tests that change a list mark the document before they submit anything
 * and check the mark afterwards. A reload, or a form that fell back to a
 * full-page POST, would replace the document and take the mark with it — so a
 * list that "updated" because the whole page was rendered again cannot pass for
 * one that updated in place.
 *
 * And the two states around the rows, from the page's `<svelte:boundary>`: the
 * live page says a list is loading until it has arrived, and says so when it
 * cannot load. Both are checked after hydration, because the server's HTML
 * always shows the loading state and so proves nothing about the browser.
 */

const hydrated = (page: Page) => page.locator('html[data-hydrated]');

/** Hold the requests `matches` picks out until the returned function is called. */
async function hold(page: Page, matches: (url: URL) => boolean): Promise<() => void> {
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route(matches, async (route) => {
		await held;
		await route.continue();
	});
	return release;
}

/** A read of one of the two lists: `GET /_app/remote/<hash>/keys` or `…/views`. */
const isList = (url: URL) => /^\/_app\/remote\/[^/]+\/(keys|views)$/.test(url.pathname);

/** The client bundle's entry, which hydration waits for (as in `hydration.e2e.ts`). */
const isBundle = (url: URL) => /^\/_app\/immutable\/entry\/start\.[^/]+\.js$/.test(url.pathname);

/** Load the page, wait for it to be live, and mark the document. */
async function openLive(page: Page, path: string) {
	await page.goto(path);
	await expect(hydrated(page)).toHaveCount(1);
	await page.evaluate(() => {
		(window as Window & { sameDocument?: boolean }).sameDocument = true;
	});
}

/** Whether the document marked by {@link openLive} is still the one on screen. */
function sameDocument(page: Page) {
	return page.evaluate(() => (window as Window & { sameDocument?: boolean }).sameDocument === true);
}

/** Mint a key through the form; it is shown once, in the alert. */
async function createKey(page: Page, name: string) {
	await page.getByLabel('Name').fill(name);
	await page.getByLabel('Scope').selectOption('read');
	await page.getByRole('button', { name: 'Create key' }).click();
	await expect(page.getByRole('alert').getByText(/^sxt_/)).toBeVisible();
}

test('a new key is listed as soon as it is made', async ({ page }, testInfo) => {
	/*
	 * A name unique to the run. Keys are revoked, never deleted, so a fixed name
	 * would match one row per earlier run and every locator would find several.
	 */
	const name = `listed key (${testInfo.project.name}) ${Date.now()}`;

	await openLive(page, '/demo/settings');
	await createKey(page, name);

	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row).toContainText('· read');
	await expect(row).toContainText('never used');
	expect(await sameDocument(page)).toBe(true);
});

test('a revoked key says so in the list, in place', async ({ page }, testInfo) => {
	// Not "revoked" in the name, or the row would say it before the server did.
	const name = `key to revoke (${testInfo.project.name}) ${Date.now()}`;

	// The key is made, then the page is opened from scratch, so this test is about
	// the revoke alone and not about the list that creating it should refresh.
	await page.goto('/demo/settings');
	await expect(hydrated(page)).toHaveCount(1);
	await createKey(page, name);

	await openLive(page, '/demo/settings');
	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row).toContainText('never used');

	await row.getByRole('button', { name: 'Revoke' }).click();

	// Revoked, not removed: the row stays, says when, and offers nothing more.
	await expect(row.getByText(/^revoked /)).toBeVisible();
	await expect(row.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
	expect(await sameDocument(page)).toBe(true);
});

test('a removed view leaves the list, in place', async ({ page }, testInfo) => {
	/*
	 * A view of its own to remove, saved from the explore page the way a person
	 * would. The seeded views are left alone: other tests open them.
	 */
	const name = `removed view (${testInfo.project.name}) ${Date.now()}`;

	await page.goto(`/demo/explore?q=${encodeURIComponent('from logs | take 20')}&range=-6h`);
	await expect(hydrated(page)).toHaveCount(1);
	// The page's own first write, which only its effects make: past it, the save
	// form is live and a click is not a full-page POST.
	await expect(page).toHaveURL(/view=table/);
	const field = page.getByLabel('Name for the saved view');
	await field.fill(name);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(field).toHaveValue('');

	await openLive(page, '/demo/settings');
	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row).toHaveCount(1);

	await row.getByRole('button', { name: 'Remove' }).click();

	await expect(row).toHaveCount(0);
	expect(await sameDocument(page)).toBe(true);
});

test('each list says it is loading until its rows arrive', async ({ page }) => {
	const release = await hold(page, isList);
	const asked = page.waitForRequest((request) => isList(new URL(request.url())));

	await page.goto('/demo/settings');
	await asked;
	await expect(hydrated(page)).toHaveCount(1);

	// Live, and the rows held back: this is the browser's `pending`, not the copy
	// of it in the server's HTML.
	const keys = page.getByRole('region', { name: 'API keys' });
	const views = page.getByRole('region', { name: 'Saved views' });
	await expect(keys.getByRole('status')).toHaveText('Loading…');
	await expect(views.getByRole('status')).toHaveText('Loading…');

	release();
	await expect(keys.getByRole('list')).toBeVisible();
	await expect(views.getByRole('list')).toBeVisible();
	await expect(keys.getByRole('status')).toHaveCount(0);
	await expect(views.getByRole('status')).toHaveCount(0);
});

test('a list that cannot load says so, with the server’s reason', async ({ page, context }) => {
	/*
	 * The session ends between the page and its rows: the server draws the page
	 * signed in, and the lists are asked for once the cookie has gone, so the
	 * server refuses them for real. The bundle is held so the cookie is cleared
	 * before the page can ask.
	 */
	const release = await hold(page, isBundle);
	await page.goto('/demo/settings');
	await context.clearCookies();
	release();
	await expect(hydrated(page)).toHaveCount(1);

	// Both say what the server said, from the `App.Error` each boundary is handed.
	await expect(page.getByRole('region', { name: 'API keys' }).getByRole('alert')).toHaveText(
		'Sign in to continue.'
	);
	await expect(page.getByRole('region', { name: 'Saved views' }).getByRole('alert')).toHaveText(
		'Sign in to continue.'
	);
});
