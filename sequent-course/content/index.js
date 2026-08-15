/**
 * The course, in reading order.
 *
 * One file per part rather than one enormous array, for the same reason the
 * venue is one file per concern: a part is the unit somebody actually works on,
 * and a 4,000-line module is a file nobody opens without a reason.
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

export const chapters = [
	// Part 0 — Ground floor: what a venue is, and the two representations
	// everything else depends on.
	...part0,

	// Part 1 — The matching engine: the pure function at the centre.
	...part1,

	// Part 2 — The log: durability, sequencing, checkpoints and replay.
	...part2,

	// Part 3 — Projections, the ledger, and reading.
	...part3,

	// Part 4 — The web tier: SvelteKit 3, remote functions, sessions, CSRF.
	...part4,

	// Part 5 — Talking to the outside: the public API, keys, limits, the outbox.
	...part5,

	// Part 6 — The screens: mobile first, motion, the ladder, live queries.
	...part6,

	// Part 7 — Running it: migrations, flags, billing, tests, operations.
	...part7
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
