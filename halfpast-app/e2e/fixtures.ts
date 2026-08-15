import { execFileSync } from 'node:child_process';
import { expect, test as base, type Page } from '@playwright/test';

/**
 * Shared fixtures and helpers for the end-to-end suite.
 *
 * The important one re-seeds the studio before every test.
 *
 * Without it the tests are order-dependent in a way that is genuinely nasty to
 * debug. Each one books an appointment or edits a price, so "the first free time
 * on Thursday" means something different by the fifth test than it did in the
 * first. The suite passes, then fails, then passes again as tests are added or
 * reordered, and every failure looks like an application bug rather than the
 * harness eating its own tail.
 */

/** The two seeded accounts, and their shared demo password. */
export const OWNER = { email: 'ada@willowlane.test', password: 'halfpast-demo-2026' };
export const STAFF = { email: 'ben@willowlane.test', password: 'halfpast-demo-2026' };

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
			/*
			 * A full re-seed, not just a diary wipe.
			 *
			 * The dashboard tests change prices, hide services and rewrite shifts, so
			 * "empty the bookings" is no longer enough to make a test independent —
			 * the studio itself has to go back to its known shape.
			 *
			 * The seed keeps the same business row rather than dropping and
			 * recreating it, so a live query still streaming to a page the previous
			 * test has only just closed never finds its business missing. That
			 * mattered: deleting it produced an intermittent 500 in whichever test
			 * happened to run next, pointing nowhere near the cause.
			 */
			execFileSync('node', ['scripts/seed.ts'], {
				stdio: 'ignore',
				env: { ...process.env, DATABASE_URL: 'file:e2e.db' }
			});
			await use();
		},
		{ auto: true }
	]
});

/**
 * Sign in through the real form, the way a person would.
 *
 * The wait at the end is load-bearing. `click()` resolves the moment the button
 * has been pressed, not when the request it fired has come back with a session
 * cookie — so a test that pressed Sign in and immediately navigated to a
 * protected page was racing its own login, and lost about half the time. The
 * symptom was a page full of missing elements with no error anywhere, because
 * the app had correctly bounced an anonymous visitor back to sign in.
 *
 * Waiting for the URL to leave `/sign-in` is the honest signal: the server has
 * answered, the cookie is set, and the redirect has happened.
 */
export async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

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
