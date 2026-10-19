/**
 * THE SURFACES, AS DATA
 * =====================
 *
 * `surfaces.json` is the exit criteria's checklist: one row per surface the
 * coverage plan assigned to a chapter, with its status — `taught`,
 * `declined` (Meridian does not use it, and a chapter says why), `deferred`
 * (on the backlog, with the gap-list item that put it there — and whether
 * that item names the surface itself, `attached: 'name'`, or only the plan
 * sentence the surface came from, `attached: 'plan'`) or `dropped` (known,
 * not built, and why). `tools/exit-criteria.js` wrote it once;
 * `verify.js` holds it to the course on every build, with the helpers here,
 * and the last chapter renders it.
 */

import { readFileSync } from 'node:fs';

/** @typedef {{ planned: string[], surface: string, chapter: string, status: 'taught' | 'declined' | 'deferred' | 'dropped', group: string, statement: string, gap?: string, attached?: 'name' | 'plan', reason?: string }} Surface */

/** @returns {{ plannedChapters: string[], rows: Surface[] }} */
export function readSurfaces() {
	return JSON.parse(readFileSync(new URL('./surfaces.json', import.meta.url), 'utf8'));
}

/**
 * Chapters that mention surfaces without teaching them: the map of features
 * is an index, the backlog lists what was not built, and the exit criteria
 * is this list. A surface found only in one of these is not taught.
 */
export const NOT_TEACHING = new Set([
	'what-we-are-building',
	'the-map-of-features',
	'what-i-would-do-next',
	'the-exit-criteria'
]);

/** Everything a reader reads in a chapter except its code: the prose a surface must appear in. */
export function proseOf(chapter) {
	const parts = [chapter.title, chapter.summary ?? '', chapter.goal ?? ''];
	for (const block of chapter.blocks) {
		if (block.type === 'code' || block.type === 'terminal') continue;
		if (block.text) parts.push(block.text);
		if (block.title) parts.push(block.title);
		if (block.items) parts.push(...block.items);
		if (block.type === 'table') parts.push(block.caption, ...block.head, ...block.rows.flat());
	}
	return parts.join('\n');
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How many backticked spans in `text` carry `token` as a whole name rather than part of a longer one. */
export function countInBackticks(text, token) {
	const name = new RegExp(`(^|[^\\w$])${escape(token)}($|[^\\w])`);
	let n = 0;
	for (const [, span] of text.matchAll(/`([^`]+)`/g)) if (name.test(span)) n += 1;
	return n;
}

/** Does `text` carry `token` inside a backticked span? */
export function hasInBackticks(text, token) {
	return countInBackticks(text, token) > 0;
}

/** The documentation groups, in the order Svelte's own `list-sections` gives them. */
export const GROUPS = [
	'SvelteKit: $app/* modules, #lib and the generated types',
	'SvelteKit: @sveltejs/kit, its subpaths and the configuration',
	'SvelteKit: concepts — routing, loading, remote functions, hooks, errors, links',
	'Svelte: runes and template syntax',
	'Svelte: the svelte/* modules',
	'Svelte: diagnostics — compiler and runtime messages',
	'The sv CLI, add-ons and AI tooling',
	'The project and the ecosystem'
];
