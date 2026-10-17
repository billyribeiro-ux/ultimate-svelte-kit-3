/**
 * RE-ANCHOR EVERY RANGE AFTER THE PROJECT MOVES
 * ============================================
 *
 * `snap.js` and `snapfile.js` repair a range that is *nearly* right — they
 * trim blank lines and extend the end until the brackets balance. They cannot
 * help when the right code has moved: add a ten-line comment near the top of
 * `vite.config.ts` and every block quoted below it now starts ten lines early,
 * on text that balances perfectly and says nothing a reader was meant to see.
 *
 * This tool asks git what each quoted block *used to say* — the file as of the
 * last commit — and finds that text in the file as it is now. The first and
 * last lines of the old block are matched (with a neighbour on each side when
 * a line alone is ambiguous, such as a lone `}`), nearest to where the block
 * was. Blocks whose text no longer exists are listed for a person, because a
 * block that changed is a block the chapter may need to say something about.
 *
 * The baseline is the last commit by default. When the ranges were already
 * brought up to date against an uncommitted tree and the tree moved again,
 * point `--base` at a copy of that tree instead — the state the ranges last
 * matched is the only state they can be re-anchored from.
 *
 * An authoring aid; `verify.js` still decides.
 *
 * Run:  node meridian-course/tools/reanchor.js            # every part file
 *       node meridian-course/tools/reanchor.js content/part0.js
 *       node meridian-course/tools/reanchor.js --base=/path/to/snapshot
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT, linesOf } from '../content/quote.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('--base='))?.slice('--base='.length);
const named = args.filter((a) => !a.startsWith('--'));
const targets = named.length
	? named.map((f) => join(root, f))
	: readdirSync(join(root, 'content'))
			.filter((f) => /^part\d+\.js$/.test(f))
			.map((f) => join(root, 'content', f));

/** @type {Map<string, string[] | null>} */
const committed = new Map();

/** The file's lines in the baseline — HEAD, or `--base` — or `null` if it has none. */
function committedLines(file) {
	if (!committed.has(file)) {
		try {
			const text = base
				? readFileSync(join(base, file), 'utf8')
				: execFileSync(
						'git',
						['-C', PROJECT, 'show', `HEAD:${relative(join(PROJECT, '..'), join(PROJECT, file))}`],
						{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
					);
			committed.set(file, text.split('\n'));
		} catch {
			committed.set(file, null);
		}
	}
	return committed.get(file) ?? null;
}

/**
 * Every index in `lines` where `window` appears, in order.
 * @param {string[]} lines
 * @param {string[]} window
 */
function occurrences(lines, window) {
	const found = [];
	for (let i = 0; i + window.length <= lines.length; i += 1) {
		let ok = true;
		for (let j = 0; j < window.length; j += 1) {
			if (lines[i + j] !== window[j]) {
				ok = false;
				break;
			}
		}
		if (ok) found.push(i);
	}
	return found;
}

/**
 * Find one line of the old block in the new file: widen the window with its
 * neighbours until the match is unique, and prefer the hit nearest `near`.
 * @param {string[]} oldLines 0-based lines of the committed file
 * @param {string[]} newLines
 * @param {number} index 0-based index of the line to find, in `oldLines`
 * @param {number} near 0-based guess at where it is now
 * @returns {number | null} the 0-based index in `newLines`
 */
function locate(oldLines, newLines, index, near) {
	for (let radius = 0; radius <= 3; radius += 1) {
		const start = Math.max(0, index - radius);
		const end = Math.min(oldLines.length, index + radius + 1);
		const window = oldLines.slice(start, end);
		if (window.every((line) => !line.trim())) continue;
		const hits = occurrences(newLines, window).map((i) => i + (index - start));
		if (hits.length === 1) return hits[0];
		if (hits.length > 1 && radius === 3) {
			return hits.reduce((best, i) => (Math.abs(i - near) < Math.abs(best - near) ? i : best));
		}
	}
	return null;
}

const PATTERN = /code\((`[^`]+`|'[^']+'),\s*(\d+),\s*(\d+)(,\s*\{[^}]*\})?\)/g;

for (const target of targets) {
	const source = readFileSync(target, 'utf8');
	const constants = new Map(
		[...source.matchAll(/^const ([A-Z_]+) = '([^']+)';/gm)].map((m) => [m[1], m[2]])
	);
	let moved = 0;
	const unresolved = [];

	const updated = source.replace(PATTERN, (match, rawFile, rawFrom, rawTo, options = '') => {
		const file = rawFile
			.slice(1, -1)
			.replace(/\$\{([A-Z_]+)\}/g, (_, name) => constants.get(name) ?? `\${${name}}`);
		const from = Number(rawFrom);
		const to = Number(rawTo);

		const oldLines = committedLines(file);
		let newLines;
		try {
			newLines = linesOf(file);
		} catch {
			unresolved.push(`${file}:${from}-${to} — no such file now`);
			return match;
		}
		if (!oldLines || oldLines.join('\n') === newLines.join('\n')) return match;

		const first = locate(oldLines, newLines, from - 1, from - 1);
		const last = locate(oldLines, newLines, to - 1, first ?? to - 1);
		if (first === null || last === null || last < first) {
			unresolved.push(`${file}:${from}-${to} — text changed; place it by hand`);
			return match;
		}
		if (first === from - 1 && last === to - 1) return match;

		moved += 1;
		return `code(${rawFile}, ${first + 1}, ${last + 1}${options})`;
	});

	writeFileSync(target, updated);
	const name = relative(root, target);
	console.log(`${name}: ${moved} range(s) re-anchored`);
	for (const line of unresolved) console.log(`  ! ${line}`);
}
