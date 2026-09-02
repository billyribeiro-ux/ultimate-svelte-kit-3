/**
 * The course, in reading order.
 *
 * One file per part rather than one enormous array, for the same reason the
 * project is one folder per concern: a part is the unit somebody actually works
 * on, and a 4,000-line module is a file nobody opens without a reason.
 *
 * The builder does not know parts exist. It takes a flat list of chapters and
 * numbers them 01…N, because that is what a reader wants — "chapter 27" is a
 * place, and "part 5, chapter 3" is arithmetic.
 */

import { part0 } from './part0.js';
import { part1 } from './part1.js';
import { part2 } from './part2.js';
import { part3 } from './part3.js';
import { part4 } from './part4.js';
import { part5 } from './part5.js';
import { part6 } from './part6.js';
import { part7 } from './part7.js';
import { part8 } from './part8.js';
import { part9 } from './part9.js';

export const chapters = [
	// Part 0 — What we are building, and the one question everything answers.
	...part0,

	// Part 1 — Time, order, and the two tools everything else is built from.
	...part1,

	// Part 2 — The three data structures, and the proof.
	...part2,

	// Part 3 — The board: an algebra of eight operations, and the projection.
	...part3,

	// Part 4 — The server tier: a log, four roles, and a fan-out allowed to fail.
	...part4,

	// Part 5 — Local-first sync, and the four bugs in it.
	...part5,

	// Part 6 — The canvas: a camera, a pointer, and geometry that is just numbers.
	...part6,

	// Part 7 — SvelteKit 3 in anger: remote functions, hooks, i18n, presence.
	...part7,

	// Part 8 — The rest of the product.
	...part8,

	// Part 9 — Proving it, and running it.
	...part9
];

/*
 * Two checks at import time.
 *
 * A duplicate slug silently overwrites a chapter's HTML file, so the course
 * builds "successfully" with one chapter missing and another appearing twice in
 * the table of contents. A missing slug produces `undefined.html`. Both are
 * five-second bugs to fix and twenty-minute ones to notice.
 */
const seen = new Set();

for (const chapter of chapters) {
	if (!chapter.slug) throw new Error(`Chapter "${chapter.title}" has no slug.`);
	if (seen.has(chapter.slug)) throw new Error(`Duplicate chapter slug: ${chapter.slug}`);
	seen.add(chapter.slug);
}
