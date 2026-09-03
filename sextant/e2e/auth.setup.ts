import { expect, test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * SIGN IN ONCE, REUSE THE COOKIE.
 *
 * A `setup` project rather than a `beforeEach`, because signing in is slow — a
 * password hash is *deliberately* slow — and doing it before every test turns a
 * two-minute suite into a ten-minute one for no additional coverage. The state
 * file is written once and every other test starts already signed in.
 *
 * The sign-in flow itself is tested properly in `auth.e2e.ts`. This is the
 * fixture, not the test, and conflating the two is how a suite ends up with the
 * login form covered forty times and nothing else covered once.
 */
export const STATE = 'e2e/.auth/state.json';

setup('sign in', async ({ page }) => {
	mkdirSync('e2e/.auth', { recursive: true });

	await page.goto('/sign-in');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery');
	await page.getByRole('button', { name: 'Sign in' }).click();

	// Landing on the explore page proves the redirect chain worked, which is more
	// than "the cookie exists" would.
	await expect(page).toHaveURL(/\/demo\/explore/);
	await page.context().storageState({ path: STATE });
});
