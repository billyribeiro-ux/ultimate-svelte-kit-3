import { expect, test } from '@playwright/test';

/**
 * The studio, driven the way a person drives it. Every test opens a preset
 * rather than the bare studio, because the bare studio restores whatever the
 * last test left in localStorage — and that is a feature under test of its own.
 */

const kickStep = (page: import('@playwright/test').Page, n: number) =>
	page
		.locator('.track')
		.first()
		.getByRole('button', { name: new RegExp(`^Step ${n}(,|$)`) });

test('paints steps: off, accent, soft, off', async ({ page }) => {
	await page.goto('/studio?preset=four-on-the-floor');
	await expect(page.getByLabel('Pattern title')).toHaveValue('Four on the floor');

	const pad = kickStep(page, 2);
	await expect(pad).toHaveAttribute('aria-pressed', 'false');

	await pad.click();
	await expect(pad).toHaveAttribute('aria-pressed', 'true');
	await expect(pad).toHaveAccessibleName('Step 2, accent');

	await pad.click();
	await expect(pad).toHaveAccessibleName('Step 2, soft');

	await pad.click();
	await expect(pad).toHaveAttribute('aria-pressed', 'false');
});

test('undoes and redoes from the keyboard', async ({ page }) => {
	await page.goto('/studio?preset=four-on-the-floor');
	const pad = kickStep(page, 2);

	await pad.click();
	await expect(pad).toHaveAttribute('aria-pressed', 'true');

	await page.keyboard.press('Control+z');
	await expect(kickStep(page, 2)).toHaveAttribute('aria-pressed', 'false');

	await page.keyboard.press('Control+y');
	await expect(kickStep(page, 2)).toHaveAttribute('aria-pressed', 'true');
});

test('the brush is a radio group, and the erase brush erases', async ({ page }) => {
	await page.goto('/studio?preset=four-on-the-floor');

	// The radio itself is visually hidden; its label is the target a person hits.
	await page.locator('label.chip', { hasText: 'Erase' }).click();
	await expect(page.getByRole('radio', { name: /Erase/ })).toBeChecked();
	const lit = kickStep(page, 1);
	await expect(lit).toHaveAttribute('aria-pressed', 'true');
	await lit.click();
	await expect(lit).toHaveAttribute('aria-pressed', 'false');

	// The row checkbox reflects the row: some on → indeterminate.
	const all = page
		.locator('.track')
		.first()
		.getByRole('checkbox', { name: /All steps/ });
	await expect(all).toHaveJSProperty('indeterminate', true);
	await all.click();
	await expect(all).toHaveJSProperty('indeterminate', false);
	await expect(kickStep(page, 2)).toHaveAttribute('aria-pressed', 'true');
});

test('plays, counts bars, and stops', async ({ page }) => {
	await page.goto('/studio?preset=four-on-the-floor');

	const play = page.getByRole('button', { name: 'Play' });
	await play.click();
	await expect(page.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('audio on')).toBeVisible();

	// One bar at 124 bpm is just under two seconds.
	await expect(page.getByLabel('Bars played')).toHaveText('001', { timeout: 6_000 });

	await page.keyboard.press('Space');
	await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('the share link is the pattern', async ({ page }) => {
	await page.goto('/studio?preset=boom-bap');
	await kickStep(page, 2).click();

	await page.getByRole('button', { name: 'Share' }).click();
	const dialog = page.getByRole('dialog', { name: 'Share' });
	await expect(dialog).toBeVisible();

	const link = await dialog.getByLabel('Share link').inputValue();
	expect(link).toContain('/studio?p=');

	// Closing is history: the panel was pushed, so back pops it.
	await page.goBack();
	await expect(dialog).not.toBeVisible();

	await page.goto(link);
	await expect(page.getByLabel('Pattern title')).toHaveValue('Boom bap');
	await expect(kickStep(page, 2)).toHaveAttribute('aria-pressed', 'true');
});

test('a damaged link opens a fresh pattern with a message', async ({ page }) => {
	await page.goto('/studio?p=AQAAbroken');
	await expect(page.getByRole('status').filter({ hasText: 'damaged' })).toBeVisible();
	await expect(page.locator('.track')).toHaveCount(4);
});

test('survives a navigation away and back, and a reload', async ({ page }) => {
	await page.goto('/studio?preset=two-step');
	await page.getByLabel('Pattern title').fill('Kept');
	await kickStep(page, 2).click();

	// Snapshot: away and back restores the edited pattern for this history entry.
	// Wait for the gallery to have *rendered* before going back — a popstate
	// fired into a navigation that is still resolving its data is a race, in a
	// test and for a person.
	await page.getByRole('link', { name: 'Gallery' }).click();
	await expect(page).toHaveURL(/\/gallery/);
	await expect(page.locator('#main .pattern-card').first()).toBeVisible();
	// `history.back()` from the page rather than Playwright's `goBack()`: the
	// router answers a popstate without a document load, which is exactly what
	// `goBack()` waits for and occasionally waits for in vain.
	await page.evaluate(() => history.back());
	await expect(page).toHaveURL(/\/studio\?preset=two-step$/);
	await expect(page.getByLabel('Pattern title')).toHaveValue('Kept');
	await expect(kickStep(page, 2)).toHaveAttribute('aria-pressed', 'true');

	// localStorage: a fresh visit restores the last session.
	await page.goto('/studio');
	await expect(page.getByLabel('Pattern title')).toHaveValue('Kept');
});

test('tracks can be added, moved, muted and removed', async ({ page }) => {
	await page.goto('/studio?preset=four-on-the-floor');
	await expect(page.locator('.track')).toHaveCount(4);

	await page.getByLabel('Add a track').selectOption('sample');
	await expect(page.locator('.track')).toHaveCount(5);
	await expect(page.locator('.track').last()).toContainText('Sample');

	await page.getByRole('button', { name: 'Move Sample up' }).click();
	await expect(page.locator('.track').nth(3)).toContainText('Sample');

	await page.getByRole('button', { name: 'Mute Kick' }).click();
	await expect(page.getByRole('button', { name: 'Mute Kick' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await page.getByRole('button', { name: 'Remove Sample' }).click();
	await expect(page.locator('.track')).toHaveCount(4);
});

test('the sound panel opens as a sheet on a phone and a side panel on a desktop', async ({
	page
}, info) => {
	await page.goto('/studio?preset=four-on-the-floor');
	await page.getByRole('button', { name: 'Sound settings for Kick' }).click();

	const dialog = page.getByRole('dialog', { name: 'Sound: Kick' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Instrument')).toHaveValue('kick');

	if (info.project.name === 'phone') {
		await expect(dialog).not.toHaveClass(/sheet--side/);
	} else {
		await expect(dialog).toHaveClass(/sheet--side/);
	}

	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
});

test('renders a WAV and plays it back', async ({ page }) => {
	await page.goto('/studio?preset=four-on-the-floor');
	await page.getByRole('button', { name: 'Share' }).click();

	const dialog = page.getByRole('dialog', { name: 'Share' });
	await dialog.getByRole('button', { name: 'Render to WAV' }).click();

	const download = dialog.getByRole('link', { name: /Download \(\d+ KB\)/ });
	await expect(download).toBeVisible({ timeout: 15_000 });
	await expect(download).toHaveAttribute('href', /^blob:/);
	await expect(dialog.getByText(/0:00 \/ 0:0[3-4]/)).toBeVisible();
});
