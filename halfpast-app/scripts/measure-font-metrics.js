/**
 * FONT METRIC MEASUREMENT
 * =======================
 *
 * Computes the `size-adjust`, `ascent-override` and `descent-override` values for a
 * metric-matched fallback font, by measuring the real fonts in a real browser.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * Those three numbers eliminate the layout shift that happens when a webfont finishes
 * loading and replaces the fallback. Get them right and the swap is invisible. Get
 * them wrong and you have Cumulative Layout Shift — content jumping under the user's
 * finger — which is both a bad experience and a Core Web Vitals failure.
 *
 * The numbers cannot be reasoned out. They depend on the specific glyph widths and
 * vertical metrics of two specific fonts. This project shipped estimated values once
 * and produced a 181px shift on mobile. Measure them.
 *
 * Run with:  pnpm run fonts:measure
 * (requires the dev or preview server to be running — it needs a page where the
 * fonts are actually loaded)
 */

import { chromium } from 'playwright';

const URL = process.env.MEASURE_URL ?? 'http://localhost:4173/';

/**
 * The fonts to measure, and the fallback to match them against.
 *
 * `weight` should be the weight that font is used at MOST on your site — the
 * adjustment can only be exact for one weight, so optimise for the common case.
 * Body text matters more than headings here, because there is far more of it.
 */
const TARGETS = [
	{ label: 'Bricolage', family: "'Bricolage Grotesque'", weight: 700 },
	{ label: 'Public Sans', family: "'Public Sans'", weight: 400 }
];

const FALLBACK = 'Arial';

const browser = await chromium.launch();

try {
	const page = await browser.newPage();
	await page.goto(URL);

	// Without this the measurement races the font load and silently measures the
	// fallback against itself, producing a perfect 100% that is completely wrong.
	await page.evaluate(() => document.fonts.ready);

	const results = await page.evaluate(
		({ targets, fallback }) => {
			/** Width of a representative string, at 100px, in a given font. */
			const width = (/** @type {string} */ family, /** @type {number} */ weight) => {
				const el = document.createElement('span');
				el.style.cssText =
					`position:absolute;visibility:hidden;white-space:nowrap;` +
					`font-size:100px;font-family:${family};font-weight:${weight}`;
				// A mixed string — letters, ascenders, descenders and digits — so one
				// unusual glyph can't skew the average.
				el.textContent = 'Handgloves the quick brown fox 0123456789';
				document.body.appendChild(el);
				const value = el.getBoundingClientRect().width;
				el.remove();
				return value;
			};

			/** Vertical metrics, in em, straight from the font file. */
			const vertical = (/** @type {string} */ family, /** @type {number} */ weight) => {
				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');
				if (!context) throw new Error('no 2d context');
				context.font = `${weight} 100px ${family}`;
				const m = context.measureText('Hxy');
				return {
					ascent: m.fontBoundingBoxAscent / 100,
					descent: m.fontBoundingBoxDescent / 100
				};
			};

			return targets.map((/** @type {{label:string,family:string,weight:number}} */ target) => {
				const targetWidth = width(target.family, target.weight);
				const fallbackWidth = width(fallback, target.weight);
				const metrics = vertical(target.family, target.weight);

				const sizeAdjust = targetWidth / fallbackWidth;

				return {
					label: target.label,
					sizeAdjust,
					// Overrides are relative to the already-size-adjusted em, so each
					// real metric is divided by the size adjustment.
					ascentOverride: metrics.ascent / sizeAdjust,
					descentOverride: metrics.descent / sizeAdjust,
					rawAscent: metrics.ascent,
					rawDescent: metrics.descent
				};
			});
		},
		{ targets: TARGETS, fallback: FALLBACK }
	);

	const pct = (/** @type {number} */ value) => `${(value * 100).toFixed(1)}%`;

	console.log(`\nMeasured against ${FALLBACK}. Paste into src/lib/styles/fonts.css:\n`);

	for (const result of results) {
		console.log(
			`/* ${result.label}: real ascent ${result.rawAscent.toFixed(2)}em, ` +
				`real descent ${result.rawDescent.toFixed(2)}em */`
		);
		console.log(`@font-face {`);
		console.log(`\tfont-family: '${result.label} Fallback';`);
		console.log(`\tsrc: local('${FALLBACK}');`);
		console.log(`\tsize-adjust: ${pct(result.sizeAdjust)};`);
		console.log(`\tascent-override: ${pct(result.ascentOverride)};`);
		console.log(`\tdescent-override: ${pct(result.descentOverride)};`);
		console.log(`\tline-gap-override: 0%;`);
		console.log(`}\n`);
	}
} finally {
	await browser.close();
}
