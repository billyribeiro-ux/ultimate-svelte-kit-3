import { expect, test } from '@playwright/test';
import { BOARD, OWNER, VIEWER, openBoard, signIn } from './helpers';

/**
 * A value in devalue's wire format — the one SvelteKit sends remote function
 * arguments in: a flat JSON array whose first entry is the value, with every
 * object and array holding the indexes of its children. This is the plain-data
 * subset, which is all an operation needs.
 */
function flatten(value: unknown): string {
	const entries: unknown[] = [];

	const add = (item: unknown): number => {
		const index = entries.push(null) - 1;
		entries[index] = Array.isArray(item)
			? item.map(add)
			: item !== null && typeof item === 'object'
				? Object.fromEntries(Object.entries(item).map(([key, child]) => [key, add(child)]))
				: item;
		return index;
	};

	add(value);
	return JSON.stringify(entries);
}

test.describe('a signed-out visitor', () => {
	test('opening a board link is sent to sign in, and then straight to the board', async ({
		page
	}) => {
		/*
		 * The board URL is the one pasted into chat, so it is the one most often
		 * opened without a session. It used to render "Something went wrong" with
		 * nothing to click: `openBoard` answered 401 inside the page's boundary.
		 */
		await page.goto(`/boards/${BOARD}`);
		await expect(page).toHaveURL(`/sign-in?from=${encodeURIComponent(`/boards/${BOARD}`)}`);

		await page.getByLabel('Email').fill(OWNER.email);
		await page.getByLabel('Password').fill(OWNER.password);
		await page.getByRole('button', { name: 'Sign in' }).click();

		await expect(page).toHaveURL(`/boards/${BOARD}`);
		await expect(page.getByRole('application')).toBeVisible();
	});
});

/**
 * The permission model, checked where it actually lives.
 *
 * Hiding the toolbar from a viewer is a courtesy. The test that matters is the
 * one that goes around the interface entirely and posts to the endpoint, because
 * that is what a collaborative editor's client can trivially be made to do — it
 * already ships the document model and the code that mutates it.
 */
test.describe('a viewer', () => {
	test('can open the board and read it', async ({ page }) => {
		await signIn(page, VIEWER);
		await openBoard(page);

		await expect(page.getByText('API gateway')).toBeVisible();
	});

	test('has the creation tools disabled', async ({ page }) => {
		await signIn(page, VIEWER);
		await openBoard(page);

		await expect(page.getByRole('button', { name: 'Service', exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeEnabled();
	});

	test('is refused by the server when the interface is bypassed', async ({ page }) => {
		await signIn(page, VIEWER);

		/*
		 * Where `pushOps` lives. A remote function is served at
		 * `/_app/remote/<hash of its file>/<export name>`, and the viewer's page
		 * calls `announcePresence` — from the same file — as soon as the board
		 * opens. Its URL, with the name swapped, is the real endpoint: the one a
		 * viewer with devtools open would find in the network panel.
		 */
		const presence = page.waitForRequest('**/_app/remote/*/announcePresence');
		await openBoard(page);
		const endpoint = (await presence).url().replace(/\/announcePresence$/, '/pushOps');

		const before = await page.locator('[data-node]').count();

		/*
		 * A well-formed operation, encoded the way the client encodes a command
		 * argument, and sent with the viewer's own session — `page.request` shares
		 * the page's cookies. The stamp has the 26-character shape the clock
		 * produces, so the schema accepts it and the request reaches the permission
		 * check, which is the thing under test: a 403, not a 400 for a malformed
		 * body, a 401 for a missing session or a 404 for a wrong URL.
		 */
		const stamp = `${String(Date.now()).padStart(13, '0')}00000zzzzzzzz`;
		const argument = {
			boardId: BOARD,
			actor: 'zzzzzzzz',
			ops: [{ kind: 'node.remove', stamp, target: stamp, observed: [] }]
		};

		const response = await page.request.fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: new URL(page.url()).origin },
			data: { payload: Buffer.from(flatten(argument)).toString('base64url'), refreshes: [] },
			failOnStatusCode: false
		});

		/*
		 * A remote function's failure travels in the body, as `{ type: 'error',
		 * error }` — the client turns it into the `HttpError` it rejects with — so
		 * the status to check is the one inside: the `App.Error`'s.
		 */
		expect(await response.json()).toMatchObject({
			type: 'error',
			error: { status: 403, message: 'You have view-only access to this board.' }
		});

		/*
		 * And the board is untouched.
		 *
		 * Asserted against the count taken a moment ago rather than against a
		 * literal seven. The suite shares one database, so an absolute count couples
		 * this test to whatever the collaboration tests happened to draw — a failure
		 * that says "expected 7, got 8" and means nothing.
		 */
		await page.reload();
		await page.getByRole('application').waitFor();
		await expect(page.locator('[data-node]')).toHaveCount(before);
	});
});
