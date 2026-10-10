import { expect, test } from '@playwright/test';
import { OWNER, SEEDED, openBoard, shape, signIn } from './helpers';

test.describe('a board', () => {
	test('renders the seeded diagram', async ({ page }) => {
		await signIn(page, OWNER);
		await openBoard(page);

		/*
		 * Named shapes, not a count.
		 *
		 * The suite shares one database, so a count couples this test to whatever
		 * the collaboration tests happened to draw before it — a failure that reads
		 * "expected 7, received 8" and means nothing. What is actually being checked
		 * is that operations seeded through the real pipeline reconstruct the real
		 * diagram, and that is what these assertions say.
		 */
		for (const label of SEEDED) {
			await expect(shape(page, label)).toBeVisible();
		}

		await expect(page.locator('[data-edge]')).toHaveCount(5);
	});

	test('says that changes are saved', async ({ page }) => {
		await signIn(page, OWNER);
		await openBoard(page);

		await expect(page.getByRole('status').filter({ hasText: 'saved' })).toBeVisible({
			timeout: 15_000
		});
	});

	test('selects a shape and shows its properties', async ({ page }) => {
		await signIn(page, OWNER);
		await openBoard(page);

		await page.getByText('Orders').click();

		const inspector = page.getByRole('complementary', { name: 'Properties' });
		await expect(inspector.getByRole('heading', { name: 'Orders' })).toBeVisible();
	});

	test('lists every shape in the outline', async ({ page }) => {
		/*
		 * The outline is what makes `role="application"` on the canvas defensible:
		 * the same document, as a tree of real buttons that a screen reader can walk
		 * without the page intercepting its keys.
		 */
		await signIn(page, OWNER);
		await openBoard(page);

		await page.getByRole('tab', { name: 'Board outline' }).click();

		const tree = page.getByRole('tree', { name: 'Board outline' });

		// The outline is the *whole* document, including shapes the camera has
		// culled — which is exactly why it is the accessible equivalent of the
		// canvas rather than a summary of what happens to be on screen.
		for (const label of SEEDED) {
			await expect(tree.getByRole('button', { name: new RegExp(escape(label)) })).toBeVisible();
		}
	});

	test('survives a reload with the board intact', async ({ page }) => {
		await signIn(page, OWNER);
		await openBoard(page);

		const before = await page.locator('[data-node]').count();

		await page.reload();
		await page.getByRole('application').waitFor();

		await expect(page.locator('[data-node]')).toHaveCount(before);
	});

	test('that does not exist says so, in the server’s words', async ({ page }) => {
		await signIn(page, OWNER);
		await page.goto('/boards/no-such-board');

		/*
		 * The page boundary's `failed` snippet, showing what `openBoard` threw.
		 *
		 * `error(404, 'No such board.')` reaches the snippet as an `App.Error`, so
		 * the detail line is its `message`. Two things used to keep it off the
		 * screen: the page read `board.current`, which never throws, so the
		 * boundary never failed and the page stayed empty; and the snippet printed
		 * `String(error)`, which is "[object Object]".
		 */
		await expect(
			page.getByText('That board does not exist, or you do not have access to it.')
		).toBeVisible();
		await expect(page.getByText('No such board.', { exact: true })).toBeVisible();
	});
});

/** Escape a label for use inside a `RegExp`. Only `.` appears in the seeded set. */
function escape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
