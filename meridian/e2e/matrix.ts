import type { Page } from '@playwright/test';

/**
 * THE SCREENS, ONCE
 * =================
 *
 * Every screen the design is judged on: the pages, and the states a page
 * alone does not show — a filter with no match, a sign-in with a bad email,
 * a dialog, the palette, a toast, the phone's open menu. Two things walk this
 * list: `scripts/screens.ts`, which photographs each screen for a person to
 * look at, and `e2e/visual.e2e.ts`, which asks each one the questions a
 * machine can answer. One list, so the screens a person reviews are the
 * screens the gate checks.
 */

export type Device = 'desktop' | 'phone';

export interface Screen {
	readonly name: string;
	readonly url: string;
	/** Needs the seed's Ana signed in. */
	readonly auth?: boolean;
	/** Photograph the viewport, not the whole page (a map does not scroll). */
	readonly viewport?: boolean;
	/** Only on a touch phone (the open menu: a desktop has no menu button). */
	readonly phoneOnly?: boolean;
	/** Needs WebGL: the globe. */
	readonly webgl?: boolean;
	/** Ships no JavaScript (`csr = false`): there is no hydration to wait for. */
	readonly static?: boolean;
	/** Something to do on the page before it is looked at. */
	readonly act?: (page: Page) => Promise<void>;
}

const TRIP = '/t/seediberia';

export const SCREENS: readonly Screen[] = [
	{ name: 'home', url: '/' },
	// A hundred places is a 9,000px page: Chromium's full-page capture repeats the sticky
	// chrome past its texture limit, so the long list is the viewport and the filtered one is the page.
	{ name: 'explore', url: '/explore', viewport: true },
	{
		name: 'explore-filtered',
		url: '/explore',
		act: async (page) => {
			await page.getByPlaceholder('Filter places').fill('Port');
			await page.getByText('5 places').waitFor();
		}
	},
	{ name: 'guides', url: '/guides', static: true },
	{ name: 'guide', url: '/guides/lisbon-in-three-days', static: true },
	{
		name: 'explore-none',
		url: '/explore',
		act: async (page) => {
			await page.getByPlaceholder('Filter places').fill('zzzz');
			await page.getByText('0 places').waitFor();
		}
	},
	{ name: 'signin', url: '/signin' },
	{
		name: 'signin-error',
		url: '/signin',
		act: async (page) => {
			await page.getByLabel('Email').fill('not-an-email');
			await page.getByRole('button', { name: 'Sign in' }).click();
			await page.locator('.issue').first().waitFor();
		}
	},
	{ name: 'signup', url: '/signup' },
	// Before signing in: a trip opened by its link, as somebody who is not on it.
	{ name: 'readonly-expenses', url: '/t/seedjapan2?tab=expenses' },
	{ name: 'embed', url: '/embed/seedjapan2', static: true },
	{ name: 'trips', url: '/trips', auth: true },
	{ name: 'trip-new', url: '/trips/new', auth: true },
	{ name: 'trip-itinerary', url: TRIP, auth: true, viewport: true },
	{
		name: 'trip-itinerary-selected',
		url: TRIP,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.getByRole('button', { name: 'Alfama', exact: true }).click();
			await page.waitForTimeout(900);
		}
	},
	{
		name: 'stop-dialog',
		url: TRIP,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.getByRole('button', { name: 'Add a stop' }).first().click();
			await page.getByRole('dialog').getByRole('heading', { name: 'New stop' }).waitFor();
			await page.waitForTimeout(500);
		}
	},
	{
		name: 'palette',
		url: TRIP,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.keyboard.press('ControlOrMeta+k');
			await page.getByRole('dialog').waitFor();
			await page.waitForTimeout(400);
		}
	},
	{
		name: 'trip-map',
		url: `${TRIP}?tab=map`,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.locator('canvas.maplibregl-canvas').waitFor();
			await page.waitForTimeout(1500);
		}
	},
	{
		name: 'trip-globe',
		url: `${TRIP}?tab=globe`,
		auth: true,
		viewport: true,
		webgl: true,
		act: async (page) => {
			await page.locator('.globe canvas').waitFor({ timeout: 30_000 });
			await page.waitForTimeout(2500);
		}
	},
	{ name: 'trip-expenses', url: `${TRIP}?tab=expenses`, auth: true },
	{ name: 'trip-notes', url: `${TRIP}?tab=notes`, auth: true },
	{ name: 'trip-companions', url: `${TRIP}?tab=companions`, auth: true },
	{ name: 'settings', url: `${TRIP}/settings`, auth: true },
	{
		// A success toast: "Saved" after saving the settings unchanged.
		name: 'toast',
		url: `${TRIP}/settings`,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.getByRole('button', { name: 'Save', exact: true }).click();
			await page.getByText('Saved', { exact: true }).waitFor();
			await page.waitForTimeout(450);
		}
	},
	{
		name: 'nav-open',
		url: '/explore',
		auth: true,
		viewport: true,
		phoneOnly: true,
		act: async (page) => {
			await page.getByRole('button', { name: 'Menu' }).click();
			await page.waitForTimeout(400);
		}
	},
	{ name: '404', url: '/nowhere' },
	{ name: 'error-root', url: '/de/nowhere-at-all' }
];

/** The scrollers a page may have that are wider than the screen on purpose, and what is inside them. */
export const ALLOWED_SCROLLERS =
	'.table-wrap, .tabs, .maplibregl-map, .globe, [data-sonner-toaster], .nav:not(.nav--open)';

/**
 * Sign the seed's Ana in through the form, so the session is a real one.
 * `scripts/screens.ts` does it in each context it opens; `visual.e2e.ts`
 * once per worker, keeping the cookies as a storage state that every
 * signed-in test starts from — nothing depends on the order tests run in.
 */
export async function signInAsAna(page: Page): Promise<void> {
	await page.goto('/signin?redirectTo=%2Ftrips');
	await page.getByLabel('Email').fill('ana@meridian.test');
	await page.getByLabel('Password').fill('meridian-demo-2026');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => !url.pathname.includes('/signin'));
}

/** Open a screen and wait until it is the screen: hydrated, fonts in, its action done. */
export async function openScreen(page: Page, screen: Screen): Promise<void> {
	// Not `networkidle`: the trip page holds a live query open, so the network is never idle there.
	await page.goto(screen.url, { waitUntil: 'load' });
	if (!screen.static) await page.locator('html[data-hydrated]').waitFor({ timeout: 15_000 });
	await page.evaluate(() => document.fonts.ready);
	await screen.act?.(page);
	await page.evaluate(() => document.fonts.ready);
}
