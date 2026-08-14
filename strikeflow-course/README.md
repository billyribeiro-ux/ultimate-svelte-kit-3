# Building StrikeFlow — a SvelteKit 3 course

A 27-chapter build-along course that takes you from an empty folder to the tested,
deployable marketing site in `../strikeflow-site`.

## Reading it

The built guide is in `dist/`. Open it directly — no server needed:

```bash
open strikeflow-course/dist/index.html        # macOS
xdg-open strikeflow-course/dist/index.html    # Linux
start strikeflow-course\dist\index.html       # Windows
```

Each chapter is its own HTML file with real prev/next links, so bookmarks, browser
back, and Ctrl+F all work. Left and right arrow keys move between chapters.

## Rebuilding it

The chapter text lives in `content/`, split into three files purely to keep each a
manageable size. `build.js` turns them into HTML.

```bash
node strikeflow-course/build.js
```

```
strikeflow-course/
  build.js            Generates dist/ from content/
  course.css          Styles for the generated pages
  content/
    index.js          Concatenates the three parts, in order
    part1.js          Chapters 01–07  — setup and foundations
    part2.js          Chapters 08–17  — data, SEO, and the visual shell
    part3.js          Chapters 18–27  — pages, lead capture, tests, shipping
  dist/               Generated output (committed, so it works on clone)
```

## Adding or editing a chapter

Chapters are plain data. Each is an object with a `slug`, `title`, optional `summary`
and `goal`, and an array of content blocks:

```js
{
	slug: '28-something-new',
	title: 'Something new',
	summary: 'One line for the index page and the meta description.',
	goal: 'What the reader will have by the end.',
	blocks: [
		{ type: 'p', text: 'Prose. Supports `code`, **bold** and [links](https://example.com).' },
		{ type: 'h3', id: 'anchor', text: 'A subheading' },
		{ type: 'ul', items: ['One', 'Two'] },
		{ type: 'ol', items: ['First', 'Second'] },
		{ type: 'code', file: 'src/thing.ts', lang: 'ts', code: 'const x = 1;' },
		{ type: 'terminal', code: 'pnpm run dev' },
		{ type: 'note', text: 'A neutral aside.' },
		{ type: 'warn', text: 'A gotcha worth flagging.' },
		{ type: 'why', title: 'Why this matters', text: 'The reasoning behind a decision.' },
		{ type: 'checkpoint', text: 'How to know this chapter worked.' }
	]
}
```

The renderer escapes all text before applying inline markup, so chapter content can
never inject HTML. An unknown block type throws at build time rather than silently
dropping a paragraph.
