/**
 * COURSE BUILDER
 *
 * Turns the chapter data in `content/` into a set of static HTML pages with real
 * prev/next links.
 *
 * The eighth course to use this builder. Code blocks carry the line range they
 * were read from, because they are read out of the project at build time rather
 * than pasted in. See `content/quote.js`.
 *
 * Why one file per chapter rather than one big page with JavaScript tabs?
 *   - Each chapter gets its own URL, so you can bookmark and share where you are
 *   - Browser back/forward works
 *   - Ctrl+F searches the chapter you're actually reading
 *   - It works with JavaScript off
 *
 * Run:  node meridian-course/build.js
 */

import { mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chapters } from './content/index.js';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'dist');

/** Everything that differs between this course and the last one. */
const COURSE = {
	name: 'Building Meridian',
	subtitle: 'a Svelte 5 and SvelteKit 3 course, with the ecosystem',
	description:
		'Build a collaborative trip planner with Svelte 5 and SvelteKit 3 — a map from a bundled atlas, a globe that flies the route, an itinerary you can drag, expenses split to the cent, notes, three languages, a publishable geodesy library, a custom element, and a second person planning beside you — using the best of the Svelte ecosystem and saying why each library earned its place.',
	lede: `A trip planner for people who travel together: pins from everybody on one
		map, a globe that flies the route, days you can drag, expenses split to the
		cent, notes that save themselves, invites, and three languages — built from
		an empty folder as a pnpm workspace with a library you could publish. It uses
		everything Svelte 5 and SvelteKit 3.1.0 offer as of October 2026, and it goes
		out into the ecosystem on purpose: Bits UI, svelte-maplibre, Threlte, TanStack
		Table, LayerChart, Tiptap, svelte-dnd-action, Paraglide, Better Auth, runed,
		mdsvex, enhanced-img — each chosen against alternatives, and each with the
		reason written down.`,
	badges: ['Svelte 5.57', 'SvelteKit 3', 'pnpm workspace', 'the ecosystem'],
	closing: `Every code block in this course is read out of the finished project
		in <code>meridian</code> at build time — file and line numbers included — so
		it cannot drift from what the code actually says. Type it out rather than
		pasting where you can: the errors you make and fix are the part that sticks.
		Where the project chose a library, the chapter says which alternatives were
		weighed and why this one won; where it chose not to, it says that too.`
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

/* ------------------------------------------------------------------ */
/* Cross-references                                                    */
/* ------------------------------------------------------------------ */

/*
 * The prose names a chapter by its slug — `ch. {{the-trip-page}}` — and the
 * number is worked out here, from the same order that numbers the pages. A
 * hand-written "ch. 24" stays 24 when a chapter is inserted before it and
 * quietly points at the wrong page; a name cannot. `tools/slugify-refs.js`
 * says how the old numbers were converted, and `verify.js` refuses a bare
 * number and a name that is not a chapter.
 */
const NUMBERS = new Map(chapters.map((c, i) => [c.slug, String(i + 1).padStart(2, '0')]));
const XREF = /\{\{([A-Za-z0-9-]+)\}\}/g;

/** @param {string} slug */
function numberOf(slug) {
	const number = NUMBERS.get(slug);
	if (!number) throw new Error(`a cross-reference names no chapter: {{${slug}}}`);
	return number;
}

/**
 * For text that cannot hold a link — a card that is itself a link, a terminal
 * block: the reference becomes the chapter's number. Text that cannot hold any
 * markup goes through `bare()`, below, which starts here.
 * @param {unknown} text
 */
function plain(text) {
	return String(text).replace(XREF, (_, slug) => numberOf(slug));
}

/**
 * A code span: one backtick on each side, or two when the code holds a backtick
 * of its own (CommonMark's double-backtick span). A double span opens and closes
 * on exactly two, and one space just inside each end is padding that it drops,
 * which is how the code can itself begin or end with a backtick. One expression,
 * so the two forms are read left to right and neither pairs up the other's.
 */
const CODE_SPAN = /(?<!`)``(?!`)([\s\S]+?)(?<!`)``(?!`)|`([^`]+)`/g;

/**
 * The code of a span, from the two capture groups of `CODE_SPAN`.
 * @param {string | undefined} two
 * @param {string} one
 */
function codeOf(two, one) {
	if (two === undefined) return one;
	const padded = two.startsWith(' ') && two.endsWith(' ') && two.trim() !== '';
	return padded ? two.slice(1, -1) : two;
}

/**
 * Inline markup for prose: `code`, **bold**, [text](url), and chapter
 * references, which become the chapter's number linked to its page. Titles go
 * through this too, so a chapter named after an identifier shows it as code.
 * Escaping happens FIRST, so the source text can never inject HTML.
 * @param {string} text
 */
function inline(text) {
	return esc(text)
		.replace(CODE_SPAN, (_, two, one) => `<code>${codeOf(two, one)}</code>`)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
		.replace(XREF, (_, slug) => `<a href="${slug}.html">${numberOf(slug)}</a>`);
}

/**
 * The same prose with all of its markup taken out, for the places that cannot
 * hold any: `<title>`, a `<meta>` description, an `aria-label`. References
 * become numbers, as in `plain()`, and code spans are unwrapped. A backtick
 * inside a double span belongs to the code, so it stays.
 * @param {unknown} text
 */
function bare(text) {
	return plain(text).replace(CODE_SPAN, (_, two, one) => codeOf(two, one));
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
		<span class="code__file">${esc(block.file ?? block.lang ?? 'code')}${
			block.from ? `<span class="code__lines">:${block.from}-${block.to}</span>` : ''
		}</span>
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
	<pre><code>${esc(plain(block.code.replace(/^\n/, '')))}</code></pre>
</figure>`;

		case 'table':
			/*
			 * A real table, because a mapping — old API to new, warning to the
			 * element that answers it — is two or three columns of facts, and a
			 * list of arrows hides which column is which. The wrapper scrolls
			 * sideways on its own, so a wide table never widens the page, and it
			 * is a labelled, focusable region so a keyboard can scroll it too.
			 */
			return `
<div class="table" role="region" aria-label="${esc(bare(block.caption))}" tabindex="0">
	<table>
		<caption>${inline(block.caption)}</caption>
		<thead><tr>${block.head.map((/** @type {string} */ h) => `<th scope="col">${inline(h)}</th>`).join('')}</tr></thead>
		<tbody>${block.rows
			.map(
				(/** @type {string[]} */ row) =>
					`<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`
			)
			.join('')}</tbody>
	</table>
</div>`;

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
			return `<li><a href="${c.slug}.html"${current}><span class="toc__num">${String(i + 1).padStart(2, '0')}</span><span>${inline(c.title)}</span></a></li>`;
		})
		.join('');

	const body = chapter.blocks.map(renderBlock).join('\n');

	const prevLink = prev
		? `<a class="pager__link pager__link--prev" href="${prev.slug}.html">
				<span class="pager__dir">← Previous</span>
				<span class="pager__title">${inline(prev.title)}</span>
			</a>`
		: `<span class="pager__link pager__link--disabled"><span class="pager__dir">← Previous</span><span class="pager__title">You're at the start</span></span>`;

	const nextLink = next
		? `<a class="pager__link pager__link--next" href="${next.slug}.html">
				<span class="pager__dir">Next →</span>
				<span class="pager__title">${inline(next.title)}</span>
			</a>`
		: `<span class="pager__link pager__link--disabled pager__link--next"><span class="pager__dir">Next →</span><span class="pager__title">You've finished 🎉</span></span>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(bare(chapter.title))} — ${COURSE.name}</title>
<meta name="description" content="${esc(bare(chapter.summary ?? ''))}">
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
			<h1>${inline(chapter.title)}</h1>
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
					<span class="card__title">${inline(c.title)}</span>
					${c.summary ? `<span class="card__summary">${inline(plain(c.summary))}</span>` : ''}
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
