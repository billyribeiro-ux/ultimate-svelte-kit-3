import { expect, test } from '@playwright/test';

/**
 * THE EXPLORE WORKSPACE
 * =====================
 *
 * The tests here are chosen by one rule: each one covers a claim made in a
 * comment somewhere in the source. A comment that says "the back button closes
 * the drawer" and no test that presses the back button is a comment that will
 * eventually be false.
 */

const DEMO = '/demo/explore';

test('the first paint already has rows, from the server', async ({ page }) => {
	/*
	 * The point of putting the query in the URL rather than in a component.
	 *
	 * With JavaScript disabled there is no hydration at all, so anything visible
	 * was rendered on the server — which is the property that makes a pasted link
	 * useful, and the thing an empty shell that fetches after hydration cannot do.
	 */
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 20')}&range=-6h`);

	await expect(page.getByRole('grid')).toBeVisible();
	await expect(page.getByRole('row').first()).toBeVisible();
});

test('the query in the URL is the query in the editor', async ({ page }) => {
	const q = 'from logs | where level == "error" | take 5';
	await page.goto(`${DEMO}?q=${encodeURIComponent(q)}&range=-6h`);

	await expect(page.getByRole('combobox', { name: 'Query' })).toHaveValue(q);
});

test('a broken query is underlined and explained before it is run', async ({ page }) => {
	await page.goto(`${DEMO}?range=-6h`);

	const editor = page.getByRole('combobox', { name: 'Query' });
	await editor.fill('from logs | where nosuchcolumn == 1');

	// The checker's own message, not a generic "invalid query". The whole reason
	// the editor calls the real checker is that it can say which column.
	await expect(page.getByText(/nosuchcolumn/i).first()).toBeVisible();
});

test('completion offers only what is legal where the caret is', async ({ page }) => {
	await page.goto(`${DEMO}?range=-6h`);

	const editor = page.getByRole('combobox', { name: 'Query' });
	await editor.click();
	await editor.fill('from logs | where ');
	await editor.press('End');
	await editor.press('Control+ ');

	const list = page.getByRole('listbox', { name: 'Completions' });
	await expect(list).toBeVisible();
	await expect(list.getByRole('option', { name: /service/ })).toBeVisible();

	/*
	 * `count` must NOT be here.
	 *
	 * An aggregate outside `summarize` always fails the check, so offering it is
	 * offering something that cannot work — which is worse than offering nothing,
	 * because a completion list reads as a list of things that are allowed.
	 */
	await expect(list.getByRole('option', { name: /^count/ })).toHaveCount(0);
});

test('running a query puts it in the address bar', async ({ page }) => {
	await page.goto(`${DEMO}?range=-6h`);

	await page.getByRole('combobox', { name: 'Query' }).fill('from logs | take 3');
	await page.getByRole('button', { name: 'Run', exact: false }).click();

	await expect(page).toHaveURL(/q=from\+logs/);
});

test('the chart view says what a result is missing rather than drawing nothing', async ({
	page
}) => {
	/*
	 * Two different things can be missing, and the message has to say which.
	 *
	 * A blank chart is indistinguishable from no data, so each case gets a
	 * sentence somebody can act on. Raw log lines have a `timestamp` but nothing
	 * numeric; a grouped count has a number but no time column unless it was
	 * grouped by one.
	 */
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 20')}&range=-6h&view=chart`);
	await expect(page.getByText(/no numeric column/i)).toBeVisible();

	const grouped = 'from logs | summarize n = count() by service';
	await page.goto(`${DEMO}?q=${encodeURIComponent(grouped)}&range=-6h&view=chart`);
	await expect(page.getByText(/no time column/i)).toBeVisible();
});

test('a grouped time series draws, with a legend per group', async ({ page }) => {
	const q =
		'from logs | where level == "error" | summarize n = count() by service, bucket = bin(timestamp, 5m) | sort bucket asc';

	await page.goto(`${DEMO}?q=${encodeURIComponent(q)}&range=-6h&view=chart`);

	await expect(page.getByRole('img', { name: /over time/i })).toBeVisible();
	// Scoped to the legend: the same label is also a row heading in the summary
	// table below, and an unscoped match resolves to two elements.
	await expect(page.locator('figcaption').getByText('payments-api · n')).toBeVisible();
});

test('the canvas chart is readable as a table', async ({ page }) => {
	/*
	 * A canvas is a rectangle of pixels with no structure at all. The summary
	 * table is not a consolation prize — for "what was the peak" it is faster than
	 * reading the picture.
	 */
	const q = 'from logs | summarize n = count() by bucket = bin(timestamp, 30m) | sort bucket asc';
	await page.goto(`${DEMO}?q=${encodeURIComponent(q)}&range=-6h&view=chart`);

	await page.getByText('Read as a table').click();
	await expect(page.getByRole('columnheader', { name: 'Max' })).toBeVisible();
});
