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

test('a filter typed before the explore page has hydrated is kept', async ({ page }) => {
	// The sign-in form's race (account.e2e.ts), on a plain `bind:value`: hold the client bundle
	// back, type into the server's HTML, then let the page wake up.
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
		await held;
		await route.continue();
	});

	await page.goto('/explore');
	await page.getByPlaceholder('Filter places').fill('Kyoto');
	await expect(page.locator('html[data-hydrated]')).toHaveCount(0);

	release();
	await expect(page.locator('html[data-hydrated]')).toHaveCount(1);
	await expect(page.getByPlaceholder('Filter places')).toHaveValue('Kyoto');
	await expect(page.getByText('1 place', { exact: false })).toBeVisible();
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

/*
 * THE SERVER'S OWN LINKS
 * ======================
 *
 * With JavaScript off, the page is exactly the HTML the server sent. Every
 * internal link goes through `href()` — `resolve()`, then Paraglide's
 * `localizeHref` — and on the server, with SvelteKit's default
 * `paths.relative`, `resolve()` answered `./explore`, which `localizeHref`
 * turned into `http://localhost:4173/explore`: a whole URL at the build's
 * origin, in the server's HTML and in every prerendered guide. The header
 * compares the page's pathname with each link, so it never marked the page
 * it was on until the browser had drawn it again.
 */
test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('links are paths, and the header marks the page it is on', async ({ page }) => {
		await page.goto('/de/explore');
		const explore = page
			// Hidden behind the menu on a phone, and still in the HTML.
			.getByRole('navigation', { name: 'Primary', includeHidden: true })
			.getByRole('link', { name: 'Entdecken', includeHidden: true });
		await expect(explore).toHaveAttribute('href', '/de/explore');
		await expect(explore).toHaveAttribute('aria-current', 'page');
		await expect(page.locator('a[href^="/de/trips/new?place="]').first()).toBeAttached();
		await expect(page.locator('a[href^="http://localhost"]')).toHaveCount(0);

		// A prerendered page was rendered by the same server, at build time.
		await page.goto('/guides');
		await expect(page.getByRole('link', { name: 'Lisbon in three days' })).toHaveAttribute(
			'href',
			'/guides/lisbon-in-three-days'
		);
		await expect(page.locator('a[href^="http://localhost"]')).toHaveCount(0);
	});
});

/*
 * A CHUNK THAT NEVER ARRIVES
 * ==========================
 *
 * The globe is the one part of the app loaded on demand, so it is the one
 * part a dropped connection can take away after the page is up. The failure
 * happens in the browser and never reaches the server, so the words for it
 * come from `handleError` in `src/hooks.client.ts`: the product's sentence,
 * in the page's language. Without that hook the boundary would print
 * SvelteKit's own, `Internal Error`, in English on a German page.
 *
 * The chunk's name is a hash, so it is found by what only it contains.
 */
test('a chunk that never arrives is explained in the page’s language', async ({ page }) => {
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		if (body.includes('globe__status')) return route.abort();
		return route.fulfill({ response, body });
	});
	const logged: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') logged.push(message.text());
	});

	await page.goto(`/de/t/${TRIPS.japan}?tab=globe`);
	const status = page.locator('.night__status.issue');
	await expect(status).toContainText('Etwas ist schiefgelaufen');
	await expect(status.getByRole('button', { name: 'Neu verbinden' })).toBeVisible();
	// The detail went where somebody debugging looks.
	expect(logged.some((text) => text.startsWith('[meridian]'))).toBe(true);
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
	// Styled, though it ships no script: the page's own stylesheet came with it. A frame
	// compiled as a custom element once shipped without it. Only that stylesheet makes the card
	// 22rem and takes the list's indent away — the root layout's CSS is linked either way.
	await expect(page.locator('article.embed')).toHaveCSS('max-width', '352px');
	await expect(page.locator('.embed__stops')).toHaveCSS('padding-inline-start', '0px');

	const framedPrivate = await page.goto(`/embed/${TRIPS.iberia}`);
	expect(framedPrivate?.status()).toBe(404);
});

test('a URL that matches nothing gets the root error page, with a way home', async ({ page }) => {
	const response = await page.goto('/nothing/here');
	expect(response?.status()).toBe(404);
	await expect(page.getByText('That page does not exist.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Meridian' })).toBeVisible();
});

test('a dynamically rendered page carries its preloads as a Link header', async ({ request }) => {
	// `output.linkHeaderPreload`: the preloads leave the HTML for the response header, so the
	// browser can start on them before it has read the body. The font is the one the `preload`
	// hook in hooks.server.ts picks by source filename.
	const response = await request.get('/explore');
	const link = response.headers()['link'] ?? '';
	expect(link).toContain('rel="modulepreload"');
	expect(link).toMatch(/fraunces-latin-standard-normal[^>]*\.woff2>; rel="preload"; as="font"/);
	expect(await response.text()).not.toContain('rel="modulepreload"');
});

test('on a phone the closed menu is not in the accessibility tree, and Escape closes the open one', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'the menu is a phone’s; a desktop shows the links');
	await page.goto('/');
	await page.locator('html[data-hydrated]').waitFor();

	// The sheet is always in the DOM — `aria-controls` points at it — so "closed" has to mean
	// more than clipped to nothing: `visibility: hidden` at the end of its motion takes its
	// links out of the accessibility tree, and a role query cannot find them.
	const sheet = page.locator('#primary-nav');
	const explore = sheet.getByRole('link', { name: 'Explore' });
	const menu = page.getByRole('button', { name: 'Menu' });
	await expect(explore).toBeHidden();

	await menu.click();
	await expect(menu).toHaveAttribute('aria-expanded', 'true');
	await expect(explore).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(menu).toHaveAttribute('aria-expanded', 'false');
	await expect(menu).toBeFocused();
	await expect(explore).toBeHidden();
});
