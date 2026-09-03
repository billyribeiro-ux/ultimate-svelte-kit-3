import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Leg from './Leg.svelte';

/**
 * The component the guides embed. It reads the gazetteer and the geodesy
 * library, so this test also proves the workspace package resolves from the
 * app in the browser build.
 */
describe('Leg', () => {
	it('names both places, the distance and the compass direction', async () => {
		const screen = await render(Leg, { from: 'lisbon', to: 'porto' });
		await expect.element(screen.getByText('Lisbon → Porto')).toBeVisible();
		// About 274 km, north by a whisker east.
		await expect.element(screen.getByText(/27\d km · N/)).toBeVisible();
	});

	it('refuses a place that is not in the gazetteer', async () => {
		await expect(render(Leg, { from: 'lisbon', to: 'atlantis' })).rejects.toThrow(/atlantis/);
	});
});
