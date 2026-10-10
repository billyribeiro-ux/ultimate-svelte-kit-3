/**
 * THE CONTRAST GATE
 * =================
 *
 * Part of `pnpm run lint`: reads `src/lib/styles/tokens.css`, works out the
 * WCAG contrast of every pair of tokens the design puts on top of each other
 * — in the light theme and the dark — and exits non-zero if any falls under
 * its floor. A token change that makes the tertiary ink unreadable on a card
 * fails here, in a second, before a browser has started.
 *
 * The table and the maths are `src/lib/design/contrast.ts`, shared with
 * `scripts/screens.ts` (which prints the same report beside its pictures) and
 * tested in `contrast.spec.ts`.
 *
 *   node scripts/contrast.ts           # quiet when everything passes
 *   node scripts/contrast.ts --report  # the whole table
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, report } from '../src/lib/design/contrast.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/lib/styles/tokens.css'), 'utf8');
const results = check(css);
const failures = results.filter((result) => !result.ok);

if (process.argv.includes('--report') || failures.length > 0) {
	console.log('CONTRAST (WCAG 2.x, from tokens.css)' + report(results).join('\n'));
}

if (failures.length > 0) {
	console.error(`\n${failures.length} pair(s) under their floor`);
	process.exitCode = 1;
} else {
	console.log(`contrast: ${results.length} pairs in two themes, every one at or above its floor`);
}
