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
 * So this checks nine things a person would otherwise have to check by eye:
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
 *   7. no two blocks in one chapter quote the same lines of the same file — a
 *      reader who meets a step twice on one page assumes it is two steps;
 *   8. no block, `partial` or not, ends on a line that only opens something
 *      (`switch (key) {`, `<div`) or on a comment about code it does not show;
 *   9. in a `.svelte` file, the markup in a whole block balances: every
 *      `{#if}`, `{#each}`, `{#snippet}` and every element it opens, it closes,
 *      and it closes nothing it did not open. Brackets cannot see this — a
 *      slice that stops between `{/each}` and `</div>` balances perfectly.
 *
 * Run:  node abacus-course/verify.js
 */

import { chapters } from './content/index.js';
import { linesOf } from './content/quote.js';

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

/**
 * Which lines of a `.svelte` file are markup, as opposed to the inside of the
 * top-level `<script>` or `<style>`.
 *
 * This has to be decided from the whole file, not from the slice: a slice of
 * TypeScript is full of `<Drag | null>` and `Map<string, Cell>`, which look
 * exactly like tags to anything that only sees the slice. The top-level tags
 * start in column 0 in every component this project has, and the opening and
 * closing tag lines count as script or style — so a block may quote the top of
 * a script, or the bottom of one, without being told it left a tag open.
 *
 * @param {string[]} lines
 */
function markupLines(lines) {
	/** @type {boolean[]} */
	const markup = [];
	/** @type {string | null} */
	let inside = null;

	for (const line of lines) {
		if (inside) {
			markup.push(false);
			if (line.startsWith(`</${inside}>`)) inside = null;
			continue;
		}
		const open = /^<(script|style)\b/.exec(line);
		if (open) {
			markup.push(false);
			if (!line.includes(`</${open[1]}>`)) inside = open[1];
			continue;
		}
		markup.push(true);
	}

	return markup;
}

/**
 * The index just past the `}` that closes the `{` at `i`, or -1 if the text ends
 * first. Strings and template literals are skipped, so `{x ? '}' : y}` and
 * `` style:--hl={`var(--h-${n})`} `` are one expression each.
 *
 * @param {string} text
 * @param {number} i
 */
function skipExpression(text, i) {
	const stack = ['{'];
	i += 1;

	while (i < text.length && stack.length > 0) {
		const ch = text[i];
		const top = stack[stack.length - 1];

		if (top === '`' || top === '"' || top === "'") {
			if (ch === '\\') i += 2;
			else if (top === '`' && ch === '$' && text[i + 1] === '{') {
				stack.push('{');
				i += 2;
			} else {
				if (ch === top) stack.pop();
				i += 1;
			}
			continue;
		}

		if (ch === '"' || ch === "'" || ch === '`') stack.push(ch);
		else if (ch === '{') stack.push('{');
		else if (ch === '}') stack.pop();
		i += 1;
	}

	return stack.length > 0 ? -1 : i;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * What is wrong with the structure of a piece of Svelte markup, or `null`.
 *
 * Template blocks and elements share one stack, because they have to nest
 * inside each other: `{#if}<div>{/if}</div>` is as broken as an unclosed tag.
 * Expressions in braces and quoted attribute values are skipped whole, so an
 * arrow function's `>` in `onclick={() => …}` does not end a tag.
 *
 * @param {string} text
 */
function markupProblem(text) {
	/** @type {string[]} */
	const stack = [];
	const shown = (/** @type {string} */ open) => (open.startsWith('{') ? `\`${open}\`` : `\`<${open}>\``);
	let i = 0;

	while (i < text.length) {
		if (text.startsWith('<!--', i)) {
			const end = text.indexOf('-->', i + 4);
			if (end < 0) return 'ends inside an HTML comment';
			i = end + 3;
			continue;
		}

		const ch = text[i];

		if (ch === '{') {
			const end = skipExpression(text, i);
			if (end < 0) return 'ends inside a `{…}` tag';
			const tag = /^([#:/])(\w+)/.exec(text.slice(i + 1, end - 1).trim());
			if (tag) {
				const [, sigil, name] = tag;
				const top = stack[stack.length - 1];
				if (sigil === '#') stack.push(`{#${name}}`);
				else if (sigil === ':') {
					if (!top?.startsWith('{#')) return `has \`{:${name}}\` outside the block it belongs to`;
				} else if (top === `{#${name}}`) stack.pop();
				else return `closes \`{/${name}}\` without the \`{#${name}}\` that opens it`;
			}
			i = end;
			continue;
		}

		if (ch === '<' && /[a-zA-Z/]/.test(text[i + 1] ?? '')) {
			const closing = text[i + 1] === '/';
			const start = i + (closing ? 2 : 1);
			const name = /^[a-zA-Z][\w:.-]*/.exec(text.slice(start))?.[0];
			if (!name) {
				i += 1;
				continue;
			}

			// Walk the attributes to the `>` that really ends the tag.
			let j = start + name.length;
			let selfClosing = false;
			for (;;) {
				if (j >= text.length) return `ends inside the tag \`<${closing ? '/' : ''}${name}\``;
				const c = text[j];
				if (c === '"' || c === "'") {
					const end = text.indexOf(c, j + 1);
					if (end < 0) return `ends inside the tag \`<${name}\``;
					j = end + 1;
				} else if (c === '{') {
					const end = skipExpression(text, j);
					if (end < 0) return `ends inside the tag \`<${name}\``;
					j = end;
				} else if (c === '>') {
					selfClosing = text[j - 1] === '/';
					j += 1;
					break;
				} else j += 1;
			}

			if (closing) {
				if (stack[stack.length - 1] === name) stack.pop();
				else return `closes \`</${name}>\` without the \`<${name}>\` that opens it`;
			} else if (name === 'script' || name === 'style') {
				// A `<script>` in markup (JSON-LD in a head, say) is opaque text.
				const end = text.indexOf(`</${name}>`, j);
				if (end < 0) return `ends inside a \`<${name}>\``;
				j = end + name.length + 3;
			} else if (!selfClosing && !VOID.has(name.toLowerCase())) {
				stack.push(name);
			}

			i = j;
			continue;
		}

		i += 1;
	}

	if (stack.length > 0) {
		return `opens ${stack.map(shown).join(', ')} and never closes ${stack.length > 1 ? 'them' : 'it'}`;
	}
	return null;
}

for (const chapter of chapters) {
	let blocks = 0;
	/** @type {{ file: string, from: number, to: number }[]} */
	const seen = [];

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

		// The same lines twice on one page: the second block is either a repeat
		// nobody meant or a range that grew into its neighbour.
		for (const other of seen) {
			if (other.file === block.file && block.from <= other.to && other.from <= block.to) {
				problems.push(`${where}: overlaps ${other.from}-${other.to} earlier in the same chapter`);
			}
		}
		seen.push({ file: block.file, from: block.from, to: block.to });

		// `partial` excuses a block from balancing, not from stopping somewhere
		// sensible. A last line that only opens something shows the reader a door
		// and no room; a last line that is a comment describes code that is not
		// there. (`*/` is fine — that is the end of a comment, not the start.)
		const end = last.trim();
		if (/[{([]$/.test(end) || /^<[a-zA-Z][^>]*$/.test(end)) {
			problems.push(`${where}: ends on a line that only opens something — "${end.slice(0, 50)}"`);
		}
		if (/^(\/\/|\/\*|<!--)/.test(end) && !/(\*\/|-->)$/.test(end)) {
			problems.push(`${where}: ends on a comment about code it does not show — "${end.slice(0, 50)}"`);
		}

		if (block.file.endsWith('.svelte') && !block.partial) {
			const markup = markupLines(lines);
			const template = lines
				.slice(block.from - 1, block.to)
				.filter((_, k) => markup[block.from - 1 + k])
				.join('\n');
			const problem = markupProblem(template);
			if (problem) problems.push(`${where}: the markup ${problem}`);
		}
	}

	// `terminal` counts: a chapter of diagrams and shell transcripts is a real
	// chapter. A chapter with neither is one that lost its code in an edit.
	if (blocks === 0) {
		problems.push(`${chapter.slug}: no code or terminal blocks at all`);
	}
}

console.log(
	`${chapters.length} chapters · ${quoted} blocks quoted from abacus/ by line range · ` +
		`${illustrative} illustrative blocks (no file named)`
);

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}

console.log('every range is inside its file, whole, and starts somewhere a reader can follow');
