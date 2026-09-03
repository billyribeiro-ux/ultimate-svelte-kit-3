/**
 * Copies the exact font files this app ships out of node_modules into
 * `static/fonts`.
 *
 * Why not just `import '@fontsource-variable/instrument-sans'` in the layout?
 *
 * Because a font imported that way gets a hashed filename chosen by the bundler,
 * and you cannot `<link rel="preload">` a path you do not know at the time you
 * write `app.html`. Preload is the single biggest win available to first paint
 * on a text-heavy page: without it the browser must fetch the HTML, fetch the
 * CSS, parse the CSS, and only *then* discover the font — three serial round
 * trips before one glyph appears.
 *
 * Tessera has a second, sharper reason. The board renders node labels into a
 * canvas for export, and canvas text measurement uses whatever font is loaded
 * *at that moment*. A font that arrives late produces an export whose text
 * metrics differ from the screen. Owning the files means we can `await
 * document.fonts.ready` against a face we named ourselves.
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
 * Two families and nothing else. Instrument Sans carries the interface; JetBrains
 * Mono carries anything the user might have to read character by character — ids,
 * keyboard shortcuts, the sync inspector. A diagram tool is tempted towards a
 * third "handwritten" face for sketch mode; it is 90kB to say something a border
 * radius already says.
 */
const FONTS = [
	{
		from: '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2',
		to: 'instrument-sans-latin-wght-normal.woff2'
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
