/**
 * THE SCREENSHOT MATRIX
 * =====================
 *
 * A Playwright script, not a test: it signs in as the seed's Ana, walks every
 * screen in three viewports (Desktop Chrome at 1440×900, a Pixel 7, and a
 * 360px phone — the narrowest the type scale is tuned for) and two themes,
 * and writes a PNG per screen to `design/screens/<theme>/<device>/`.
 * It never asserts about pixels — a person looks at the pictures. Beside
 * them it prints the two things a person is bad at checking by eye:
 *
 *   1. OVERFLOW — on the phones, for every page: does the document scroll
 *      sideways, which elements stick out past the right edge, and which
 *      controls run past their card's content box (the table wrapper, the
 *      tab strip and the two canvases are allowed to scroll inside
 *      themselves and are excluded).
 *   2. CONTRAST — the WCAG 2.x ratio of every text token on every surface
 *      tier, for both sides of each `light-dark()` in `tokens.css`, against
 *      the 4.5:1 floor for text and 3:1 for the focus ring.
 *
 * Neither is this script's own code any more. The screens are `e2e/matrix.ts`,
 * the overflow walk is `src/lib/design/page-checks.ts` and the contrast table
 * is `src/lib/design/contrast.ts` — the same three the gates use
 * (`e2e/visual.e2e.ts`, at the same three widths, and `scripts/contrast.ts`),
 * so what this prints is what `pnpm run verify` enforces, and either kind of
 * problem makes it exit non-zero.
 *
 * The theme is forced two ways, and both are needed: `meridian:theme` in
 * localStorage is what the boot script in `app.html` reads before the first
 * paint, and `emulateMedia({ colorScheme })` is what `light-dark()` reads
 * when nothing is stored. Set together, they agree.
 *
 * Run against the built server, with `PUBLIC_ORIGIN` the same for the build
 * and the server — it is baked into the bundle, and a mismatch is a 403 on
 * the sign-in this script starts with (`design/README.md` says more):
 *
 *   export DATABASE_URL=file:e2e.db PUBLIC_ORIGIN=http://localhost:4173 \
 *     BETTER_AUTH_SECRET=e2e-only-secret-of-at-least-thirty-two-characters \
 *     STOP_LIMIT=200 PORT=4173
 *   node scripts/prepare-e2e-db.js && pnpm run build
 *   node build/index.js &
 *   node scripts/screens.ts
 *
 * Options: `--only=home,trips` to shoot a subset; `--device=phone|narrow|desktop`;
 * `--theme=light|dark`; `--skip-globe` when there is no WebGL to be had.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, type BrowserContextOptions, type Page } from 'playwright';
import { ALLOWED_SCROLLERS, SCREENS, openScreen, signInAsAna } from '../e2e/matrix.ts';
import { check, report } from '../src/lib/design/contrast.ts';
import { overflowInPage } from '../src/lib/design/page-checks.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'design', 'screens');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';

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
	narrow: {
		...devices['Pixel 7'],
		viewport: { width: 360, height: 780 },
		screen: { width: 360, height: 780 }
	}
};

const isPhone = (device: Device) => device !== 'desktop';

/* ------------------------------------------------------------------ */
/* The walk                                                            */
/* ------------------------------------------------------------------ */

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

function contrastReport(): { lines: string[]; failures: number } {
	const results = check(readFileSync(join(root, 'src/lib/styles/tokens.css'), 'utf8'));
	return { lines: report(results), failures: results.filter((r) => !r.ok).length };
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

			const context = await browser.newContext({
				...DEVICE_OPTIONS[device],
				colorScheme: theme,
				baseURL: BASE
			});
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
				if (screen.phoneOnly && !isPhone(device)) continue;
				if (screen.webgl && skipGlobe) continue;
				if (screen.auth && !signedIn) {
					await signInAsAna(page);
					signedIn = true;
				}
				try {
					await openScreen(page, screen);
					if (!screen.viewport) await scrollThrough(page);
					await settle(page);
					if (screen.name === 'stop-dialog') {
						const focused = await page.evaluate(() => {
							const el = document.activeElement;
							return el
								? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}`
								: 'none';
						});
						console.log(`      focus on open: ${focused}`);
					}
					await page.screenshot({
						path: join(dir, `${screen.name}.png`),
						fullPage: !screen.viewport,
						animations: 'disabled',
						caret: 'hide'
					});
					if (isPhone(device)) {
						const o = await page.evaluate(overflowInPage, ALLOWED_SCROLLERS);
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
	process.exitCode = failures > 0 || problems.length > 0 ? 1 : 0;
}

await main();
