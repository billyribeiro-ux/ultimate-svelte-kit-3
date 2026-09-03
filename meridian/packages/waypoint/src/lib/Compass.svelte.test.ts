import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Compass from './Compass.svelte';
import Sparkline from './Sparkline.svelte';

describe('Compass', () => {
	it('names the nearest compass point for a screen reader', async () => {
		const screen = await render(Compass, { bearing: 92 });
		await expect.element(screen.getByRole('img', { name: '92 degrees, E' })).toBeVisible();
	});

	it('folds bearings into a turn', async () => {
		const screen = await render(Compass, { bearing: -45 });
		await expect.element(screen.getByRole('img', { name: '315 degrees, NW' })).toBeVisible();
	});
});

describe('Sparkline', () => {
	it('draws one path through every value', async () => {
		const screen = await render(Sparkline, { values: [1, 3, 2, 5], label: 'Spend per day' });
		const svg = screen.getByRole('img', { name: 'Spend per day' });
		await expect.element(svg).toBeVisible();
		const d = svg.element().querySelector('path')?.getAttribute('d') ?? '';
		expect(d.split(' ')).toHaveLength(4);
		expect(d.startsWith('M')).toBe(true);
	});

	it('draws nothing for fewer than two values', async () => {
		const screen = await render(Sparkline, { values: [7] });
		const svg = screen.getByRole('img', { name: 'Trend' });
		await expect.element(svg).toBeVisible();
		expect(svg.element().querySelector('path')).toBeNull();
	});
});
