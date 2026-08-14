import { part0 } from './part0.js';
import { part1 } from './part1.js';
import { part2 } from './part2.js';
import { part3 } from './part3.js';
import { part4 } from './part4.js';

/**
 * The full chapter list, in reading order.
 *
 * Chapter numbers are derived from position in this array, and slugs contain no
 * numbers — so inserting a chapter anywhere renumbers everything automatically and
 * never leaves a stale filename behind. That is why part0 and part4 could be added
 * later without touching a single existing slug.
 *
 * The motion chapters deliberately sit BEFORE the testing chapters: the end-to-end
 * tests we write in the testing chapters cover the motion safety rules, so the
 * reader needs to have built them first.
 */

/** Split part3 so the motion chapters can slot in before the testing ones. */
const TESTING_SLUGS = new Set(['unit-tests', 'e2e-tests', 'ship-it']);

const buildingChapters = part3.filter((chapter) => !TESTING_SLUGS.has(chapter.slug));
const testingChapters = part3.filter((chapter) => TESTING_SLUGS.has(chapter.slug));

export const chapters = [
	// 01–06  Foundations — assumes you have never written code
	...part0,
	// 07–13  Setup, SvelteKit 3, TypeScript, fonts, design system
	...part1,
	// 14–23  Data, environment, SEO, UI components, charts
	...part2,
	// 24–30  Pages, lead capture, the PDF pipeline, blog and legal
	...buildingChapters,
	// 31–34  Cinematic motion
	...part4,
	// 35–37  Testing and shipping
	...testingChapters
];
