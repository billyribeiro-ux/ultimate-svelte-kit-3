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
 * ("ch. 14") are the one thing that does not renumber itself, which is why
 * the parts are listed with their ranges here.
 *
 * The order is the order a person would want to understand it, not the order
 * it was built. The model and the audio engine come before any interface,
 * because they are pure and can be certain; the studio comes before the
 * server, because a groovebox with no server is still a groovebox; the
 * adapter comes near the end, because it only makes sense once every route it
 * partitions has been seen.
 */
export const chapters = [
	// 01–03  What we are building, the config, the map
	...part0,
	// 04–08  The model: notes, time, patterns, the URL codec, storage and presets
	...part1,
	// 09–13  Sound: voices, one scheduled step, the engine, two clocks, rendering
	...part2,
	// 14–20  The studio: session, knob, grid, transport, panels, the page, sound & share
	...part3,
	// 21–26  The server: schema, identity, reads, writes, the live jam, hooks
	...part4,
	// 27–32  The pages: layouts, landing, pattern page, gallery, jam, diagnostics & API
	...part5,
	// 33–36  Beyond: the custom element, the adapter, the service worker, security
	...part6,
	// 37–39  Proving it: unit & browser tests, end to end, where next
	...part7
];

/* A duplicate slug would give two chapters one address. Fail at import time. */
const seen = new Set();
for (const chapter of chapters) {
	if (seen.has(chapter.slug)) throw new Error(`Duplicate chapter slug: ${chapter.slug}`);
	seen.add(chapter.slug);
}
