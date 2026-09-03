import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Stop } from '#lib/server/db/schema.ts';
import StopCard from './StopCard.svelte';

/**
 * The card is the itinerary's unit: a name that selects, an edit and a
 * remove button that exist only for editors, and the names of companions
 * looking at it. The stop is a plain object of the database row's shape —
 * the type import is erased at compile time, so a client test may name a
 * server type without pulling the server in.
 */
const stop: Stop = {
	id: '00000000-0000-4000-8000-0000000000aa',
	tripId: '00000000-0000-4000-8000-00000000d001',
	name: 'Alfama',
	kind: 'place',
	lng: -9.1308,
	lat: 38.7118,
	date: '2026-05-10',
	position: 0,
	notes: 'Go before the coaches.',
	placeId: null,
	createdBy: null,
	createdAt: new Date(0),
	updatedAt: new Date(0)
};

describe('StopCard', () => {
	it('selects on click and shows who is looking', async () => {
		const onselect = vi.fn();
		const screen = await render(StopCard, {
			stop,
			number: 1,
			selected: false,
			editable: false,
			lookers: ['Ben'],
			onselect
		});
		const name = screen.getByRole('button', { name: 'Alfama' });
		await expect.element(name).toHaveAttribute('aria-pressed', 'false');
		await name.click();
		expect(onselect).toHaveBeenCalledTimes(1);
		await expect.element(screen.getByText('Ben')).toBeVisible();
		await expect.element(screen.getByText('Go before the coaches.')).toBeVisible();
	});

	it('offers edit and remove only to editors', async () => {
		const viewer = await render(StopCard, {
			stop,
			number: 1,
			selected: true,
			editable: false,
			lookers: [],
			onselect: () => {}
		});
		expect(viewer.container.querySelectorAll('button')).toHaveLength(1);

		const onedit = vi.fn();
		const onremove = vi.fn();
		const editor = await render(StopCard, {
			stop,
			number: 1,
			selected: true,
			editable: true,
			lookers: [],
			onselect: () => {},
			onedit,
			onremove
		});
		await editor.getByRole('button', { name: 'Edit stop' }).click();
		await editor.getByRole('button', { name: 'Remove' }).click();
		expect(onedit).toHaveBeenCalledTimes(1);
		expect(onremove).toHaveBeenCalledTimes(1);
	});
});
