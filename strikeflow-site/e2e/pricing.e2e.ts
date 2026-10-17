/**
 * PRICING TOGGLE
 *
 * The billing toggle is announced as a radio group, so it has to behave like one
 * from the keyboard: the arrow keys move the selection. A pair of buttons with
 * `role="radio"` is announced the same way and does nothing when you press an
 * arrow — which is exactly the gap this test exists to catch.
 */

import { test, expect } from '@playwright/test';

test.describe('billing toggle', () => {
	test('the arrow keys switch from monthly to annual billing', async ({ page }) => {
		await page.goto('/pricing');

		const monthly = page.getByRole('radio', { name: 'Monthly' });
		const annual = page.getByRole('radio', { name: /^Annual/ });
		await expect(monthly).toBeChecked();

		await monthly.focus();
		await page.keyboard.press('ArrowRight');

		await expect(annual).toBeChecked();
		await expect(annual).toBeFocused();
		// The selection reaches the prices, not just the toggle.
		await expect(page.getByText(/Billed annually at/).first()).toBeVisible();
	});
});
