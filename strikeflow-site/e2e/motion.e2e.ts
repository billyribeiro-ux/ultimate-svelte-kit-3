/**
 * MOTION SAFETY TESTS
 *
 * Animation is the easiest thing on a website to get catastrophically wrong, because
 * the failure mode is invisible to whoever built it: on a fast machine with a warm
 * cache everything works, and the blank page only happens to other people.
 *
 * These tests assert the three things that must never break, regardless of how the
 * animation itself looks:
 *
 *   1. With JavaScript disabled, every piece of content is visible.
 *   2. Under reduced motion, content is visible AND the animation library is never
 *      downloaded.
 *   3. The animated headline is still readable by assistive technology after
 *      SplitText has shredded it into fragments.
 *
 * ═══ A NOTE ON HOW REDUCED MOTION IS SET HERE ═══
 *
 * We call `page.emulateMedia({ reducedMotion: 'reduce' })` explicitly rather than
 * using `test.use({ reducedMotion: 'reduce' })`.
 *
 * That is not a style preference. In this version of Playwright, `test.use` with
 * `reducedMotion` **silently does not apply** — neither `window.matchMedia` nor CSS
 * media queries see it, at file scope or inside a describe. A test written that way
 * appears to pass or fail meaningfully while actually testing the default state.
 *
 * That cost real time here: three tests failed, and the application code was correct
 * the whole way through. Verify that your emulation is actually reaching the page
 * before you trust a test that depends on it.
 */

import { test, expect, type Page } from '@playwright/test';

/** Every element the motion system is allowed to hide. */
const ANIMATED_SELECTORS = ['[data-hero]', '[data-reveal]'];

/** Every JS chunk the page requested. Used to prove GSAP was or wasn't fetched. */
function trackChunks(page: Page): string[] {
	const chunks: string[] = [];
	page.on('request', (request) => {
		const url = request.url();
		if (url.includes('/_app/immutable/') && url.endsWith('.js')) chunks.push(url);
	});
	return chunks;
}

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('no animated element is left hidden', async ({ page }) => {
		await page.goto('/');

		for (const selector of ANIMATED_SELECTORS) {
			const elements = page.locator(selector);
			const count = await elements.count();
			expect(count, `expected some ${selector} elements to exist`).toBeGreaterThan(0);

			for (let i = 0; i < count; i += 1) {
				const opacity = await elements
					.nth(i)
					.evaluate((node) => getComputedStyle(node).opacity);

				// The whole point. Without the inline script's guards this is 0, and
				// the page is blank for anyone whose JavaScript did not run.
				expect(Number(opacity), `${selector}[${i}] should be visible`).toBeGreaterThan(0.99);
			}
		}
	});

	test('the hero headline is present and readable', async ({ page }) => {
		await page.goto('/');
		const h1 = page.getByRole('heading', { level: 1 });
		await expect(h1).toBeVisible();
		await expect(h1).toContainText('Read institutional options flow as it prints');
	});
});

test.describe('with reduced motion', () => {
	test('the motion gate is never applied', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');

		// Sanity check that the emulation actually reached the page. Without this,
		// every assertion below could pass against the default state and tell us
		// nothing at all.
		const emulationWorked = await page.evaluate(
			() => window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
		expect(emulationWorked, 'reduced-motion emulation must reach the page').toBe(true);

		const hasGate = await page.evaluate(() =>
			document.documentElement.classList.contains('motion-pending')
		);
		expect(hasGate).toBe(false);

		const heroOpacity = await page
			.locator('[data-hero="headline"]')
			.evaluate((node) => getComputedStyle(node).opacity);
		expect(Number(heroOpacity)).toBe(1);
	});

	test('downloads strictly less JavaScript than the animated path', async ({ page }) => {
		/*
		 * Comparative rather than absolute.
		 *
		 * The obvious test — "no request URL contains 'gsap'" — is worthless here,
		 * because production chunks have hashed filenames like `wzadwL2c2.js`. That
		 * test passes whether or not GSAP loads, which is the worst kind of test:
		 * one that reports success without checking anything.
		 *
		 * Counting chunks and comparing the two paths cannot be fooled that way.
		 */
		const reduced = trackChunks(page);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		await page.waitForTimeout(1500);
		const reducedCount = reduced.length;

		const normalPage = await page.context().newPage();
		const normal = trackChunks(normalPage);
		await normalPage.emulateMedia({ reducedMotion: 'no-preference' });
		await normalPage.goto('/');
		await normalPage.waitForTimeout(1500);
		const normalCount = normal.length;
		await normalPage.close();

		// GSAP core, ScrollTrigger, SplitText and CustomEase are four extra chunks.
		expect(
			normalCount,
			`animated path should load more chunks (reduced: ${reducedCount}, normal: ${normalCount})`
		).toBeGreaterThan(reducedCount);
	});

	test('stat values render as their final text', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		// Not "0" mid-count, and no duplicated visually-hidden copy.
		await expect(page.getByText('<250ms').first()).toBeVisible();
	});
});

test.describe('with motion enabled', () => {
	test('the animated headline stays accessible after splitting', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.goto('/');
		await page.waitForTimeout(2000);

		// SplitText shreds the heading into per-line divs. `aria: 'auto'` must put
		// the original string back as an accessible name, or a screen reader reads
		// the headline as a series of disconnected fragments.
		const h1 = page.getByRole('heading', { level: 1 });
		await expect(h1).toHaveAccessibleName(/Read institutional options flow as it prints/);
	});

	test('nothing stays stuck hidden after scrolling the page', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.goto('/');
		await page.waitForTimeout(2000);

		const gate = await page.evaluate(() =>
			document.documentElement.classList.contains('motion-pending')
		);
		expect(gate, 'the motion gate must be released').toBe(false);

		await expect(page.locator('[data-hero="headline"]')).toBeVisible();
		await expect(page.locator('[data-hero="panel"]')).toBeVisible();

		/*
		 * Scroll the whole page before asserting.
		 *
		 * An earlier version of this test checked every reveal element immediately
		 * after load and failed — correctly. Elements below the fold are *supposed*
		 * to still be hidden; that is what a scroll reveal is. The bug was in the
		 * test's understanding, not the code.
		 *
		 * What genuinely matters is that nothing gets permanently stuck: after the
		 * user has scrolled past everything, everything must have appeared. A reveal
		 * whose ScrollTrigger never fires is invisible content, and that is the real
		 * failure mode worth guarding.
		 */
		await page.evaluate(async () => {
			const step = window.innerHeight * 0.6;
			for (let y = 0; y < document.body.scrollHeight; y += step) {
				window.scrollTo(0, y);
				await new Promise((resolve) => setTimeout(resolve, 120));
			}
			window.scrollTo(0, document.body.scrollHeight);
		});

		// Let the last batch of tweens finish.
		await page.waitForTimeout(1800);

		for (const selector of ANIMATED_SELECTORS) {
			const elements = page.locator(selector);
			const count = await elements.count();
			for (let i = 0; i < count; i += 1) {
				const opacity = await elements
					.nth(i)
					.evaluate((node) => getComputedStyle(node).opacity);
				expect(Number(opacity), `${selector}[${i}] should end visible`).toBeGreaterThan(0.99);
			}
		}
	});

	test('the stat counter lands on the exact final value', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.goto('/');
		await page.waitForTimeout(3000);

		// Floating-point drift must not leave it on "249ms" or "1,399,999".
		// The visible copy is aria-hidden, so read the DOM text directly.
		const text = await page.locator('.stats__value').first().innerText();
		expect(text).toContain('250');
	});
});
