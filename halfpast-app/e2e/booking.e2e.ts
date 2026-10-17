import {
	SHOP,
	arriveClientSide,
	chooseAvailableSlot,
	chooseDay,
	chooseWho,
	expect,
	selectedDay,
	submitBooking,
	test,
	uniqueEmail
} from './fixtures.ts';

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

		await page.getByRole('link', { name: 'All services' }).click();
		await expect(page.getByRole('link', { name: /Full colour/ })).toBeVisible();
	});

	test('does not ask who with when only one person offers the service', async ({ page }) => {
		// Only Ada does restyles.
		await page.goto(`${SHOP}?service=restyle`);
		await expect(page.getByRole('heading', { name: 'When?' })).toBeVisible();
		await expect(page.getByRole('list', { name: 'Choose who with' })).toHaveCount(0);
	});

	test('asks who with when more than one person offers the service', async ({ page }) => {
		// Ada and Ben both cut.
		await page.goto(`${SHOP}?service=cut-and-finish`);
		const who = page.getByRole('list', { name: 'Choose who with' });

		await expect(who).toBeVisible();
		await expect(who.getByRole('link', { name: 'Anyone' })).toHaveAttribute('aria-current', 'true');
		await expect(who.getByRole('link', { name: 'Ada' })).toBeVisible();
		await expect(who.getByRole('link', { name: 'Ben' })).toBeVisible();
	});

	test('hides the details form until a time is chosen', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);

		await expect(page.getByRole('button', { name: 'Book this time' })).toHaveCount(0);

		await chooseAvailableSlot(page);
		await expect(page.getByRole('button', { name: 'Book this time' })).toBeVisible();
	});

	test('puts the details away when the chosen time leaves the screen', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page);
		await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();

		// Move to a different day — the chosen time is no longer on screen, so the
		// page must stop asking for details about it. The day is read first and
		// then chosen by its date: a locator for "a day that is not current" would
		// stop matching the very link it found the moment that link became current.
		const otherDay = await page
			.getByRole('list', { name: 'Choose a day' })
			.locator('a[data-day]:not([aria-current])')
			.last()
			.getAttribute('data-day');
		if (!otherDay) throw new Error('No other day in the strip to move to.');
		await chooseDay(page, otherDay);

		await expect(page.getByRole('heading', { name: 'Your details' })).toHaveCount(0);
	});

	test('keeps the chosen day and person in the URL', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseWho(page, 'Ben');
		await chooseAvailableSlot(page, 2);
		const day = await selectedDay(page);

		// A refresh lands on the same person and the same day.
		await page.reload();
		await expect(
			page.getByRole('list', { name: 'Choose who with' }).getByRole('link', { name: 'Ben' })
		).toHaveAttribute('aria-current', 'true');
		expect(await selectedDay(page)).toBe(day);
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

	test('leaves no live stream running once the booking is made', async ({ page }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page);
		await page.getByLabel('Your name').fill('Streaming Sam');
		await page.getByLabel('Email').fill(uniqueEmail('Streaming Sam'));

		/*
		 * Any request for availability that *starts* after Book is pressed is the
		 * booking page reopening its live stream on its way out. A form handler
		 * that refreshes nothing makes SvelteKit refresh every query on the page,
		 * the live one included, and that stream stayed open on the confirmation
		 * page. The handler now refreshes the confirmation page's own query
		 * instead, so nothing on the booking page is asked for again.
		 */
		const reopened: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/getAvailability')) reopened.push(request.url());
		});

		await page.getByRole('button', { name: 'Book this time' }).click();
		await expect(page).toHaveURL(/\/booking\/[0-9A-HJKMNP-TV-Z]{26}\?new=1$/);
		await expect(page.getByText("You're booked in")).toBeVisible();

		expect(reopened, 'the availability stream was reopened on the way out').toEqual([]);
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
		const day = await selectedDay(page);

		await submitBooking(page, 'First Come');
		await expect(page).toHaveURL(/\/booking\//);

		// A completely separate browser context — different cookies, fresh cache.
		const context = await browser.newContext();
		const second = await context.newPage();
		await second.goto(`${SHOP}?service=cut-and-finish`);

		// The slot may still exist for the *other* stylist, so narrow to one person.
		await chooseWho(second, 'Ada');

		await chooseDay(second, day);

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
		await chooseWho(page, 'Ada');
		const freedLabel = await chooseAvailableSlot(page, 3);

		const day = await selectedDay(page);

		await submitBooking(page, 'Returning Rob');
		await expect(page).toHaveURL(/\/booking\//);

		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: 'Cancel this appointment' }).click();
		await expect(page.getByText('This appointment is cancelled')).toBeVisible();

		// Back to the grid: the slot the cancellation freed is bookable again.
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseWho(page, 'Ada');

		await chooseDay(page, day);

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

	test('an unknown token gets the server s own sentence, not a fallback', async ({ page }) => {
		/*
		 * The query the page awaits calls `error(404, 'We could not find that
		 * booking.')`. SvelteKit's boundary around the page renders `+error.svelte`
		 * with an `App.Error` — `{ status, message }`, no `body` — so the screen
		 * shows the sentence only if the component reads `error.message`.
		 */
		const response = await page.goto('/booking/ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
		expect(response?.status()).toBe(404);
		await expect(page.getByRole('alert')).toContainText('We could not find that booking.');
		// The heading names the kind of failure: a missing booking is not a broken app.
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
	});

	test('the same failure after a client-side navigation shows the same sentence', async ({
		page
	}) => {
		/*
		 * The test above is the boundary catching the rejection while the server
		 * renders. Here the same boundary catches it in the browser: the query's
		 * rejection crosses the network as an `HttpError`, and SvelteKit unwraps it
		 * back into the `App.Error` that `+error.svelte` receives. A different code
		 * path to the same screen, so it gets its own test.
		 */
		await arriveClientSide(page, '/booking/ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
		await expect(page.getByRole('alert')).toContainText('We could not find that booking.');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
	});

	test('cancelling from a stale second window is refused in the server s words', async ({
		page
	}) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page, 3);
		await submitBooking(page, 'Twice Tess');
		await expect(page).toHaveURL(/\/booking\//);
		const managePath = new URL(page.url()).pathname;

		// The same link, open in a second window before the cancellation.
		const other = await page.context().newPage();
		await arriveClientSide(other, managePath);
		const otherCancel = other.getByRole('button', { name: 'Cancel this appointment' });
		await expect(otherCancel).toBeVisible();

		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: 'Cancel this appointment' }).click();
		await expect(page.getByText('This appointment is cancelled')).toBeVisible();

		/*
		 * The second window reads a plain query, so it still offers the button, and
		 * the command reaches the server, which calls `error(400, 'That booking is
		 * already cancelled.')`. The browser receives an `HttpError` — not an
		 * `Error` — with that sentence in `body.message`. Reading `.message` off the
		 * rejection instead would show the fallback, "We could not cancel that."
		 */
		other.once('dialog', (dialog) => void dialog.accept());
		await otherCancel.click();
		await expect(other.getByRole('alert')).toContainText('That booking is already cancelled.');
		await other.close();
	});

	test('a cancellation that never reaches the server is explained in our words', async ({
		page
	}) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseAvailableSlot(page, 3);
		await submitBooking(page, 'Offline Olu');
		await expect(page).toHaveURL(/\/booking\//);

		/*
		 * With the network gone, the command's `fetch` rejects with the browser's
		 * own `TypeError: Failed to fetch`. Nothing on our side wrote that or vetted
		 * it, so the page shows its fallback. An earlier `messageFrom` also read
		 * `.message` off any `Error`, and this alert then said "Failed to fetch".
		 */
		await page.context().setOffline(true);
		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: 'Cancel this appointment' }).click();

		const alert = page.getByRole('alert');
		await expect(alert.getByText('We could not cancel that.', { exact: true })).toBeVisible();
		await expect(alert).not.toContainText('Failed to fetch');
		await page.context().setOffline(false);
	});
});

test.describe('booking without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('books end to end, from the service list to the confirmation', async ({ page }) => {
		/*
		 * Every step is something the browser does on its own. The service, the
		 * person and the day are links, so each is a page load with the choice
		 * in the URL; the time is a native radio; the details appear because a
		 * CSS `:has()` rule sees it checked; and Book posts a real form, which
		 * the server answers with a redirect.
		 */
		await page.goto(SHOP);
		await page.getByRole('link', { name: /Cut and finish/ }).click();
		await chooseWho(page, 'Ada');

		await expect(page.getByRole('button', { name: 'Book this time' })).toHaveCount(0);
		const chosenTime = await chooseAvailableSlot(page);
		await submitBooking(page, 'Scriptless Sol');

		await expect(page).toHaveURL(/\/booking\/[0-9A-HJKMNP-TV-Z]{26}\?new=1$/);
		await expect(page.getByText("You're booked in")).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toContainText(chosenTime);
	});

	test('a time lost to somebody else keeps the details filled in', async ({ page, browser }) => {
		await page.goto(`${SHOP}?service=cut-and-finish`);
		await chooseWho(page, 'Ada');
		const lostTime = await chooseAvailableSlot(page);
		const day = await selectedDay(page);
		await page.getByLabel('Your name').fill('Second Sasha');
		await page.getByLabel('Email').fill(uniqueEmail('Second Sasha'));

		// Somebody else, with a normal browser, takes the same time with Ada first.
		const context = await browser.newContext();
		const rival = await context.newPage();
		await rival.goto(`${SHOP}?service=cut-and-finish`);
		await chooseWho(rival, 'Ada');
		await chooseDay(rival, day);
		await rival.locator('label.slot', { hasText: lostTime }).click();
		await submitBooking(rival, 'First Finn');
		await expect(rival).toHaveURL(/\/booking\//);
		await context.close();

		await page.getByRole('button', { name: 'Book this time' }).click();

		/*
		 * The server refuses the time with `invalid(issue.slot(…))`, so the answer
		 * is the booking form again, not the failure screen: the sentence beside
		 * the grid, the lost time gone from it, and the name and email still
		 * there. It used to be `error(409, …)`, and this was "Back to the start".
		 */
		await expect(page).toHaveURL(/\/book\/willow-lane\?/);
		await expect(page.getByRole('alert')).toContainText('That time is no longer available.');
		await expect(page.locator('label.slot', { hasText: lostTime })).toHaveCount(0);

		await page.locator('label.slot').first().click();
		await expect(page.getByLabel('Your name')).toHaveValue('Second Sasha');
		await expect(page.getByRole('button', { name: 'Book this time' })).toBeVisible();
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
