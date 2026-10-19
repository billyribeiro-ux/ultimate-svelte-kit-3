/**
 * THE COURSE, IN ORDER
 * ====================
 *
 * Nine parts, fifty-one chapters. Each part is a file, each chapter an
 * object with a slug (the page's file name), a title, a summary, a goal and
 * its blocks. `build.js` numbers them from the order here, so moving a
 * chapter is moving a line — and the prose names chapters by slug
 * (`ch. {{the-trip-page}}`), so a cross-reference follows the chapter it
 * names wherever it moves. `verify.js` refuses a number written by hand.
 *
 *   part0  01–05  What we are building, the workspace, the toolchain, the config, the map
 *   part1  06–09  The geodesy library: maths, a class with runes, packaging
 *   part2  10–14  The domain: ids, dates, money, fair splits, schemas, the database
 *   part3  15–20  The server: hooks, identity, remote functions, live collaboration
 *   part4  21–22  Three languages
 *   part5  23–33  The interface, tab by tab, and the motion in it
 *   part6  34–39  The pages around the trip, and the trip with no network
 *   part7  40–43  The ecosystem: what was chosen, and the three shapes of a library
 *   part8  44–51  Proof and production: tests, the compiler's messages, security, the
 *                 container, upgrading a major, what is next, and the exit criteria
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

export const chapters = [
	...part0,
	...part1,
	...part2,
	...part3,
	...part4,
	...part5,
	...part6,
	...part7,
	...part8
];

// A slug is a file name; two chapters with one slug would overwrite each other.
const seen = new Set();
for (const chapter of chapters) {
	if (seen.has(chapter.slug)) throw new Error(`duplicate chapter slug: ${chapter.slug}`);
	seen.add(chapter.slug);
}
