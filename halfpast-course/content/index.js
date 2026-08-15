import { part0 } from './part0.js';
import { part1 } from './part1.js';
import { part2 } from './part2.js';
import { part3 } from './part3.js';
import { part4 } from './part4.js';
import { part5 } from './part5.js';
import { part6 } from './part6.js';

/**
 * The full chapter list, in reading order.
 *
 * Chapter numbers come from position in this array, and no slug contains a number —
 * so inserting a chapter anywhere renumbers everything automatically and never leaves
 * a stale filename behind.
 *
 * The order is not the order the app was built in, and that is deliberate. Time comes
 * first, with no database and no interface anywhere near it, because it is the hardest
 * part and because it is pure — you can be certain it is right before anything else
 * depends on it. The concurrency chapter then arrives while the reader still remembers
 * what a five-minute cell is.
 */
export const chapters = [
	// 01–04  What we are building, and why two parts of it are hard
	...part0,
	// 05–09  Time: instants, zones, the grid, availability, and testing all of it
	...part1,
	// 10–14  The database, and the one line that stops double-booking
	...part2,
	// 15–19  Config, identity, authorisation, taking a booking, live events
	...part3,
	// 20–23  Remote functions, forms, live queries, async Svelte
	...part4,
	// 24–29  The design system and the four screens
	...part5,
	// 30–35  Motion, mobile, testing, security, shipping
	...part6
];
