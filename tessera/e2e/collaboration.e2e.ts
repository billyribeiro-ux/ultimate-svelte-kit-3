import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { OWNER, VIEWER, BOARD, draw, newBoard, openBoard, shape, signIn } from './helpers';

/**
 * TWO REPLICAS, ONE BOARD
 * =======================
 *
 * The test the whole project exists to pass.
 *
 * Two browser *contexts*, not two pages in one context. A context has its own
 * cookie jar, its own storage and its own IndexedDB — which is what makes these
 * genuinely separate replicas rather than two views of one. Two tabs in a single
 * context would share IndexedDB and quietly hide any bug in the local-first
 * layer.
 *
 * Each test works on a board it created, so nothing here can disturb the seeded
 * fixture the other suites read.
 */
/*
 * Ninety seconds, not the default thirty.
 *
 * These tests sign in twice, create a board, drive two multi-step drawing
 * gestures and then wait for one replica's work to reach the other. That is
 * legitimately slow, and when the default budget runs out mid-wait Playwright
 * reports whichever assertion was pending — so a timeout reads as "the other
 * replica never received it", which is the one conclusion it does not support.
 * The individual `toBeVisible` timeouts below are what actually bound the
 * propagation being tested.
 */
test.describe.configure({ timeout: 90_000 });

test.describe('two people on one board', () => {
	test('a shape drawn by one appears for the other', async ({ browser }) => {
		const alice = await browser.newContext();
		const bob = await browser.newContext();

		try {
			const alicePage = await context(alice, OWNER);
			const url = await newBoard(alicePage);

			const bobPage = await context(bob, OWNER);
			await bobPage.goto(url);
			await bobPage.getByRole('application').waitFor();

			await draw(alicePage, 'n', { x: 220, y: 220 }, 'Ledger');
			await expect(shape(alicePage, 'Ledger')).toBeVisible();

			// Bob's board is told by the stream, with no reload.
			await expect(shape(bobPage, 'Ledger')).toBeVisible({ timeout: 20_000 });
		} finally {
			await alice.close();
			await bob.close();
		}
	});

	test('concurrent edits from both replicas all survive', async ({ browser }) => {
		const alice = await browser.newContext();
		const bob = await browser.newContext();

		try {
			const alicePage = await context(alice, OWNER);
			const url = await newBoard(alicePage);

			const bobPage = await context(bob, OWNER);
			await bobPage.goto(url);
			await bobPage.getByRole('application').waitFor();

			/*
			 * Both draw at once, in different places.
			 *
			 * Neither edit is a last-write-wins loser, because they touch different
			 * elements — which is the property per-field operations buy and a
			 * whole-document save would destroy.
			 */
			/*
			 * Both positions have to fit the *narrowest* profile in the matrix. A
			 * Pixel 7 canvas is 412 points wide, so an x of 420 is off the edge — the
			 * click lands nowhere, nothing is drawn, and the failure reads as a sync
			 * bug on the other replica.
			 */
			await Promise.all([
				draw(alicePage, 'n', { x: 110, y: 140 }, 'Alpha'),
				draw(bobPage, 's', { x: 250, y: 300 }, 'Beta')
			]);

			for (const page of [alicePage, bobPage]) {
				await expect(shape(page, 'Alpha')).toBeVisible({ timeout: 20_000 });
				await expect(shape(page, 'Beta')).toBeVisible({ timeout: 20_000 });
			}
		} finally {
			await alice.close();
			await bob.close();
		}
	});

	test('shows the other person in the room', async ({ browser }) => {
		const alice = await browser.newContext();
		const bob = await browser.newContext();

		try {
			const alicePage = await context(alice, OWNER);
			await openBoard(alicePage);

			const bobPage = await context(bob, VIEWER);
			await bobPage.goto(`/boards/${BOARD}`);
			await bobPage.getByRole('application').waitFor();

			// Presence is announced on a heartbeat, so this is eventually-true rather
			// than immediately-true — which is the honest way to assert on it.
			await expect(alicePage.getByRole('button', { name: /Follow/ })).toBeVisible({
				timeout: 20_000
			});
		} finally {
			await alice.close();
			await bob.close();
		}
	});
});

async function context(browserContext: BrowserContext, who: typeof OWNER): Promise<Page> {
	const page = await browserContext.newPage();
	await signIn(page, who);
	return page;
}
