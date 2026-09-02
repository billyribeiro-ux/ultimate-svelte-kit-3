/**
 * The course, in reading order.
 *
 * One file per part rather than one enormous array, for the same reason the
 * project is one folder per concern: a part is the unit somebody actually works
 * on, and a four-thousand-line module is a file nobody opens without a reason.
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

export const chapters = [
	// Part 0 — What we are building, and the decision everything follows from.
	...part0,

	// Part 1 — The front end of a language: characters in, a checked tree out.
	...part1,

	// Part 2 — Answering the question: the evaluator, and two sketches.
	...part2,

	// Part 3 — Time, shape and state.
	...part3,

	// Part 4 — Storage, ingest and access.
	...part4
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
