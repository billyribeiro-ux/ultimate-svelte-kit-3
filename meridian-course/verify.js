/**
 * COURSE ↔ CODE FIDELITY
 * ======================
 *
 * The first four courses pasted code into the chapters and used a script to
 * check the paste still matched. Since Sextant, a course reads the code out of
 * the project at build time instead, so *that* check is vacuously true — the
 * text and the file are the same bytes by construction.
 *
 * That does not make the script unnecessary. It moves it to the thing that
 * still needs judgement: **whether the ranges are sensible.** A quotation can be
 * perfectly faithful and still useless — a block that starts on the closing
 * brace of the function above it, or stops halfway through an `if`, is exactly
 * as wrong to a reader as a stale paste, and no amount of byte-comparison
 * notices.
 *
 * So this checks six things a person would otherwise have to check by eye:
 *
 *   1. the file exists;
 *   2. the range is inside it;
 *   3. it does not begin or end on a blank line;
 *   4. it does not begin mid-comment — a block starting on ` * so on` reads as
 *      gibberish;
 *   5. braces, brackets and parentheses balance across the slice, which is a
 *      cheap and surprisingly effective proxy for "this is a whole thing";
 *   6. every chapter has at least one code or terminal block, because a chapter
 *      of pure prose in a course about building something is usually a chapter
 *      that lost its code in an edit;
 *   7. every cross-reference names a chapter that exists — `{{the-trip-page}}`,
 *      which `build.js` turns into the chapter's number — and no chapter number
 *      is written by hand ("ch. 24", "chapter 36", "chapters 16–19"), in the
 *      prose, in the part files' own comments, or in a quoted code comment. A
 *      hand-written number is right until a chapter is inserted before it, and
 *      then wrong on every page at once with nothing to say so;
 *   8. the exit criteria are true. `content/surfaces.json` lists every
 *      surface the coverage plan assigned to a chapter, with a status, and
 *      the last chapter renders it as the checklist a reader measures
 *      themselves against. So every chapter it names must exist, and every
 *      planned chapter must have a row; a surface marked `taught` or
 *      `declined` must be in backticks in the prose of the chapter it names;
 *      and a `deferred` one must be on the backlog — its gap-list item in
 *      `content/backlog.json`, and the surface itself in backticks in the
 *      prose of what-i-would-do-next. Mark a deferred surface `taught` and
 *      this fails, which is the point: the checklist cannot claim what the
 *      course does not do.
 *
 * Run:  node meridian-course/verify.js
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapters } from './content/index.js';
import { linesOf } from './content/quote.js';
import { hasInBackticks, proseOf, readSurfaces } from './content/surfaces.js';

/** @type {string[]} */
const problems = [];
let quoted = 0;
let illustrative = 0;

/**
 * Do the brackets balance?
 *
 * Deliberately crude: it counts characters and ignores those inside strings and
 * comments, which it detects with a small state machine rather than a regular
 * expression, because a regular expression that finds strings in TypeScript is
 * either wrong or a parser. A real lexer could do this
 * exactly — and a heuristic that depends on the project it checks is a loop
 * worth avoiding.
 *
 * @param {string} text
 */
function balanced(text) {
	let depth = 0;
	let inString = /** @type {string | null} */ (null);
	let inLine = false;
	let inBlock = false;

	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		const next = text[i + 1];

		if (inLine) {
			if (ch === '\n') inLine = false;
			continue;
		}
		if (inBlock) {
			if (ch === '*' && next === '/') {
				inBlock = false;
				i += 1;
			}
			continue;
		}
		if (inString) {
			if (ch === '\\') i += 1;
			else if (ch === inString) inString = null;
			continue;
		}

		if (ch === '/' && next === '/') {
			inLine = true;
			i += 1;
			continue;
		}
		if (ch === '/' && next === '*') {
			inBlock = true;
			i += 1;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			inString = ch;
			continue;
		}

		if (ch === '{' || ch === '(' || ch === '[') depth += 1;
		if (ch === '}' || ch === ')' || ch === ']') depth -= 1;

		// A slice that closes more than it opens is cut off at the front, which is
		// worth reporting even if it ends up balanced by the end.
		if (depth < 0) return false;
	}

	return depth === 0;
}

for (const chapter of chapters) {
	let blocks = 0;

	for (const block of chapter.blocks) {
		if (block.type === 'terminal') {
			blocks += 1;
			continue;
		}
		if (block.type !== 'code') continue;
		blocks += 1;

		if (!block.file) {
			illustrative += 1;
			continue;
		}

		quoted += 1;

		/** @type {string[]} */
		let lines;
		try {
			lines = linesOf(block.file);
		} catch {
			problems.push(`${chapter.slug}: no such file — ${block.file}`);
			continue;
		}

		const where = `${chapter.slug} → ${block.file}:${block.from}-${block.to}`;

		if (block.from < 1 || block.to > lines.length || block.from > block.to) {
			problems.push(`${where}: range is outside the file (${lines.length} lines)`);
			continue;
		}

		const first = lines[block.from - 1] ?? '';
		const last = lines[block.to - 1] ?? '';

		if (!first.trim()) problems.push(`${where}: starts on a blank line`);
		if (!last.trim()) problems.push(`${where}: ends on a blank line`);

		// ` * …` or `*/` as the first line means the block opens inside a comment
		// that started above it, which reads as a fragment of a sentence.
		if (/^\s*(\*|\*\/)/.test(first)) {
			problems.push(`${where}: starts inside a block comment — "${first.trim().slice(0, 50)}"`);
		}

		const body = lines.slice(block.from - 1, block.to).join('\n');
		// `partial: true` is the author saying "this slice cuts through something on
		// purpose" — the opening of a config object, the middle of a long function.
		// Everything else is claiming to be a whole thing, and is held to it.
		if (!block.partial && !balanced(body)) {
			problems.push(`${where}: brackets do not balance — the slice cuts through something`);
		}
	}

	// `terminal` counts: a chapter of diagrams and shell transcripts is a real
	// chapter. A chapter with neither is one that lost its code in an edit.
	if (blocks === 0) {
		problems.push(`${chapter.slug}: no code or terminal blocks at all`);
	}
}

/* 7. Cross-references ------------------------------------------------ */

const slugs = new Set(chapters.map((c) => c.slug));
const XREF = /\{\{([A-Za-z0-9-]+)\}\}/g;
const BARE = /\b([Cc]h\.|[Cc]hapters?)\s+\d+/g;
const content = join(dirname(fileURLToPath(import.meta.url)), 'content');
let xrefs = 0;

for (const name of readdirSync(content).filter((f) => /^part\d+\.js$/.test(f))) {
	const lines = readFileSync(join(content, name), 'utf8').split('\n');
	lines.forEach((line, i) => {
		for (const [, slug] of line.matchAll(XREF)) {
			xrefs += 1;
			if (!slugs.has(slug)) problems.push(`${name}:${i + 1}: {{${slug}}} names no chapter`);
		}
		for (const [match] of line.matchAll(BARE)) {
			problems.push(`${name}:${i + 1}: "${match}…" is a chapter number written by hand — name the chapter: {{slug}}`);
		}
	});
}

for (const chapter of chapters) {
	if (XREF.test(chapter.title)) problems.push(`${chapter.slug}: a title is a name, not a reference`);
	XREF.lastIndex = 0;
	for (const block of chapter.blocks) {
		if (block.type !== 'code' || !block.file) continue;
		for (const [match] of block.code.matchAll(BARE)) {
			problems.push(`${chapter.slug} → ${block.file}: "${match}…" in the quoted code — name the chapter instead`);
		}
	}
}

/* 8. The exit criteria --------------------------------------------- */

const { plannedChapters, rows } = readSurfaces();
const backlog = JSON.parse(readFileSync(join(content, 'backlog.json'), 'utf8'));
const backlogIds = new Set(backlog.map((/** @type {{ id: string }} */ item) => item.id));
const proseBySlug = new Map(chapters.map((c) => [c.slug, proseOf(c)]));
const BACKLOG = 'what-i-would-do-next';
/** @type {Record<string, number>} */
const counts = { taught: 0, declined: 0, deferred: 0, dropped: 0 };

for (const slug of plannedChapters) {
	if (!slugs.has(slug)) problems.push(`surfaces.json: planned chapter ${slug} is not a chapter`);
	else if (!rows.some((row) => row.planned.includes(slug))) {
		problems.push(`surfaces.json: planned chapter ${slug} has no row in the exit criteria`);
	}
}

for (const row of rows) {
	counts[row.status] = (counts[row.status] ?? 0) + 1;
	const where = `surfaces.json: \`${row.surface}\` (${row.status})`;
	for (const slug of [row.chapter, ...row.planned]) {
		if (!slugs.has(slug)) problems.push(`${where} names ${slug}, which is not a chapter`);
	}
	if (row.status === 'taught' || row.status === 'declined') {
		if (!hasInBackticks(proseBySlug.get(row.chapter) ?? '', row.surface)) {
			problems.push(`${where} — ${row.chapter} never names it in backticks, so it is not taught there`);
		}
	} else if (row.status === 'deferred') {
		if (!row.gap || !backlogIds.has(row.gap)) problems.push(`${where} — its gap-list item ${row.gap} is not in backlog.json`);
		if (!hasInBackticks(proseBySlug.get(BACKLOG) ?? '', row.surface)) {
			problems.push(`${where} — not named in the backlog of ${BACKLOG}`);
		}
	} else if (row.status === 'dropped') {
		if (!row.reason) problems.push(`${where} — a dropped surface needs the reason it was not built`);
	} else {
		problems.push(`${where} — unknown status`);
	}
}

console.log(
	`${chapters.length} chapters · ${quoted} blocks quoted from meridian/ by line range · ` +
		`${illustrative} illustrative blocks (no file named) · ${xrefs} chapter references by name · ` +
		`${rows.length} surfaces in the exit criteria (${counts.taught} taught, ${counts.declined} declined, ` +
		`${counts.deferred} deferred, ${counts.dropped} dropped)`
);

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}

console.log(
	'every range is inside its file, whole, and starts somewhere a reader can follow; every chapter reference names a chapter; every surface the exit criteria claim is taught is taught, and every deferred one is on the backlog'
);
