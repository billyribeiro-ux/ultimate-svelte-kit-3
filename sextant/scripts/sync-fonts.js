/**
 * Copies the exact font files this app ships out of node_modules into
 * `static/fonts`.
 *
 * Why not just `import '@fontsource-variable/inter'` in the layout?
 *
 * Because a font imported that way gets a hashed filename chosen by the bundler,
 * and you cannot `<link rel="preload">` a path you do not know at the time you
 * write `app.html`. Preload is the single biggest win available to first paint
 * on a text-heavy page: without it the browser must fetch the HTML, fetch the
 * CSS, parse the CSS, and only *then* discover the font — three serial round
 * trips before one glyph appears.
 *
 * Sextant has a second, sharper reason. The charts and the flame graph draw
 * their labels into a canvas, and canvas text measurement uses whatever font is
 * loaded *at that moment*. A font that arrives late makes the first frame lay
 * out against a fallback and every frame after it against the real face, so
 * labels jump and truncation is computed twice. Owning the files means we can
 * `await document.fonts.ready` against a face we named ourselves.
 *
 * Run with `pnpm run fonts:sync`. Also runs from `prepare`, so a fresh
 * `pnpm install` always leaves a working project.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'static', 'fonts');

/**
 * The only font files this app ships. Latin subset, variable weight axis.
 *
 * Two families and nothing else. Inter carries the interface; JetBrains Mono
 * carries everything a person reads character by character, which in this
 * application is most of it — trace ids, log lines, query text, exact numbers.
 *
 * The monospace choice is functional rather than aesthetic. A table of durations
 * in a proportional face cannot be scanned down a column, because `1` and `8`
 * are different widths and the decimal points do not line up. `font-variant-
 * numeric: tabular-nums` fixes that for one family; using a mono face for the
 * data fixes it for every number in the product, including the ones drawn into
 * a canvas where that CSS property does not reach.
 */
const FONTS = [
	{
		from: '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
		to: 'inter-latin-wght-normal.woff2'
	},
	{
		from: '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
		to: 'jetbrains-mono-latin-wght-normal.woff2'
	}
];

mkdirSync(outDir, { recursive: true });

for (const font of FONTS) {
	const source = join(root, 'node_modules', font.from);

	if (!existsSync(source)) {
		console.error(`[sync-fonts] missing: ${font.from}`);
		console.error('[sync-fonts] did you run `pnpm install`?');
		process.exit(1);
	}

	copyFileSync(source, join(outDir, font.to));
	console.log(`[sync-fonts] ${font.to}`);
}

console.log(`[sync-fonts] done — ${FONTS.length} files in static/fonts`);
