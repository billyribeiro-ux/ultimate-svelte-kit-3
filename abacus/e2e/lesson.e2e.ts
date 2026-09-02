import { expect, test } from '@playwright/test';

/**
 * THE LESSON PAGE
 * ===============
 *
 * Two three-by-three sheets: the hand-written engine on the left, nine
 * `$derived`s on the right. Edit one side and the other side must agree —
 * that agreement is the lesson, so it is what the test checks.
 */

test('the engine and the deriveds agree after an edit on either side', async ({ page }) => {
	await page.goto('/lesson');
	const engine = page.locator('.twin').nth(0);
	const reactive = page.locator('.twin').nth(1);

	const values = async () => ({
		engine: await engine.locator('output').allTextContents(),
		reactive: await reactive.locator('output').allTextContents()
	});

	const before = await values();
	expect(before.engine).toHaveLength(9);
	expect(before.engine.map((s) => s.trim())).toEqual(before.reactive.map((s) => s.trim()));

	// Edit A1 on the engine's side.
	await engine.getByLabel('A1').fill('100');
	await engine.getByLabel('A1').press('Enter');
	await expect(engine.locator('output').nth(2)).not.toHaveText(before.engine[2]!.trim());
	await expect(engine.locator('p.hint')).toContainText('evaluated');

	// Edit B2 on the reactive side.
	await reactive.getByLabel('B2').fill('=A1*3');
	await reactive.getByLabel('B2').press('Enter');

	await expect
		.poll(async () => {
			const now = await values();
			return (
				now.engine.map((s) => s.trim()).join('|') === now.reactive.map((s) => s.trim()).join('|')
			);
		})
		.toBe(true);
});
