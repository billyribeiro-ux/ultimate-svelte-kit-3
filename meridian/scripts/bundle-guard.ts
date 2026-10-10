/**
 * THE BUNDLE GUARD
 * ================
 *
 * Run after `pnpm run build` in `pnpm run verify`. Two rules of the design
 * that a build that succeeds can still break:
 *
 *   1. GSAP is in the home page's chunk and nowhere else. It was kept for one
 *      timeline, on one page; an `import { gsap }` anywhere else would ship
 *      72 KB of animation library to every trip.
 *   2. No chunk over 20 KB gzipped that nobody has agreed to. The big ones
 *      that are meant to be big — the trip page with MapLibre, Tiptap and
 *      LayerChart in it, the globe with three.js — are listed in
 *      `scripts/bundle-budget.json` with the size they were measured at, and
 *      may not grow more than 10% past it. A new chunk over the limit, or a
 *      budgeted one that grew, fails here with its name and its size.
 *
 * What a chunk *is* comes from `.svelte-kit/bundle-stats.json`, which the
 * `bundleStats()` plugin in `vite.config.ts` writes at the end of the browser
 * build: the modules in each chunk and how many bytes of each are in it. A
 * chunk is named after the route it renders, the module it was split at, or
 * the package that is most of it — names that survive an edit, unlike the
 * hashes in its file name.
 *
 *   node scripts/bundle-guard.ts            # check
 *   node scripts/bundle-guard.ts --write    # measure again and rewrite the budget
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT_KB = 20;
const GROWTH = 1.1;
const HOME = 'route:src/routes/(site)/+page.svelte';

interface Chunk {
	readonly file: string;
	readonly entry: boolean;
	readonly facade: string | null;
	readonly modules: Record<string, number>;
}

const chunks = JSON.parse(
	readFileSync(join(root, '.svelte-kit/bundle-stats.json'), 'utf8')
) as Chunk[];
const budgetFile = join(root, 'scripts/bundle-budget.json');
const budget = JSON.parse(readFileSync(budgetFile, 'utf8')) as Record<string, number>;

/** `…/node_modules/.pnpm/three@0.186.1/node_modules/three/src/…` → `three`; scoped names keep their scope. */
function packageOf(id: string): string | null {
	const at = id.lastIndexOf('/node_modules/');
	if (at < 0) return null;
	const [first = '', second = ''] = id.slice(at + '/node_modules/'.length).split('/');
	return first.startsWith('@') ? `${first}/${second}` : first;
}

const local = (id: string) => relative(root, id.split('?')[0]!);

/** A module's path inside its package, without the version-stamped store path pnpm puts in front. */
const inPackage = (id: string) => {
	const at = id.lastIndexOf('/node_modules/');
	return at < 0 ? local(id) : id.slice(at + '/node_modules/'.length).split('?')[0]!;
};

/** A name for a chunk that does not change when its hash does. */
function identify(chunk: Chunk): string {
	const ids = Object.keys(chunk.modules);
	const routes = [
		...new Set(
			ids.map(local).filter((id) => /^src\/routes\/.*\+(page|layout|error)\.svelte$/.test(id))
		)
	].sort();
	if (chunk.entry && routes.length > 0) return `route:${routes.join(' + ')}`;
	if (
		chunk.facade &&
		!chunk.facade.includes('/node_modules/') &&
		!chunk.facade.includes('.svelte-kit')
	) {
		return `module:${local(chunk.facade)}`;
	}
	const byPackage = new Map<string, number>();
	for (const [id, bytes] of Object.entries(chunk.modules)) {
		const name = packageOf(id) ?? 'app';
		byPackage.set(name, (byPackage.get(name) ?? 0) + bytes);
	}
	const [top = 'app'] = [...byPackage].sort((a, b) => b[1] - a[1]).map(([name]) => name);
	return `package:${top}`;
}

const measured = chunks.map((chunk) => {
	const bytes = readFileSync(join(root, '.svelte-kit/output/client', chunk.file));
	return {
		chunk,
		name: identify(chunk),
		kb: Math.round((gzipSync(bytes).byteLength / 1024) * 10) / 10,
		gsap: Object.keys(chunk.modules).some((id) => packageOf(id) === 'gsap')
	};
});

const problems: string[] = [];

for (const { name, chunk, gsap } of measured) {
	if (gsap && name !== HOME) {
		problems.push(`GSAP is in ${name} (${chunk.file}); it belongs in the home page's chunk only`);
	}
}
if (!measured.some(({ name, gsap }) => gsap && name === HOME)) {
	problems.push(`GSAP is not in ${HOME}: did the hero timeline move, or the route?`);
}

/*
 * The limit is per chunk. Two chunks can earn the same name — two split
 * points in one package — so a repeated name gets the chunk's largest
 * module after it, which keeps the budget's keys apart.
 */
const seenNames = new Map<string, number>();
for (const { name } of measured) seenNames.set(name, (seenNames.get(name) ?? 0) + 1);
const large = measured
	.filter(({ kb }) => kb > LIMIT_KB)
	.map(({ name, kb, chunk }): [string, number] => {
		if ((seenNames.get(name) ?? 0) < 2) return [name, kb];
		const [biggest = ''] = Object.entries(chunk.modules).sort((a, b) => b[1] - a[1])[0] ?? [];
		return [`${name} (${inPackage(biggest)})`, kb];
	})
	.sort((a, b) => b[1] - a[1]);

if (process.argv.includes('--write')) {
	writeFileSync(budgetFile, JSON.stringify(Object.fromEntries(large), null, '\t') + '\n');
	console.log(`bundle-budget.json: ${large.length} chunk(s) over ${LIMIT_KB} KB recorded`);
} else {
	for (const [name, kb] of large) {
		const allowed = budget[name];
		if (allowed === undefined) {
			problems.push(
				`${name} is ${kb} KB gzipped, over the ${LIMIT_KB} KB limit and not in the budget`
			);
		} else if (kb > allowed * GROWTH) {
			problems.push(`${name} grew from ${allowed} KB to ${kb} KB gzipped (more than 10%)`);
		}
	}
}

console.log(`BUNDLE (${measured.length} chunks, gzipped)`);
for (const [name, kb] of large) {
	const allowed = budget[name];
	console.log(`  ${String(kb).padStart(6)} KB  ${name}${allowed ? `  (budget ${allowed})` : ''}`);
}
console.log(`  everything else is under ${LIMIT_KB} KB`);

if (problems.length > 0) {
	console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
	console.error(
		'If a size change is intended, run `node scripts/bundle-guard.ts --write` and commit it.'
	);
	process.exitCode = 1;
}
