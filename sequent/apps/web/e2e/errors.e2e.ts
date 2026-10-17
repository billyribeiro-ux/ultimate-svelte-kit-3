import { expect, test, type Page } from '@playwright/test';

/**
 * WHEN THE VENUE SAYS NO
 * ======================
 *
 * Every test here makes the venue refuse something, or fail, for a real
 * reason, and asserts what the person is told — the server's own words where
 * it has some. Each one failed against the code before it, in a different way:
 *
 *   - a role's certain refusal took the whole terminal down with it, and the
 *     first fix still served the working terminal as an HTTP 403;
 *   - a refused cancel showed nothing at all;
 *   - a refused page fell through to SvelteKit's bare default error page,
 *     because the layout's own failure card could never be reached;
 *   - a wrong password replaced the sign-in form with an error page;
 *   - without JavaScript, a wrong password came back to the browser in the page;
 *   - a panel that failed to load could only be recovered by reloading.
 *
 * Two shapes are in play, and mixing them up was the bug behind the first four.
 * What a `<svelte:boundary>` or `+error.svelte` receives is an `App.Error`, a
 * plain `{ status, message }`. What an awaited remote call rejects with is an
 * `HttpError`, `{ status, body }`, with the message at `body.message`.
 * Neither is an `Error`, so a guard of `instanceof Error` sends every real
 * message to the fallback.
 */

const PASSWORD = 'sequent-demo-2026';

async function signIn(page: Page, email: string) {
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/terminal');
}

/** A card on the page, found by its heading. */
function panel(page: Page, heading: string) {
	return page.locator('section', { has: page.getByRole('heading', { name: heading }) });
}

/** The whole terminal, with a Positions panel that never asked. */
async function expectTerminalWithoutPositions(page: Page) {
	await expect(page.getByRole('heading', { name: 'Tape' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Order ticket' })).toBeVisible();
	await expect(panel(page, 'Positions')).toContainText(
		'This role watches the market and holds none.'
	);
}

test('a panel the role has no use for is a note, and the terminal is a 200', async ({ page }) => {
	// A venue operator watches the market and holds no positions of its own.
	// The terminal must still be all there, in the browser after signing in…
	await signIn(page, 'ops@sequent.test');
	await expectTerminalWithoutPositions(page);

	// …and from the server, on a fresh load. The sign-in arrives by client-side
	// navigation, where a boundary around a rejected read catches it; on the
	// server the same mistake fails the render. And a refusal a boundary catches
	// becomes the page's status, so the code is part of what is asserted.
	const response = await page.reload();
	expect(response?.status()).toBe(200);
	await expectTerminalWithoutPositions(page);
});

test('a cancel the venue refuses says so, rather than appearing to work', async ({ page }) => {
	// An auditor sees the firm's working orders, each with a Cancel button, and
	// may cancel none of them: reads everything, changes nothing. So do risk
	// managers and firm admins, whose cancel is the firm-wide one. Three of the
	// five roles on this screen meet this refusal.
	await signIn(page, 'quinn@northgate.test');
	await expect(page.locator('html[data-hydrated]')).toHaveCount(1);

	const cancel = page.getByRole('button', { name: /^Cancel SEED-/ }).first();
	await cancel.click();

	await expect(panel(page, 'Your orders').getByRole('alert')).toHaveText(
		'Your role does not allow that.'
	);
});

test('a page the role may not open shows the reason, inside the app', async ({ page }) => {
	await signIn(page, 'ada@northgate.test');
	await page.goto('/risk');

	const failure = page.getByRole('alert');
	await expect(failure.getByRole('heading', { name: 'We cannot show you this' })).toBeVisible();
	await expect(failure).toContainText('Your role does not allow that.');

	// Inside the layout, not instead of it: the person can still get somewhere.
	await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
});

test('a wrong password keeps the form, and says what was wrong', async ({ page }) => {
	await page.goto('/sign-in');
	await expect(page.locator('html[data-hydrated]')).toHaveCount(1);

	await page.getByLabel('Email').fill('ada@northgate.test');
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByRole('alert')).toHaveText(
		'That email and password do not match an account.'
	);
	// Still the form, still filled in — one retype away from signing in.
	await expect(page.getByLabel('Email')).toHaveValue('ada@northgate.test');
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a wrong password comes back as a message, and the password does not', async ({ page }) => {
		const typed = 'not-the-password-7f3c19';

		await page.goto('/sign-in');
		await page.getByLabel('Email').fill('ada@northgate.test');
		await page.getByLabel('Password').fill(typed);
		await page.getByRole('button', { name: 'Sign in' }).click();

		// A real form post and a fresh page: the form again, the reason, the email.
		await expect(page.getByRole('alert')).toHaveText(
			'That email and password do not match an account.'
		);
		await expect(page.getByLabel('Email')).toHaveValue('ada@northgate.test');

		// And not the password — not in the field, and not anywhere in the
		// document, which includes the data the page would hydrate from.
		await expect(page.getByLabel('Password')).toHaveValue('');
		expect(await page.content()).not.toContain(typed);
	});
});

test('a panel that failed to load can be tried again, in place', async ({ page }) => {
	// The connection drops on the one request that reads positions, and only
	// that one: the rest of the terminal must not notice.
	const positionsRead = /\/_app\/remote\/[^/]+\/getMyPositions/;
	await page.route(positionsRead, (route) => route.abort());

	await signIn(page, 'ada@northgate.test');
	await expect(page.locator('html[data-hydrated]')).toHaveCount(1);

	const positions = panel(page, 'Positions');
	await expect(positions).toContainText('Positions did not load');
	await expect(page.getByRole('heading', { name: 'Tape' })).toBeVisible();

	// The connection is back. Retrying fetches again, rather than re-reading the
	// failure Kit kept for that query.
	await page.unroute(positionsRead);
	await positions.getByRole('button', { name: 'Try again' }).click();

	await expect(positions.getByRole('region', { name: 'Positions, scrollable' })).toBeVisible();
});
