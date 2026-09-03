/**
 * THE COURSE, IN ORDER
 * ====================
 *
 * Nine parts, forty-five chapters. Each part is a file, each chapter an
 * object with a slug (the page's file name), a title, a summary, a goal and
 * its blocks. `build.js` numbers them from the order here, so moving a
 * chapter is moving a line.
 *
 *   part0  01–04  What we are building, the workspace, the config, the map
 *   part1  05–08  The geodesy library: maths, a class with runes, packaging
 *   part2  09–13  The domain: ids, dates, money, fair splits, schemas, the database
 *   part3  14–19  The server: hooks, identity, remote functions, live collaboration
 *   part4  20–21  Three languages
 *   part5  22–31  The interface, tab by tab
 *   part6  32–36  The pages around the trip
 *   part7  37–40  The ecosystem: what was chosen, and the three shapes of a library
 *   part8  41–45  Proof and production: tests, security, the container, what is next
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
