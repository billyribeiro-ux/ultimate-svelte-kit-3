import { expect, test, type Page } from '@playwright/test';
import { signIn, TRIPS, USERS } from './helpers.ts';

/**
 * THE MAP'S OWN BEHAVIOUR
 * =======================
 *
 * Three things the map does that a picture of it cannot show, each of
 * which shipped broken once:
 *
 *   - a pressed bubble or pin is not also a click on the map — for an
 *     editor a click on the map starts a new stop, and pressing a bubble
 *     opened the "New stop" dialog over the zoom it asked for;
 *   - choosing a stop moves the camera to it, and the camera stays there —
 *     the live query's next snapshot re-fitted the whole route under the
 *     flight;
 *   - the pins are where the map is — a frame that changed height as the
 *     map started left them 25px below the route on a phone.
 *
 * Ana owns "Iberia by rail", so she may edit, which is what makes a click
 * on the map mean something.
 */

/** Where each marker's centre is, by its label, on the screen. */
function markers(page: Page): Promise<Record<string, { x: number; y: number }>> {
	return page.evaluate(() =>
		Object.fromEntries(
			[...document.querySelectorAll('.maplibregl-marker')].map((marker) => {
				const box = marker.getBoundingClientRect();
				const label = (marker.textContent ?? '').trim().split(':')[0] ?? '';
				return [label, { x: box.x + box.width / 2, y: box.y + box.height / 2 }];
			})
		)
	);
}

/** Open the map and wait for it to have loaded and settled. */
async function openMap(page: Page, url: string): Promise<void> {
	await signIn(page, USERS.ana, url);
	await page.locator('.map[data-ready]').waitFor();
	// The route is framed as a cut; give the frame's measured height time to arrive and settle.
	await page.waitForTimeout(1000);
}

test('pressing a bubble or a pin is not a click on the map', async ({ page }) => {
	await openMap(page, `/t/${TRIPS.iberia}?tab=map`);
	const dialog = page.getByRole('dialog');

	// At the zoom that fits Lisbon to Barcelona, the Lisbon stops are one bubble.
	await page.locator('.maplibregl-marker:has(.pin--cluster)').first().click();
	await page.waitForTimeout(1000);
	await expect(dialog).toHaveCount(0);

	// The bubble zoomed in until its stops came apart; press one of them.
	await page.locator('.maplibregl-marker:has(.pin:not(.pin--cluster))').first().click();
	await page.waitForTimeout(500);
	await expect(dialog).toHaveCount(0);

	// And a click on the map itself still starts a stop there.
	const frame = await page.locator('.map').boundingBox();
	expect(frame).not.toBeNull();
	await page.mouse.click(frame!.x + 60, frame!.y + 60);
	await expect(dialog.getByRole('heading', { name: 'New stop' })).toBeVisible();
});

test('choosing a stop flies the camera to it, and it stays', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'the map beside the itinerary is a desktop’s');
	await openMap(page, `/t/${TRIPS.iberia}`);

	// Barcelona is a bubble at the edge of the fitted route; choosing one of its stops pulls it
	// out. (Not Madrid: it is near the middle of the route, so a re-fit would pass for a flight.)
	await page.getByRole('button', { name: 'Sagrada Família', exact: true }).click();
	const selected = page.locator('.maplibregl-marker:has(.pin--selected)');
	await expect(selected).toHaveCount(1);
	// The flight is 800ms; the heartbeat that choosing sends brings a new snapshot meanwhile.
	await page.waitForTimeout(2000);

	const pin = await selected.boundingBox();
	const frame = await page.locator('.map').boundingBox();
	expect(pin).not.toBeNull();
	expect(frame).not.toBeNull();
	const dx = pin!.x + pin!.width / 2 - (frame!.x + frame!.width / 2);
	const dy = pin!.y + pin!.height / 2 - (frame!.y + frame!.height / 2);
	expect(Math.abs(dx), 'the chosen pin is in the middle, across').toBeLessThan(24);
	expect(Math.abs(dy), 'the chosen pin is in the middle, down').toBeLessThan(24);
});

test('the pins are where the map is once it has settled', async ({ page }) => {
	await openMap(page, `/t/${TRIPS.iberia}?tab=map`);
	const settled = await markers(page);

	// A resize at rest makes MapLibre place every marker afresh. A pin that moves was out of place.
	const size = page.viewportSize()!;
	await page.setViewportSize({ width: size.width, height: size.height + 1 });
	await page.waitForTimeout(300);
	await page.setViewportSize(size);
	await page.waitForTimeout(800);
	const afresh = await markers(page);

	expect(Object.keys(afresh).sort()).toEqual(Object.keys(settled).sort());
	for (const [label, at] of Object.entries(settled)) {
		const now = afresh[label]!;
		expect(Math.hypot(now.x - at.x, now.y - at.y), `marker ${label} moved`).toBeLessThan(1.5);
	}
});
