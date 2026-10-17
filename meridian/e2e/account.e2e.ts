import { expect, test } from '@playwright/test';
import { openMenu, PASSWORD, signIn, typeDate, USERS } from './helpers.ts';

/**
 * AN ACCOUNT, AND A TRIP OF ONE'S OWN
 * ===================================
 *
 * Better Auth's email-and-password flow through the app's own forms, the
 * redirect guard on the signed-in group, and the whole life of a trip: made
 * from the explore page, seen in the list, deleted from its settings.
 */

test('signing up, signing out and signing in', async ({ page }) => {
	// Nobody signed in: sent to sign in, and told where to come back to.
	await page.goto('/trips');
	await expect(page).toHaveURL(/\/signin\?redirectTo=%2Ftrips$/);

	await page.getByRole('link', { name: 'Create an account' }).click();
	const email = `dee-${Date.now()}@meridian.test`;
	await page.getByLabel('Your name').fill('Dee Okonkwo');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Create an account' }).click();

	await expect(page).toHaveURL(/\/trips$/);
	await expect(page.getByText('No trips yet.')).toBeVisible();

	// The header was drawn on the sign-in page, signed out, and outlived the
	// sign-up: its links follow the person without a reload, both ways.
	const trips = page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('link', { name: 'Trips', exact: true });
	await openMenu(page);
	await expect(trips).toBeVisible();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await openMenu(page);
	await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
	await expect(trips).toHaveCount(0);

	// The account exists: the same email and password sign in.
	await signIn(page, email);
	await expect(page.getByRole('heading', { name: 'Your trips' })).toBeVisible();
});

test('what is typed before the page has hydrated is kept', async ({ page }) => {
	// Hold the client bundle back, so for a while the sign-in page is exactly
	// what a slow connection sees: server-rendered HTML with no JavaScript yet.
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
		await held;
		await route.continue();
	});

	await page.goto('/signin?redirectTo=%2Ftrips');
	await page.getByLabel('Email').fill(USERS.ana);
	await page.getByLabel('Password').fill(PASSWORD);
	await expect(page.locator('html[data-hydrated]')).toHaveCount(0);

	// Now let it wake up. Hydration must not throw away what was typed.
	release();
	await expect(page.locator('html[data-hydrated]')).toHaveCount(1);
	await expect(page.getByLabel('Email')).toHaveValue(USERS.ana);
	await expect(page.getByLabel('Password')).toHaveValue(PASSWORD);

	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/trips$/);
});

test('a wrong password is refused, with the message on the field', async ({ page }) => {
	await page.goto('/signin');
	await page.getByLabel('Email').fill(USERS.ana);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText('That email and password do not match an account.')).toBeVisible();
	await expect(page).toHaveURL(/\/signin/);
});

test('on a German page the schema’s own messages are German', async ({ page }) => {
	// Not the handler's message, which was always localised: the valibot schema's,
	// which runs before the handler and used to answer in English on every page.
	await page.goto('/de/signin');
	await page.locator('html[data-hydrated]').waitFor();
	await page.getByLabel('E-Mail').fill('keine-adresse');
	await page.getByLabel('Passwort').fill('irgendetwas');
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page.getByText('Gib eine E-Mail-Adresse ein')).toBeVisible();
	await expect(page.getByText('Enter an email address')).toHaveCount(0);
	await expect(page).toHaveURL(/\/de\/signin/);
});

test('a trip is started from the explore page, listed, and deleted from its settings', async ({
	page
}) => {
	await signIn(page, USERS.ana);
	await expect(page.getByRole('link', { name: 'Iberia by rail' })).toBeVisible();

	// The explore page hands the place to the form.
	await page.goto('/explore');
	await page.getByPlaceholder('Filter places').fill('Kyoto');
	// The filter is debounced: wait for the list to shrink before clicking.
	await expect(page.getByText('1 place', { exact: false })).toBeVisible();
	await page
		.locator('li.place', { hasText: 'Kyoto' })
		.getByRole('link', { name: 'Start a trip here' })
		.click();
	await expect(page).toHaveURL(/\/trips\/new\?place=kyoto$/);
	await expect(page.getByLabel('Name')).toHaveValue('Kyoto');

	await page.getByLabel('Name').fill('Kyoto in the spring');
	await typeDate(page, 'start', { year: 2027, month: 4, day: 3 });
	await typeDate(page, 'end', { year: 2027, month: 4, day: 9 });
	await page.getByRole('button', { name: 'Create trip' }).click();

	await page.waitForURL(/\/t\/[a-z2-9]{6,32}$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Kyoto in the spring' })).toBeVisible();
	// Seven days, no stops yet.
	await expect(page.getByText('Nothing planned yet').first()).toBeVisible();
	const slug = new URL(page.url()).pathname.split('/').pop()!;

	await page.goto('/trips');
	await expect(page.getByRole('link', { name: 'Kyoto in the spring' })).toHaveAttribute(
		'href',
		`/t/${slug}`
	);

	// Delete it: a real form, with a confirm in front of it when JavaScript is on.
	await page.goto(`/t/${slug}/settings`);
	await page.locator('html[data-hydrated]').waitFor();

	// "Cancel" keeps the trip: nothing is sent, and the trip is still listed.
	let asked = false;
	page.once('dialog', (dialog) => {
		asked = true;
		void dialog.dismiss();
	});
	await page.getByRole('button', { name: 'Delete trip' }).click();
	await expect.poll(() => asked).toBe(true);
	await expect(page).toHaveURL(new RegExp(`/t/${slug}/settings$`));
	await page.goto('/trips');
	await expect(page.getByRole('link', { name: 'Kyoto in the spring' })).toBeVisible();

	// "OK" deletes it.
	await page.goto(`/t/${slug}/settings`);
	await page.locator('html[data-hydrated]').waitFor();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Delete trip' }).click();
	await expect(page).toHaveURL(/\/trips$/);
	await expect(page.getByRole('link', { name: 'Kyoto in the spring' })).toHaveCount(0);
});

test('a refusal inside the trips list is shown in the server’s words', async ({ page }) => {
	await signIn(page, USERS.ana);
	await page.goto('/explore');

	// Reached from here by a client-side navigation, the list's previews are
	// fetched by the browser as one `query.batch` request. Each argument is
	// swapped on the way out for one the schema refuses, so the server answers
	// with the sentence its `handleError` gives a failed validation — and the
	// boundary's `failed` snippet, handed an `App.Error`, has to print it.
	const refused = Buffer.from(JSON.stringify(['not-an-id'])).toString('base64url');
	await page.route('**/_app/remote/*/tripPreview', (route) => {
		const { payloads } = JSON.parse(route.request().postData() ?? '{}') as { payloads: string[] };
		return route.continue({ postData: JSON.stringify({ payloads: payloads.map(() => refused) }) });
	});

	await openMenu(page);
	await page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('link', { name: 'Trips', exact: true })
		.click();

	// Caught by the boundary, not by the error page. `+error.svelte` prints
	// the same sentence, so the sentence alone would pass with no boundary at
	// all. Inside the trips page, under its own heading and beside the
	// Reconnect button that runs `reset`, it can only be the `failed` snippet.
	const list = page.locator('section.trips');
	await expect(list.getByRole('heading', { level: 1, name: 'Your trips' })).toBeVisible();
	await expect(list.locator('p.issue')).toHaveText('That request did not make sense.');
	await expect(list.getByRole('button', { name: 'Reconnect' })).toBeVisible();
});

test('the diagnostics page draws a new report when it is refreshed', async ({ page }) => {
	await signIn(page, USERS.ana, '/diagnostics');

	// Newest span first; the refresh's own request is newer than all of them.
	const newest = page.locator('.diagnostics tbody tr').first();
	await expect(newest).toBeVisible();
	const before = (await newest.textContent()) ?? '';
	await page.getByRole('button', { name: 'Refresh' }).click();
	await expect(newest).not.toHaveText(before);
});
