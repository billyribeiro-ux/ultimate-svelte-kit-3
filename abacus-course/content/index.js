import { part0 } from './part0.js';
import { part1 } from './part1.js';
import { part2 } from './part2.js';
import { part3 } from './part3.js';
import { part4 } from './part4.js';
import { part5 } from './part5.js';
import { part6 } from './part6.js';
import { part7 } from './part7.js';

/**
 * The full chapter list, in reading order.
 *
 * Chapter numbers come from position in this array, and no slug contains a
 * number — so inserting a chapter anywhere renumbers everything automatically
 * and never leaves a stale filename behind. Cross-references in the prose
 * ("ch. 15") are the one thing that does not renumber itself, which is why
 * the parts are listed with their ranges here.
 *
 * The order is the order a person would want to understand it. The formula
 * language and the engine come first because they are pure and can be
 * certain; the sheet model comes before the grid because the grid is a view
 * of it; the server comes after the interface because a spreadsheet with no
 * server is still a spreadsheet; the pages come last because every one of
 * them is assembled from parts already seen.
 */
export const chapters = [
	// 01–03  What we are building, the config, the map
	...part0,
	// 04–08  The formula language: addresses, values, lexer, parser, evaluation
	...part1,
	// 09–12  The engine: the graph, cycles, moving references, proving it
	...part2,
	// 13–17  The sheet model: locale, the document, the class, commands, the lesson
	...part3,
	// 18–23  The grid and the editor: axis, grid, input, editor and bar, toolbar, CSV
	...part4,
	// 24–29  The server: schema, identity, passkeys, sheets, live, hooks
	...part5,
	// 30–35  The pages: shell, landing and templates, local, stored, workspace, published
	...part6,
	// 36–39  Proving and shipping: unit and browser, end to end, deploying, where next
	...part7
];

/* A duplicate slug would give two chapters one address. Fail at import time. */
const seen = new Set();
for (const chapter of chapters) {
	if (seen.has(chapter.slug)) throw new Error(`Duplicate chapter slug: ${chapter.slug}`);
	seen.add(chapter.slug);
}
