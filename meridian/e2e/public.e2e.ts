import { expect, test } from '@playwright/test';
import { openMenu, TRIPS } from './helpers.ts';

/**
 * WHAT A STRANGER CAN SEE
 * =======================
 *
 * Nobody signed in: the home page, the prerendered guides in three
 * languages, the explore page, the trip that is visible by link, and the
 * things a load balancer or another site would ask for — the health
 * endpoint, the route API, the embed frame.
 */

test('the guides are prerendered, translated and shipped without JavaScript', async ({ page }) => {
	await page.goto('/guides');
	await expect(page.getByRole('heading', { level: 1, name: 'Guides' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	// `csr = false`: not one script file. The only <script> is the theme boot in app.html.
	expect(await page.locator('script[src]').count()).toBe(0);

	await page.getByRole('link', { name: 'Lisbon in three days' }).click();
	await expect(page).toHaveURL(/\/guides\/lisbon-in-three-days$/);
	// A component inside the Markdown, computed at build time by the geodesy library.
	await expect(page.getByText('Lisbon → Sintra')).toBeVisible();
	await expect(page.getByText(/2\d km · W/)).toBeVisible();

	await page.goto('/de/guides');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByText('Min. Lesezeit').first()).toBeVisible();

	await page.goto('/pt-br/guides/kyoto-on-two-wheels');
	await expect(page.locator('html')).toHaveAttribute('lang', 'pt-br');
	await expect(page.getByText('min de leitura')).toBeVisible();
});

test('the explore page filters a hundred places by name or country', async ({ page }) => {
	await page.goto('/explore');
	await expect(page.getByText('100 places')).toBeVisible();
	await page.getByPlaceholder('Filter places').fill('portu');
	await expect(page.getByRole('heading', { name: /^Portugal/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Japan/ })).toHaveCount(0);
	await expect(page.getByText('5 places')).toBeVisible();
	// A place with a guide links to it.
	await page.getByRole('link', { name: 'Read the guide' }).first().click();
	await expect(page).toHaveURL(/\/guides\//);
});

test('a trip visible by link is readable; a private one is a 404', async ({ page }) => {
	await page.goto(`/t/${TRIPS.japan}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Japan in autumn' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Senso-ji' })).toBeVisible();
	// A stranger can look and not touch: no "Add a stop".
	await expect(page.getByRole('button', { name: 'Add a stop' })).toHaveCount(0);

	const response = await page.goto(`/t/${TRIPS.iberia}`);
	expect(response?.status()).toBe(404);
	await expect(page.getByText('That page does not exist.')).toBeVisible();
});

test('a language switch is a full navigation that changes the document language', async ({
	page
}) => {
	await page.goto(`/t/${TRIPS.japan}?tab=expenses`);
	await openMenu(page);
	await page.getByRole('link', { name: 'Deutsch' }).click();
	await expect(page).toHaveURL(/\/de\/t\/seedjapan2\?tab=expenses$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('heading', { name: 'Ausgaben' })).toBeVisible();
});

test('health, the route API and the embed frame answer for machines', async ({ page, request }) => {
	const health = await request.get('/healthz');
	expect(health.ok()).toBeTruthy();
	expect((await health.json()).ok).toBe(true);

	const route = await request.get(`/api/route/${TRIPS.japan}.json`);
	expect(route.headers()['access-control-allow-origin']).toBe('*');
	const body = await route.json();
	expect(body.name).toBe('Japan in autumn');
	expect(body.stops.length).toBeGreaterThan(2);

	const hidden = await request.get(`/api/route/${TRIPS.iberia}.json`);
	expect(hidden.status()).toBe(404);

	const frame = await page.goto(`/embed/${TRIPS.japan}`);
	expect(frame?.headers()['content-security-policy']).toContain('frame-ancestors *');
	await expect(page.getByRole('link', { name: 'Planned with Meridian' })).toBeVisible();
	expect(await page.locator('script[src]').count()).toBe(0);

	const framedPrivate = await page.goto(`/embed/${TRIPS.iberia}`);
	expect(framedPrivate?.status()).toBe(404);
});

test('a URL that matches nothing gets the root error page, with a way home', async ({ page }) => {
	const response = await page.goto('/nothing/here');
	expect(response?.status()).toBe(404);
	await expect(page.getByText('That page does not exist.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Meridian' })).toBeVisible();
});
