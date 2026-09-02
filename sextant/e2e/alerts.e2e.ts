import { expect, test } from '@playwright/test';

/**
 * ALERT RULES
 * ===========
 *
 * The two things worth proving through the interface: a rule with a broken query
 * is refused at the moment it is typed, and a rule that has never run says so
 * rather than saying "ok".
 */

test('a rule with an unparseable query is refused', async ({ page }) => {
	await page.goto('/demo/alerts');
	await page.getByRole('button', { name: 'New rule' }).click();

	await page.getByLabel('Name').fill('Broken');
	await page.getByLabel('Query').fill('from logs | where');
	await page.getByRole('button', { name: 'Create rule' }).click();

	/*
	 * A rule whose query does not parse never fires — the evaluator reads null,
	 * the machine holds its state, and nothing happens ever again. That is the
	 * worst failure an alerting system has, and it is entirely preventable at the
	 * moment somebody types it.
	 */
	await expect(page.getByText('Broken')).toHaveCount(0);
});

test('a valid rule is created and listed with its thresholds', async ({ page }, testInfo) => {
	/*
	 * A name unique to this run, and removed at the end.
	 *
	 * The two viewport projects share one database and run in sequence, so a fixed
	 * name meant the second project created a duplicate and every locator resolved
	 * to two elements. A test that leaves rows behind is a test that only passes
	 * the first time.
	 */
	const name = `Search errors (${testInfo.project.name})`;

	await page.goto('/demo/alerts');
	await page.getByRole('button', { name: 'New rule' }).click();

	await page.getByLabel('Name').fill(name);
	await page
		.getByLabel('Query')
		.fill('from logs | where service == "search" and level == "error" | summarize n = count()');
	await page.getByLabel('Threshold').fill('5');
	await page.getByLabel('Clears at (optional)').fill('2');
	await page.getByRole('button', { name: 'Create rule' }).click();

	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row.getByRole('heading', { name })).toBeVisible();
	await expect(row.getByText('above 5')).toBeVisible();
	await expect(row.getByText('below 2')).toBeVisible();

	await row.getByRole('button', { name: 'Delete' }).click();
	await expect(row).toHaveCount(0);
});

test('a form reset keeps the direction the rule actually has', async ({ page }, testInfo) => {
	const name = `Traffic collapse (${testInfo.project.name})`;

	await page.goto('/demo/alerts');
	await page.getByRole('button', { name: 'New rule' }).click();

	await page.getByLabel('Name').fill(name);
	await page.getByLabel('Query').fill('from logs | summarize n = count()');
	await page.getByLabel('Fires when the value is').selectOption('below');
	await page.getByLabel('Threshold').fill('100');
	await page.getByRole('button', { name: 'Create rule' }).click();

	const row = page.getByRole('listitem').filter({ hasText: name });
	await expect(row.getByText('below 100')).toBeVisible();

	// Reopen it for editing: this is the form whose default matters, because the
	// rule it is editing fires *below* and the first option is `above`.
	await row.getByRole('button', { name: 'Edit' }).click();
	const direction = page.getByLabel('Fires when the value is');
	await expect(direction).toHaveValue('below');

	/*
	 * `fields.as('select', …)` sets the select's **value property**. It does not
	 * mark any option with the `selected` attribute, and that attribute —
	 * `defaultSelected` — is the only thing a form reset looks at. Without
	 * `defaultValue` on the select, every option's default is false, so a reset
	 * falls to the first one: editing a `below` rule and saving it leaves the
	 * control showing `above`, which is a different rule.
	 *
	 * A remote form resets itself after a successful submission, so this is not a
	 * hypothetical path — it is the path.
	 */
	await direction.evaluate((element) => {
		(element as HTMLSelectElement).form?.reset();
	});

	await expect(direction).toHaveValue('below');

	await row.getByRole('button', { name: 'Delete' }).click();
	await expect(row).toHaveCount(0);
});

test('a rule that has never been evaluated does not claim to be ok', async ({ page }) => {
	await page.goto('/demo/alerts');

	/*
	 * "Not yet evaluated" and "OK" are different facts, and showing the second for
	 * the first is the most dangerous thing this page could do: it says a safety
	 * net is in place when nothing has checked.
	 */
	const seeded = page.getByRole('heading', { name: 'Errors in the last five minutes' });
	await expect(seeded).toBeVisible();

	const states = await page.locator('.chip').allTextContents();
	expect(states.some((text) => /not yet evaluated|ok|firing|pending/i.test(text))).toBe(true);
});

test('a rule can be disabled from the list', async ({ page }) => {
	await page.goto('/demo/alerts');

	const toggle = page.getByRole('checkbox', { name: 'Enabled' }).first();
	await expect(toggle).toBeChecked();

	await toggle.uncheck();
	await page.reload();

	await expect(page.getByRole('checkbox', { name: 'Enabled' }).first()).not.toBeChecked();

	// Put it back, so the suite leaves the workspace as it found it.
	await page.getByRole('checkbox', { name: 'Enabled' }).first().check();
});
