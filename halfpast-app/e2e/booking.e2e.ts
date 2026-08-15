import { SHOP, chooseAvailableSlot, expect, submitBooking, test } from './fixtures.ts';

/**
 * The customer's journey, end to end, against a real production build.
 *
 * Every test starts from a freshly seeded diary — see `fixtures.ts` — so they
 * can be read, run and reordered independently.
 */

test.describe('the booking page', () => {
	test('shows the studio and its services on first load', async ({ page }) => {
		await page.goto(SHOP);

		await expect(page.getByRole('heading', { name: 'Willow Lane Studio' })).toBeVisible();
		await expect(page.getByRole('link', { name: /Cut and finish/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /Full colour/ })).toBeVisible();
		// A free service says "Free", not "£0.00".
		await expect(page.getByRole('link', { name: /Fringe trim/ })).toContainText('Free');
	});

	test('server-renders the services rather than filling them in after hydration', async ({
		page
	}) => {
		/*
		 * The assertion that catches a regression to a `pending` snippet on the root
		 * boundary. Navigating and looking at the DOM would pass either way, because
		 * hydration fills it in; this reads the bytes the server actually sent.
		 */
		const response = await page.request.get(SHOP);
		const html = await response.text();

		expect(html).toContain('Willow Lane Studio');
		expect(html).toContain('Cut and finish');
		expect(html).toContain('£48.00');
	});

	test('keeps the chosen service in the URL so it can be shared', async ({ page }) => {
		await page.goto(SHOP);
		await page.getByRole('link', { name: /Cut and finish/ }).click();

		await expect(page).toHaveURL(/\?service=cut-and-finish$/);

		await page.getByRole('button', { name: 'All services' }).click();
		await expect(page.getByRole('link', { name: /Full colour/ })).toBeVisible();
	});

	test('does not ask who with when only one person offers the service', async ({ page }) => {
		// Only Ada does restyles.
		await page.goto(`${SHOP}?service=restyle`);
		await expect(page.getByRole('heading', { name: 'When?' })).toBeVisible();
		await expect(page.getByRole('radiogroup', { name: 'Choose who with' })).toHaveCount(0);
	});

	test('asks who with when more than one person offers the service', async ({ page }) => {
		// Ada and Ben both cut.
		await page.goto(`${SHOP}?service=cut-and-finish`);
		const who = page.getByRole('radiogroup', { name: 'Choose who with' });

		await expect(who).toBeVisible();
		await expect(who.getByRole('radio', { name: 'Anyone' })).toBeVisible();
		await expect(who.getByRole('radio', { name: 'Ada' })).toBeVisible();
		await expect(who.getByRole('radio', { name: 'Ben' })).toBeVisible();
	});

	test('hides the details form until a time is chosen', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);

		await expect(page.getByRole('button', { name: 'Book this time' })).toHaveCount(0);

		await chooseAvailableSlot(page);
		await expect(page.getByRole('button', { name: 'Book this time' })).toBeVisible();
	});

	test('forgets the chosen time when the day changes', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page);
		await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();

		// Move to a different day — the previous selection referred to a time that
		// is no longer on screen, so it must not survive.
		const days = page.getByRole('radiogroup', { name: 'Choose a day' }).getByRole('radio');
		await days.nth(4).click();

		await expect(page.getByRole('heading', { name: 'Your details' })).toHaveCount(0);
	});
});

test.describe('making a booking', () => {
	test('walks from service to confirmation', async ({ page }) => {
		await page.goto(SHOP);

		await page.getByRole('link', { name: /Cut and finish/ }).click();
		await expect(page.getByRole('heading', { name: 'When?' })).toBeVisible();

		const chosenTime = await chooseAvailableSlot(page);
		await submitBooking(page, 'Playwright Pat');

		// Lands on the manage page, which is keyed by the secret token.
		await expect(page).toHaveURL(/\/booking\/[0-9A-HJKMNP-TV-Z]{26}\?new=1$/);
		await expect(page.getByText("You're booked in")).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toContainText(chosenTime);
		await expect(page.getByText(/HP-[0-9A-Z]{8}/)).toBeVisible();
	});

	test('refuses to submit an invalid email', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page);

		await page.getByLabel('Your name').fill('Bad Email Bob');
		await page.getByLabel('Email').fill('not-an-email');
		await page.getByRole('button', { name: 'Book this time' }).click();

		/*
		 * `fields.email.as('email')` renders `type="email"`, so the browser's own
		 * constraint validation refuses the submission before a request is made.
		 * That is the right order — instant, localised and free — so the assertion
		 * here is "nothing was sent", not "our message appeared". The server-side
		 * schema is still the authority and is covered by unit tests; this proves
		 * the client never wastes a round trip discovering the same thing.
		 */
		await expect(page).toHaveURL(/\/book\/willow-lane/);

		const email = page.getByLabel('Email');
		expect(await email.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
	});

	test('removes a booked time from the next visitor s grid', async ({ page, browser }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		const takenLabel = await chooseAvailableSlot(page);

		// Which day are we on? The second browser has to look at the same one.
		const selectedDay = await page
			.getByRole('radiogroup', { name: 'Choose a day' })
			.getByRole('radio', { checked: true })
			.getAttribute('aria-label');

		await submitBooking(page, 'First Come');
		await expect(page).toHaveURL(/\/booking\//);

		// A completely separate browser context — different cookies, fresh cache.
		const context = await browser.newContext();
		const second = await context.newPage();
		await second.goto(`${SHOP}?service=cut-and-finish`);

		// The slot may still exist for the *other* stylist, so narrow to one person.
		await second.getByRole('radio', { name: 'Ada' }).click();

		const days = second.getByRole('radiogroup', { name: 'Choose a day' }).getByRole('radio');
		const count = await days.count();
		for (let index = 0; index < count; index += 1) {
			const day = days.nth(index);
			if ((await day.getAttribute('aria-label')) === selectedDay) {
				await day.click();
				break;
			}
		}

		// Ada is the first eligible staff member, so she took the booking.
		await expect(second.locator('label.slot', { hasText: takenLabel })).toHaveCount(0);
		await context.close();
	});
});

test.describe('managing a booking', () => {
	test('a customer can cancel, and the page updates in one round trip', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		// Three days out, comfortably outside the 24-hour cancellation window.
		await chooseAvailableSlot(page, 3);
		await submitBooking(page, 'Cancelling Cara');
		await expect(page).toHaveURL(/\/booking\//);

		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: 'Cancel this appointment' }).click();

		await expect(page.getByText('This appointment is cancelled')).toBeVisible();
		// The cancel button is gone, because there is nothing left to cancel.
		await expect(page.getByRole('button', { name: 'Cancel this appointment' })).toHaveCount(0);
	});

	test('a cancelled time goes back on offer', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await page.getByRole('radio', { name: 'Ada' }).click();
		const freedLabel = await chooseAvailableSlot(page, 3);

		const day = await page
			.getByRole('radiogroup', { name: 'Choose a day' })
			.getByRole('radio', { checked: true })
			.getAttribute('aria-label');

		await submitBooking(page, 'Returning Rob');
		await expect(page).toHaveURL(/\/booking\//);

		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: 'Cancel this appointment' }).click();
		await expect(page.getByText('This appointment is cancelled')).toBeVisible();

		// Back to the grid: the slot the cancellation freed is bookable again.
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await page.getByRole('radio', { name: 'Ada' }).click();

		const days = page.getByRole('radiogroup', { name: 'Choose a day' }).getByRole('radio');
		const count = await days.count();
		for (let index = 0; index < count; index += 1) {
			if ((await days.nth(index).getAttribute('aria-label')) === day) {
				await days.nth(index).click();
				break;
			}
		}

		await expect(page.locator('label.slot', { hasText: freedLabel })).toHaveCount(1);
	});

	test('the manage page asks not to be indexed', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page);
		await submitBooking(page, 'Private Percy');
		await expect(page).toHaveURL(/\/booking\//);

		// The URL is the credential. A search engine that crawled it would publish
		// somebody's appointment together with the power to cancel it.
		const robots = page.locator('meta[name="robots"]');
		await expect(robots).toHaveAttribute('content', /noindex/);
	});

	test('an unknown token is a 404, not a crash', async ({ page }) => {
		const response = await page.goto('/booking/ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
		expect(response?.status()).toBe(404);
	});

	test('a malformed token is rejected without reaching the database', async ({ page }) => {
		// Too short to be a token, so the schema refuses it.
		const response = await page.goto('/booking/nope');
		expect(response?.status()).toBeGreaterThanOrEqual(400);
	});
});

test.describe('time zones', () => {
	test.use({ timezoneId: 'America/New_York' });

	test('shows times in the visitor s own zone and names the studio s', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page);

		/*
		 * New York is five hours behind London, so a 09:00 appointment at the studio
		 * reads as 04:00 to this visitor. The page must say both — showing only the
		 * local time is how somebody turns up five hours late, and showing only the
		 * studio's time is how they turn up five hours early.
		 */
		const note = page.getByText(/at the studio/);
		await expect(note).toBeVisible();
		await expect(note).toContainText(/UTC[+-]\d{2}:\d{2}/);
	});
});
