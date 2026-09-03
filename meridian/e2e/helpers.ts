import { expect, type Page } from '@playwright/test';

/**
 * SHARED STEPS
 * ============
 *
 * The seed (`scripts/seed.ts`) creates three people and two trips, and the
 * end-to-end database is rebuilt from it before every run. The password is
 * the seed's.
 */
export const PASSWORD = 'meridian-demo-2026';

export const USERS = {
	ana: 'ana@meridian.test',
	ben: 'ben@meridian.test',
	cal: 'cal@meridian.test'
} as const;

/** The seeded trips, by slug. */
export const TRIPS = {
	/** Ana owns it; Ben edits; Cal looks. Private. */
	iberia: 'seediberia',
	/** Ben owns it. Visible by link. */
	japan: 'seedjapan2'
} as const;

/** Sign in through the form, and land where the app sends people afterwards. */
export async function signIn(page: Page, email: string, redirectTo = '/trips'): Promise<void> {
	await page.goto(`/signin?redirectTo=${encodeURIComponent(redirectTo)}`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => !url.pathname.includes('/signin'));
}

/**
 * On a phone the header's links are behind a menu button; on a desktop they
 * are simply there. Open the menu when it exists, so a test can click a
 * header link in either project without knowing which one it is in.
 */
export async function openMenu(page: Page): Promise<void> {
	// The menu button needs JavaScript; the root layout marks the document once
	// it has hydrated. Clicking earlier is a click nobody is listening to.
	await page.locator('html[data-hydrated]').waitFor();
	const menu = page.getByRole('button', { name: 'Menu' });
	if ((await menu.count()) > 0 && (await menu.isVisible())) {
		const expanded = await menu.getAttribute('aria-expanded');
		if (expanded !== 'true') await menu.click();
	}
}

/** The trip page's tab strip. */
export async function openTab(page: Page, name: string): Promise<void> {
	await page
		.getByRole('navigation', { name: 'Meridian' })
		.getByRole('link', { name, exact: true })
		.click();
	await expect(page).toHaveURL(new RegExp(`tab=${name.toLowerCase()}`));
}

/**
 * Type a date into one of the picker's two inputs. The picker is Bits UI's
 * DateRangePicker: three editable segments per date, in the locale's order —
 * month, day, year for English.
 */
export async function typeDate(
	page: Page,
	which: 'start' | 'end',
	date: { year: number; month: number; day: number }
): Promise<void> {
	const input = page.locator('.range__input').nth(which === 'start' ? 0 : 1);
	await input.locator('[data-segment="month"]').click();
	await page.keyboard.type(String(date.month).padStart(2, '0'));
	await input.locator('[data-segment="day"]').click();
	await page.keyboard.type(String(date.day).padStart(2, '0'));
	await input.locator('[data-segment="year"]').click();
	await page.keyboard.type(String(date.year));
}
