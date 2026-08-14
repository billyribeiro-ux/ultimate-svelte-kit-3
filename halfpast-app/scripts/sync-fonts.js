/**
 * Copies the exact font files this app uses out of node_modules into `static/fonts`.
 *
 * Why not `import '@fontsource-variable/bricolage-grotesque'` and be done?
 *
 * That package's `index.css` declares @font-face for every subset it ships —
 * latin, latin-ext, vietnamese. Browsers only *download* the subsets a page
 * actually needs, so the waste is small. The real problem is that we cannot
 * `<link rel="preload">` a file whose hashed path the bundler chooses.
 *
 * Preloading is the biggest single win available to first paint on a text-heavy
 * page. Without it the browser must download the HTML, download the CSS, parse
 * the CSS, and only *then* discover the font — three round trips before a single
 * glyph. With it, the font starts downloading alongside the CSS.
 *
 * So we take ownership of two files, write our own @font-face, and preload them.
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
 * Bricolage Grotesque publishes several axes as separate files — `wght`, `wdth`,
 * `opsz` — and we take only `wght`. The optical-size axis is lovely and would
 * cost another 40kB to express a difference nobody notices at the two sizes we
 * set headings at.
 */
const FONTS = [
	{
		from: '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
		to: 'bricolage-grotesque-latin-wght-normal.woff2'
	},
	{
		from: '@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2',
		to: 'public-sans-latin-wght-normal.woff2'
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
