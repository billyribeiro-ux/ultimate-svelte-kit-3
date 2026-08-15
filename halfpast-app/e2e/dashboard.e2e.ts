import { OWNER, STAFF, expect, signIn, test } from './fixtures.ts';

/**
 * The staff-facing dashboard, and the role boundary it enforces.
 *
 * The authorisation tests here matter more than the feature tests. A booking
 * page that renders slightly wrong is a bug; a members-only page that a member
 * can open is a breach, and it is invisible unless something checks.
 */

const MANAGE = '/manage/willow-lane';

test.describe('getting in', () => {
	test('sends a signed-out visitor to sign in, and back again afterwards', async ({ page }) => {
		await page.goto(MANAGE);

		await expect(page).toHaveURL(/\/sign-in\?redirectTo=/);
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

		await signIn(page, OWNER);

		// Landed back where they were originally headed, not on a generic home page.
		await expect(page).toHaveURL(new RegExp(`${MANAGE}$`));
	});

	test('refuses a wrong password without saying which half was wrong', async ({ page }) => {
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill(OWNER.email);
		await page.getByLabel('Password').fill('definitely-not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		const message = page.getByText(/do not match an account/i);
		await expect(message).toBeVisible();

		// Distinguishing "no such account" from "wrong password" would turn this
		// form into a tool for discovering which customers have accounts.
		await expect(message).not.toContainText(/password is/i);
		await expect(message).not.toContainText(/no account/i);
	});

	test('an unknown email gets the identical message', async ({ page }) => {
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill('nobody@willowlane.test');
		await page.getByLabel('Password').fill('definitely-not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page.getByText(/do not match an account/i)).toBeVisible();
	});

	test('rejects an off-site redirect target', async ({ page }) => {
		// An unchecked `redirectTo` is an open redirect: a link that starts with
		// your domain and lands somebody on an attacker's, moments after they typed
		// their password.
		await page.goto('/sign-in?redirectTo=https://evil.example/');
		await signIn(page, OWNER);

		// Signed in, and safely home — not refused, and not sent off-site.
		await expect(page).toHaveURL(/localhost:4173\/manage(\/|$)/);
	});

	test('rejects a protocol-relative redirect target', async ({ page }) => {
		// The one that slips past a naive `startsWith('/')` check: `//evil.example`
		// begins with a slash and still leaves your site.
		await page.goto('/sign-in?redirectTo=//evil.example/');
		await signIn(page, OWNER);

		await expect(page).toHaveURL(/localhost:4173\/manage(\/|$)/);
	});
});

test.describe('the diary', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/sign-in');
		await signIn(page, OWNER);
	});

	test('shows today, live, and an empty state when nothing is booked', async ({ page }) => {
		await page.goto(MANAGE);

		await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
		await expect(page.getByText('Nothing booked. Enjoy it.')).toBeVisible();
		await expect(page.getByText('Live')).toBeVisible();
	});

	test('a booking made on the public page appears without a reload', async ({ page, browser }) => {
		await page.goto(MANAGE);
		await expect(page.getByText('Nothing booked. Enjoy it.')).toBeVisible();

		/*
		 * The point of the whole live-query machinery: a receptionist has this open
		 * all day, and a booking from the website has to land on their screen
		 * without anybody pressing anything.
		 */
		const context = await browser.newContext();
		const customer = await context.newPage();
		await customer.goto('/book/willow-lane?service=cut-and-finish');
		await customer.getByRole('radio', { name: 'Ada' }).click();

		// Today, so it lands in the diary the dashboard is currently showing.
		const today = customer.getByRole('radiogroup', { name: 'Choose a day' }).getByRole('radio');
		await today.first().click();

		const slots = customer.locator('label.slot');
		if ((await slots.count()) === 0) {
			// Nothing left today — the studio has closed. Not a failure of the app.
			test.skip(true, 'no slots left today at the demo studio');
		}

		await slots.first().click();
		await customer.getByLabel('Your name').fill('Live Lucy');
		await customer.getByLabel('Email').fill(`lucy+${Date.now()}@example.test`);
		await customer.getByRole('button', { name: 'Book this time' }).click();
		await expect(customer).toHaveURL(/\/booking\//);

		// No reload on the dashboard. The stream pushes it.
		await expect(page.getByText('Live Lucy')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Nothing booked. Enjoy it.')).toHaveCount(0);

		await context.close();
	});

	test('a staff member can cancel from the diary', async ({ page, browser }) => {
		const context = await browser.newContext();
		const customer = await context.newPage();
		await customer.goto('/book/willow-lane?service=cut-and-finish');
		await customer.getByRole('radio', { name: 'Ada' }).click();

		const slots = customer.locator('label.slot');
		if ((await slots.count()) === 0) test.skip(true, 'no slots left today');
		await slots.first().click();
		await customer.getByLabel('Your name').fill('Doomed Dora');
		await customer.getByLabel('Email').fill(`dora+${Date.now()}@example.test`);
		await customer.getByRole('button', { name: 'Book this time' }).click();
		await expect(customer).toHaveURL(/\/booking\//);
		await context.close();

		await page.goto(MANAGE);
		await expect(page.getByText('Doomed Dora')).toBeVisible({ timeout: 15_000 });

		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: /Cancel Doomed Dora/ }).click();

		await expect(page.getByText('Doomed Dora')).toHaveCount(0, { timeout: 15_000 });
	});
});

test.describe('what an owner can reach', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/sign-in');
		await signIn(page, OWNER);
	});

	test('sees every section in the navigation', async ({ page }) => {
		await page.goto(MANAGE);
		const nav = page.getByRole('navigation', { name: 'Dashboard sections' });

		for (const label of ['Diary', 'Services', 'Hours', 'Team', 'Settings']) {
			await expect(nav.getByRole('link', { name: label })).toBeVisible();
		}
	});

	test('can change a price, and the booking page shows the new one', async ({ page, browser }) => {
		await page.goto(`${MANAGE}/services`);

		const card = page.locator('.card', { hasText: 'Cut and finish' });
		await card.getByRole('button', { name: 'Edit' }).click();

		await card.getByLabel('Price').fill('52');
		await card.getByRole('button', { name: 'Save changes' }).click();
		await expect(card.getByText('Saved.')).toBeVisible();

		const context = await browser.newContext();
		const customer = await context.newPage();
		await customer.goto('/book/willow-lane');
		await expect(customer.getByRole('link', { name: /Cut and finish/ })).toContainText('£52.00');
		await context.close();
	});

	test('can hide a service from the booking page', async ({ page, browser }) => {
		await page.goto(`${MANAGE}/services`);

		const card = page.locator('.card', { hasText: 'Full colour' });
		await card.getByRole('button', { name: /Hide Full colour/ }).click();
		await expect(card.getByRole('button', { name: /Show Full colour/ })).toBeVisible();

		const context = await browser.newContext();
		const customer = await context.newPage();
		await customer.goto('/book/willow-lane');
		await expect(customer.getByRole('link', { name: /Full colour/ })).toHaveCount(0);
		// The others are untouched.
		await expect(customer.getByRole('link', { name: /Cut and finish/ })).toBeVisible();
		await context.close();
	});

	test('can add and remove a shift', async ({ page }) => {
		await page.goto(`${MANAGE}/hours`);

		// Ada does not work Sundays in the seed data.
		const ada = page.locator('.person', { hasText: 'Ada' });
		await expect(ada.getByText('Sunday')).toHaveCount(0);

		/*
		 * Scoped to the add-a-shift panel. `getByLabel` matches accessible names by
		 * substring, and every existing shift has a "Remove Tuesday…" button — so an
		 * unscoped `getByLabel('Day')` matches fifteen elements, because "Tuesday"
		 * contains "day".
		 */
		const adder = page.locator('.adder');
		await adder.getByLabel('Who').selectOption({ label: 'Ada' });
		await adder.getByLabel('Day').selectOption({ label: 'Sunday' });
		await adder.getByLabel('From').fill('10:00');
		await adder.getByLabel('To').fill('14:00');
		await adder.getByRole('button', { name: 'Add' }).click();

		await expect(ada.getByText('Sunday')).toBeVisible();
		await expect(ada.getByText('10:00 – 14:00')).toBeVisible();

		await ada.getByRole('button', { name: /Remove Sunday/ }).click();
		await expect(ada.getByText('Sunday')).toHaveCount(0);
	});

	test('refuses a shift that ends before it starts', async ({ page }) => {
		await page.goto(`${MANAGE}/hours`);

		const adder = page.locator('.adder');
		await adder.getByLabel('Day').selectOption({ label: 'Sunday' });
		await adder.getByLabel('From').fill('16:00');
		await adder.getByLabel('To').fill('09:00');
		await adder.getByRole('button', { name: 'Add' }).click();

		await expect(page.getByText(/end after it starts/i)).toBeVisible();
	});

	test('can change who offers what', async ({ page, browser }) => {
		await page.goto(`${MANAGE}/team`);

		// Ben does not do restyles in the seed data.
		const ben = page.locator('.card', { hasText: 'Ben' });
		const restyle = ben.getByRole('checkbox', { name: 'Restyle' });
		await expect(restyle).not.toBeChecked();

		await restyle.check();
		await expect(restyle).toBeChecked();

		// The public page now offers a choice where it previously offered none.
		const context = await browser.newContext();
		const customer = await context.newPage();
		await customer.goto('/book/willow-lane?service=restyle');
		await expect(customer.getByRole('radiogroup', { name: 'Choose who with' })).toBeVisible();
		await context.close();
	});

	test('can change the booking rules', async ({ page }) => {
		await page.goto(`${MANAGE}/settings`);

		await page.getByLabel('Book up to').fill('7');
		await page.getByRole('button', { name: 'Save settings' }).click();
		await expect(page.getByText('Settings saved.')).toBeVisible();

		await page.reload();
		await expect(page.getByLabel('Book up to')).toHaveValue('7');
	});

	test('rejects a duration that does not fit the five-minute grid', async ({ page }) => {
		await page.goto(`${MANAGE}/services`);

		const card = page.locator('.card', { hasText: 'Cut and finish' });
		await card.getByRole('button', { name: 'Edit' }).click();

		// 47 minutes would end mid-cell: that cell is then either sold twice or
		// wasted, so it has to be refused rather than rounded silently.
		const minutes = card.getByLabel('Minutes');

		// The browser stops it first — that is the courtesy layer.
		await expect(minutes).toHaveAttribute('step', '5');

		/*
		 * Now take the courtesy layer away and prove the guarantee underneath.
		 *
		 * With `step="5"` in place the browser refuses to submit at all, so a test
		 * that only typed 47 would be testing Chromium rather than our schema. An
		 * attacker has no step attribute; neither does curl. Stripping it here
		 * drives the request the way they would.
		 */
		await minutes.evaluate((input) => input.removeAttribute('step'));
		await minutes.fill('47');
		await card.getByRole('button', { name: 'Save changes' }).click();

		await expect(card.getByText(/multiple of 5 minutes/i)).toBeVisible();
	});

	test('rejects a time zone the server does not recognise', async ({ page }) => {
		await page.goto(`${MANAGE}/settings`);

		/*
		 * The dropdown cannot produce this value, so drive the request the way an
		 * attacker would: add the option ourselves and submit.
		 *
		 * Wrapped in `toPass` because the injection races hydration. Svelte renders
		 * the options from an `{#each}`, so an option appended before the component
		 * takes over the DOM is thrown away again a moment later — and the form then
		 * submits a perfectly valid zone, and the test fails claiming the server
		 * accepted a fake one. Retrying the whole attack is the honest fix: if the
		 * server ever does accept `Europe/Atlantis`, no amount of retrying will make
		 * the error appear and the test still fails.
		 */
		await expect(async () => {
			await page.evaluate(() => {
				const select = document.querySelector<HTMLSelectElement>('select[name*="timeZone"]');
				if (!select) throw new Error('time zone select not found');

				if (![...select.options].some((option) => option.value === 'Europe/Atlantis')) {
					const option = document.createElement('option');
					option.value = 'Europe/Atlantis';
					option.textContent = 'Europe/Atlantis';
					select.append(option);
				}

				select.value = 'Europe/Atlantis';
				select.dispatchEvent(new Event('change', { bubbles: true }));
			});

			await page.getByRole('button', { name: 'Save settings' }).click();
			await expect(page.getByText(/not a time zone/i)).toBeVisible({ timeout: 3_000 });
		}).toPass({ timeout: 20_000 });
	});
});

test.describe('what a member cannot reach', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/sign-in');
		await signIn(page, STAFF);
	});

	test('sees only the sections they can use', async ({ page }) => {
		await page.goto(MANAGE);
		const nav = page.getByRole('navigation', { name: 'Dashboard sections' });

		await expect(nav.getByRole('link', { name: 'Diary' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Hours' })).toBeVisible();

		// Hiding the link is manners. The next three tests are the control.
		await expect(nav.getByRole('link', { name: 'Services' })).toHaveCount(0);
		await expect(nav.getByRole('link', { name: 'Team' })).toHaveCount(0);
		await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
	});

	for (const section of ['services', 'team', 'settings']) {
		test(`is refused /${section} even by typing the URL`, async ({ page }) => {
			const response = await page.goto(`${MANAGE}/${section}`);
			expect(response?.status()).toBe(403);
			await expect(page.getByText(/only an owner/i)).toBeVisible();
		});
	}

	test('cannot see another studio s diary', async ({ page }) => {
		/*
		 * A 404, not a 403. Confirming that `/manage/other-studio` exists but is
		 * not yours leaks the platform's customer list one guess at a time.
		 */
		const response = await page.goto('/manage/some-other-studio');
		expect(response?.status()).toBe(404);
	});

	test('can still manage their own hours', async ({ page }) => {
		await page.goto(`${MANAGE}/hours`);

		const ben = page.locator('.person', { hasText: 'Ben' });
		await expect(ben.getByRole('button', { name: /^Remove/ }).first()).toBeVisible();
	});

	test('cannot remove somebody else s shift', async ({ page }) => {
		await page.goto(`${MANAGE}/hours`);

		// Ada's shifts are visible — a member can see the rota — but not editable.
		const ada = page.locator('.person', { hasText: 'Ada' });
		await expect(ada).toBeVisible();
		await expect(ada.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
	});
});
