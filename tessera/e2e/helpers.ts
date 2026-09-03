import { expect, type Page } from '@playwright/test';

export const OWNER = { email: 'ada@tessera.test', password: 'tessera-demo-2026' };
export const VIEWER = { email: 'mo@tessera.test', password: 'tessera-demo-2026' };

export const BOARD = 'demo-board';

/** Every shape `scripts/seed.ts` writes, by label. */
export const SEEDED = [
	'Web',
	'API gateway',
	'Orders',
	'order.events',
	'Postgres',
	'Email provider',
	'Double-click a shape to rename it'
] as const;

/**
 * Sign in through the real form.
 *
 * Not by writing a session cookie directly. Seeding a cookie is faster and skips
 * the one flow every single user takes; a suite that never signs in is a suite
 * that cannot tell you sign-in is broken.
 */
export async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/boards');
}

/** Open the seeded board and wait for the canvas to be ready for input. */
export async function openBoard(page: Page): Promise<void> {
	await page.goto(`/boards/${BOARD}`);
	await page.getByRole('application').waitFor();
	// The shapes arrive from IndexedDB or the stream; either way, wait for one.
	await page.locator('[data-node]').first().waitFor();
}

/**
 * A shape on the canvas, by its label.
 *
 * Scoped to `[data-node]` on purpose. The same words appear in the outline panel
 * and in the inspector heading, so a bare `getByText('Orders')` matches three
 * elements and fails Playwright's strict mode — which reads as "the board is
 * broken" and is in fact "the interface is doing its job three times".
 */
export function shape(page: Page, label: string) {
	return page.locator('[data-node]').filter({ hasText: label }).first();
}

/** Rename a shape in place, the way a person does: double-click, type, Enter. */
export async function rename(page: Page, from: string, to: string): Promise<void> {
	await shape(page, from).dblclick();
	const field = page.getByRole('textbox', { name: 'Label' });
	await field.waitFor();
	await field.fill(to);
	await page.keyboard.press('Enter');
}

/**
 * Create a fresh board and return its URL.
 *
 * Every test that *changes* a board gets its own, rather than sharing the seeded
 * one. Two Playwright projects run against a single server and a single
 * database, so a test that renames a seeded shape silently rewrites the fixture
 * the next project asserts against — a failure that appears in a file nobody
 * touched, in the project that happens to run second.
 */
export async function newBoard(page: Page): Promise<string> {
	await page.goto('/boards');
	await page.getByRole('button', { name: 'New board' }).click();
	await page.waitForURL(/\/boards\/[0-9a-f-]{36}$/);
	await page.getByRole('application').waitFor();
	return page.url();
}

/**
 * Drop a shape of the given tool on the canvas and name it.
 *
 * Ends by asserting the shape is on the page that drew it. That is not
 * redundant: without it, a failure to *create* and a failure to *sync* produce
 * the same message twenty seconds later in the calling test, and the two have
 * nothing to do with each other.
 */
export async function draw(page: Page, key: string, at: { x: number; y: number }, label: string) {
	const canvas = page.getByRole('application');

	await canvas.click({ position: at });
	await page.keyboard.press(key);
	await canvas.click({ position: at });

	const field = page.getByRole('textbox', { name: 'Label' });
	await field.waitFor();
	await page.keyboard.type(label);
	await page.keyboard.press('Enter');

	await expect(shape(page, label)).toBeVisible();
}
