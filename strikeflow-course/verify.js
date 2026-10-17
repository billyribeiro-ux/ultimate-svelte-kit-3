/**
 * COURSE ↔ CODE FIDELITY
 * ======================
 *
 * Every code block in this course that names a file must be what that file in
 * `../strikeflow-site` actually says. This script checks it, against the built
 * pages in `dist/` — the thing a reader actually sees.
 *
 * The point is not tidiness. A course that quotes a codebase drifts from it the
 * first time somebody refactors, and the drift is invisible: the prose still
 * reads correctly, the code sample still compiles in the reader's head, and it
 * is simply no longer what the project does. This course went without a check
 * like this for a while, and that is exactly how it drifted. Checking it
 * mechanically turns "the course quotes the code" from a claim into a property.
 *
 * A block whose label looks like a path (`src/routes/+page.svelte`,
 * `vite.config.ts`) is a quotation, and it passes only if its text is in that
 * file in one of three ways. Every comparison is of whole lines: a block that
 * starts or ends halfway through a line of the file is not a quotation of it.
 *
 *   verbatim     the block is a run of the file's lines, exactly
 *   re-indented  it is, once each line's leading and trailing whitespace is
 *                ignored (a nested slice is shown flush with the page)
 *   excerpt      every run of lines between elision lines appears, in order,
 *                each one after the last — so every gap is marked, and no run
 *                reuses a line the run before it already matched
 *
 * An excerpt's elision lines must also read as code in the place they stand,
 * because a reader copies them along with everything else. Each one hides at
 * least one line, never hides a `<script>` or `<style>` tag, and is written in
 * the syntax of the code it replaces:
 *
 *   script   `// …`  — a `.ts` or `.js` file, or a component's `<script>`
 *   CSS      a comment holding only `…` — a `.css` file, a component's
 *            `<style>`, or any block marked as CSS
 *   markup   `<!-- … -->` — a component's template, or an `.html` page
 *   JSON     a bare `…`, because JSON has no comments
 *
 * Anything else fails: a line the file does not contain (the code changed, or
 * the block was edited for the page), lines skipped with no elision to say so,
 * an elision in the wrong syntax, or a label that names no file (the file was
 * renamed or deleted).
 *
 * A block whose label is not a path — "the difference", "usage", "the wrong
 * way" — is an illustration: a contrived before/after or the shape of an idea.
 * It is not a quotation, so it is not checked here. Terminal blocks are skipped
 * too. A label may carry a parenthetical, "fonts.css (continued)", which is
 * ignored when the file is looked up.
 *
 * Run:  node strikeflow-course/build.js && node strikeflow-course/verify.js
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const project = join(root, '..', 'strikeflow-site');

if (!existsSync(dist)) {
	console.error('no dist/ — run `node strikeflow-course/build.js` first');
	process.exit(1);
}

/** Undo the HTML escaping build.js applied, so we compare the text the reader sees. */
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

/** A line that stands for code left out: `…` or `...`, optionally inside a comment. */
const ELISION = /^\s*(\/\/\s*)?(\/\*\s*)?(<!--\s*)?(…|\.\.\.)(\s*\*\/)?(\s*-->)?\s*$/;

/** "Looks like a path": has a slash, or ends in a file extension. */
const PATH_LIKE = /\/|\.[a-z0-9]{1,6}$/i;

/** @param {string} line */
const norm = (line) => line.trim();

/** @type {Map<string, string[] | null>} */
const cache = new Map();

/** @param {string} label */
function read(label) {
	const path = resolve(project, label);
	if (!cache.has(path)) {
		cache.set(
			path,
			existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8').split('\n') : null
		);
	}
	return cache.get(path);
}

/**
 * Where the lines of `needle` start, as a run, in `hay` at or after `from`; -1 if nowhere.
 * @param {string[]} hay
 * @param {string[]} needle
 */
function indexOfRun(hay, needle, from = 0) {
	for (let i = from; i + needle.length <= hay.length; i += 1) {
		if (needle.every((line, j) => hay[i + j] === line)) return i;
	}
	return -1;
}

/**
 * Blank lines at either end of a run are spacing around a gap, not code.
 * @param {string[]} run
 */
function trimBlank(run) {
	let start = 0;
	let end = run.length;
	while (start < end && !run[start]) start += 1;
	while (end > start && !run[end - 1]) end -= 1;
	return run.slice(start, end);
}

/**
 * Which part of a component or HTML page each line is in: 'script', 'style' or
 * 'markup'. The `<script>` and `<style>` tag lines themselves are markup.
 * @param {string[]} file
 */
function regions(file) {
	let part = 'markup';
	return file.map((line) => {
		const tag = line.trim();
		const opens = /^<(script|style)[\s>]/.exec(tag);
		if (opens && !tag.includes(`</${opens[1]}>`)) {
			part = opens[1];
			return 'markup';
		}
		if (/^<\/(script|style)>/.test(tag)) {
			part = 'markup';
			return 'markup';
		}
		return part;
	});
}

/** @param {string} line */
const isTag = (line) => /^<\/?(script|style)[\s>]/.test(line.trim());

/** The one way to write an elision in each kind of code. */
const ELISION_IN = {
	script: { name: 'script', write: '// …', test: /^\s*\/\/ …\s*$/ },
	style: { name: 'CSS', write: '/* … */', test: /^\s*\/\* … \*\/\s*$/ },
	markup: { name: 'markup', write: '<!-- … -->', test: /^\s*<!-- … -->\s*$/ },
	json: { name: 'JSON', write: '…', test: /^\s*…\s*$/ }
};

/**
 * Why a quoted block is not in its file, or null if it is.
 * @param {string} code
 * @param {string[]} file
 * @param {string} name the file's path, for its extension
 * @param {string} lang the block's language
 */
function mismatch(code, file, name, lang) {
	if (`\n${file.join('\n')}\n`.includes(`\n${code}\n`)) return null;

	const lines = code.split('\n');
	const fileNorm = file.map(norm);
	if (indexOfRun(fileNorm, lines.map(norm)) >= 0) return null;

	const known = new Set(fileNorm);
	const real = lines.filter((line) => line.trim() && !ELISION.test(line));
	const missing = real.filter((line) => !known.has(norm(line)));
	if (missing.length === real.length) return 'no line of it is in the file';
	if (missing.length > 0) {
		return `${missing.length} line(s) not in the file, first: "${missing[0].trim().slice(0, 70)}"`;
	}

	// Every line exists. An honest excerpt marks each gap with an elision line,
	// and each run between the gaps occurs in the file, in order, after the one
	// before it — so a run cannot quietly repeat a line the last run matched.
	/** @type {string[][]} */
	const runs = [];
	/** @type {{ line: string, after: number }[]} */
	const gaps = [];
	let run = [];
	for (const line of lines) {
		if (ELISION.test(line)) {
			if (run.length) runs.push(trimBlank(run));
			run = [];
			gaps.push({ line, after: runs.length });
		} else run.push(norm(line));
	}
	if (run.length) runs.push(trimBlank(run));

	/** @type {number[]} */
	const starts = [];
	let from = 0;
	for (const r of runs) {
		const at = indexOfRun(fileNorm, r, from);
		if (at < 0)
			return `lines skipped without an elision, near "${r.find(Boolean)?.slice(0, 70) ?? ''}"`;
		starts.push(at);
		from = at + r.length;
	}

	// Each elision between two runs hides at least one line and no `<script>` or
	// `<style>` tag, so it stands inside one part of the file. One at the start or
	// end of a block stands for "and more", in the part of the code beside it.
	// Either way it is written in that part's syntax.
	const parts = /\.(svelte|html)$/.test(name) ? regions(file) : null;
	for (const gap of gaps) {
		const hiddenFrom = gap.after > 0 ? starts[gap.after - 1] + runs[gap.after - 1].length : null;
		const shownAgain = gap.after < runs.length ? starts[gap.after] : null;
		const shown = gap.line.trim();
		let at;
		if (hiddenFrom !== null && shownAgain !== null) {
			if (shownAgain === hiddenFrom) return `"${shown}" stands for no lines`;
			const tag = parts && file.slice(hiddenFrom, shownAgain).find(isTag);
			if (tag) return `"${shown}" hides the tag ${tag.trim()}`;
			at = hiddenFrom;
		} else at = shownAgain ?? (hiddenFrom ?? 1) - 1;

		const kind = lang === 'json' ? 'json' : lang === 'css' ? 'style' : parts ? parts[at] : 'script';
		const want = ELISION_IN[kind];
		if (!want.test.test(gap.line)) {
			return `"${shown}" stands in ${want.name} (file line ${at + 1}), where an elision is ${want.write}`;
		}
	}
	return null;
}

let quoted = 0;
let illustrative = 0;
/** @type {string[]} */
const problems = [];

const pages = readdirSync(dist).filter((name) => name.endsWith('.html'));

for (const page of pages) {
	const html = readFileSync(join(dist, page), 'utf8');
	const figures = /<figure class="code( code--terminal)?">([\s\S]*?)<\/figure>/g;
	let match;
	let index = 0;

	while ((match = figures.exec(html))) {
		index += 1;
		if (match[1]) continue; // a terminal

		const inner = match[2];
		const labelHtml =
			(inner.match(/<span class="code__file">([\s\S]*?)<\/span>\s*<button/) ?? [])[1] ?? '';
		const label = decode(
			labelHtml.replace(/<span class="code__lines">[\s\S]*?<\/span>/, '')
		).trim();
		const name = label.replace(/\s+\(.*\)$/, '');
		const lang = (inner.match(/<code class="lang-([^"]+)"/) ?? [])[1] ?? '';
		const code = decode((inner.match(/<code[^>]*>([\s\S]*?)<\/code>/) ?? [])[1] ?? '').replace(
			/\n+$/,
			''
		);
		const where = `${page}#${index}`;

		const file = name ? read(name) : null;
		if (!file) {
			if (PATH_LIKE.test(name)) problems.push(`${where}: no such file — ${label}`);
			else illustrative += 1;
			continue;
		}

		quoted += 1;
		const why = mismatch(code, file, name, lang);
		if (why) problems.push(`${where} → ${label}: ${why}`);
	}
}

console.log(
	`${pages.length} pages · ${quoted} quoted blocks checked against strikeflow-site/ · ` +
		`${illustrative} illustrations (no file named)`
);

if (problems.length > 0) {
	console.error(`${problems.length} block(s) do not match the project:`);
	console.error(problems.map((problem) => `  ${problem}`).join('\n'));
	process.exit(1);
}

console.log(
	'every quoted block is in the file it names — verbatim, re-indented, or an excerpt with every gap marked in its own syntax'
);
