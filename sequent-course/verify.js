/**
 * COURSE ↔ CODE FIDELITY
 * ======================
 *
 * Every code block in this course that names a file must be **in** that file.
 * This script checks it, against the built pages in `dist/` — what a reader
 * actually sees — rather than against the chapter data, so a builder bug that
 * mangled a block would be caught too.
 *
 * The point is not tidiness. A course that quotes a codebase drifts from it the
 * first time somebody refactors, and the drift is invisible: the prose still
 * reads correctly, the code sample still compiles in the reader's head, and it
 * is simply no longer what the project does. This course went without a check
 * for one migration, and that was enough — forty blocks had quietly stopped
 * being true. Checking it mechanically turns "the course quotes the code" from
 * a claim into a property, and this fails the day either side changes without
 * the other.
 *
 * ## What counts as a quotation
 *
 * A block's label is a quotation when it looks like a path: it contains a `/`
 * or ends in an extension. A trailing note in brackets — `apply.ts (abridged)`
 * — is not part of the path. Anything else (`the wrong version`, `ts`) is an
 * illustration: a contrived before/after or the shape of an idea, deliberately
 * not checked here. If a block names a file, it is a quotation, and it is one
 * of exactly three things:
 *
 *   - **verbatim** — the text occurs in the file as it stands;
 *   - **reindented** — it occurs once each line's leading and trailing
 *     whitespace is ignored, because a slice from inside a function is shown
 *     flush with the page rather than four tabs in;
 *   - **an honest excerpt** — every gap is marked by an elision line of its
 *     own (`// …` in script, `<!-- … -->` in markup, `/* … *\/` in CSS, a
 *     bare `…` in JSON), and every run between the gaps occurs in the file,
 *     in order.
 *
 * All three match whole lines. A block whose first line has lost its start,
 * or whose last line has lost its end — `}` where the file says `},` — shows a
 * line the file does not contain, even though the text is a substring of it.
 *
 * Everything else fails: a label that names no file (renamed or deleted), a
 * line that is not in the file (edited for the page, or stale), and lines that
 * are all real but were skipped without saying so. The last one is the subtle
 * one — an excerpt that silently joins two distant lines shows the reader code
 * that does not exist anywhere.
 *
 * An elision marks a gap *between* lines. `{ /* … *\/ }` inside a line, or
 * ` * …` inside a doc comment, is a line the file does not contain, and it
 * fails like one: quote the whole comment, or cut around it.
 *
 * Run:  node sequent-course/build.js && node sequent-course/verify.js
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const project = join(here, '..', 'sequent');

if (!existsSync(dist)) {
	console.error('No dist/ to check. Run `node sequent-course/build.js` first.');
	process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Reading a built page back into text                                 */
/* ------------------------------------------------------------------ */

/**
 * Undo the builder's escaping. `&amp;` goes last, so `&amp;lt;` — a literal
 * `&lt;` in the source — comes back as `&lt;` and not as `<`.
 *
 * @param {string} html
 */
function decode(html) {
	return html
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&#x27;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}

/** A line that stands for lines left out, and nothing else. */
const ELISION = /^\s*(\/\/\s*)?(\/\*\s*)?(<!--\s*)?(…|\.\.\.)(\s*\*\/)?(\s*-->)?\s*$/;

/** @param {string} line */
const norm = (line) => line.trim();

/** @param {string} label */
const looksLikePath = (label) => /\/|\.[a-z0-9]{1,6}$/i.test(label);

/* ------------------------------------------------------------------ */
/* The project, read once per file                                     */
/* ------------------------------------------------------------------ */

/** @type {Map<string, string | null>} */
const cache = new Map();

/** @param {string} path */
function read(path) {
	const full = resolve(project, path);
	if (!cache.has(full)) {
		const exists = existsSync(full) && statSync(full).isFile();
		cache.set(full, exists ? readFileSync(full, 'utf8') : null);
	}
	return cache.get(full) ?? null;
}

/* ------------------------------------------------------------------ */
/* The check                                                           */
/* ------------------------------------------------------------------ */

/**
 * Where `lines` occur in `text` as whole lines, searching from `from`, or -1.
 *
 * Both sides are wrapped in newlines so that a match has to start at the
 * beginning of a line and end at the end of one. A bare substring test would
 * accept a block whose first line had lost its start (`client = createClient({`
 * inside `const client = createClient({`) or whose last line had lost its end
 * (`}` inside `},`), and both of those are lines the file does not contain.
 *
 * @param {string} text the file, already wrapped as `'\n' + text + '\n'`
 * @param {string[]} lines
 * @param {number} [from]
 */
function findLines(text, lines, from = 0) {
	return text.indexOf(`\n${lines.join('\n')}\n`, from);
}

/**
 * A run with the blank lines at either edge removed. A blank line beside an
 * elision belongs to the page's layout, not to the file.
 *
 * @param {string[]} run
 */
function trimBlank(run) {
	let start = 0;
	let end = run.length;
	while (start < end && run[start] === '') start += 1;
	while (end > start && run[end - 1] === '') end -= 1;
	return run.slice(start, end);
}

/**
 * What a quoted block is, or why it is not one.
 *
 * @param {string} code
 * @param {string} source
 * @returns {{ ok: true, kind: string } | { ok: false, why: string }}
 */
function classify(code, source) {
	const lines = code.split('\n');
	if (findLines(`\n${source}\n`, lines) >= 0) return { ok: true, kind: 'verbatim' };

	const sourceLines = source.split('\n').map(norm);
	const joined = `\n${sourceLines.join('\n')}\n`;

	if (findLines(joined, lines.map(norm)) >= 0) return { ok: true, kind: 'reindented' };

	const known = new Set(sourceLines);
	const real = lines.filter((line) => line.trim() && !ELISION.test(line));
	const absent = real.filter((line) => !known.has(norm(line)));

	if (absent.length === real.length) return { ok: false, why: 'none of its lines are in the file' };
	if (absent.length > 0) {
		return {
			ok: false,
			why: `${absent.length} line(s) not in the file, first: "${norm(absent[0] ?? '').slice(0, 70)}"`
		};
	}

	// Every line is real. An honest excerpt marks each gap, and each run between
	// the marks occurs in the file, as whole lines, after the one before it.
	/** @type {string[][]} */
	const runs = [];
	/** @type {string[]} */
	let run = [];
	for (const line of lines) {
		if (ELISION.test(line)) {
			runs.push(run);
			run = [];
		} else {
			run.push(norm(line));
		}
	}
	runs.push(run);

	let from = 0;
	for (const segment of runs.map(trimBlank).filter((segment) => segment.length > 0)) {
		const at = findLines(joined, segment, from);
		if (at < 0) {
			const first = segment[0] ?? '';
			return {
				ok: false,
				why: `lines were skipped without an elision, near "${first.slice(0, 70)}"`
			};
		}
		// The next run starts on the line after this one ends: the closing
		// newline of this match is the opening newline of the next.
		from = at + segment.join('\n').length + 1;
	}

	return { ok: true, kind: 'excerpt' };
}

const pages = readdirSync(dist)
	.filter((name) => name.endsWith('.html'))
	.sort();

/** @type {Record<string, number>} */
const counts = { verbatim: 0, reindented: 0, excerpt: 0 };
let illustrative = 0;
/** @type {string[]} */
const problems = [];

for (const page of pages) {
	const html = readFileSync(join(dist, page), 'utf8');
	const figures = /<figure class="code( code--terminal)?">([\s\S]*?)<\/figure>/g;

	let match;
	let index = 0;
	while ((match = figures.exec(html))) {
		index += 1;
		// A terminal transcript is output, not source. It is not checked.
		if (match[1]) continue;

		const inner = match[2] ?? '';
		const labelHtml =
			inner.match(/<span class="code__file">([\s\S]*?)<\/span>\s*<button/)?.[1] ?? '';
		const label = decode(labelHtml).trim();
		const path = label.replace(/\s+\(.*\)$/, '');
		const codeHtml = inner.match(/<code[^>]*>([\s\S]*?)<\/code>/)?.[1] ?? '';
		const code = decode(codeHtml).replace(/\n+$/, '');
		const where = `${page}#${index}`;

		if (!looksLikePath(path)) {
			illustrative += 1;
			continue;
		}

		const source = read(path);
		if (source === null) {
			problems.push(`${where} → ${path}: no such file in sequent/`);
			continue;
		}

		const verdict = classify(code, source);
		if (verdict.ok) counts[verdict.kind] = (counts[verdict.kind] ?? 0) + 1;
		else problems.push(`${where} → ${path}: ${verdict.why}`);
	}
}

const quoted = counts.verbatim + counts.reindented + counts.excerpt + problems.length;

console.log(
	`${pages.length} pages · ${quoted} quoted blocks checked against sequent/ ` +
		`(${counts.verbatim} verbatim, ${counts.reindented} reindented, ${counts.excerpt} excerpts) · ` +
		`${illustrative} illustrative blocks (no file named)`
);

if (problems.length > 0) {
	console.error(`${problems.length} block(s) do not match the file they name:`);
	console.error(problems.map((line) => `  ${line}`).join('\n'));
	process.exit(1);
}

console.log('every quoted block is in the file it names, verbatim or as a marked excerpt');
