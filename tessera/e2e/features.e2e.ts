import { expect, test, type Page } from '@playwright/test';
import * as v from 'valibot';
import { BOARD, OWNER, VIEWER, VIEWER_BOARD, draw, newBoard, shape, signIn } from './helpers';

/** The JSON body of a remote command: its argument, devalue-encoded, then base64url. */
const CommandBody = v.looseObject({ payload: v.string() });

/** The owner starts a thread on a board of their own, and returns the board's URL. */
async function postThread(page: Page, text: string): Promise<string> {
	await signIn(page, OWNER);
	const url = await newBoard(page);

	await page.getByRole('tab', { name: 'Comments' }).click();
	await page.getByPlaceholder('Leave a comment').fill(text);
	await page.getByRole('button', { name: 'Post' }).first().click();
	await page.getByText(text).waitFor();

	return url;
}

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

	test('tells a viewer, in the server’s words, why they cannot resolve one', async ({
		browser
	}) => {
		// Two contexts, two cookie jars: the owner starts the thread, the viewer tries.
		const owner = await browser.newContext();
		const viewer = await browser.newContext();

		try {
			const ownerPage = await owner.newPage();
			await signIn(ownerPage, OWNER);
			const url = await newBoard(ownerPage);

			await ownerPage.getByRole('tab', { name: 'Comments' }).click();
			await ownerPage.getByPlaceholder('Leave a comment').fill('Can a viewer resolve this?');
			await ownerPage.getByRole('button', { name: 'Post' }).first().click();
			await ownerPage.getByText('Can a viewer resolve this?').waitFor();

			const viewerPage = await viewer.newPage();
			await signIn(viewerPage, VIEWER);
			await viewerPage.goto(url);
			await viewerPage.getByRole('tab', { name: 'Comments' }).click();

			/*
			 * `resolveThread` answers 403, and the awaited command rejects with an
			 * `HttpError` whose text is `body.message` — it has no `message` of its
			 * own. Before the catch in `Comments.svelte` that rejection went nowhere,
			 * and pressing the button did nothing anybody could see.
			 */
			await viewerPage.getByRole('button', { name: 'Resolve' }).click();
			await expect(
				viewerPage.getByRole('region', { name: 'Comments' }).getByRole('alert')
			).toHaveText('You have view-only access to this board.');
		} finally {
			await owner.close();
			await viewer.close();
		}
	});

	test('tells a viewer who posts why not, and leaves the board where it was', async ({
		browser
	}) => {
		const owner = await browser.newContext();
		const viewer = await browser.newContext();

		try {
			const url = await postThread(await owner.newPage(), 'Comments are for commenters');

			const viewerPage = await viewer.newPage();
			await signIn(viewerPage, VIEWER);
			await viewerPage.goto(url);
			await viewerPage.getByRole('tab', { name: 'Comments' }).click();

			/*
			 * `postComment` answers 403, the same as Resolve. Without `enhance` a
			 * refused form renders the nearest `+error.svelte`, which for a board
			 * that resets its layout is the root error page — the whole editor gone,
			 * to report that one comment could not be posted.
			 */
			await viewerPage.getByPlaceholder('Leave a comment').fill('May I?');
			await viewerPage.getByRole('button', { name: 'Post' }).first().click();

			await expect(
				viewerPage.getByRole('region', { name: 'Comments' }).getByRole('alert')
			).toHaveText('You have view-only access to this board.');
			await expect(viewerPage.getByRole('application')).toBeVisible();
			await expect(viewerPage.getByPlaceholder('Leave a comment')).toHaveValue('May I?');
		} finally {
			await owner.close();
			await viewer.close();
		}
	});

	test('will not let a viewer resolve a thread by naming a board of their own', async ({
		browser
	}) => {
		const owner = await browser.newContext();
		const viewer = await browser.newContext();

		try {
			const ownerPage = await owner.newPage();
			const text = 'Only somebody who may comment here can resolve this';
			const url = await postThread(ownerPage, text);
			const board = JSON.stringify(url.slice(url.lastIndexOf('/') + 1));

			const viewerPage = await viewer.newPage();
			await signIn(viewerPage, VIEWER);
			await viewerPage.goto(url);
			await viewerPage.getByRole('tab', { name: 'Comments' }).click();

			/*
			 * The forgery, done the way anybody with devtools could do it: press the
			 * real button, and on the way out swap the command's `boardId` for a
			 * board the viewer owns. The access check then asks about *that* board,
			 * and passes. Before the fix, the update that followed matched the thread
			 * on its id alone and resolved it here, on a board where this person can
			 * only look.
			 */
			let forged = false;
			await viewerPage.route('**/_app/remote/*/resolveThread', async (route) => {
				const sent = v.parse(CommandBody, JSON.parse(route.request().postData() ?? ''));
				const argument = Buffer.from(sent.payload, 'base64url').toString('utf8');
				forged = argument.includes(board);

				const swapped = argument.replace(board, JSON.stringify(VIEWER_BOARD));
				const payload = Buffer.from(swapped, 'utf8').toString('base64url');
				await route.continue({ postData: JSON.stringify({ ...sent, payload }) });
			});

			await viewerPage.getByRole('button', { name: 'Resolve' }).click();

			await expect(
				viewerPage.getByRole('region', { name: 'Comments' }).getByRole('alert')
			).toHaveText('No such thread.');
			expect(forged).toBe(true);

			// And the owner, reloading, still has an open thread and nothing resolved.
			await ownerPage.reload();
			await ownerPage.getByRole('tab', { name: 'Comments' }).click();
			await expect(ownerPage.getByText(text)).toBeVisible();
			await expect(ownerPage.getByText(/Resolved \(\d+\)/)).toHaveCount(0);
		} finally {
			await owner.close();
			await viewer.close();
		}
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

test.describe('the language switcher', () => {
	test('shows the same page in another language, and back', async ({ page }) => {
		await signIn(page, OWNER);

		/*
		 * Links, not a `<select>` that navigates on change, so nothing happens until
		 * a language is actually chosen — and the same page comes back, not the
		 * home page.
		 */
		await page.locator('summary', { hasText: 'English' }).click();
		await page.getByRole('link', { name: 'Français' }).click();

		await expect(page).toHaveURL('/fr/boards');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tableaux');

		await page.locator('summary', { hasText: 'Français' }).click();
		await page.getByRole('link', { name: 'English' }).click();

		await expect(page).toHaveURL('/boards');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Boards');
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

	test('reads its strings from the catalogue with no provider above it', async ({ page }) => {
		await signIn(page, OWNER);
		await page.goto(`/embed/${BOARD}`);

		/*
		 * The `has` half of `createContext`.
		 *
		 * A custom element is its own Svelte root: nothing of ours is above it, so
		 * the strict accessor would throw during initialisation and the element
		 * would render nothing at all. `useMessages()` asks whether a catalogue was
		 * provided before reading one, and falls back to English when it was not.
		 *
		 * Asserting the `aria-label` is what makes this a test of the accessor
		 * rather than of the markup: it is built by `t.embed.label(board)`, so it
		 * can only be right if the catalogue was reached.
		 */
		await expect(page.locator('tessera-board svg')).toHaveAttribute('aria-label', `Board ${BOARD}`);

		// And the element mounted at all — which it would not have done if reading
		// context had thrown.
		await expect(page.locator('tessera-board svg')).toBeVisible();
	});
});
