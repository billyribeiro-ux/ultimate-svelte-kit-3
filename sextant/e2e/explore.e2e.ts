import { expect, test, type Page, type Route } from '@playwright/test';

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

/**
 * Wait until the page is live.
 *
 * The editor is in the server's HTML, so a test can type into it before the
 * JavaScript has arrived — and the underline, completion and Run are all
 * JavaScript. Only the client adds `view` to the address bar, so its arrival
 * is the proof that the page has hydrated and its effects have run.
 */
async function live(page: Page): Promise<void> {
	await expect(page).toHaveURL(/view=table/);
}

test.describe('with JavaScript off, so the screen is what the server sent', () => {
	test.use({ javaScriptEnabled: false });

	test('the first paint already has rows, from the server', async ({ page }) => {
		/*
		 * The point of putting the query in the URL rather than in a component.
		 *
		 * With JavaScript disabled there is no hydration at all, so anything visible
		 * was rendered on the server — which is the property that makes a pasted
		 * link useful, and the thing an empty shell that fetches after hydration
		 * cannot do. This test used to leave JavaScript on, and passed while the
		 * server sent a grid with no rows in it: the browser drew them.
		 */
		await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 20')}&range=-6h`);

		await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '20');
		await expect(page.getByRole('row').first()).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Query' })).toHaveValue('from logs | take 20');
	});
});

test('the query in the URL is the query in the editor', async ({ page }) => {
	const q = 'from logs | where level == "error" | take 5';
	await page.goto(`${DEMO}?q=${encodeURIComponent(q)}&range=-6h`);

	await expect(page.getByRole('combobox', { name: 'Query' })).toHaveValue(q);
});

test('a broken query is underlined and explained before it is run', async ({ page }) => {
	await page.goto(`${DEMO}?range=-6h`);
	await live(page);

	const editor = page.getByRole('combobox', { name: 'Query' });
	await editor.fill('from logs | where nosuchcolumn == 1');

	// The checker's own message, not a generic "invalid query". The whole reason
	// the editor calls the real checker is that it can say which column.
	await expect(page.getByText(/nosuchcolumn/i).first()).toBeVisible();
});

test('completion offers only what is legal where the caret is', async ({ page }) => {
	await page.goto(`${DEMO}?range=-6h`);
	await live(page);

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
	await live(page);

	await page.getByRole('combobox', { name: 'Query' }).fill('from logs | take 3');
	await page.getByRole('button', { name: 'Run', exact: false }).click();

	// The whole query, not a prefix of it: the page writes the default `from logs`
	// out by itself once it is live, so `q=from+logs` alone passed before anything
	// had been typed.
	await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'from logs | take 3');
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
 * and on a stopped clock neither ever comes, so a drawer whose opening waits on
 * either would never paint. A millisecond a step lets those through and keeps
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

/**
 * A QUERY THE SERVER REFUSES
 * ==========================
 *
 * The claim in `+page.svelte` is that a refused query — a 400 from the checker
 * is the common case — is explained in the results area, by its boundary's
 * `failed` snippet, with the editor left where it was to fix the query in.
 *
 * It used to take the whole page down instead. The values derived from the
 * result were declared in the script, a `$derived` that throws reports to the
 * boundary of the component that declared it, and so the refusal went past the
 * results' boundary to SvelteKit's error page: a "400" heading, the server's
 * sentence under it, and no editor.
 */
test('a query the server refuses is explained where its results would be', async ({ page }) => {
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 5')}&range=-6h`);
	// Only the client adds `view`, so this is also the proof that the page is live.
	await expect(page).toHaveURL(/view=table/);

	const editor = page.getByRole('combobox', { name: 'Query' });
	const run = page.getByRole('button', { name: 'Run', exact: false });
	const results = page.getByRole('region', { name: 'Results' });

	await editor.fill('from logs | where');
	await run.click();

	// The parser's own sentence, as the server said it, where the rows would be.
	await expect(results.getByRole('alert')).toHaveText('Expected a value');
	await expect(editor).toHaveValue('from logs | where');

	// And the next query that works draws its rows in the same place.
	await editor.fill('from logs | take 3');
	await run.click();
	await expect(results.getByRole('grid')).toBeVisible();
	await expect(results.getByRole('alert')).toHaveCount(0);
});

/*
 * The same refusal, when the server renders the page: a link somebody shared,
 * a new tab, a reload. The query used to be awaited in the page's script, the
 * server waits for every such `await` before it renders anything, and so the
 * refusal failed the render as a whole and came back as SvelteKit's error page.
 *
 * The response is still a 400, and should be: the request asked for a query
 * the server refuses, and SvelteKit answers with the status of an error that a
 * boundary caught while it rendered. What changed is the page that comes with
 * it, so these tests look at the page. A status cannot tell SvelteKit's error
 * page from this one, and the first test turns JavaScript off so that the
 * page it looks at is the one the server sent, not one the browser repaired —
 * down to the editor, with the query in it, ready to be fixed.
 */
test.describe('with JavaScript off, so the screen is what the server sent', () => {
	test.use({ javaScriptEnabled: false });

	test('a link to a query the server refuses is the explore page, saying why', async ({ page }) => {
		const response = await page.goto(
			`${DEMO}?q=${encodeURIComponent('from logs | where')}&range=-6h`
		);
		expect(response?.status()).toBe(400);

		const results = page.getByRole('region', { name: 'Results' });
		await expect(results.getByRole('alert')).toHaveText('Expected a value');
		await expect(page.getByRole('combobox', { name: 'Query' })).toHaveValue('from logs | where');
	});
});

test('a link to a query the server refuses opens with the editor, and says why', async ({
	page
}) => {
	const response = await page.goto(
		`${DEMO}?q=${encodeURIComponent('from logs | where')}&range=-6h`
	);
	expect(response?.status()).toBe(400);

	const results = page.getByRole('region', { name: 'Results' });
	await expect(results.getByRole('alert')).toHaveText('Expected a value');
	await expect(page.getByRole('combobox', { name: 'Query' })).toHaveValue('from logs | where');
});

test('a refused query is still explained after a reload', async ({ page }) => {
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 5')}&range=-6h`);
	await expect(page).toHaveURL(/view=table/);

	const editor = page.getByRole('combobox', { name: 'Query' });
	const results = page.getByRole('region', { name: 'Results' });

	await editor.fill('from logs | where');
	await page.getByRole('button', { name: 'Run', exact: false }).click();
	await expect(results.getByRole('alert')).toHaveText('Expected a value');

	// The run is in the address bar now, so a reload asks the server for it.
	await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'from logs | where');

	const response = await page.reload();
	expect(response?.status()).toBe(400);
	await expect(results.getByRole('alert')).toHaveText('Expected a value');
	await expect(editor).toHaveValue('from logs | where');
});

/**
 * Make every query fail as a dropped connection would, until the returned
 * function puts the network back.
 */
async function cut(page: Page): Promise<() => Promise<void>> {
	const remote = (url: URL) => url.pathname.includes('/remote/');
	const drop = (route: Route) => route.abort('internetdisconnected');
	await page.route(remote, drop);
	return () => page.unroute(remote, drop);
}

/*
 * "Try again" runs the query on screen again, in an area of its own, and the
 * focus goes where the answer is. The button that was pressed does not survive
 * its answer — the area it sits in is replaced — so without somewhere to go, a
 * keyboard user ended every try on the page body.
 *
 * Pressed with the keyboard, because that is who the focus is for. The first
 * test holds the request to look at the screen while it waits; its refusal
 * comes back the same, so it proves the asking and the waiting, and where the
 * focus lands. The second is the case the button exists for: a connection that
 * dropped and came back.
 */
test('"Try again" asks again, keeps the refusal up until it answers, and keeps the keyboard there', async ({
	page
}) => {
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | where')}&range=-6h`);
	await live(page);

	const results = page.getByRole('region', { name: 'Results' });
	const status = page.getByRole('status').filter({ hasText: 'Running…' });
	await expect(results.getByRole('alert')).toHaveText('Expected a value');

	const release = await hold(page, (url) => url.pathname.includes('/remote/'));
	const asked = page.waitForRequest((request) => request.url().includes('/remote/'));
	await results.getByRole('button', { name: 'Try again' }).focus();
	await page.keyboard.press('Enter');
	await asked;

	await expect(status).toHaveCount(1);
	await expect(results).toHaveAttribute('aria-busy', 'true');
	await expect(results.getByRole('alert')).toHaveText('Expected a value');
	await expect(results.getByRole('button', { name: 'Try again' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);

	release();
	await expect(status).toHaveCount(0);
	await expect(results.getByRole('alert')).toHaveText('Expected a value');
	await expect(results.getByRole('button', { name: 'Try again' })).toBeFocused();
	await expect(results.getByRole('button', { name: 'Try again' })).toHaveAttribute(
		'aria-disabled',
		'false'
	);
});

test('a run lost to a dropped connection says so, and "Try again" draws its rows', async ({
	page
}) => {
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 5')}&range=-6h`);
	await live(page);

	const results = page.getByRole('region', { name: 'Results' });
	const restore = await cut(page);
	await page.getByRole('combobox', { name: 'Query' }).fill('from logs | take 2');
	await page.getByRole('button', { name: 'Run', exact: false }).click();

	// The client's `handleError`, not SvelteKit's "Internal Error": the server
	// never heard the request, and the sentence says what to do about it.
	await expect(results.getByRole('alert')).toHaveText(
		'Sextant could not be reached. Check your connection, then try again.'
	);

	await restore();
	await results.getByRole('button', { name: 'Try again' }).focus();
	await page.keyboard.press('Enter');

	await expect(results.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
	await expect(results.getByRole('alert')).toHaveCount(0);
	await expect(results).toBeFocused();
});

/*
 * Run asks the server even when the query on screen is the one in the editor.
 * A range like `-6h` means something new every minute, and a Run that sent
 * nothing could neither show it nor recover an area that failed for a passing
 * reason. The request is held, so the test can see the page say it is running.
 */
test('Run asks the server again for the query already on screen, and says it is running', async ({
	page
}) => {
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 5')}&range=-6h`);
	await live(page);

	const results = page.getByRole('region', { name: 'Results' });
	const status = page.getByRole('status').filter({ hasText: 'Running…' });
	await expect(results.getByRole('grid')).toHaveAttribute('aria-rowcount', '5');
	await expect(status).toHaveCount(0);

	const release = await hold(page, (url) => url.pathname.includes('/remote/'));
	const asked = page.waitForRequest((request) => request.url().includes('/remote/'));
	await page.getByRole('button', { name: 'Run', exact: false }).click();
	await asked;

	await expect(status).toHaveCount(1);
	await expect(results).toHaveAttribute('aria-busy', 'true');
	// The rows on screen stay up while the new ones are on their way.
	await expect(results.getByRole('grid')).toHaveAttribute('aria-rowcount', '5');

	release();
	await expect(status).toHaveCount(0);
	await expect(results).toHaveAttribute('aria-busy', 'false');
	await expect(results.getByRole('grid')).toHaveAttribute('aria-rowcount', '5');
});

/*
 * Two runs in flight at once, both answers held and then let go together.
 *
 * The results area is keyed on what a run asked for. Keyed on the query object
 * instead, which is a new object at every call, this froze the tab: each run
 * still waiting read the key again, found a new one, and started over.
 */
test('two runs in flight at once end on the answer to the second', async ({ page }) => {
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | take 5')}&range=-6h`);
	await expect(page).toHaveURL(/view=table/);

	const editor = page.getByRole('combobox', { name: 'Query' });
	const run = page.getByRole('button', { name: 'Run', exact: false });
	const results = page.getByRole('region', { name: 'Results' });

	const release = await hold(page, (url) => url.pathname.includes('/remote/'));
	await editor.fill('from logs | where');
	await run.click();
	await editor.fill('from logs | take 2');
	await run.click();
	release();

	await expect(results.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
	await expect(results.getByRole('alert')).toHaveCount(0);
});

test('a tail the server refuses says why', async ({ page }) => {
	await page.goto(`${DEMO}?q=${encodeURIComponent('from logs | summarize n = count()')}&range=-6h`);
	await expect(page).toHaveURL(/view=table/);

	await page.getByRole('button', { name: 'Live tail' }).click();

	/*
	 * The endpoint's own sentence, which reaches the tail only because its
	 * request accepts JSON as well as a stream. Asking for the stream alone, it
	 * got SvelteKit's HTML error page and said "The tail could not start (400)."
	 */
	await expect(page.getByRole('status').filter({ hasText: 'Stopped' })).toContainText(
		'A tail cannot summarize. Remove the summarize, or use the chart instead.'
	);
});
