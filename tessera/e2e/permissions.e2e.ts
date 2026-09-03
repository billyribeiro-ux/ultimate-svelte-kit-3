import { expect, test } from '@playwright/test';
import { BOARD, VIEWER, openBoard, signIn } from './helpers';

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

	test('is refused by the server when the interface is bypassed', async ({ page, request }) => {
		await signIn(page, VIEWER);
		await openBoard(page);

		const before = await page.locator('[data-node]').count();

		/*
		 * A well-formed operation, posted directly to the remote endpoint with the
		 * viewer's own session cookies. The stamp is built to the same 26-character
		 * shape the clock produces, so this gets past validation and is refused by
		 * the permission check rather than by the schema — which is the thing under
		 * test.
		 */
		const stamp = `${String(Date.now()).padStart(13, '0')}00000zzzzzzzz`;

		const response = await request.fetch('/_app/remote/pushOps', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: new URL(page.url()).origin },
			data: {
				boardId: BOARD,
				actor: 'zzzzzzzz',
				ops: [{ kind: 'node.remove', stamp, target: stamp, observed: [] }]
			},
			failOnStatusCode: false
		});

		expect(response.ok()).toBe(false);
		expect([400, 403, 404]).toContain(response.status());

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
