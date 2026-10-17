import { expect, test } from '@playwright/test';

/**
 * THE LESSON PAGE
 * ===============
 *
 * Two three-by-three sheets: the hand-written engine on the left, nine
 * `$derived`s on the right. Edit one side and the other side must agree —
 * in every value, and in how many formulas each evaluated to get there.
 * That agreement is the lesson, so it is what the tests check.
 */

const evaluated = (n: number) => `Last edit evaluated ${n} formula cells.`;

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
	// B1, C1, B2, C2, A3, B3, C3 — on both sides, and not A2.
	await expect(engine.locator('p.hint')).toHaveText(evaluated(7));
	await expect(reactive.locator('p.hint')).toHaveText(evaluated(7));

	// Edit B2 on the reactive side.
	await reactive.getByLabel('B2').fill('=A1*3');
	await reactive.getByLabel('B2').press('Enter');
	// B2 and what reads it: C2, B3, C3.
	await expect(engine.locator('p.hint')).toHaveText(evaluated(4));
	await expect(reactive.locator('p.hint')).toHaveText(evaluated(4));

	await expect
		.poll(async () => {
			const now = await values();
			return (
				now.engine.map((s) => s.trim()).join('|') === now.reactive.map((s) => s.trim()).join('|')
			);
		})
		.toBe(true);
});

test('a cycle is a value on both sides, and breaking it brings both back', async ({ page }) => {
	await page.goto('/lesson');
	const engine = page.locator('.twin').nth(0);
	const reactive = page.locator('.twin').nth(1);
	const values = async () => ({
		engine: (await engine.locator('output').allTextContents()).map((s) => s.trim()),
		reactive: (await reactive.locator('output').allTextContents()).map((s) => s.trim())
	});
	const before = await values();

	// One edit sets both sides. Left to the runtime, the deriveds would call
	// each other until the stack ran out — and the page did not recover.
	await reactive.getByLabel('A1').fill('=C3');
	await reactive.getByLabel('A1').press('Enter');
	await expect(engine.locator('output').first()).toHaveText('#CYCLE!');
	await expect(reactive.locator('output').first()).toHaveText('#CYCLE!');
	// The six cells on the cycle are marked, not evaluated; A3 and B3 read it
	// from outside and are the two that are worked out.
	await expect(engine.locator('p.hint')).toHaveText(evaluated(2));
	await expect(reactive.locator('p.hint')).toHaveText(evaluated(2));
	// A2 reads nothing, and still shows its number on both sides.
	await expect(engine.locator('output').nth(3)).toHaveText('5');
	await expect(reactive.locator('output').nth(3)).toHaveText('5');
	const cyclic = await values();
	expect(cyclic.reactive).toEqual(cyclic.engine);

	// Break the cycle where it was made: every cell is what it was.
	await reactive.getByLabel('A1').fill('10');
	await reactive.getByLabel('A1').press('Enter');
	await expect.poll(values).toEqual(before);
	await expect(engine.locator('p.hint')).toHaveText(evaluated(7));
	await expect(reactive.locator('p.hint')).toHaveText(evaluated(7));
});

test('an edit that changes no value: the engine works anyway, the deriveds stop', async ({
	page
}) => {
	await page.goto('/lesson');
	const engine = page.locator('.twin').nth(0);
	const reactive = page.locator('.twin').nth(1);

	// Different text, the same number. The engine evaluates everything
	// downstream of an edited cell; Svelte compares A2's new value with its
	// old one, finds them equal, and wakes nothing.
	await reactive.getByLabel('A2').fill('5.0');
	await reactive.getByLabel('A2').press('Enter');
	await expect(engine.locator('p.hint')).toHaveText(evaluated(5));
	await expect(reactive.locator('p.hint')).toHaveText(evaluated(0));
	await expect(engine.locator('output').nth(3)).toHaveText('5');
	await expect(reactive.locator('output').nth(3)).toHaveText('5');
});
