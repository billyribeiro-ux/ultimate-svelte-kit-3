import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import DateField from './DateField.svelte';
import DateRangeField from './DateRangeField.svelte';

/**
 * THE DATE FIELDS, THROUGH THE REAL LIBRARY
 * =========================================
 *
 * `date-segments.spec.ts` tests the function that rewrites what Bits UI
 * says about a segment, fed the props Bits computes as a hand-written stub.
 * This renders the two fields themselves, with Bits doing the computing,
 * on a German and a Brazilian page — so if a Bits release renames or
 * translates the English it writes ("Empty", "day, ", "Previous"), the
 * stub would still pass and these would not.
 *
 * The page's language is Paraglide's `getLocale()`, which on a real page
 * reads the URL; here it is overwritten for each test and put back after.
 */
const pageLocale = getLocale;
afterEach(() => overwriteGetLocale(pageLocale));

const segment = (container: HTMLElement, part: string) => {
	const element = container.querySelector<HTMLElement>(`[data-segment="${part}"]`);
	expect(element, `a ${part} segment`).not.toBeNull();
	return element!;
};

describe('DateField', () => {
	it('names an empty German segment in German, and marks it empty', async () => {
		overwriteGetLocale(() => 'de');
		const screen = await render(DateField, { label: 'Datum', name: 'date' });
		const day = segment(screen.container, 'day');

		expect(day.getAttribute('role')).toBe('spinbutton');
		expect(day.getAttribute('aria-label')).toBe('Tag, ');
		expect(day.getAttribute('aria-valuetext')).toBe('Leer');
		expect(day.hasAttribute('data-empty')).toBe(true);
	});

	it('stops calling a segment empty once something is typed in it', async () => {
		overwriteGetLocale(() => 'de');
		const screen = await render(DateField, { label: 'Datum', name: 'date' });
		const day = segment(screen.container, 'day');

		await userEvent.click(day);
		await userEvent.keyboard('3');
		await expect.element(day).not.toHaveAttribute('data-empty');
		expect(day.getAttribute('aria-valuetext')).toBe('3');
	});

	it('points every segment at the issue under the field', async () => {
		overwriteGetLocale(() => 'de');
		const screen = await render(DateField, {
			label: 'Datum',
			name: 'date',
			issues: [{ message: 'Wähle ein Datum' }]
		});
		const day = segment(screen.container, 'day');

		expect(day.getAttribute('aria-invalid')).toBe('true');
		const issue = document.getElementById(day.getAttribute('aria-describedby') ?? '');
		expect(issue?.textContent).toBe('Wähle ein Datum');
	});

	it('names the calendar after the field, and its month buttons in German', async () => {
		overwriteGetLocale(() => 'de');
		const screen = await render(DateField, { label: 'Datum', name: 'date', near: '2026-10-10' });

		await screen.getByRole('button', { name: 'Datum' }).click();
		await expect.element(screen.getByRole('button', { name: 'Vorheriger Monat' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Nächster Monat' })).toBeVisible();
		// Bits' default name for the calendar is "Event"; it is the field's label, then the month.
		const calendar = document.querySelector('[role="application"]');
		expect(calendar?.getAttribute('aria-label')).toMatch(/^Datum /);
	});
});

describe('DateRangeField', () => {
	it('names both ends’ segments in the page’s language', async () => {
		overwriteGetLocale(() => 'pt-br');
		const screen = await render(DateRangeField, {
			label: 'Datas',
			startName: 'startDate',
			endName: 'endDate'
		});
		const months = screen.container.querySelectorAll<HTMLElement>('[data-segment="month"]');

		expect(months).toHaveLength(2);
		for (const month of months) {
			expect(month.getAttribute('aria-label')).toBe('mês, ');
			expect(month.getAttribute('aria-valuetext')).toBe('Vazio');
			expect(month.hasAttribute('data-empty')).toBe(true);
		}
	});
});
