import { expect, test } from '@playwright/test';

/**
 * A published pattern: its page, its vanity address (which is a reroute),
 * its share card (which is a server render), its counts (which are batched
 * and optimistic), and the read API (which has a QUERY handler).
 */

test('renders the page and its share card', async ({ page, request }) => {
	await page.goto('/p/seedfour');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Four on the floor');
	await expect(page.getByRole('link', { name: '@ostinato' })).toHaveAttribute(
		'href',
		'/@ostinato/four-on-the-floor'
	);

	// `og:image` points at the card, and the card is a real SVG document.
	const og = await page.locator('meta[property="og:image"]').getAttribute('content');
	expect(og).toMatch(/\/p\/seedfour\/card\.svg$/);

	const card = await request.get('/p/seedfour/card.svg');
	expect(card.status()).toBe(200);
	expect(card.headers()['content-type']).toContain('image/svg+xml');
	// No inline script in the render, so the policy says so — read from
	// `hashes.script`, not assumed.
	expect(card.headers()['content-security-policy']).toContain("script-src 'none'");
	const svg = await card.text();
	expect(svg).toContain('Four on the floor');
	expect(svg).toContain('@ostinato');
	expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThan(64);
});

test('a vanity address is rerouted to the pattern without changing the URL', async ({ page }) => {
	const response = await page.goto('/@ostinato/four-on-the-floor');
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Four on the floor');
	await expect(page).toHaveURL(/\/@ostinato\/four-on-the-floor$/);

	// The catch-all function handled it and handed it on: `applyReroute`.
	expect(response?.headers()['x-ostinato-entry']).toBe('router');
});

test('an unknown vanity address is a 404 from the catch-all', async ({ page }) => {
	const response = await page.goto('/@nobody/nothing');
	expect(response?.status()).toBe(404);
	await expect(page.getByText('Back to the studio')).toBeVisible();
});

test('loving is optimistic and then persisted', async ({ page }) => {
	await page.goto('/p/seedboom');
	// Scoped to the header: the pads are buttons named "Step 10" and friends.
	const love = page.locator('.view__head').getByRole('button', { name: /^\d+$/ });
	await expect(love).toBeVisible();
	const before = Number(await love.textContent());

	await love.click();
	await expect(love).toHaveText(String(before + 1));

	await page.reload();
	await expect(
		page.locator('.view__head').getByRole('button', { name: String(before + 1) })
	).toBeVisible();
});

test('playing counts a play once', async ({ page }) => {
	await page.goto('/p/seedstep');
	const plays = page.locator('.chip', { hasText: '▶' });
	const before = Number((await plays.textContent())?.replace(/\D/g, ''));

	await page.getByRole('button', { name: 'Play' }).click();
	await expect(plays).toContainText(String(before + 1));
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.getByRole('button', { name: 'Play' }).click();
	await expect(plays).toContainText(String(before + 1));
});

test('the read API lists and searches with QUERY', async ({ request }) => {
	const list = await request.get('/api/patterns');
	expect(list.status()).toBe(200);
	expect(list.headers()['x-ostinato-entry']).toBe('api');
	const { patterns } = await list.json();
	expect(patterns.length).toBeGreaterThanOrEqual(5);
	expect(patterns[0]).toMatchObject({ artist: 'ostinato' });

	const search = await request.fetch('/api/patterns', {
		method: 'QUERY',
		headers: { 'content-type': 'application/json' },
		data: { q: 'boom', bpm: { max: 100 }, sort: 'loved' }
	});
	expect(search.status()).toBe(200);
	const body = await search.json();
	expect(body.patterns.every((p: { title: string }) => /boom/i.test(p.title))).toBe(true);
	expect(body.patterns.every((p: { bpm: number }) => p.bpm <= 100)).toBe(true);

	const bad = await request.fetch('/api/patterns', {
		method: 'QUERY',
		headers: { 'content-type': 'application/json' },
		data: { limit: 999 }
	});
	expect(bad.status()).toBe(400);

	const one = await request.get('/api/patterns/seedfour');
	expect(one.headers()['access-control-allow-origin']).toBe('*');
	expect((await one.json()).pattern.tracks[0].steps[0]).toEqual({ v: 112, n: 60 });
});
