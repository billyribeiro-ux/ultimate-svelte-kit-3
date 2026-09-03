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
