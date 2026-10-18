/**
 * TURN CHAPTER NUMBERS INTO CHAPTER NAMES
 * =======================================
 *
 * `build.js` numbers the chapters by their position in `content/index.js`,
 * which is what makes moving a chapter "moving a line". It also made every
 * cross-reference in the prose a promise nothing kept: "ch. 24" is written
 * by hand, and inserting one chapter before it makes it point at the
 * chapter before the one it meant — silently, on every later page at once.
 *
 * So the prose names the chapter instead, and the builder supplies the
 * number: `ch. {{the-trip-page}}` renders as "ch. 24", linked, for as long
 * as the trip page is the twenty-fourth chapter, and as "ch. 25" the day a
 * chapter is added before it. `verify.js` refuses a bare number and a name
 * that is not a chapter.
 *
 * This rewrites the existing references once. It reads each number through
 * the order the chapters are in *now*, so it must run before the order
 * changes, and running it again finds nothing left to do. It understands
 * the shapes the course uses: `ch. 24`, `chapter 36`, `Chapter 44`,
 * `chapters 16–19`, `ch. 24, 31` and `chapters 06, 24, 25 and 31`.
 *
 * Run:  node meridian-course/tools/slugify-refs.js
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapters } from '../content/index.js';

const content = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');

/*
 * The word, then a list of one- or two-digit numbers joined by a dash, a
 * comma, "and" or "or". A number followed by another digit or by a decimal
 * point is not a chapter ("5.36:1"), so each one is fenced on the right.
 */
const NUMBER = String.raw`\d{1,2}(?!\d|\.\d)`;
const REFERENCE = new RegExp(
	String.raw`\b(ch\.|[Cc]hapters?)(\s+)(${NUMBER}(?:\s*(?:–|-|,|and|or)\s*${NUMBER})*)`,
	'g'
);

/** @param {string} digits */
function slugOf(digits) {
	const chapter = chapters[Number(digits) - 1];
	if (!chapter) throw new Error(`there is no chapter ${digits}`);
	return chapter.slug;
}

let total = 0;

for (const name of readdirSync(content).filter((f) => /^part\d+\.js$/.test(f))) {
	const file = join(content, name);
	const before = readFileSync(file, 'utf8');
	let count = 0;

	const after = before.replace(REFERENCE, (_, word, space, list) => {
		count += 1;
		return word + space + list.replace(/\d{1,2}/g, (/** @type {string} */ n) => `{{${slugOf(n)}}}`);
	});

	if (after !== before) writeFileSync(file, after);
	console.log(`${name}: ${count} reference(s)`);
	total += count;
}

console.log(`${total} references now name their chapter`);
