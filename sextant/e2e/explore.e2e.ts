import { expect, test, type Page } from '@playwright/test';

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

/**
 * A URL WRITE THAT IS STILL SETTLING
 * ==================================
 *
 * The workspace writes the address bar 400ms after an edit settles, with a
 * shallow `goto` that replaces whichever entry is current when it fires. The
 * claim in `+page.svelte` is that the write only ever lands on this page's own
 * entry — never on the drawer's, never into a navigation in flight — and that
 * holding it back does not lose it.
 *
 * Under load the suite once caught it doing exactly that, in the middle of
 * "Open full page". The tests below hold that window open on purpose instead of
 * hoping to land in it. The page's clock is Playwright's, stopped once the page
 * has written its URL out — which is also the proof that it hydrated, because
 * only the client adds `view`. From then on no timer fires unless a test moves
 * the clock, so "a write is waiting" is a fact rather than a race. The edit that
 * sets one waiting is a zoom, because a zoom moves the range and leaves the
 * rows where they are.
 */
const WITH_TRACES = `${DEMO}?q=${encodeURIComponent(
	'from spans | where service == "checkout" | sort duration desc | take 30'
)}&range=-6h`;

/** The workspace's debounce, from `workspace.svelte.ts`. */
const SETTLE = 400;

/** The page's own idea of the time: Playwright's clock, once it is installed. */
async function clockOf(page: Page): Promise<number> {
	return page.evaluate(() => Date.now());
}

/** Load the explore page, stop its clock, and leave a write waiting. Returns when the wait began. */
async function aWriteIsWaiting(page: Page): Promise<number> {
	await page.clock.install();
	await page.goto(WITH_TRACES);
	await expect(page).toHaveURL(/view=table/);
	await page.clock.pauseAt(Date.now() + 1_000);

	await page.getByRole('button', { name: 'Zoom in' }).click();
	return clockOf(page);
}

/**
 * Open the first row's trace in the drawer, moving the stopped clock a
 * millisecond at a time.
 *
 * In async mode Svelte's `tick()` waits for a frame or a zero-length timeout,
 * and on a stopped clock neither ever comes, so the drawer would wait for its
 * data and then never paint. A millisecond a step lets those through and keeps
 * the clock nowhere near the debounce — which each test then checks.
 */
async function openTheDrawer(page: Page): Promise<void> {
	await page.getByRole('row').first().click();

	const dialog = page.getByRole('dialog');
	await expect
		.poll(
			async () => {
				await page.clock.runFor(1);
				return dialog.isVisible();
			},
			{ intervals: [50] }
		)
		.toBe(true);
}

/** Hold the requests `matches` picks out until the returned function is called. */
async function hold(page: Page, matches: (url: URL) => boolean): Promise<() => void> {
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route(matches, async (route) => {
		await held;
		await route.continue();
	});
	return release;
}

test('a write still settling does not follow "Open full page" to the trace', async ({ page }) => {
	const waitingSince = await aWriteIsWaiting(page);
	await openTheDrawer(page);

	// The full page's data is held, so its navigation is still in flight when the
	// clock moves past the debounce.
	const release = await hold(page, (url) => url.pathname.endsWith('/__data.json'));
	const requested = page.waitForRequest((request) => request.url().includes('/__data.json'));

	await page.getByRole('link', { name: 'Open full page' }).click();
	// The router lets the browser paint before it navigates — a frame, then a
	// zero-length timeout, both on the stopped clock.
	await page.clock.runFor(20);
	await requested;
	expect((await clockOf(page)) - waitingSince).toBeLessThan(SETTLE);

	/*
	 * Past the debounce, with the navigation waiting for its data.
	 *
	 * This is where the waiting write used to fire: a shallow `goto` that took
	 * the in-flight navigation over, so SvelteKit abandoned the one that was
	 * asked for and the explore URL stayed in the address bar.
	 */
	await page.clock.runFor(SETTLE * 2);
	release();
	await page.clock.resume();

	await expect(page.getByRole('tree', { name: 'Spans' })).toBeVisible();
	await expect(page).toHaveURL(/\/demo\/traces\//);
});

test('the drawer is not closed by a write meant for the page under it', async ({ page }) => {
	const waitingSince = await aWriteIsWaiting(page);
	await openTheDrawer(page);
	expect((await clockOf(page)) - waitingSince).toBeLessThan(SETTLE);

	// Before the fix, the write fired here: it replaced the drawer's entry with
	// the explore URL and an empty `page.state`, and the drawer closed itself
	// with nobody touching it.
	await page.clock.runFor(SETTLE * 2);
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page).toHaveURL(/\/demo\/traces\//);

	/*
	 * Closing the drawer hands the address bar back.
	 *
	 * The zoom was never written while the drawer was open, and it is not lost
	 * either: it is written now, to the entry it was meant for.
	 */
	await page.clock.resume();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).toHaveURL(/\/demo\/explore\?.*range=\d+\.\.\d+/);
});

test('no write, waiting or asked for, takes over a navigation to another page', async ({
	page
}) => {
	const waitingSince = await aWriteIsWaiting(page);

	/*
	 * A plain link this time, so no drawer stands in between.
	 *
	 * The list page loads no server data, so what keeps its navigation in flight
	 * is the page's own code: the route's chunk, which nothing on the explore
	 * page has needed until now.
	 */
	const release = await hold(page, (url) => url.pathname.startsWith('/_app/immutable/nodes/'));
	const requested = page.waitForRequest((request) =>
		request.url().includes('/_app/immutable/nodes/')
	);

	await page
		.getByRole('navigation', { name: 'Workspace' })
		.getByRole('link', { name: 'Traces' })
		.click();
	await page.clock.runFor(20);
	await requested;

	/*
	 * Two more things while the next page is still loading.
	 *
	 * The zoom goes through the page's effect, which sees the router busy and
	 * schedules nothing. Run is the one that does not wait for any effect: it
	 * flushes, straight into `#write`, and the guard there is all that stands
	 * between it and the navigation.
	 */
	await page.getByRole('button', { name: 'Zoom in' }).click();
	await page.getByRole('button', { name: 'Run', exact: false }).click();
	expect((await clockOf(page)) - waitingSince).toBeLessThan(SETTLE);

	await page.clock.runFor(SETTLE * 2);
	release();
	await page.clock.resume();

	await expect(page.getByRole('list', { name: 'Recent traces' })).toBeVisible();
	await expect(page).toHaveURL(/\/demo\/traces$/);
});

test('a write held back by a navigation to this same page is made once it lands', async ({
	page
}) => {
	const waitingSince = await aWriteIsWaiting(page);

	/*
	 * The header's own link to this page, with no query string.
	 *
	 * Its data is held, so the navigation is still in flight when the zoom would
	 * have been written, and the write is held back. The page stays mounted
	 * through a navigation to its own route, so this time the edit has somewhere
	 * to go once the router is idle.
	 */
	const release = await hold(page, (url) => url.pathname.endsWith('/__data.json'));
	const requested = page.waitForRequest((request) => request.url().includes('/__data.json'));

	await page
		.getByRole('navigation', { name: 'Workspace' })
		.getByRole('link', { name: 'Explore' })
		.click();
	await page.clock.runFor(20);
	await requested;
	expect((await clockOf(page)) - waitingSince).toBeLessThan(SETTLE);

	// Past the debounce, and nothing has been written: the router still has the
	// explore URL it is leaving in the address bar, without the zoom.
	await page.clock.runFor(SETTLE * 2);
	await expect(page).not.toHaveURL(/range=\d+\.\.\d+/);
	release();
	await page.clock.resume();

	/*
	 * The link said nothing about `q`, `range` or `view`, and the workspace keeps
	 * what it holds for a key the URL leaves out. So the zoom is still the range,
	 * and once the router is idle it is written to the entry the link made. A
	 * guard that only held the write back, with nothing to run the effect again,
	 * would leave the address bar bare for good while the page showed the zoom.
	 */
	await expect(page).toHaveURL(/\/demo\/explore\?.*range=\d+\.\.\d+.*view=table/);
});
