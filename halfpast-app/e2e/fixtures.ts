import { execFileSync } from 'node:child_process';
import { expect, test as base, type Locator, type Page } from '@playwright/test';

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
	 * Surface browser-side errors in the test output — and fail on an uncaught one.
	 *
	 * A bug that throws in the browser during a client-side navigation renders
	 * the error page and writes nothing to the server log — the server was never
	 * involved. Without this, such a failure appears in Playwright as "expected a
	 * button, found a page saying 500" and the actual message is sitting in a
	 * browser console nobody is reading.
	 *
	 * Printing was not enough. The booking page's live stream once died with
	 * "Live query connection was interrupted" in the middle of an unrelated
	 * test, and this fixture printed it under a green suite. Sign out threw
	 * `remote_command_redirect` in the page for as long as it was a command, and
	 * would have been printed and passed the same way had any test pressed it.
	 * An exception nothing caught is a bug whether or not the assertion that
	 * follows happens to notice, so the test that produced it fails.
	 */
	reportBrowserErrors: [
		async ({ page }, use) => {
			const uncaught: string[] = [];

			page.on('pageerror', (error) => {
				uncaught.push(error.message);
				console.error('[browser] uncaught:', error.message);
			});
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

			expect(uncaught, 'the page threw an error nothing caught').toEqual([]);
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

/**
 * Arrive at `path` by following a link inside the running app, not by loading it.
 *
 * For a test about the client-side path, and for a page whose buttons must work
 * the moment they are visible. Neither is safe straight after `page.goto`: the
 * HTML arrives before SvelteKit has started, a page that awaits its data gets
 * its click handlers only once those awaits resume, and nothing on screen says
 * when that has happened. A page SvelteKit renders in the browser after a
 * client-side navigation has its handlers from the moment it exists.
 *
 * `history.scrollRestoration` becomes `'manual'` on the first line of the
 * function that starts SvelteKit's router, so once it reads `'manual'` a click
 * on a link is a client-side navigation. The home page is the starting point
 * because nothing on it can fail. The flag set on `window` survives only if no
 * page load happened, which is checked rather than assumed.
 */
export async function arriveClientSide(page: Page, path: string): Promise<void> {
	await page.goto('/');
	await page.waitForFunction(() => history.scrollRestoration === 'manual');

	await page.evaluate((href) => {
		Object.assign(window, { arrivedClientSide: true });
		const link = document.createElement('a');
		link.href = href;
		link.textContent = 'Follow this link';
		document.body.append(link);
	}, path);
	await page.getByRole('link', { name: 'Follow this link' }).click();

	await page.waitForURL((url) => url.pathname === path);
	expect(
		await page.evaluate(() => 'arrivedClientSide' in window),
		'the link caused a page load'
	).toBe(true);
}

/** The demo studio's public booking page. */
export const SHOP = '/book/willow-lane';

/** The booking page's strip of days, a list of links named "Choose a day". */
const dayStrip = (page: Page) => page.getByRole('list', { name: 'Choose a day' });

/**
 * Follow a link that changes one choice on the booking page, and wait for it.
 *
 * Every choice before the time — the day, the person — is a link that puts
 * the choice in the URL, and the page marks the one in force with
 * `aria-current`. Waiting for that is waiting for the page to have finished:
 * with JavaScript the navigation, and any fresh availability it needed, have
 * settled, because the attribute only changes in the same update that shows
 * the new times; without it, the next page has loaded. Reading the grid before
 * then would read the old day's times.
 */
async function follow(link: Locator): Promise<void> {
	await link.click();
	await expect(link).toHaveAttribute('aria-current', 'true');
}

/**
 * Pick a bookable time, starting from `fromDayIndex` days into the strip.
 *
 * `fromDayIndex` exists because the studio's cancellation window is 24 hours: a
 * slot booked for this afternoon genuinely cannot be cancelled online, so a test
 * about cancelling has to book further out. Hard-coding a date instead would rot
 * the first time the suite ran on a Sunday.
 *
 * Works the same with JavaScript off: the day links are ordinary links, the
 * radio is a native radio, and the details appear because CSS sees it checked.
 *
 * Returns the label of the chosen slot, e.g. `09:00`.
 */
export async function chooseAvailableSlot(page: Page, fromDayIndex = 0): Promise<string> {
	const strip = dayStrip(page);
	await expect(strip).toBeVisible();

	// Days before today are drawn but are not links, so they are not counted.
	const days = strip.getByRole('link');
	const dayCount = await days.count();

	for (let index = fromDayIndex; index < dayCount; index += 1) {
		await follow(days.nth(index));

		const slots = page.locator('label.slot');
		if ((await slots.count()) === 0) continue;

		const chosen = slots.first();
		const label = (await chosen.innerText()).trim();
		await chosen.click();
		return label;
	}

	throw new Error(`No bookable slot found from day ${fromDayIndex} onwards`);
}

/**
 * Which day is selected, as an ISO date.
 *
 * `data-day` and not the accessible name. The name is written for a person and
 * contains the availability count — "Tuesday, 18 August 2026 — 26 times
 * available" — so it changes the moment anything is booked, and a test that
 * captured it before a booking could never match it again afterwards.
 *
 * The assertion is the important half: `getAttribute` returns `null` for an
 * attribute that does not exist, and `null` compares equal to every other
 * `null`. An earlier version of this read `aria-label`, which the day buttons
 * have never had, so every day matched, the first one was clicked, and two
 * tests quietly started looking at the wrong day.
 */
export async function selectedDay(page: Page): Promise<string> {
	const day = await dayStrip(page).locator('a[aria-current="true"]').getAttribute('data-day');

	if (!day) throw new Error('No day is selected, or the day links have lost their data-day.');
	return day;
}

/**
 * Select a specific day by its ISO date.
 *
 * Throws when the day is not on screen. The version this replaces was a `for`
 * loop with a `break`, which did *nothing at all* when nothing matched and left
 * whatever day was already selected — so the assertion that followed was
 * measuring the wrong day and, in one case, passing because of it.
 */
export async function chooseDay(page: Page, day: string): Promise<void> {
	const link = dayStrip(page).locator(`[data-day="${day}"]`);

	await expect(link, `day ${day} is not in the strip`).toHaveCount(1);
	await follow(link);
}

/** Narrow the booking page to one person, by the name on their link. */
export async function chooseWho(page: Page, name: string): Promise<void> {
	await follow(
		page.getByRole('list', { name: 'Choose who with' }).getByRole('link', { name, exact: true })
	);
}

/**
 * Step the diary forward until it shows `day`, an ISO date.
 *
 * The diary keeps its day in component state, so the way there is the "Next
 * day" button, pressed until the `<time datetime>` in the day bar says `day`.
 * Each press waits for that attribute to move on: the new day's diary is a
 * fresh live query, and the label changes in the same update that shows it.
 */
export async function showDiaryDay(page: Page, day: string): Promise<void> {
	const showing = page.locator('.daylabel time');

	for (let step = 0; step <= 31; step += 1) {
		const current = await showing.getAttribute('datetime');
		if (current === day) return;
		if (current === null || current > day) break;

		await page.getByRole('button', { name: 'Next day' }).click();
		await expect(showing).not.toHaveAttribute('datetime', current);
	}

	throw new Error(`The diary never showed ${day}`);
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
