/**
 * COURSE BUILDER
 *
 * Turns the chapter data in `content/` into a set of static HTML pages with real
 * prev/next links.
 *
 * The third course to use this builder unchanged, which is the point: the
 * program and the content are separate, so a new course is a new `content/`
 * folder and a different `COURSE` object rather than a fork that drifts.
 *
 * Why one file per chapter rather than one big page with JavaScript tabs?
 *   - Each chapter gets its own URL, so you can bookmark and share where you are
 *   - Browser back/forward works
 *   - Ctrl+F searches the chapter you're actually reading
 *   - It works with JavaScript off
 *
 * Run:  node sequent-course/build.js
 */

import { mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chapters } from './content/index.js';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'dist');

/** Everything that differs between this course and the last one. */
const COURSE = {
	name: 'Building Sequent',
	subtitle: 'a SvelteKit 3 course',
	description:
		'Build a stock exchange with SvelteKit 3 — a matching engine, an opening auction, central clearing, a double-entry ledger, and an event log the whole venue can be rebuilt from.',
	lede: `An exchange. Orders match by price and time, the opening auction clears
		everything at one price, every trade posts to a ledger that balances by
		construction, and the entire venue can be replayed from its log and arrive
		at exactly the same state. Built from an empty folder, with every bug found
		along the way written down.`,
	badges: ['SvelteKit 3 RC', 'Event sourcing', 'Node 24 LTS', 'Three processes'],
	closing: `Every chapter shows the real code from the finished project in
		<code>sequent</code>. Type it out rather than pasting where you can — the
		errors you make and fix are the part that sticks. Roughly a dozen chapters
		end with a bug that was genuinely in this codebase, and how it was found.`
};

/* ------------------------------------------------------------------ */
/* Escaping                                                            */
/* ------------------------------------------------------------------ */

/** @param {unknown} value */
function esc(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Inline markup for prose: `code`, **bold**, [text](url).
 * Escaping happens FIRST, so the source text can never inject HTML.
 * @param {string} text
 */
function inline(text) {
	return esc(text)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/* ------------------------------------------------------------------ */
/* Block rendering                                                     */
/* ------------------------------------------------------------------ */

/** @param {any} block */
function renderBlock(block) {
	switch (block.type) {
		case 'p':
			return `<p>${inline(block.text)}</p>`;

		case 'h3':
			return `<h3 id="${esc(block.id ?? '')}">${inline(block.text)}</h3>`;

		case 'ul':
			return `<ul>${block.items.map((/** @type {string} */ i) => `<li>${inline(i)}</li>`).join('')}</ul>`;

		case 'ol':
			return `<ol>${block.items.map((/** @type {string} */ i) => `<li>${inline(i)}</li>`).join('')}</ol>`;

		case 'code':
			return `
<figure class="code">
	<figcaption>
		<span class="code__file">${esc(block.file ?? block.lang ?? 'code')}</span>
		<button class="code__copy" type="button" data-copy>Copy</button>
	</figcaption>
	<pre><code class="lang-${esc(block.lang ?? 'text')}">${esc(block.code.replace(/^\n/, ''))}</code></pre>
</figure>`;

		case 'terminal':
			return `
<figure class="code code--terminal">
	<figcaption>
		<span class="code__file">terminal</span>
		<button class="code__copy" type="button" data-copy>Copy</button>
	</figcaption>
	<pre><code>${esc(block.code.replace(/^\n/, ''))}</code></pre>
</figure>`;

		case 'note':
			return `<aside class="callout callout--note"><p>${inline(block.text)}</p></aside>`;

		case 'warn':
			return `<aside class="callout callout--warn"><p>${inline(block.text)}</p></aside>`;

		case 'why':
			return `
<aside class="callout callout--why">
	<h4>${inline(block.title ?? 'Why this matters')}</h4>
	<p>${inline(block.text)}</p>
</aside>`;

		case 'checkpoint': {
			/*
			 * Two shapes, because both read naturally in the source: a single
			 * sentence (`text`) or a list of things you should now be able to do
			 * (`items`). Rendering only one of them silently printed the string
			 * "undefined" into every chapter ending, which is exactly the kind of
			 * bug a template engine should not be able to have.
			 */
			const inner = Array.isArray(block.items)
				? `<ul>${block.items.map((/** @type {string} */ i) => `<li>${inline(i)}</li>`).join('')}</ul>`
				: `<p>${inline(block.text)}</p>`;
			return `
<aside class="callout callout--check">
	<h4>Checkpoint</h4>
	${inner}
</aside>`;
		}

		default:
			throw new Error(`Unknown block type: ${block.type}`);
	}
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {{ chapter: any, index: number, all: any[] }} args
 */
function renderPage({ chapter, index, all }) {
	const prev = index > 0 ? all[index - 1] : null;
	const next = index < all.length - 1 ? all[index + 1] : null;
	const number = String(index + 1).padStart(2, '0');

	const toc = all
		.map((c, i) => {
			const current = i === index ? ' aria-current="page"' : '';
			return `<li><a href="${c.slug}.html"${current}><span class="toc__num">${String(i + 1).padStart(2, '0')}</span><span>${esc(c.title)}</span></a></li>`;
		})
		.join('');

	const body = chapter.blocks.map(renderBlock).join('\n');

	const prevLink = prev
		? `<a class="pager__link pager__link--prev" href="${prev.slug}.html">
				<span class="pager__dir">← Previous</span>
				<span class="pager__title">${esc(prev.title)}</span>
			</a>`
		: `<span class="pager__link pager__link--disabled"><span class="pager__dir">← Previous</span><span class="pager__title">You're at the start</span></span>`;

	const nextLink = next
		? `<a class="pager__link pager__link--next" href="${next.slug}.html">
				<span class="pager__dir">Next →</span>
				<span class="pager__title">${esc(next.title)}</span>
			</a>`
		: `<span class="pager__link pager__link--disabled pager__link--next"><span class="pager__dir">Next →</span><span class="pager__title">You've finished 🎉</span></span>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(chapter.title)} — ${COURSE.name}</title>
<meta name="description" content="${esc(chapter.summary ?? '')}">
<link rel="stylesheet" href="course.css">
</head>
<body>

<a class="skip" href="#content">Skip to content</a>

<header class="topbar">
	<a class="topbar__home" href="index.html">
		<span class="topbar__mark" aria-hidden="true"></span>
		<span>${COURSE.name}</span>
	</a>
	<div class="topbar__progress" role="group" aria-label="Progress">
		<span class="topbar__count">${number} / ${String(all.length).padStart(2, '0')}</span>
		<div class="topbar__bar"><div class="topbar__fill" style="width: ${((index + 1) / all.length) * 100}%"></div></div>
	</div>
	<button class="topbar__menu" type="button" data-toggle-nav aria-expanded="false" aria-controls="chapter-nav">Chapters</button>
</header>

<div class="shell">
	<nav class="sidebar" id="chapter-nav" aria-label="Chapters">
		<p class="sidebar__title">Chapters</p>
		<ol class="toc">${toc}</ol>
	</nav>

	<main class="content" id="content">
		<article>
			<p class="eyebrow">Chapter ${number}</p>
			<h1>${esc(chapter.title)}</h1>
			${chapter.summary ? `<p class="lede">${inline(chapter.summary)}</p>` : ''}
			${chapter.goal ? `<aside class="callout callout--goal"><h4>By the end of this chapter</h4><p>${inline(chapter.goal)}</p></aside>` : ''}
			${body}
		</article>

		<nav class="pager" aria-label="Chapter navigation">
			${prevLink}
			${nextLink}
		</nav>
	</main>
</div>

<script>
	// Copy buttons. Progressive enhancement — the code is selectable without them.
	document.addEventListener('click', async (event) => {
		const button = event.target.closest('[data-copy]');
		if (!button) return;
		const code = button.closest('figure').querySelector('code');
		try {
			await navigator.clipboard.writeText(code.innerText);
			button.textContent = 'Copied';
			setTimeout(() => { button.textContent = 'Copy'; }, 1600);
		} catch {
			button.textContent = 'Press Ctrl+C';
		}
	});

	// Mobile chapter drawer.
	const toggle = document.querySelector('[data-toggle-nav]');
	const sidebar = document.getElementById('chapter-nav');
	toggle?.addEventListener('click', () => {
		const open = sidebar.classList.toggle('is-open');
		toggle.setAttribute('aria-expanded', String(open));
	});

	// Left/right arrow keys move between chapters, unless you're typing.
	document.addEventListener('keydown', (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) return;
		if (event.key === 'ArrowLeft') document.querySelector('.pager__link--prev[href]')?.click();
		if (event.key === 'ArrowRight') document.querySelector('.pager__link--next[href]')?.click();
	});
</script>
</body>
</html>`;
}

/**
 * @param {any[]} all
 */
function renderIndex(all) {
	const cards = all
		.map(
			(c, i) => `
		<li>
			<a class="card" href="${c.slug}.html">
				<span class="card__num">${String(i + 1).padStart(2, '0')}</span>
				<span class="card__body">
					<span class="card__title">${esc(c.title)}</span>
					${c.summary ? `<span class="card__summary">${esc(c.summary)}</span>` : ''}
				</span>
			</a>
		</li>`
		)
		.join('');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${COURSE.name} — ${COURSE.subtitle}</title>
<meta name="description" content="${esc(COURSE.description)}">
<link rel="stylesheet" href="course.css">
</head>
<body class="is-home">

<main class="home">
	<p class="eyebrow">A build-along course</p>
	<h1>${COURSE.name}</h1>
	<p class="home__lede">${COURSE.lede}</p>

	<div class="home__meta">
		<span>${all.length} chapters</span>
		${COURSE.badges.map((b) => `<span>${esc(b)}</span>`).join('')}
	</div>

	<a class="home__start" href="${all[0].slug}.html">Start chapter 01 →</a>

	<h2 class="home__heading">Everything we'll cover</h2>
	<ol class="cards">${cards}</ol>

	<footer class="home__footer">
		<p>${COURSE.closing}</p>
	</footer>
</main>

</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const [index, chapter] of chapters.entries()) {
	const html = renderPage({ chapter, index, all: chapters });
	await writeFile(join(outDir, `${chapter.slug}.html`), html, 'utf8');
}

await writeFile(join(outDir, 'index.html'), renderIndex(chapters), 'utf8');
await cp(join(root, 'course.css'), join(outDir, 'course.css'));

console.log(`[${COURSE.name}] ${chapters.length} chapters + index written to ${outDir}`);
