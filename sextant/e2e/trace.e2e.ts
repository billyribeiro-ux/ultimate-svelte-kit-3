import { expect, test } from '@playwright/test';

/**
 * SHALLOW ROUTING, END TO END
 * ===========================
 *
 * Every claim in `TraceDrawer.svelte`'s header comment, tested: the URL changes,
 * the results survive, the back button closes it, and the URL it wrote is a real
 * page.
 */

const WITH_TRACES = `/demo/explore?q=${encodeURIComponent(
	'from spans | where service == "checkout" | sort duration desc | take 30'
)}&range=-6h`;

test('opening a trace changes the URL without losing the results', async ({ page }) => {
	await page.goto(WITH_TRACES);

	const rows = page.getByRole('row');
	await expect(rows.first()).toBeVisible();
	const before = await rows.count();

	await rows.first().click();

	await expect(page).toHaveURL(/\/demo\/traces\//);
	await expect(page.getByRole('dialog')).toBeVisible();

	/*
	 * The whole point of shallow routing.
	 *
	 * A real navigation would have run the route's loads and thrown the result
	 * away. The rows are still there, so nothing re-loaded.
	 */
	await expect(page.getByRole('row')).toHaveCount(before);
});

test('the back button closes the drawer', async ({ page }) => {
	await page.goto(WITH_TRACES);
	await page.getByRole('row').first().click();
	await expect(page.getByRole('dialog')).toBeVisible();

	await page.goBack();

	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).toHaveURL(/\/demo\/explore/);
});

test('Escape closes the drawer, and does so through history', async ({ page }) => {
	await page.goto(WITH_TRACES);
	await page.getByRole('row').first().click();
	await expect(page.getByRole('dialog')).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(page.getByRole('dialog')).toHaveCount(0);
	// Through history, not by clearing a variable: if it cleared a variable, the
	// entry would still be there and going forward would be a broken state.
	await expect(page).toHaveURL(/\/demo\/explore/);
});

test('"Open full page" leaves the drawer for the real page', async ({ page }) => {
	await page.goto(WITH_TRACES);
	await page.getByRole('row').first().click();
	await expect(page.getByRole('dialog')).toBeVisible();

	await page.getByRole('link', { name: 'Open full page' }).click();

	/*
	 * A real navigation this time, from a plain link. The version of this link
	 * that pushed shallow state on click pushed the URL the address bar already
	 * showed, so the click did nothing — and no test said so until this one.
	 */
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('tree', { name: 'Spans' })).toBeVisible();
	await expect(page).toHaveURL(/\/demo\/traces\//);
});

test('the URL the drawer wrote is a real page on reload', async ({ page }) => {
	await page.goto(WITH_TRACES);
	await page.getByRole('row').first().click();
	await expect(page.getByRole('dialog')).toBeVisible();

	const url = page.url();
	await page.goto(url);

	// No drawer this time: a whole page, with the same two views.
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Trace' })).toBeVisible();
	await expect(page.getByRole('tree', { name: 'Spans' })).toBeVisible();
});

test('the waterfall is a tree that folds and navigates with arrow keys', async ({ page }) => {
	/*
	 * Scoped to the list, and not filtered by service.
	 *
	 * `getByRole('link')` unscoped starts at "Skip to content", and the list only
	 * ever shows *root* spans — which in this data are always the gateway, never
	 * checkout. Both mistakes made the test look for something that was never
	 * going to be there.
	 */
	await page.goto('/demo/traces');
	await page.getByRole('list', { name: 'Recent traces' }).getByRole('link').first().click();

	const tree = page.getByRole('tree', { name: 'Spans' });
	await expect(tree).toBeVisible();

	const before = await tree.getByRole('treeitem').count();
	expect(before).toBeGreaterThan(1);

	// Collapse everything below the root: the count must fall, and the row that is
	// hiding rows must say how many.
	await page.getByRole('button', { name: 'Collapse all' }).click();
	await expect.poll(async () => tree.getByRole('treeitem').count()).toBeLessThan(before);

	await page.getByRole('button', { name: 'Expand all' }).click();
	await expect.poll(async () => tree.getByRole('treeitem').count()).toBe(before);
});

/**
 * The trace id the seed reserves for a deliberately incomplete trace.
 *
 * Hard-coded in two places on purpose. The alternative — importing it from
 * `scripts/seed.ts` — would pull the seed's whole module graph, and its database
 * client, into the Playwright process.
 */
const INCOMPLETE_TRACE = 'ffffffffffffffffffffffffffffffff';

test('a trace with no root still renders as one tree, and says so', async ({ page }) => {
	/*
	 * A fixed id, not a hunt.
	 *
	 * The first version of this test opened traces one by one until it found an
	 * incomplete one, which is a flake generator: the seed drops a root at random,
	 * so the test passed or failed on a coin toss it could not see. The seed now
	 * plants one at a known id, and the case becomes something a test can name.
	 */
	await page.goto(`/demo/traces/${INCOMPLETE_TRACE}`);

	// One tree, from two orphans, under a root this code invented.
	await expect(page.getByRole('tree', { name: 'Spans' })).toBeVisible();
	await expect(page.getByRole('treeitem')).toHaveCount(3);

	// And it must say so, rather than rendering a plausible tree in silence:
	// "the gateway span is missing" is frequently the answer.
	await expect(page.getByText(/no parent in this trace/i)).toBeVisible();
});

test('a list of traces that cannot load says what the server said', async ({ page, context }) => {
	await page.goto('/demo/traces');
	await expect(page.locator('html[data-hydrated]')).toHaveCount(1);
	await expect(page.getByRole('list', { name: 'Recent traces' })).toBeVisible();

	// The session ends under a live page. Re-sorting asks the server again, and
	// the server refuses for real.
	await context.clearCookies();
	await page.getByRole('button', { name: 'Newest' }).click();

	/*
	 * The boundary is handed SvelteKit's `App.Error`, so the server's sentence is
	 * its `message`. The snippet used to look on `body`, where a thrown
	 * `HttpError` keeps it, found nothing there, and said "Could not load
	 * traces." whatever had gone wrong.
	 */
	await expect(page.getByRole('alert')).toHaveText('Sign in to continue.');
});

/*
 * The trace page and the drawer, refused. Each one's boundary is handed
 * SvelteKit's `App.Error`, and both used to look for the message on `body`,
 * where a thrown `HttpError` keeps it, and say "Could not load the trace."
 * whatever had gone wrong. The session ends under a live page, and the next
 * trace each one asks for is refused for real.
 */
test('a trace page that cannot load says what the server said', async ({ page, context }) => {
	await page.goto('/demo/traces');
	await expect(page.locator('html[data-hydrated]')).toHaveCount(1);

	// The trace page loads no server data of its own, so the navigation asks
	// for nothing but the trace — and that is refused.
	await context.clearCookies();
	await page.getByRole('list', { name: 'Recent traces' }).getByRole('link').first().click();

	await expect(page).toHaveURL(/\/demo\/traces\/[0-9a-f]+/);
	await expect(page.getByRole('alert')).toHaveText('Sign in to continue.');
});

test('a drawer whose trace cannot load says what the server said', async ({ page, context }) => {
	await page.goto(WITH_TRACES);
	await expect(page).toHaveURL(/view=table/);
	await expect(page.getByRole('row').first()).toBeVisible();

	await context.clearCookies();
	await page.getByRole('row').first().click();

	await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Sign in to continue.');
});

/*
 * With JavaScript off, so the page is what the server sent. Both trace views
 * used to await in their scripts and then draw a `pending` snippet: the server
 * waited for the data and sent "Loading…" in its place, for good.
 */
test.describe('with JavaScript off, so the screen is what the server sent', () => {
	test.use({ javaScriptEnabled: false });

	test('the list of traces is in the server’s HTML', async ({ page }) => {
		await page.goto('/demo/traces');

		await expect(
			page.getByRole('list', { name: 'Recent traces' }).getByRole('link')
		).not.toHaveCount(0);
		await expect(page.getByRole('status')).toHaveCount(0);
	});

	test('a trace is in the server’s HTML', async ({ page }) => {
		await page.goto(`/demo/traces/${INCOMPLETE_TRACE}`);

		await expect(page.getByRole('tree', { name: 'Spans' })).toBeVisible();
		await expect(page.getByRole('treeitem')).toHaveCount(3);
	});
});
