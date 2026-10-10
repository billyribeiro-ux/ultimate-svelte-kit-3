/**
 * THE SCREENSHOT MATRIX
 * =====================
 *
 * A Playwright script, not a test: it signs in as the seed's Ana, walks every
 * screen in three viewports (Desktop Chrome at 1440×900, a Pixel 7, and a
 * 360px phone — the narrowest the type scale is tuned for) and two themes,
 * and writes a PNG per screen to `design/screens/<theme>/<device>/`.
 * It never asserts about pixels — a person looks at the pictures. What it
 * does check, and prints, are the two things a person is bad at checking by
 * eye:
 *
 *   1. OVERFLOW — on the phone, for every page: does the document scroll
 *      sideways, and which elements stick out past the right edge (the table
 *      wrapper, the tab strip and the two canvases are allowed to scroll
 *      inside themselves and are excluded).
 *   2. CONTRAST — the WCAG 2.x ratio of every text token on every surface
 *      tier, for both sides of each `light-dark()` in `tokens.css`, against
 *      the 4.5:1 floor for text and 3:1 for the focus ring.
 *
 * The theme is forced two ways, and both are needed: `meridian:theme` in
 * localStorage is what the boot script in `app.html` reads before the first
 * paint, and `emulateMedia({ colorScheme })` is what `light-dark()` reads
 * when nothing is stored. Set together, they agree.
 *
 * Run against the built server from `playwright.config.ts`:
 *
 *   node scripts/prepare-e2e-db.js && pnpm run build
 *   DATABASE_URL=file:e2e.db PUBLIC_ORIGIN=http://localhost:4173 \
 *     BETTER_AUTH_SECRET=e2e-only-secret-of-at-least-thirty-two-characters \
 *     PORT=4173 node build/index.js &
 *   node scripts/screens.ts
 *
 * Options: `--only=home,trips` to shoot a subset; `--device=phone|narrow|desktop`;
 * `--theme=light|dark`; `--skip-globe` when there is no WebGL to be had.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, type BrowserContextOptions, type Page } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'design', 'screens');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const EMAIL = 'ana@meridian.test';
const PASSWORD = 'meridian-demo-2026';

const args = new Map(
	process.argv.slice(2).map((arg) => {
		const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
		return [key, value] as const;
	})
);
const only = args.get('only')?.split(',');
const skipGlobe = args.has('skip-globe');

type Theme = 'light' | 'dark';
type Device = 'desktop' | 'phone' | 'narrow';

const THEMES: Theme[] = (args.get('theme')?.split(',') as Theme[] | undefined) ?? ['light', 'dark'];
const DEVICES: Device[] = (args.get('device')?.split(',') as Device[] | undefined) ?? [
	'desktop',
	'phone',
	'narrow'
];

const DEVICE_OPTIONS: Record<Device, BrowserContextOptions> = {
	desktop: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
	phone: { ...devices['Pixel 7'] },
	// A Pixel 7's touch and density at 360px: the width every `clamp()` in the type scale starts from.
	narrow: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } }
};

const isPhone = (device: Device) => device !== 'desktop';

/* ------------------------------------------------------------------ */
/* The screens                                                         */
/* ------------------------------------------------------------------ */

interface Screen {
	readonly name: string;
	readonly url: string;
	/** Needs Ana signed in. */
	readonly auth?: boolean;
	/** Capture the viewport, not the whole page (the trip tabs: a map does not scroll). */
	readonly viewport?: boolean;
	/** Something to do before the shot. */
	readonly act?: (page: Page, device: Device) => Promise<void>;
}

const TRIP = '/t/seediberia';

const SCREENS: Screen[] = [
	{ name: 'home', url: '/' },
	// A hundred places is a 9,000px page: Chromium's full-page capture repeats the sticky
	// chrome past its texture limit, so the long list is the viewport and the filtered one is the page.
	{ name: 'explore', url: '/explore', viewport: true },
	{
		name: 'explore-filtered',
		url: '/explore',
		act: async (page) => {
			await page.getByPlaceholder('Filter places').fill('Port');
			await page.getByText('5 places').waitFor();
		}
	},
	{ name: 'guides', url: '/guides' },
	{ name: 'guide', url: '/guides/lisbon-in-three-days' },
	{
		name: 'explore-none',
		url: '/explore',
		act: async (page) => {
			await page.getByPlaceholder('Filter places').fill('zzzz');
			await page.getByText('0 places').waitFor();
		}
	},
	{ name: 'signin', url: '/signin' },
	{
		name: 'signin-error',
		url: '/signin',
		act: async (page) => {
			await page.getByLabel('Email').fill('not-an-email');
			await page.getByRole('button', { name: 'Sign in' }).click();
			await page.locator('.issue').first().waitFor();
		}
	},
	{ name: 'signup', url: '/signup' },
	// Before signing in: a trip opened by its link, as somebody who is not on it.
	{ name: 'readonly-expenses', url: '/t/seedjapan2?tab=expenses' },
	{ name: 'embed', url: '/embed/seedjapan2' },
	{ name: 'trips', url: '/trips', auth: true },
	{ name: 'trip-new', url: '/trips/new', auth: true },
	{ name: 'trip-itinerary', url: TRIP, auth: true, viewport: true },
	{
		name: 'trip-itinerary-selected',
		url: TRIP,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.getByRole('button', { name: 'Alfama', exact: true }).click();
			await page.waitForTimeout(300);
		}
	},
	{
		name: 'stop-dialog',
		url: TRIP,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.getByRole('button', { name: 'Add a stop' }).first().click();
			await page.getByRole('dialog').getByRole('heading', { name: 'New stop' }).waitFor();
			await page.waitForTimeout(500);
			const focused = await page.evaluate(() => {
				const el = document.activeElement;
				return el
					? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}`
					: 'none';
			});
			console.log(`      focus on open: ${focused}`);
		}
	},
	{
		name: 'palette',
		url: TRIP,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.keyboard.press('ControlOrMeta+k');
			await page.getByRole('dialog').waitFor();
			await page.waitForTimeout(400);
		}
	},
	{
		name: 'trip-map',
		url: `${TRIP}?tab=map`,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.locator('canvas.maplibregl-canvas').waitFor();
			await page.waitForTimeout(1500);
		}
	},
	...(skipGlobe
		? []
		: [
				{
					name: 'trip-globe',
					url: `${TRIP}?tab=globe`,
					auth: true,
					viewport: true,
					act: async (page: Page) => {
						await page.locator('.globe canvas').waitFor({ timeout: 30_000 });
						await page.waitForTimeout(2500);
					}
				} satisfies Screen
			]),
	{ name: 'trip-expenses', url: `${TRIP}?tab=expenses`, auth: true },
	{ name: 'trip-notes', url: `${TRIP}?tab=notes`, auth: true },
	{ name: 'trip-companions', url: `${TRIP}?tab=companions`, auth: true },
	{ name: 'settings', url: `${TRIP}/settings`, auth: true },
	{
		// A success toast: "Saved" after saving the settings unchanged.
		name: 'toast',
		url: `${TRIP}/settings`,
		auth: true,
		viewport: true,
		act: async (page) => {
			await page.getByRole('button', { name: 'Save', exact: true }).click();
			await page.getByText('Saved', { exact: true }).waitFor();
			await page.waitForTimeout(450);
		}
	},
	{
		name: 'nav-open',
		url: '/explore',
		auth: true,
		viewport: true,
		act: async (page, device) => {
			if (!isPhone(device)) return;
			await page.locator('html[data-hydrated]').waitFor();
			await page.getByRole('button', { name: 'Menu' }).click();
			await page.waitForTimeout(400);
		}
	},
	{ name: '404', url: '/nowhere' },
	{ name: 'error-root', url: '/de/nowhere-at-all' }
];

/* ------------------------------------------------------------------ */
/* Overflow                                                            */
/* ------------------------------------------------------------------ */

interface Overflow {
	readonly scrollWidth: number;
	readonly clientWidth: number;
	readonly offenders: readonly string[];
}

async function overflow(page: Page): Promise<Overflow> {
	return page.evaluate(() => {
		const html = document.documentElement;
		const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
			.filter((el) => {
				const r = el.getBoundingClientRect();
				if (r.width === 0 || r.right <= innerWidth + 1) return false;
				const style = getComputedStyle(el);
				if (style.position === 'fixed' || style.visibility === 'hidden') return false;
				// The allowed scrollers, and whatever is inside them.
				return !el.closest(
					'.table-wrap, .tabs, .maplibregl-map, .globe, [data-sonner-toaster], .nav:not(.nav--open)'
				);
			})
			.slice(0, 8)
			.map((el) => {
				const r = el.getBoundingClientRect();
				return `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} right=${Math.round(r.right)}`;
			});
		return { scrollWidth: html.scrollWidth, clientWidth: html.clientWidth, offenders };
	});
}

/* ------------------------------------------------------------------ */
/* Contrast                                                            */
/* ------------------------------------------------------------------ */

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb;
}

function luminance([r, g, b]: Rgb): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb): number {
	const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (l1 + 0.05) / (l2 + 0.05);
}

/** Every `--name: light-dark(#a, #b)` in tokens.css, both sides resolved through `var()` aliases. */
function tokens(): Record<Theme, Map<string, Rgb>> {
	const css = readFileSync(join(root, 'src/lib/styles/tokens.css'), 'utf8');
	const light = new Map<string, Rgb>();
	const dark = new Map<string, Rgb>();
	const pending: [string, string][] = [];
	for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
		const [, name, value] = match as unknown as [string, string, string];
		const pair = value.match(/light-dark\(\s*(#[0-9a-f]{3,6})\s*,\s*(#[0-9a-f]{3,6})\s*\)/i);
		if (pair) {
			light.set(name, parseHex(pair[1]!));
			dark.set(name, parseHex(pair[2]!));
			continue;
		}
		// A token that is the same in both themes (the globe's night frame).
		const plain = value.trim().match(/^#[0-9a-f]{3,6}$/i);
		if (plain) {
			light.set(name, parseHex(plain[0]));
			dark.set(name, parseHex(plain[0]));
			continue;
		}
		const alias = value.match(/^var\(--([a-z0-9-]+)\)$/);
		if (alias) pending.push([name, alias[1]!]);
	}
	for (const [name, target] of pending) {
		const l = light.get(target);
		const d = dark.get(target);
		if (l && d) {
			light.set(name, l);
			dark.set(name, d);
		}
	}
	return { light, dark };
}

interface Pair {
	readonly fg: string;
	readonly bg: string;
	readonly min: number;
	readonly note: string;
}

const PAIRS: Pair[] = [
	{ fg: 'ink', bg: 'paper', min: 4.5, note: 'body text on the page' },
	{ fg: 'ink', bg: 'paper-2', min: 4.5, note: 'body text on a card' },
	{ fg: 'ink', bg: 'paper-4', min: 4.5, note: 'body text on a dialog' },
	{ fg: 'ink-2', bg: 'paper', min: 4.5, note: 'secondary text, labels' },
	{ fg: 'ink-2', bg: 'paper-2', min: 4.5, note: 'secondary text on a card' },
	{ fg: 'ink-2', bg: 'paper-3', min: 4.5, note: 'table head, chips' },
	{ fg: 'ink-2', bg: 'paper-4', min: 4.5, note: 'secondary text on a dialog' },
	{ fg: 'ink-3', bg: 'paper', min: 4.5, note: 'tertiary text (.hint, coordinates)' },
	{ fg: 'ink-3', bg: 'paper-2', min: 4.5, note: 'tertiary text on a card' },
	{ fg: 'ink-3', bg: 'paper-3', min: 4.5, note: 'tertiary text on a chip' },
	{ fg: 'ink-3', bg: 'paper-4', min: 4.5, note: 'tertiary text on a dialog' },
	{ fg: 'sea', bg: 'paper', min: 4.5, note: 'links' },
	{ fg: 'sea', bg: 'paper-2', min: 4.5, note: 'links on a card' },
	{ fg: 'sea-strong', bg: 'paper', min: 4.5, note: 'hovered links' },
	{ fg: 'sea', bg: 'sea-soft', min: 4.5, note: '.chip--sea, Live' },
	{ fg: 'sun', bg: 'paper', min: 4.5, note: 'warning text' },
	{ fg: 'sun', bg: 'sun-soft', min: 4.5, note: 'sun text on its soft fill' },
	{ fg: 'coral', bg: 'paper', min: 4.5, note: '.issue' },
	{ fg: 'coral', bg: 'coral-soft', min: 4.5, note: '.chip--coral' },
	{ fg: 'on-sea', bg: 'sea', min: 4.5, note: 'primary button' },
	{ fg: 'on-fill', bg: 'kind-place', min: 4.5, note: 'pin: place' },
	{ fg: 'on-fill', bg: 'kind-lodging', min: 4.5, note: 'pin: lodging' },
	{ fg: 'on-fill', bg: 'kind-food', min: 4.5, note: 'pin: food' },
	{ fg: 'on-fill', bg: 'kind-transport', min: 4.5, note: 'pin: transport' },
	{ fg: 'on-fill', bg: 'kind-activity', min: 4.5, note: 'pin: activity' },
	{ fg: 'on-fill', bg: 'kind-idea', min: 4.5, note: 'pin: idea' },
	{ fg: 'on-fill', bg: 'coral', min: 4.5, note: '.btn--danger' },
	{ fg: 'paper', bg: 'ink', min: 4.5, note: 'update banner, skip link' },
	{ fg: 'focus', bg: 'paper', min: 3, note: 'focus ring (non-text)' },
	{ fg: 'focus', bg: 'paper-2', min: 3, note: 'focus ring on a card' },
	{ fg: 'focus', bg: 'paper-3', min: 3, note: 'focus ring on a hovered button' },
	{ fg: 'line-2', bg: 'paper-2', min: 1.5, note: 'control border (hairline floor)' },
	{ fg: 'segment-edge', bg: 'paper-3', min: 3, note: 'chosen segment edge on its track' },
	{ fg: 'segment-edge', bg: 'paper-4', min: 3, note: 'chosen segment edge on the segment' },
	{ fg: 'night-ink', bg: 'night', min: 4.5, note: 'globe hints on the night frame' }
];

function contrastReport(): { lines: string[]; failures: number } {
	const all = tokens();
	const lines: string[] = [];
	let failures = 0;
	for (const theme of ['light', 'dark'] as Theme[]) {
		lines.push(`\n${theme.toUpperCase()}`);
		for (const pair of PAIRS) {
			const fg = all[theme].get(pair.fg);
			const bg = all[theme].get(pair.bg);
			if (!fg || !bg) {
				lines.push(`  ?     --${pair.fg} on --${pair.bg}: token missing`);
				failures += 1;
				continue;
			}
			const r = ratio(fg, bg);
			const ok = r >= pair.min;
			if (!ok) failures += 1;
			lines.push(
				`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}  --${pair.fg} on --${pair.bg} (≥ ${pair.min}) — ${pair.note}`
			);
		}
	}
	return { lines, failures };
}

/* ------------------------------------------------------------------ */
/* The walk                                                            */
/* ------------------------------------------------------------------ */

async function signIn(page: Page) {
	await page.goto(`${BASE}/signin?redirectTo=%2Ftrips`);
	await page.getByLabel('Email').fill(EMAIL);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => !url.pathname.includes('/signin'));
}

/* Scroll the whole page once, so anything that waits to be scrolled into view has been, then back to the top. */
async function scrollThrough(page: Page) {
	await page.evaluate(async () => {
		const step = innerHeight * 0.8;
		for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
			scrollTo(0, y);
			await new Promise((r) => setTimeout(r, 40));
		}
		scrollTo(0, 0);
	});
	await page.waitForTimeout(800);
}

async function settle(page: Page) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(250);
}

async function main() {
	const { lines, failures } = contrastReport();
	console.log('CONTRAST (WCAG 2.x, from tokens.css)' + lines.join('\n'));
	console.log(failures === 0 ? '\nevery pair passes\n' : `\n${failures} pair(s) FAIL\n`);

	const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
	const problems: string[] = [];

	for (const device of DEVICES) {
		for (const theme of THEMES) {
			const dir = join(out, theme, device);
			mkdirSync(dir, { recursive: true });

			const context = await browser.newContext({ ...DEVICE_OPTIONS[device], colorScheme: theme });
			await context.addInitScript((t) => {
				try {
					localStorage.setItem('meridian:theme', t);
				} catch {
					/* private mode */
				}
			}, theme);

			const page = await context.newPage();
			let signedIn = false;

			for (const screen of SCREENS) {
				if (only && !only.includes(screen.name)) continue;
				if (screen.name === 'nav-open' && !isPhone(device)) continue;
				if (screen.auth && !signedIn) {
					await signIn(page);
					signedIn = true;
				}
				try {
					// Not `networkidle`: the trip page holds a live query open, so the network is never idle there.
					await page.goto(`${BASE}${screen.url}`, { waitUntil: 'load' });
					await page
						.locator('html[data-hydrated]')
						.waitFor({ timeout: 10_000 })
						.catch(() => {});
					await settle(page);
					if (!screen.viewport) await scrollThrough(page);
					await screen.act?.(page, device);
					await settle(page);
					await page.screenshot({
						path: join(dir, `${screen.name}.png`),
						fullPage: !screen.viewport,
						animations: 'disabled',
						caret: 'hide'
					});
					if (isPhone(device)) {
						const o = await overflow(page);
						const wide = o.scrollWidth > o.clientWidth;
						if (wide || o.offenders.length > 0) {
							problems.push(
								`${theme}/${device}/${screen.name}: scrollWidth ${o.scrollWidth} vs ${o.clientWidth}` +
									(o.offenders.length ? `\n    ${o.offenders.join('\n    ')}` : '')
							);
						}
					}
					console.log(`shot  ${theme}/${device}/${screen.name}`);
				} catch (error) {
					problems.push(
						`${theme}/${device}/${screen.name}: ${(error as Error).message.split('\n')[0]}`
					);
					console.log(`FAIL  ${theme}/${device}/${screen.name}`);
				}
			}
			await context.close();
		}
	}

	await browser.close();

	console.log(
		problems.length === 0
			? '\nOVERFLOW: no page scrolls sideways at phone width; nothing sticks out'
			: `\nPROBLEMS (${problems.length})\n${problems.join('\n')}`
	);
	process.exitCode = failures > 0 ? 1 : 0;
}

await main();
