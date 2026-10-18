import { expect, test, type Page } from '@playwright/test';
import { openMenu, signIn, TRIPS, USERS } from './helpers.ts';

/**
 * A TRIP IN A TUNNEL
 * ==================
 *
 * The service worker (`src/service-worker/index.ts`) keeps a copy of every
 * page it serves, so a trip opened once reads with no network; the app
 * empties those copies when nobody is signed in, so the next person on the
 * device cannot read them. Three proofs: the first promise, and the two
 * ways a session ends.
 *
 * The rest of the suite runs with service workers blocked (see
 * `playwright.config.ts`); this file lets them in.
 *
 * NO CLOCKS
 * ---------
 * A service worker under test is a classic source of flaky tests, because
 * so much of it happens in the background: it registers after `load`,
 * installs by copying the build, controls a page only from that page's
 * next load, and writes each page's copy beside the response. So every
 * step here waits for the thing it needs and nothing else — `ready` for
 * an active worker, `controller` for a controlled page, the copy itself in
 * Cache Storage — and nothing waits for a number of milliseconds.
 * `context.setOffline` reaches the worker as well as the page, so offline
 * means the worker's own `fetch` fails too, and what the page shows came
 * from the copy.
 */

test.use({ serviceWorkers: 'allow' });

const TRIP = `/t/${TRIPS.iberia}`;

/** Is a copy of `path` kept on this device? */
async function kept(page: Page, path: string): Promise<boolean> {
	const url = new URL(path, page.url()).href;
	return page.evaluate(
		async (url) => (await caches.match(url, { ignoreVary: true })) !== undefined,
		url
	);
}

/** Open the trip as Ana, under a worker that controls the page, and wait for its copy. */
async function openKept(page: Page): Promise<void> {
	await signIn(page, USERS.ana, TRIP);
	await expect(page.getByRole('heading', { level: 1, name: 'Iberia by rail' })).toBeVisible();

	// Registered on `load`; `ready` resolves once a worker is active — the build copied.
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	// A worker controls the pages that load after it is active, so this load is the first.
	await page.reload();
	expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
	// The copy is written beside the response: wait for it to exist, not for a clock.
	await expect.poll(() => kept(page, TRIP)).toBe(true);
}

test('a trip opened once is readable offline', async ({ page, context }) => {
	await openKept(page);

	await context.setOffline(true);
	const response = await page.reload();
	expect(response?.fromServiceWorker()).toBe(true);
	await expect(page.getByRole('heading', { level: 1, name: 'Iberia by rail' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Alfama' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Train to Porto' })).toBeVisible();
	// The page hydrated from the copied build, and it is honest about the network.
	await expect(page.getByText('Offline', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reconnect' })).toHaveCount(0);

	// Back online, the live stream comes back by itself.
	await context.setOffline(false);
	await expect(page.getByText('Live', { exact: true })).toBeVisible();
});

test('after signing out, a trip is not readable offline', async ({ page, context }) => {
	await openKept(page);

	// The button must empty the copies *before* the session ends, not leave it to
	// the `(site)` layout on the page that follows: look at the cache at the very
	// moment the sign-out request leaves.
	let keptAtSubmit: boolean | undefined;
	await page.route(/\/_app\/remote\/[^/]+\/signOut/, async (route) => {
		keptAtSubmit ??= await kept(page, TRIP);
		await route.continue();
	});

	await openMenu(page);
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL((url) => url.pathname === '/');
	expect(keptAtSubmit).toBe(false);
	expect(await kept(page, TRIP)).toBe(false);

	await context.setOffline(true);
	// Nothing kept, no network: the navigation fails as it would with no worker at all.
	await expect(page.goto(TRIP)).rejects.toThrow(/net::ERR_/);
	await expect(page.getByRole('button', { name: 'Alfama' })).toHaveCount(0);
});

test('a session that ends without the button takes the copies with it', async ({
	page,
	context
}) => {
	await openKept(page);

	// An expired session, as far as the server can tell: no cookie.
	await context.clearCookies();
	await page.goto('/');
	await openMenu(page);
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	await expect.poll(() => kept(page, TRIP)).toBe(false);
});
