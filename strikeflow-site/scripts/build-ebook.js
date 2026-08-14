/**
 * EBOOK BUILD
 * ===========
 *
 * Renders `ebook-content.js` to HTML, then prints that HTML to PDF with headless
 * Chromium via Playwright.
 *
 * WHY CHROMIUM RATHER THAN A PDF LIBRARY?
 * Libraries like pdfkit or jsPDF make you position every element by hand in points.
 * That is fine for an invoice and miserable for a 30-page document with headings,
 * lists and page breaks. Chromium already contains the best text layout engine ever
 * written, and it speaks CSS — including the print-specific parts (`@page`,
 * `page-break-inside`, running headers) that exist precisely for this.
 *
 * The cost is a heavyweight dev dependency. We were already carrying it: Playwright
 * is installed for the end-to-end tests. Reusing it is free.
 *
 * Run with `pnpm run ebook:build`.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { meta, chapters, disclaimer } from './ebook-content.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'private', 'ebook');
const outFile = join(outDir, 'strikeflow-options-flow-guide.pdf');

/**
 * Escape HTML.
 *
 * The content is ours and trusted, but escaping is one line and means an apostrophe
 * or an ampersand in the copy can never break the document. Cheap habit, worth having.
 */
/** @param {unknown} text */
function esc(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** @param {{ type: string, text?: string, title?: string, items?: string[] }} block */
function renderBlock(block) {
	switch (block.type) {
		case 'p':
			return `<p>${esc(block.text)}</p>`;
		case 'h3':
			return `<h3>${esc(block.text)}</h3>`;
		case 'ul':
			return `<ul>${(block.items ?? []).map((/** @type {string} */ item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
		case 'ol':
			return `<ol>${(block.items ?? []).map((/** @type {string} */ item) => `<li>${esc(item)}</li>`).join('')}</ol>`;
		case 'callout':
			return `<aside class="callout"><h4>${esc(block.title)}</h4><p>${esc(block.text)}</p></aside>`;
		default:
			// A `default` that throws means adding a block type to the content file
			// without handling it here fails loudly at build, rather than silently
			// dropping a paragraph from the finished PDF.
			throw new Error(`Unknown block type: ${block.type}`);
	}
}

function renderHtml() {
	const toc = chapters
		.map(
			(chapter, index) =>
				`<li><span class="toc__num">${String(index + 1).padStart(2, '0')}</span><span>${esc(chapter.title)}</span></li>`
		)
		.join('');

	const body = chapters
		.map(
			(chapter, index) => `
			<section class="chapter">
				<p class="chapter__eyebrow">Chapter ${index + 1}</p>
				<h2>${esc(chapter.title)}</h2>
				${chapter.blocks.map(renderBlock).join('\n')}
			</section>`
		)
		.join('\n');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(meta.title)}</title>
<style>
	/*
	 * @page is the print equivalent of a viewport. The margin here becomes the
	 * physical page margin; Chromium's own margin setting is turned off in the
	 * pdf() call below so this is the single source of truth.
	 */
	@page {
		size: A4;
		margin: 22mm 20mm 20mm;
	}

	* { box-sizing: border-box; margin: 0; padding: 0; }

	body {
		font-family: 'Sofia Sans', 'Segoe UI', system-ui, sans-serif;
		font-size: 10.5pt;
		line-height: 1.62;
		color: #16202e;
	}

	h1, h2, h3, h4 {
		font-family: 'Montserrat', 'Segoe UI', system-ui, sans-serif;
		color: #0b1220;
		letter-spacing: -0.01em;
	}

	/* ---------- Cover ---------- */
	.cover {
		/* break-after forces the next section onto a fresh sheet. */
		break-after: page;
		height: 235mm;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.cover__rule { width: 64px; height: 5px; background: #3b63e8; margin-bottom: 26px; }
	.cover__title { font-size: 30pt; line-height: 1.12; max-width: 15em; }
	.cover__subtitle { font-size: 12pt; color: #4a5a72; margin-top: 18px; max-width: 30em; }
	.cover__author { margin-top: 46px; font-size: 10pt; color: #16202e; font-weight: 600; }
	.cover__edition { font-size: 9pt; color: #6b7a90; margin-top: 4px; }

	/* ---------- Contents ---------- */
	.toc { break-after: page; }
	.toc h2 { font-size: 16pt; margin-bottom: 20px; }
	.toc ol { list-style: none; }
	.toc li { display: flex; gap: 14px; padding: 9px 0; border-bottom: 1px solid #e3e8f0; font-size: 10.5pt; }
	.toc__num { color: #3b63e8; font-weight: 700; font-family: 'Montserrat', sans-serif; }

	/* ---------- Chapters ---------- */
	.chapter { break-before: page; }
	.chapter__eyebrow {
		font-family: 'Montserrat', sans-serif;
		font-size: 8pt; font-weight: 700; text-transform: uppercase;
		letter-spacing: 0.14em; color: #3b63e8; margin-bottom: 8px;
	}
	.chapter h2 { font-size: 19pt; line-height: 1.2; margin-bottom: 18px; }

	/*
	 * break-after: avoid stops a heading being orphaned at the bottom of a page
	 * with its paragraph overleaf. This is exactly the sort of thing a PDF library
	 * makes you compute manually.
	 *
	 * (Note: no backticks anywhere inside this stylesheet — the whole document is a
	 * JS template literal, and a stray backtick in a CSS comment terminates it. The
	 * resulting syntax error points at the CSS, which is a confusing place to land.)
	 */
	.chapter h3 {
		font-size: 12pt; margin-top: 22px; margin-bottom: 8px;
		break-after: avoid;
	}

	p { margin-bottom: 11px; orphans: 2; widows: 2; }
	ul, ol { margin: 10px 0 14px 20px; }
	li { margin-bottom: 7px; }
	li::marker { color: #3b63e8; font-weight: 600; }

	.callout {
		break-inside: avoid;
		background: #f2f5fb;
		border-left: 3px solid #3b63e8;
		padding: 14px 16px;
		margin: 16px 0;
	}
	.callout h4 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #3b63e8; margin-bottom: 6px; }
	.callout p { margin-bottom: 0; font-size: 10pt; }

	/* ---------- Back matter ---------- */
	.disclaimer { break-before: page; }
	.disclaimer h2 { font-size: 13pt; margin-bottom: 12px; }
	.disclaimer p { font-size: 9pt; color: #4a5a72; }
</style>
</head>
<body>
	<section class="cover">
		<div class="cover__rule"></div>
		<h1 class="cover__title">${esc(meta.title)}</h1>
		<p class="cover__subtitle">${esc(meta.subtitle)}</p>
		<p class="cover__author">${esc(meta.author)}</p>
		<p class="cover__edition">${esc(meta.edition)}</p>
	</section>

	<section class="toc">
		<h2>Contents</h2>
		<ol>${toc}</ol>
	</section>

	${body}

	<section class="disclaimer">
		<h2>Risk disclosure</h2>
		<p>${esc(disclaimer)}</p>
	</section>
</body>
</html>`;
}

async function main() {
	await mkdir(outDir, { recursive: true });

	/*
	 * Normally `chromium.launch()` uses the browser Playwright downloaded for itself.
	 *
	 * The override exists for environments that already have a compatible Chromium
	 * and would rather not download a second copy — CI images, Docker builds, Nix
	 * shells, and locked-down networks. Set CHROMIUM_PATH to the binary and we use it.
	 *
	 *   CHROMIUM_PATH=/usr/bin/chromium pnpm run ebook:build
	 *
	 * If you see "Executable doesn't exist", the fix on a normal machine is
	 * `pnpm exec playwright install chromium`.
	 */
	const executablePath = process.env.CHROMIUM_PATH;

	const browser = await chromium.launch(executablePath ? { executablePath } : {});
	try {
		const page = await browser.newPage();

		/*
		 * `setContent` with `waitUntil: 'networkidle'` — the document has no external
		 * resources, but this is the habit to keep: if you later add a logo or a web
		 * font, printing before it loads produces a PDF with a gap where it should be.
		 */
		await page.setContent(renderHtml(), { waitUntil: 'networkidle' });

		await page.pdf({
			path: outFile,
			format: 'A4',
			// Chromium's own margins set to zero so the stylesheet's @page rule is the
			// only thing controlling layout. Two competing margin systems is a
			// reliable way to produce a document that looks fine on screen and wrong
			// on paper.
			margin: { top: '0', bottom: '0', left: '0', right: '0' },
			// Without this, Chromium strips background colours when printing — which
			// would silently remove every callout box.
			printBackground: true,
			displayHeaderFooter: true,
			headerTemplate: '<div></div>',
			footerTemplate: `
				<div style="width:100%;font-size:8pt;color:#8590a8;padding:0 20mm;display:flex;justify-content:space-between;font-family:sans-serif;">
					<span>StrikeFlow — How to read options flow</span>
					<span class="pageNumber"></span>
				</div>`
		});

		const pages = await page.evaluate(() => document.querySelectorAll('.chapter').length);
		console.log(`[ebook] ${pages} chapters rendered`);
	} finally {
		// `finally` so a failed render still closes the browser. Leaked Chromium
		// processes are a classic way to exhaust CI memory.
		await browser.close();
	}

	console.log(`[ebook] written to ${outFile}`);
}

await main();
