/**
 * SNAP EVERY RANGE IN A PART FILE
 * ===============================
 *
 * `snap.js` fixes one range and prints it. This applies the same rules to every
 * `code(...)` call in a chapter file and rewrites it in place, adding
 * `{ partial: true }` where the slice genuinely cannot be balanced.
 *
 * It is an authoring aid and nothing more — `verify.js` is still what decides
 * whether the course is correct, and this only exists so that fixing thirty
 * ranges is one command rather than thirty.
 *
 * Run:  node sextant-course/tools/snapfile.js content/part5.js
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linesOf } from '../content/quote.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, process.argv[2] ?? '');

/** Bracket depth of a slice, ignoring strings and comments. */
function scan(text) {
	let depth = 0;
	let min = 0;
	let inString = null;
	let inLine = false;
	let inBlock = false;

	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		const next = text[i + 1];

		if (inLine) {
			if (ch === '\n') inLine = false;
			continue;
		}
		if (inBlock) {
			if (ch === '*' && next === '/') {
				inBlock = false;
				i += 1;
			}
			continue;
		}
		if (inString) {
			if (ch === '\\') i += 1;
			else if (ch === inString) inString = null;
			continue;
		}
		if (ch === '/' && next === '/') {
			inLine = true;
			i += 1;
			continue;
		}
		if (ch === '/' && next === '*') {
			inBlock = true;
			i += 1;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			inString = ch;
			continue;
		}
		if (ch === '{' || ch === '(' || ch === '[') depth += 1;
		if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
		if (depth < min) min = depth;
	}

	return { depth, min };
}

/**
 * The nearest range that satisfies `verify.js`, and whether it needed `partial`.
 *
 * The order matters: open the comment first (so the trims see real code), then
 * trim blanks, then try to balance by extending the end only. Walking the start
 * backwards to balance was in an earlier version and produced ranges that began
 * four functions earlier — technically balanced and useless to a reader.
 */
function snap(file, from, to) {
	const lines = linesOf(file);
	const slice = () => lines.slice(from - 1, to).join('\n');

	while (from > 1 && /^\s*(\*|\*\/)/.test(lines[from - 1] ?? '')) from -= 1;
	while (from < to && !(lines[from - 1] ?? '').trim()) from += 1;
	while (to > from && !(lines[to - 1] ?? '').trim()) to -= 1;

	for (let guard = 0; guard < 60 && scan(slice()).depth !== 0 && to < lines.length; guard += 1) {
		to += 1;
	}
	while (to > from && !(lines[to - 1] ?? '').trim()) to -= 1;

	const { depth, min } = scan(slice());
	return { from, to, partial: depth !== 0 || min < 0 };
}

const source = readFileSync(target, 'utf8');
let changed = 0;

const updated = source.replace(
	/code\('([^']+)',\s*(\d+),\s*(\d+)(,\s*\{[^}]*\})?\)/g,
	(match, file, rawFrom, rawTo, options) => {
		const result = snap(file, Number(rawFrom), Number(rawTo));
		const label = /label:/.test(options ?? '') ? options : '';
		const tail = result.partial
			? label
				? label.replace('}', ', partial: true }')
				: ", { partial: true }"
			: label;
		const next = `code('${file}', ${result.from}, ${result.to}${tail})`;
		if (next !== match) changed += 1;
		return next;
	}
);

writeFileSync(target, updated);
console.log(`${process.argv[2]}: ${changed} range(s) adjusted`);
