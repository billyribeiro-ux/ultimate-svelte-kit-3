import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { overflowInPage, smallTargetsInPage } from '../src/lib/design/page-checks.ts';
import { ALLOWED_SCROLLERS, SCREENS, openScreen, signInAsAna } from './matrix.ts';

/**
 * WHAT A MACHINE CAN SEE IN A DESIGN
 * ==================================
 *
 * Every screen of the screenshot matrix (`matrix.ts`), in both themes, in
 * three projects — the desktop, the Pixel 7, and the Pixel 7 narrowed to
 * 360px, the narrowest phone the design is drawn for — asked four
 * questions a person looking at a picture is bad at answering:
 *
 *   1. Does anything stick out? The document must not scroll sideways, no
 *      element may end past the right edge of the screen (the scrollers
 *      that scroll inside themselves are allowed), and no form control may
 *      run past its card's content box.
 *   2. On a phone, can a finger hit it? Every visible button, link, input,
 *      select, option and `role="button"` — the map's pins and bubbles —
 *      is drawn at least 36px and answers a press anywhere in a 44px box:
 *      the design's numbers, and the reason `.btn--icon` extends its hit
 *      area with a pseudo-element. (`page-checks.ts` names the two narrow
 *      exemptions and why.)
 *   3. Does axe find anything? WCAG 2 A and AA, every rule, and any
 *      violation fails. Two things are left out: the MapLibre canvas and the
 *      globe's, which are pictures drawn in WebGL that axe cannot read. Only
 *      the canvases — the map's markers are HTML buttons in the element
 *      beside the canvas, and axe reads them like any other.
 *   4. Is there one map at most? A hidden MapLibre is still a WebGL
 *      context, and a phone would pay for two.
 *
 * The 360px project exists because a 412px phone hid a real bug: the date
 * range field ran past its card at 360px and not at 412px, and the gate
 * passed with it broken.
 *
 * And, on the phone, the three pages people land on are measured twice.
 * As they are, nothing may shift at all, and the largest paint comes
 * early. Then on the connection Lighthouse's mobile run assumes — 150ms
 * round trips, 1.6 Mbps down — the largest paint must still be inside 2.5
 * seconds. The network is throttled and the processor is not: a CPU
 * multiplier slows whatever machine runs the suite by a factor, so the
 * same test would mean something different on a laptop and on a CI
 * runner, while a throttled connection is the same connection everywhere.
 *
 * The axe engine is the `axe-core` this project depends on, handed to
 * `@axe-core/playwright` as its source, so the rules are the latest
 * release rather than the one the adapter happens to bundle.
 */

const axeSource = readFileSync(
	createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
	'utf8'
);

interface Fixtures {
	/** Whether this test's browser context starts with Ana's session. */
	signedIn: boolean;
}

interface WorkerFixtures {
	/** A storage state file holding a session for Ana, made once per worker. */
	anaState: string;
}

const it = test.extend<Fixtures, WorkerFixtures>({
	signedIn: [false, { option: true }],
	anaState: [
		async ({ browser }, use, workerInfo) => {
			const file = `${workerInfo.project.outputDir}/ana-${workerInfo.workerIndex}.json`;
			const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
			await signInAsAna(await context.newPage());
			await context.storageState({ path: file });
			await context.close();
			await use(file);
		},
		{ scope: 'worker' }
	],
	storageState: async ({ signedIn, anaState }, use) => {
		await use(signedIn ? anaState : undefined);
	}
});

/*
 * The questions are about where a screen settles, so the matrix runs with
 * reduced motion: the hero's timeline, the cards' rise and the map's camera
 * are then cuts, and axe never measures a button's contrast half way
 * through a fade (it did: 1.97:1, at 97% opacity). Motion is checked where
 * it is decided — every duration is a token that reduced motion zeroes.
 */
const AXE_EXCEPTIONS = [
	{
		rule: 'scrollable-region-focusable',
		selector: '.cmd__list',
		// The palette's list scrolls, and focus never enters it: it is the listbox of a
		// combobox, driven from the input by `aria-activedescendant` (Bits UI's Command),
		// and the highlighted option is scrolled into view as the arrows move. axe asks
		// for a focusable region, which here would be a tab stop that does nothing.
		why: 'a combobox listbox, scrolled from its input'
	}
] as const;

for (const theme of ['light', 'dark'] as const) {
	it.describe(`${theme} theme`, () => {
		it.use({ colorScheme: theme, reducedMotion: 'reduce' });

		for (const screen of SCREENS) {
			it.describe(screen.name, () => {
				it.use({ signedIn: Boolean(screen.auth) });

				it(`${screen.name} holds together`, async ({ page }, testInfo) => {
					const phone = testInfo.project.name !== 'desktop';
					it.skip(Boolean(screen.phoneOnly) && !phone, 'there is no menu button on a desktop');
					// The globe waits up to 30s for three.js and WebGL; the checks after it need their own time.
					it.slow(Boolean(screen.webgl), 'the globe loads a large chunk and starts WebGL');

					// The theme both ways the app reads it: the stored choice and the system's.
					await page.addInitScript((t) => {
						try {
							localStorage.setItem('meridian:theme', t);
						} catch {
							/* private mode */
						}
					}, theme);
					await openScreen(page, screen);

					const overflow = await page.evaluate(overflowInPage, ALLOWED_SCROLLERS);
					expect(overflow.scrollWidth, 'the page scrolls sideways').toBeLessThanOrEqual(
						overflow.clientWidth
					);
					expect(overflow.offenders, 'elements that stick out').toEqual([]);

					if (phone) {
						const small = await page.evaluate(smallTargetsInPage, { drawn: 36, hit: 44 });
						expect(small, 'targets a finger cannot hit').toEqual([]);
					}

					// Every WCAG 2 A and AA rule — but the excepted ones only on their one selector,
					// so each runs a second time over the rest of the page.
					const axe = () =>
						new AxeBuilder({ page, axeSource })
							.exclude('canvas.maplibregl-canvas')
							.exclude('.globe canvas');
					const { violations } = await axe()
						.withTags(['wcag2a', 'wcag2aa'])
						.disableRules(AXE_EXCEPTIONS.map((e) => e.rule))
						.analyze();
					for (const exception of AXE_EXCEPTIONS) {
						const rest = await axe()
							.withRules([exception.rule])
							.exclude(exception.selector)
							.analyze();
						violations.push(...rest.violations);
					}
					expect(
						violations.map(
							(v) =>
								`${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`).join('; ')}`
						),
						'axe violations'
					).toEqual([]);

					expect(await page.locator('canvas.maplibregl-canvas').count()).toBeLessThanOrEqual(1);
				});
			});
		}
	});
}

it.describe('one map at any width', () => {
	it.use({ signedIn: true });

	it('the trip never runs two MapLibre canvases', async ({ page }, testInfo) => {
		it.skip(testInfo.project.name !== 'desktop', 'the desktop project can change its width');
		const maps = page.locator('canvas.maplibregl-canvas');

		// The itinerary has its side map from 64em, and none below.
		await page.goto('/t/seediberia');
		await expect(maps).toHaveCount(1);
		await page.setViewportSize({ width: 700, height: 900 });
		await expect(maps).toHaveCount(0);
		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(maps).toHaveCount(1);

		// The Map tab is the map, at every width.
		await page.goto('/t/seediberia?tab=map');
		await expect(maps).toHaveCount(1);
		await page.setViewportSize({ width: 700, height: 900 });
		await expect(maps).toHaveCount(1);
	});
});

interface Vitals {
	cls: number;
	lcp: number;
	shifts: string[];
}

/** Record layout shifts and the largest paint from the first byte, as Lighthouse does. */
async function watchVitals(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const vitals = { cls: 0, lcp: 0, shifts: [] as string[] };
		(window as unknown as { vitals: typeof vitals }).vitals = vitals;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as (PerformanceEntry & {
				value: number;
				hadRecentInput: boolean;
				sources?: { node?: Node | null }[];
			})[]) {
				if (entry.hadRecentInput) continue;
				vitals.cls += entry.value;
				for (const source of entry.sources ?? []) {
					const node = source.node;
					vitals.shifts.push(
						node instanceof Element
							? `${node.tagName.toLowerCase()}.${node.className}`
							: String(node?.nodeName)
					);
				}
			}
		}).observe({ type: 'layout-shift', buffered: true });
		new PerformanceObserver((list) => {
			const last = list.getEntries().at(-1);
			if (last) vitals.lcp = last.startTime;
		}).observe({ type: 'largest-contentful-paint', buffered: true });
	});
}

const readVitals = (page: Page) =>
	page.evaluate(() => (window as unknown as { vitals: Vitals }).vitals);

/*
 * The round trip and the bandwidth Lighthouse's mobile preset simulates,
 * applied by the browser to every request of the page. It is not
 * Lighthouse's own figure: Lighthouse models the page's requests one by
 * one from an unthrottled run, and its preset for applied throttling adds
 * a margin for that (562.5ms round trips). This is the same connection on
 * every machine, which makes it a gate rather than a report.
 */
const SLOW_4G = {
	offline: false,
	latency: 150,
	downloadThroughput: (1.6 * 1024 * 1024) / 8,
	uploadThroughput: (750 * 1024) / 8
};

it.describe('first impressions on a phone', () => {
	for (const url of ['/', '/explore', '/t/seedjapan2']) {
		it(`${url} does not shift and paints its largest thing early`, async ({ page }, testInfo) => {
			it.skip(testInfo.project.name !== 'phone', 'measured on the phone profile, like Lighthouse');

			await watchVitals(page);
			await page.goto(url, { waitUntil: 'load' });
			await page.locator('html[data-hydrated]').waitFor();
			await page.evaluate(() => document.fonts.ready);
			// Long enough for anything late — a chart, a live chip, a font — to have moved if it was going to.
			await page.waitForTimeout(1500);

			const vitals = await readVitals(page);
			expect(vitals.shifts, 'what moved').toEqual([]);
			expect(vitals.cls).toBe(0);
			expect(vitals.lcp).toBeGreaterThan(0);
			expect(vitals.lcp).toBeLessThan(2500);
		});

		it(`${url} paints its largest thing inside 2.5 seconds on a slow 4G connection`, async ({
			page
		}, testInfo) => {
			it.skip(testInfo.project.name !== 'phone', 'measured on the phone profile, like Lighthouse');

			const cdp = await page.context().newCDPSession(page);
			await cdp.send('Network.enable');
			await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
			await watchVitals(page);
			await page.goto(url, { waitUntil: 'load' });
			await page.locator('html[data-hydrated]').waitFor({ timeout: 20_000 });
			// The largest paint is reported a frame after it happens.
			await page.waitForTimeout(500);

			const { lcp } = await readVitals(page);
			expect(lcp).toBeGreaterThan(0);
			expect(lcp, 'the largest contentful paint, in ms').toBeLessThan(2500);
		});
	}
});
