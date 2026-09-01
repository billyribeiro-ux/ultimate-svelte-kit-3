import { expect, test } from '@playwright/test';
import { BOARD, OWNER, draw, newBoard, shape, signIn } from './helpers';

test.describe.configure({ timeout: 90_000 });

test.describe('comments', () => {
	test('posts a thread and resolves it', async ({ page }) => {
		await signIn(page, OWNER);

		/*
		 * Its own board, not the seeded one.
		 *
		 * Comments are board state, and the two Playwright projects share one
		 * server and one database. Posting to `demo-board` from desktop and then
		 * from mobile leaves two threads with identical text, and the assertion
		 * below stops meaning "my comment appeared" and starts meaning "strict
		 * mode found two of them" — a failure in the second project to run, in a
		 * test nobody changed.
		 */
		await newBoard(page);

		await page.getByRole('tab', { name: 'Comments' }).click();
		await page.getByPlaceholder('Leave a comment').fill('Is the queue really needed here?');
		await page.getByRole('button', { name: 'Post' }).first().click();

		const thread = page.getByText('Is the queue really needed here?');
		await expect(thread).toBeVisible({ timeout: 15_000 });

		await page.getByRole('button', { name: 'Resolve' }).first().click();
		await expect(page.getByText(/Resolved \(\d+\)/)).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('version history', () => {
	test('restores a board to a checkpoint', async ({ page }) => {
		await signIn(page, OWNER);
		await newBoard(page);

		await draw(page, 'n', { x: 140, y: 160 }, 'Before');

		// Name this moment.
		await page.getByRole('tab', { name: 'History' }).click();
		await page.getByPlaceholder('Save a checkpoint').fill('Just the one box');
		await page.getByRole('button', { name: 'Save a checkpoint' }).click();
		await expect(page.getByText(/Just the one box/)).toBeVisible({ timeout: 15_000 });

		// Draw something else, then put the board back.
		await draw(page, 's', { x: 300, y: 300 }, 'After');
		await expect(shape(page, 'After')).toBeVisible();

		await page.getByRole('tab', { name: 'History' }).click();
		await page.getByRole('button', { name: 'Restore this version' }).last().click();

		/*
		 * The restore is an ordinary batch of operations, so it arrives through the
		 * same stream as anybody else's edit and the board updates in place.
		 */
		await expect(shape(page, 'After')).toHaveCount(0, { timeout: 20_000 });
		await expect(shape(page, 'Before')).toBeVisible();

		/*
		 * And it survives a reload, which is the claim that matters: the restore is
		 * in the log, not just in this tab's memory.
		 *
		 * The generous timeout is because a reload of a board with no local snapshot
		 * yet replays the whole log from sequence zero — fast, but not instant, and
		 * a five-second default here fails on a loaded machine while the feature
		 * works perfectly.
		 */
		await page.reload();
		await page.getByRole('application').waitFor();
		await expect(shape(page, 'Before')).toBeVisible({ timeout: 20_000 });
		await expect(shape(page, 'After')).toHaveCount(0);
	});
});

test.describe('the embeddable viewer', () => {
	test('renders the board inside a custom element', async ({ page }) => {
		await signIn(page, OWNER);
		await page.goto(`/embed/${BOARD}`);

		/*
		 * Reaching into the shadow root on purpose.
		 *
		 * Playwright pierces open shadow roots, so this asserts the element really
		 * did define itself, attach a shadow root and render — rather than that a
		 * `<tessera-board>` tag exists, which an unknown element would also satisfy.
		 */
		const svg = page.locator('tessera-board svg');
		await expect(svg).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('tessera-board text', { hasText: 'API gateway' })).toBeVisible();
	});
});
