/**
 * SNAP A RANGE TO SOMETHING WHOLE
 * ==============================
 *
 * An authoring aid, not part of the build. Given a file and a rough range, it
 * prints the nearest range that satisfies `verify.js`: not starting inside a
 * comment, not starting or ending on a blank line, brackets balanced.
 *
 * It exists because picking ranges by eye is exactly the kind of work a person
 * is bad at and a script is good at, and because the alternative — loosening the
 * checks until the ranges pass — would give up the thing the checks are for.
 *
 * Run:  node sextant-course/tools/snap.js src/lib/sqf/lexer.ts 93 130
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT } from '../content/quote.js';

const [file, rawFrom, rawTo] = process.argv.slice(2);
if (!file) throw new Error('usage: snap.js <file> <from> <to>');

const lines = readFileSync(join(PROJECT, file), 'utf8').split('\n');

let from = Number(rawFrom);
let to = Number(rawTo);

/** Bracket depth of a slice, ignoring strings and comments. */
function depthOf(text) {
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

const slice = () => lines.slice(from - 1, to).join('\n');

// 1. If the first line is inside a block comment, walk up to where it opened.
while (from > 1 && /^\s*(\*|\*\/)/.test(lines[from - 1] ?? '')) from -= 1;

// 2. Trim blank lines at both ends.
while (from < to && !(lines[from - 1] ?? '').trim()) from += 1;
while (to > from && !(lines[to - 1] ?? '').trim()) to -= 1;

// 3. If the slice closes more than it opens, walk the start back.
for (let guard = 0; guard < 400 && depthOf(slice()).min < 0 && from > 1; guard += 1) {
	from -= 1;
	while (from > 1 && /^\s*(\*|\*\/)/.test(lines[from - 1] ?? '')) from -= 1;
}

// 4. Extend the end until the brackets balance, then trim blanks again.
for (let guard = 0; guard < 400 && depthOf(slice()).depth !== 0 && to < lines.length; guard += 1) {
	to += 1;
}
while (to > from && !(lines[to - 1] ?? '').trim()) to -= 1;

const { depth, min } = depthOf(slice());
const ok = depth === 0 && min >= 0;

console.log(`${file} ${from} ${to}${ok ? '' : '   ← STILL UNBALANCED, mark it partial'}`);
console.log('---');
console.log(
	lines
		.slice(from - 1, to)
		.map((line, i) => `${String(from + i).padStart(4)} ${line}`)
		.join('\n')
);
