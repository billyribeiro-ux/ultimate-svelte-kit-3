import { expect, test } from '@playwright/test';

/**
 * The sign-in page, with no stored state.
 *
 * An **empty** state object, not `undefined`. `undefined` means "inherit the
 * project's value", so it silently keeps the signed-in cookie — and the symptom
 * is every test here timing out on a sign-in page that redirected away, which
 * looks like the page is broken rather than the fixture.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('an anonymous visitor is sent to sign in', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/sign-in/);
	await expect(page.getByRole('heading', { name: 'Sextant' })).toBeVisible();
});

test('the sign-in form works without JavaScript', async ({ browser }) => {
	/*
	 * THE TEST THAT JUSTIFIES THE FORM.
	 *
	 * `sign-in/+page.server.ts` uses a real action rather than a remote function,
	 * and the entire argument for that is "it has to work when the bundle does
	 * not". An argument nobody tests is a comment.
	 */
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();

	await page.goto('/sign-in');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL(/\/demo\/explore/);
	await context.close();
});

test('a wrong password says the same thing as a wrong email', async ({ page }) => {
	/*
	 * The two messages must be identical.
	 *
	 * Distinguishing them turns the sign-in form into an account-existence oracle:
	 * an attacker with a list of addresses learns which are customers, one request
	 * at a time, with no credentials at all.
	 */
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('wrong-password-entirely');
	await page.getByRole('button', { name: 'Sign in' }).click();

	const wrongPassword = await page.getByRole('alert').textContent();

	await page.goto('/sign-in');
	await page.getByLabel('Email').fill('nobody@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByRole('alert')).toHaveText(wrongPassword ?? '');
});

test('a failed sign-in keeps the email and clears the password', async ({ page }) => {
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('wrong-password-entirely');
	await page.getByRole('button', { name: 'Sign in' }).click();

	/*
	 * Still on the sign-in page, with no `?/signIn` in the address bar.
	 *
	 * SvelteKit 3.0.0-next.17 made an enhanced submission navigate to wherever the
	 * action lands, on failure as well as success, the way a native form does. For
	 * a form posting to its own page that is a no-op — and this is the assertion
	 * that says so, so a future action moved to its own route fails here rather
	 * than surprising somebody in production.
	 */
	await expect(page).toHaveURL(/\/sign-in$/);

	await expect(page.getByLabel('Email')).toHaveValue('ada@example.com');
	// Never re-populated: it would put the password in the HTML of a page that may
	// be cached, logged by a proxy, or printed.
	await expect(page.getByLabel('Password')).toHaveValue('');
});
