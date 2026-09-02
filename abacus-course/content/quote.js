/**
 * QUOTING THE PROJECT BY REFERENCE
 * ================================
 *
 * Every code block in this course names a file and a range of lines, and the
 * text is read out of the real file when the course is built.
 *
 * WHY THIS IS DIFFERENT FROM THE FIRST FOUR COURSES
 * -------------------------------------------------
 * They pasted the code into the chapter and shipped a script that checked the
 * paste still matched. That works, and it has a failure mode you only notice
 * later: the check tells you the course has drifted *after* somebody has
 * refactored, and the fix is a manual re-paste of thirty blocks. It also means
 * the same lines exist twice in the repository, which is the definition of a
 * thing that will disagree.
 *
 * Reading the file at build time makes drift impossible rather than detectable.
 * A refactor that moves a function changes the course the next time it is built,
 * and `verify.js` is freed up to check something that actually needs judgement:
 * whether the *ranges* are sensible — inside the file, not starting on a blank
 * line, not cut off in the middle of a brace.
 *
 * The cost is that the chapter source no longer shows the code inline. That is a
 * real loss for somebody reading `content/part3.js` directly, and a small one
 * next to a course that is wrong.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The project this course is about. Every `file` is relative to it. */
export const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'abacus');

/** @type {Map<string, string[]>} */
const cache = new Map();

/**
 * The lines of a project file, cached.
 * @param {string} file
 */
export function linesOf(file) {
	let lines = cache.get(file);
	if (!lines) {
		lines = readFileSync(join(PROJECT, file), 'utf8').split('\n');
		cache.set(file, lines);
	}
	return lines;
}

/** Guess the highlighter language from the extension. */
function langFor(file) {
	if (file.endsWith('.svelte')) return 'svelte';
	if (file.endsWith('.css')) return 'css';
	if (file.endsWith('.json')) return 'json';
	if (file.endsWith('.html')) return 'html';
	return 'ts';
}

/**
 * A code block quoting `file`, lines `from`..`to` inclusive and 1-based.
 *
 * The common leading indentation is stripped so that a method lifted out of a
 * class renders flush against the left edge of the page rather than four tabs
 * in. The original indentation is what `verify.js` reads, so the two never have
 * to agree about whitespace.
 *
 * `partial: true` marks a slice that deliberately cuts through a structure — the
 * opening of a config object, the middle of a long function. `verify.js` skips
 * its bracket-balance check for those, and *only* for those, so the check keeps
 * its teeth for the blocks that claim to be whole things.
 *
 * @param {string} file
 * @param {number} from
 * @param {number} to
 * @param {{ label?: string, partial?: boolean }} [options]
 */
export function code(file, from, to, options = {}) {
	const lines = linesOf(file).slice(from - 1, to);

	const indent = Math.min(
		...lines.filter((line) => line.trim()).map((line) => line.match(/^\t*/)?.[0].length ?? 0)
	);

	return {
		type: 'code',
		file,
		lang: langFor(file),
		from,
		to,
		label: options.label,
		partial: options.partial === true,
		code: '\n' + lines.map((line) => line.slice(indent)).join('\n')
	};
}
