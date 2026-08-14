/**
 * Copies the exact font files we use out of node_modules and into `static/fonts`.
 *
 * Why not just `import '@fontsource-variable/montserrat'`?
 * That package's `index.css` declares @font-face for EVERY subset it ships:
 * cyrillic, cyrillic-ext, greek, vietnamese, latin, latin-ext. Browsers are smart
 * enough to only *download* the subsets a page actually needs (that's what the
 * `unicode-range` descriptor is for), so the waste is small — but we still can't
 * <link rel="preload"> a file whose hashed path we don't control.
 *
 * Preloading the font is the single biggest win for Largest Contentful Paint on a
 * text-heavy marketing page: without it the browser has to (1) download HTML,
 * (2) download CSS, (3) parse CSS, (4) *then* discover the font. That's three
 * round-trips before the first glyph. With a preload it starts in parallel with the CSS.
 *
 * So: we take ownership of two files, write our own @font-face, and preload them.
 *
 * Run with `pnpm run fonts:sync`. It also runs automatically via `prepare`,
 * so a fresh `pnpm install` always produces a working project.
 */

import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'static', 'fonts');

/** The only font files this site ships. Latin subset, variable weight axis. */
const FONTS = [
	{
		from: '@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2',
		to: 'montserrat-latin-wght-normal.woff2'
	},
	{
		from: '@fontsource-variable/sofia-sans/files/sofia-sans-latin-wght-normal.woff2',
		to: 'sofia-sans-latin-wght-normal.woff2'
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
