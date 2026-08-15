import { execFileSync } from 'node:child_process';
import { expect, test as base, type Page } from '@playwright/test';

/**
 * Shared fixtures and helpers for the end-to-end suite.
 *
 * The important one empties the diary before every test.
 *
 * Without it the tests are order-dependent in a way that is genuinely nasty to
 * debug. Each test books an appointment, which permanently removes a slot, so
 * "the first free time on Thursday" means something different by the fifth test
 * than it did in the first. The suite passes, then fails, then passes again as
 * tests are added or reordered, and every failure looks like an application bug
 * rather than the harness eating its own tail.
 *
 * It empties the *diary*, not the database. Deleting the studio out from under a
 * running server breaks any live query still streaming to a page that has only
 * just closed — an intermittent 500 in whichever test runs next, pointing
 * nowhere near the cause. Bookings are all the tests create, so bookings are all
 * that needs clearing.
 */
export const test = base.extend<{ emptyDiary: void; reportBrowserErrors: void }>({
	/**
	 * Surface browser-side errors in the test output.
	 *
	 * A remote query that rejects during a client-side navigation renders
	 * SvelteKit's error page and writes nothing to the server log — the server was
	 * never involved. Without this, such a failure appears in Playwright as
	 * "expected a button, found a page saying 500" and the actual message is
	 * sitting in a browser console nobody is reading.
	 */
	reportBrowserErrors: [
		async ({ page }, use) => {
			page.on('pageerror', (error) => console.error('[browser] uncaught:', error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') console.error('[browser]', message.text());
			});

			// 4xx responses are expected — several tests assert on them. A 5xx never
			// is, so surface it with its body rather than leaving a bare status code.
			page.on('response', (response) => {
				if (response.status() < 500) return;
				void response
					.text()
					.then((body) =>
						console.error('[http]', response.status(), response.url(), body.slice(0, 300))
					)
					.catch(() => {});
			});

			await use();
		},
		{ auto: true }
	],

	/*
	 * `auto: true` means every test gets this whether it asks for it or not, which
	 * is what makes the guarantee unconditional — a test cannot forget to reset.
	 */
	emptyDiary: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructure
		async ({}, use) => {
			execFileSync('node', ['scripts/reset-diary.ts'], {
				stdio: 'ignore',
				env: { ...process.env, DATABASE_URL: 'file:e2e.db' }
			});
			await use();
		},
		{ auto: true }
	]
});

export { expect };

/** The demo studio's public booking page. */
export const SHOP = '/book/willow-lane';

/**
 * Pick a bookable time, starting from `fromDayIndex` days into the strip.
 *
 * `fromDayIndex` exists because the studio's cancellation window is 24 hours: a
 * slot booked for this afternoon genuinely cannot be cancelled online, so a test
 * about cancelling has to book further out. Hard-coding a date instead would rot
 * the first time the suite ran on a Sunday.
 *
 * Returns the label of the chosen slot, e.g. `09:00`.
 */
export async function chooseAvailableSlot(page: Page, fromDayIndex = 0): Promise<string> {
	const strip = page.getByRole('radiogroup', { name: 'Choose a day' });
	await expect(strip).toBeVisible();

	const days = strip.getByRole('radio');
	const dayCount = await days.count();

	for (let index = fromDayIndex; index < dayCount; index += 1) {
		const day = days.nth(index);
		if (await day.isDisabled()) continue;

		await day.click();

		const slots = page.locator('label.slot');
		if ((await slots.count()) === 0) continue;

		const chosen = slots.first();
		const label = (await chosen.innerText()).trim();
		await chosen.click();
		return label;
	}

	throw new Error(`No bookable slot found from day ${fromDayIndex} onwards`);
}

/** Fill in the customer details and submit. Returns nothing; assert on the URL. */
export async function submitBooking(page: Page, name: string): Promise<void> {
	await page.getByLabel('Your name').fill(name);
	await page.getByLabel('Email').fill(uniqueEmail(name));
	await page.getByRole('button', { name: 'Book this time' }).click();
}

let sequence = 0;

/** A fresh email per booking, so tests never collide on the customer record. */
export function uniqueEmail(who: string): string {
	const slug = who.toLowerCase().replace(/[^a-z]+/g, '-');
	return `${slug}+${Date.now()}-${sequence++}@example.test`;
}
