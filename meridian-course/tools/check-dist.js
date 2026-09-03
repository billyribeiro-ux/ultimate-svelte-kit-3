/**
 * CHECK THE BUILT COURSE THE WAY A READER MEETS IT
 * ================================================
 *
 * `verify.js` proves the *content* — every quoted range is a whole thing in a
 * real file. This proves the *pages*: that what `build.js` wrote can actually
 * be read, on a phone, with the console open.
 *
 *   1. every relative link on every page resolves to a file that exists, and
 *      every `#fragment` to an id on the target page;
 *   2. the prev/next chain walks from chapter 01 to the last chapter and back,
 *      visiting every page exactly once;
 *   3. no page logs an error to the console when opened;
 *   4. no page scrolls sideways at 390px — the width of a small phone — and no
 *      code block escapes its own scroll container;
 *   5. no rendered prose says "undefined", "NaN" or "[object Object]", which is
 *      what a template hole looks like from the outside.
 *
 * It needs a browser. Playwright is a dependency of the project the course is
 * about, so run it from there:
 *
 *   cd meridian && node ../meridian-course/tools/check-dist.js
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const pages = readdirSync(dist).filter((f) => f.endsWith('.html'));

/** @type {string[]} */
const problems = [];

/* ------------------------------------------------------------------ */
/* 1. Links, statically                                                */
/* ------------------------------------------------------------------ */

const ids = new Map(
	pages.map((page) => [
		page,
		new Set([...readFileSync(join(dist, page), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
	])
);

for (const page of pages) {
	const html = readFileSync(join(dist, page), 'utf8');
	for (const [, href] of html.matchAll(/\shref="([^"]+)"/g)) {
		if (/^(https?:|mailto:)/.test(href)) continue;
		const [file, fragment] = href.split('#');
		const target = file === '' ? page : file;
		if (!existsSync(join(dist, target))) {
			problems.push(`${page}: link to missing file ${href}`);
			continue;
		}
		if (fragment && !ids.get(target)?.has(fragment)) {
			problems.push(`${page}: link to missing anchor ${href}`);
		}
	}
}

/* ------------------------------------------------------------------ */
/* 2. The chain                                                        */
/* ------------------------------------------------------------------ */

const chapters = pages.filter((p) => p !== 'index.html');
const nextOf = (page) =>
	/class="pager__link pager__link--next" href="([^"]+)"/.exec(readFileSync(join(dist, page), 'utf8'))?.[1] ??
	null;
const prevOf = (page) =>
	/class="pager__link pager__link--prev" href="([^"]+)"/.exec(readFileSync(join(dist, page), 'utf8'))?.[1] ??
	null;

const first = /class="home__start" href="([^"]+)"/.exec(readFileSync(join(dist, 'index.html'), 'utf8'))?.[1];
if (!first) problems.push('index.html: no start link');

const visited = [];
for (let page = first, guard = 0; page && guard < 500; page = nextOf(page), guard += 1) {
	if (visited.includes(page)) {
		problems.push(`chain loops at ${page}`);
		break;
	}
	visited.push(page);
}
if (visited.length !== chapters.length) {
	problems.push(`the next-chain visits ${visited.length} pages; there are ${chapters.length} chapters`);
}
for (let i = 1; i < visited.length; i += 1) {
	if (prevOf(visited[i]) !== visited[i - 1]) {
		problems.push(`${visited[i]}: prev link does not point back to ${visited[i - 1]}`);
	}
}

/* ------------------------------------------------------------------ */
/* 3–5. In a browser                                                   */
/* ------------------------------------------------------------------ */

const playwright = join(process.cwd(), 'node_modules', 'playwright', 'index.mjs');
if (!existsSync(playwright)) {
	console.error(`No Playwright at ${playwright} — run this from a project that has it installed.`);
	process.exit(2);
}
const { chromium } = await import(pathToFileURL(playwright).href);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await context.newPage();

/** @type {string[]} */
const consoleErrors = [];
page.on('console', (message) => {
	if (message.type() === 'error') consoleErrors.push(`${page.url().split('/').pop()}: ${message.text()}`);
});
page.on('pageerror', (error) => consoleErrors.push(`${page.url().split('/').pop()}: ${error.message}`));

for (const file of pages) {
	await page.goto(pathToFileURL(join(dist, file)).href, { waitUntil: 'load' });

	const report = await page.evaluate(() => {
		const doc = document.documentElement;
		const overflow = doc.scrollWidth > doc.clientWidth ? doc.scrollWidth - doc.clientWidth : 0;

		// A code block may be wider than the page as long as it scrolls inside itself.
		const escaped = [...document.querySelectorAll('pre')].filter((pre) => {
			const box = pre.getBoundingClientRect();
			return box.right > doc.clientWidth + 1;
		}).length;

		const holes = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (node.parentElement?.closest('pre, code')) continue;
			const text = node.textContent ?? '';
			if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) holes.push(text.trim().slice(0, 80));
		}

		return { overflow, escaped, holes };
	});

	if (report.overflow > 0) problems.push(`${file}: page scrolls sideways by ${report.overflow}px at 390px`);
	if (report.escaped > 0) problems.push(`${file}: ${report.escaped} code block(s) escape the viewport`);
	for (const hole of report.holes) problems.push(`${file}: template hole in prose — "${hole}"`);
}

await browser.close();
problems.push(...consoleErrors.map((e) => `console: ${e}`));

/* ------------------------------------------------------------------ */

if (problems.length > 0) {
	console.error(`${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'));
	process.exit(1);
}

console.log(
	`${chapters.length} chapters + index · every link resolves · the chain is whole · no console errors · nothing scrolls sideways at 390px · no template holes`
);
