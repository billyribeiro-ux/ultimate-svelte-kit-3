import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RouteThumb from './RouteThumb.svelte';

/**
 * A COMPONENT TEST IN A REAL BROWSER
 * ==================================
 *
 * `vitest-browser-svelte` mounts the component in the Chromium that Vitest's
 * browser project starts (see `vite.config.ts`), and `expect.element`
 * retries until the assertion holds — the same idea as Playwright's
 * `expect(locator)`, at component scale.
 */
describe('RouteThumb', () => {
	it('draws a circle per stop and one path through them', async () => {
		const screen = await render(RouteThumb, {
			points: [
				[-9.14, 38.72],
				[-8.63, 41.16],
				[-3.7, 40.42]
			],
			label: 'Iberia'
		});
		const svg = screen.getByRole('img', { name: 'Iberia' });
		await expect.element(svg).toBeVisible();
		expect(svg.element().querySelectorAll('circle')).toHaveLength(3);
		const d = svg.element().querySelector('path')?.getAttribute('d') ?? '';
		expect(d.startsWith('M')).toBe(true);
		expect(d.split(' ')).toHaveLength(3);
	});

	it('draws no route for a single stop', async () => {
		const screen = await render(RouteThumb, { points: [[139.69, 35.69]], label: 'Tokyo' });
		const svg = screen.getByRole('img', { name: 'Tokyo' });
		await expect.element(svg).toBeVisible();
		expect(svg.element().querySelectorAll('circle')).toHaveLength(1);
		expect(svg.element().querySelector('path')).toBeNull();
	});
});
