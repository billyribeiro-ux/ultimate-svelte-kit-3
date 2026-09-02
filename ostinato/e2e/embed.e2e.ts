import { expect, test } from '@playwright/test';

/**
 * The standalone bundle on a page with none of the app around it. Playwright
 * locators pierce shadow roots, so the element's insides are reachable.
 */

test('the bare demo page loads the standalone player', async ({ page }) => {
	await page.goto('/embed/demo#seedfour');

	// The `(app)` layout is skipped: no primary navigation on this page.
	await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

	const player = page.locator('ostinato-player');
	await expect(player).toContainText('Four on the floor', { timeout: 10_000 });
	await expect(player).toContainText('@ostinato');

	// The method added with `extend` exists on the element and drives the prop.
	await page.evaluate(() =>
		(document.querySelector('ostinato-player') as unknown as { play(): void }).play()
	);
	await expect(player).toHaveAttribute('playing', '');
	await expect(player.getByRole('button', { name: '■' })).toBeVisible();

	await page.evaluate(() =>
		(document.querySelector('ostinato-player') as unknown as { stop(): void }).stop()
	);
	await expect(player).not.toHaveAttribute('playing', '');
});

test('the element dispatches events on its host', async ({ page }) => {
	await page.goto('/embed/demo#seedboom');
	const player = page.locator('ostinato-player');
	await expect(player).toContainText('Boom bap', { timeout: 10_000 });

	const heard = await page.evaluate(
		() =>
			new Promise<string>((resolve) => {
				const el = document.querySelector('ostinato-player') as HTMLElement & { play(): void };
				el.addEventListener('play', () => resolve('play'), { once: true });
				el.play();
			})
	);
	expect(heard).toBe('play');

	// Stop before the test ends. A context torn down with audio still running
	// takes headless Chromium down with it in a container with no sound device.
	await page.evaluate(() =>
		(document.querySelector('ostinato-player') as unknown as { stop(): void }).stop()
	);
	await expect(player).not.toHaveAttribute('playing', '');
});

test('the documentation page defines the element from the app itself', async ({ page }) => {
	await page.goto('/embed#seedstep');
	await expect(page.locator('ostinato-player')).toContainText('Two-step', { timeout: 10_000 });
	await expect(page.locator('pre')).toContainText('<ostinato-player pattern="seedstep">');

	// `SvelteURL`: the hostname and port fields rewrite the origin in the snippet.
	await page.getByLabel('Where the app is hosted').fill('grooves.example');
	await expect(page.locator('pre')).toContainText(
		'http://grooves.example:4173/embed/ostinato-player.js'
	);
	await page.getByLabel(/^Port/).fill('');
	await expect(page.locator('pre')).toContainText(
		'http://grooves.example/embed/ostinato-player.js'
	);
});
