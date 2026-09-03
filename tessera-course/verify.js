/**
 * COURSE ↔ CODE FIDELITY
 * ======================
 *
 * Every code block in this course that names a `file` must appear **verbatim**
 * in that file. This script checks it.
 *
 * The point is not tidiness. A course that quotes a codebase drifts from it the
 * first time somebody refactors, and the drift is invisible: the prose still
 * reads correctly, the code sample still compiles in the reader's head, and it
 * is simply no longer what the project does. Checking it mechanically turns
 * "the course quotes the code" from a claim into a property, and this fails the
 * day either side changes without the other.
 *
 * Blocks with no `file` are illustrative — a contrived before/after, a shell
 * transcript, a shape of an operation — and are deliberately not checked. If a
 * block names a file, it is a quotation and it has to be exact.
 *
 * Run:  node tessera-course/verify.js
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chapters } from './content/index.js';

const project = join(dirname(fileURLToPath(import.meta.url)), '..', 'tessera');

const cache = new Map();

/** @param {string} path */
function read(path) {
	if (!cache.has(path)) cache.set(path, readFileSync(join(project, path), 'utf8'));
	return cache.get(path);
}

let quoted = 0;
let illustrative = 0;
/** @type {string[]} */
const problems = [];

for (const chapter of chapters) {
	for (const block of chapter.blocks) {
		if (block.type !== 'code') continue;

		if (!block.file) {
			illustrative += 1;
			continue;
		}

		let source;
		try {
			source = read(block.file);
		} catch {
			problems.push(`${chapter.slug}: no such file — ${block.file}`);
			continue;
		}

		quoted += 1;

		// Blocks are stored with a leading newline, and a nested slice has had its
		// common leading indent stripped so it renders flush in the page.
		const body = block.code.replace(/^\n/, '');
		if (source.includes(body)) continue;

		const reindented = ['\t', '\t\t', '\t\t\t', '\t\t\t\t', '\t\t\t\t\t'].some((pad) =>
			source.includes(
				body
					.split('\n')
					.map((line) => (line.trim() ? pad + line : line))
					.join('\n')
			)
		);
		if (reindented) continue;

		const first = body.split('\n').find((line) => line.trim()) ?? '';
		problems.push(`${chapter.slug} → ${block.file}: not found, starting "${first.trim().slice(0, 60)}"`);
	}
}

console.log(
	`${chapters.length} chapters · ${quoted} quoted blocks checked against tessera/ · ` +
		`${illustrative} illustrative blocks (no file named)`
);

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}

console.log('every quoted block is verbatim from the file it names');
