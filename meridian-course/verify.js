/**
 * COURSE ↔ CODE FIDELITY
 * ======================
 *
 * The first four courses pasted code into the chapters and used a script to
 * check the paste still matched. Since Sextant, a course reads the code out of
 * the project at build time instead, so *that* check is vacuously true — the
 * text and the file are the same bytes by construction.
 *
 * That does not make the script unnecessary. It moves it to the thing that
 * still needs judgement: **whether the ranges are sensible.** A quotation can be
 * perfectly faithful and still useless — a block that starts on the closing
 * brace of the function above it, or stops halfway through an `if`, is exactly
 * as wrong to a reader as a stale paste, and no amount of byte-comparison
 * notices.
 *
 * So this checks six things a person would otherwise have to check by eye:
 *
 *   1. the file exists;
 *   2. the range is inside it;
 *   3. it does not begin or end on a blank line;
 *   4. it does not begin mid-comment — a block starting on ` * so on` reads as
 *      gibberish;
 *   5. braces, brackets and parentheses balance across the slice, which is a
 *      cheap and surprisingly effective proxy for "this is a whole thing";
 *   6. every chapter has at least one code or terminal block, because a chapter
 *      of pure prose in a course about building something is usually a chapter
 *      that lost its code in an edit.
 *
 * Run:  node meridian-course/verify.js
 */

import { chapters } from './content/index.js';
import { linesOf } from './content/quote.js';

/** @type {string[]} */
const problems = [];
let quoted = 0;
let illustrative = 0;

/**
 * Do the brackets balance?
 *
 * Deliberately crude: it counts characters and ignores those inside strings and
 * comments, which it detects with a small state machine rather than a regular
 * expression, because a regular expression that finds strings in TypeScript is
 * either wrong or a parser. A real lexer could do this
 * exactly — and a heuristic that depends on the project it checks is a loop
 * worth avoiding.
 *
 * @param {string} text
 */
function balanced(text) {
	let depth = 0;
	let inString = /** @type {string | null} */ (null);
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

		// A slice that closes more than it opens is cut off at the front, which is
		// worth reporting even if it ends up balanced by the end.
		if (depth < 0) return false;
	}

	return depth === 0;
}

for (const chapter of chapters) {
	let blocks = 0;

	for (const block of chapter.blocks) {
		if (block.type === 'terminal') {
			blocks += 1;
			continue;
		}
		if (block.type !== 'code') continue;
		blocks += 1;

		if (!block.file) {
			illustrative += 1;
			continue;
		}

		quoted += 1;

		/** @type {string[]} */
		let lines;
		try {
			lines = linesOf(block.file);
		} catch {
			problems.push(`${chapter.slug}: no such file — ${block.file}`);
			continue;
		}

		const where = `${chapter.slug} → ${block.file}:${block.from}-${block.to}`;

		if (block.from < 1 || block.to > lines.length || block.from > block.to) {
			problems.push(`${where}: range is outside the file (${lines.length} lines)`);
			continue;
		}

		const first = lines[block.from - 1] ?? '';
		const last = lines[block.to - 1] ?? '';

		if (!first.trim()) problems.push(`${where}: starts on a blank line`);
		if (!last.trim()) problems.push(`${where}: ends on a blank line`);

		// ` * …` or `*/` as the first line means the block opens inside a comment
		// that started above it, which reads as a fragment of a sentence.
		if (/^\s*(\*|\*\/)/.test(first)) {
			problems.push(`${where}: starts inside a block comment — "${first.trim().slice(0, 50)}"`);
		}

		const body = lines.slice(block.from - 1, block.to).join('\n');
		// `partial: true` is the author saying "this slice cuts through something on
		// purpose" — the opening of a config object, the middle of a long function.
		// Everything else is claiming to be a whole thing, and is held to it.
		if (!block.partial && !balanced(body)) {
			problems.push(`${where}: brackets do not balance — the slice cuts through something`);
		}
	}

	// `terminal` counts: a chapter of diagrams and shell transcripts is a real
	// chapter. A chapter with neither is one that lost its code in an edit.
	if (blocks === 0) {
		problems.push(`${chapter.slug}: no code or terminal blocks at all`);
	}
}

console.log(
	`${chapters.length} chapters · ${quoted} blocks quoted from meridian/ by line range · ` +
		`${illustrative} illustrative blocks (no file named)`
);

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}

console.log('every range is inside its file, whole, and starts somewhere a reader can follow');
