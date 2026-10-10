import { expect, test, type Page } from '@playwright/test';

/**
 * WHEN THE VENUE SAYS NO
 * ======================
 *
 * Every test here makes the server refuse something for a real reason, and
 * asserts that the person is told that reason — the server's own words, not a
 * fallback. Each one failed against the code before it, in a different way:
 *
 *   - a panel's refusal took the whole terminal down with it;
 *   - a refused cancel showed nothing at all;
 *   - a refused page fell through to SvelteKit's bare default error page,
 *     because the layout's own failure card could never be reached;
 *   - a wrong password replaced the sign-in form with an error page.
 *
 * Two shapes are in play, and mixing them up is the bug all four shared. What
 * a `<svelte:boundary>` or `+error.svelte` receives is an `App.Error`, a plain
 * `{ status, message }`. What an awaited remote call rejects with is an
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

test('a panel the role may not see fails on its own, in the server’s words', async ({ page }) => {
	// A venue operator watches the market and holds no positions of its own, so
	// the positions query is refused for this role.
	await signIn(page, 'ops@sequent.test');

	// The rest of the terminal is still there…
	await expect(page.getByRole('heading', { name: 'Tape' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Order ticket' })).toBeVisible();

	// …and the one panel that failed says why, with the message the server sent.
	await expect(panel(page, 'Positions')).toContainText('Your role does not allow that.');
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
	// Refused at the gateway, so the order never left the book.
	await expect(cancel).toBeVisible();
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
