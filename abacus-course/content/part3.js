/**
 * PART 3 — The sheet model
 * (chapters 13–17)
 *
 * Everything about *working on* a sheet that the engine does not know: what a
 * typed value means in a locale, the document at rest, the `Sheet` class and
 * the one number that connects it to the engine, commands with inverses, and
 * finally the lesson — the same engine written out of `$derived`.
 */

import { code } from './quote.js';

export const part3 = [
	{
		slug: 'locale',
		title: 'What a person typed, in their language',
		summary:
			'A German types `1.234,56` and an American types `1,234.56` and they mean the same number. Nothing here knows any locale: it asks `Intl` how the locale writes a number and a date, and reads the answer backwards.',
		goal: 'Parse and format numbers and dates for any locale without a table of separators, and know why formatters are cached.',
		blocks: [
			code('src/lib/sheet/locale.ts', 1, 39),
			{
				type: 'p',
				text: 'The trick in `separators` is the whole philosophy of the module: format a known number with `Intl.NumberFormat` and read the decimal and group characters out of the *parts*. The browser already knows that German groups with a dot; a table in this file would be a table that is wrong for the locale nobody tested.'
			},
			code('src/lib/sheet/locale.ts', 41, 58),
			{
				type: 'p',
				text: 'Same trick for dates: format 3 February 2001 and look at which part comes first. `02/03/2001` is 3 February in London and 2 March in New York, and the only honest way to know is to ask.'
			},
			code('src/lib/sheet/locale.ts', 60, 107),
			{
				type: 'p',
				text: 'Parsing a number backwards from the locale’s notation. Group separators are optional but, if present, must be *consistent*: `1,2,3` is not a number in any locale, and the point of the check is that a typo becomes text rather than a silently wrong number. A narrow no-break space is accepted as a group mark because that is what French `Intl` produces and no keyboard has a key for it.'
			},
			code('src/lib/sheet/locale.ts', 145, 183),
			{
				type: 'p',
				text: '`parseInput` is the entry point the engine is given as its `parseLiteral`. It decides what a typed string *means* and, when the text implies a format — `12%`, `$40`, a date — says so, so that a cell typed as a percentage stays a percentage. A leading apostrophe forces text, which is how a person keeps a phone number from becoming a number.'
			},

			{ type: 'h3', id: 'formatting', text: 'How a value looks' },
			code('src/lib/sheet/format.ts', 1, 34),
			code('src/lib/sheet/format.ts', 36, 65),
			{
				type: 'why',
				title: 'Why formatters are cached',
				text: '`new Intl.NumberFormat()` costs tens of microseconds because it loads locale data. A grid formats every visible cell on every scroll; ten thousand of those per second is a hundred milliseconds of building the same formatter. One formatter per (locale, options) pair in a `Map` is the difference between a grid that scrolls and one that stutters — and the JSON of the options is a perfectly good cache key.'
			},
			code('src/lib/sheet/format.ts', 67, 120),
			{
				type: 'p',
				text: 'Every branch is an `Intl` call with options and nothing else. Dates are formatted in UTC because serials are UTC-based (ch. 08), which is what keeps 2 September from becoming 1 September for the reader in Los Angeles.'
			},
			code('src/lib/sheet/locale.spec.ts', 21, 49),
			{
				type: 'checkpoint',
				items: [
					'You can say how `separators("de-DE")` discovers the comma without a table.',
					'You can predict what `parseInput("1,234", "de-DE")` and `parseInput("1,234", "en-US")` return.',
					'You can explain what the formatter cache key is made of.'
				]
			}
		]
	},

	{
		slug: 'the-document',
		title: 'The document, the operations, and the templates',
		summary:
			'What a sheet looks like at rest: a valibot schema shared by the server, the browser and the local file, with inputs and never values. Operations are the unit of change between browsers, and `applyOps` keeps the stored document current without running the engine.',
		goal: 'Design a document format that cannot disagree with itself, and know why the server never stores a computed value.',
		blocks: [
			code('src/lib/sheet/document.ts', 1, 21),
			{
				type: 'p',
				text: 'Two decisions. Cells are a *list*, because a sheet is sparse and a list of forty is forty. And each cell carries its **input**, never its value — values are recomputed on load, because a stored value can disagree with the formula that produced it and a recomputed one cannot.'
			},
			code('src/lib/sheet/document.ts', 23, 64),
			{
				type: 'p',
				text: 'The same valibot schema on both sides. The server validates what a browser sends; the browser validates what it reads back from the Origin Private File System, which may have been written by an older build. `v.variant(\'kind\', …)` is a discriminated union: exactly the shape `CellFormat` has in TypeScript, and `v.GenericSchema<CellFormat>` makes the compiler check that the two agree.'
			},
			code('src/lib/sheet/document.ts', 66, 79),

			{ type: 'h3', id: 'operations', text: 'Operations' },
			code('src/lib/sheet/ops.ts', 1, 53),
			{
				type: 'p',
				text: 'An operation is what leaves a browser: a batch of cell edits, a structural shift, a title, a size. Every bound in the schema is a limit a bad client would otherwise find — twenty thousand cells per batch, a thousand rows per shift — because the server validates these with the same schema before it applies them (ch. 27).'
			},
			code('src/lib/sheet/apply.ts', 1, 86),
			{
				type: 'p',
				text: 'The server does not run the engine — it has nothing to calculate — but it does keep the stored document *current* as operations arrive, so that a browser opening the sheet later loads the truth rather than replaying a log. `applyOps` is that: a pure function from a document and operations to a new document. Its shift branch reuses `shiftIndex` and `shiftFormula` from chapter 11, so the server and the browser rewrite formulas with the same code.'
			},

			{ type: 'h3', id: 'templates', text: 'Templates' },
			code('src/lib/sheet/templates.ts', 19, 36, { partial: true }),
			code('src/lib/sheet/templates.ts', 159, 179),
			{
				type: 'p',
				text: 'A template is rows of inputs with column letters for formats, turned into a document by `templateDocument`. Three of them ship — a budget, a loan schedule, a grade book — and each is a real sheet with real formulas, which is why the template pages in chapter 31 can be prerendered with the numbers already computed.'
			},
			code('src/lib/sheet/templates.spec.ts', 8, 28),
			{
				type: 'checkpoint',
				items: [
					'You can say why a document stores inputs and what would go wrong if it stored values.',
					'You can explain what `v.variant` checks that `v.union` would not.',
					'You can say what `applyOps` does with a `shift` and which chapter’s functions it borrows.'
				]
			}
		]
	},

	{
		slug: 'the-sheet-class',
		title: 'The Sheet class, and where the reactivity line is',
		summary:
			'A class in a `.svelte.ts` file: selection, the edit session, the title, whether it is saved. The engine inside it holds ten thousand cells without Svelte noticing; one `$state` number, `version`, is the whole contract between them.',
		goal: 'Decide where fine-grained reactivity stops and a version number starts, and know exactly what the grid subscribes to.',
		blocks: [
			code('src/lib/sheet/sheet.svelte.ts', 1, 27),
			{
				type: 'p',
				text: 'The header states the two ideas of the class. The engine is plain `Map`s; this class publishes one number. Undo is commands with inverses rather than snapshots, because a sheet can be megabytes and project 6’s two-kilobyte snapshots would not survive contact with it.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 46, 65),
			code('src/lib/sheet/sheet.svelte.ts', 67, 111, { partial: true }),
			{
				type: 'p',
				text: 'Every `$state` field is something a component renders directly: the selection, the editing session, the title, the flags. `columns`, `rows` and `flashes` are `SvelteMap` and `SvelteSet` because the grid iterates them and wants to know when an entry changes. The engine is `readonly engine` with no rune at all.'
			},

			{ type: 'h3', id: 'the-line', text: 'The line' },
			code('src/lib/sheet/sheet.svelte.ts', 117, 148),
			{
				type: 'why',
				title: 'Why four methods read a number they do not use',
				text: 'The grid renders `{sheet.display(r, c)}` for ten thousand cells. In Svelte 5 that text is its own tiny effect, and it re-runs only when something it *read* changes. `this.engine.get(...)` reads a plain `Map` — nothing reactive — so without the `void this.version` on the first line, a cell that depends on another cell would show its old value forever. The first end-to-end run found exactly that: `=SUM(A1:A2)` stayed at 84 after A1 changed. Reading `version` subscribes every visible cell to one signal that changes once per batch. That is a few thousand cheap re-reads per edit instead of ten thousand signals — and it is the reason the engine can stay a plain `Map`.'
			},
			{
				type: 'p',
				text: 'The alternative — a `$state` per cell — is what the reactivity lesson in chapter 17 builds, for nine cells. It is the right design for nine and the wrong one for a million, and the difference is not taste: a proxy per cell is memory and a signal write per cell per recalculation is time, and a spreadsheet has more cells than anything else in this course.'
			},

			{ type: 'h3', id: 'editing', text: 'The edit session' },
			code('src/lib/sheet/sheet.svelte.ts', 158, 173),
			code('src/lib/sheet/sheet.svelte.ts', 175, 202),
			{
				type: 'p',
				text: 'The in-cell editor and the formula bar both bind to `editing.text`. Type in either; both show it. The session lives here rather than in a component so that a click on the grid while a formula is open can insert a reference into it (ch. 20), and so that it can be tested without rendering anything.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 204, 243),
			{
				type: 'p',
				text: '`edit` is the one door every change goes through: prepare the edits (an implied format, ch. 13), snapshot what the cells held, and run a command whose `revert` applies the snapshot. `setFormat` refuses more than twenty thousand cells, because a format on an empty cell is *kept* — so selecting a column and pressing “Currency” would otherwise create a million entries.'
			},

			{ type: 'h3', id: 'documents', text: 'In and out: documents and remote operations' },
			code('src/lib/sheet/sheet.svelte.ts', 592, 632),
			code('src/lib/sheet/sheet.svelte.ts', 634, 658),
			{
				type: 'p',
				text: '`applyRemote` is somebody else’s change: applied to the engine with no undo entry — you cannot undo another person’s typing — and flashed, so a cell that changed under you is briefly highlighted. `load` ends by setting `dirty` back to false *after* `#sync`, because what was just loaded is, by definition, what is saved; the browser test that asserts it caught the first version doing that in the wrong order.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 660, 712),
			{
				type: 'checkpoint',
					items: [
					'You can name every `$state` field of `Sheet` and say which component renders each.',
					'You can explain, in one sentence, what `void this.version` does and what breaks without it.',
					'You can say why `applyRemote` does not push an undo entry.'
				]
			}
		]
	},

	{
		slug: 'commands-with-inverses',
		title: 'Commands with inverses: undo, structure, clipboard, fill, sort',
		summary:
			'Every change is a command that knows how to undo itself. An edit remembers what the cells held; a deleted row remembers its cells *and* every formula the deletion rewrote. Then the operations built on top: the clipboard, the fill handle, sorting, find and replace.',
		goal: 'Build undo as commands rather than snapshots, and handle the case that snapshots would have hidden: an inverse that is not a mirror image.',
		blocks: [
			code('src/lib/sheet/sheet.svelte.ts', 559, 590),
			{
				type: 'p',
				text: '`#run` applies a command, pushes it, and clears the redo stack — a new action after an undo forks history, and the old branch is gone. `HISTORY_LIMIT` keeps a long session from holding two hundred megabytes of snapshots. `canUndo` and `canRedo` are `$state` mirrors of the private stacks so the toolbar can disable its buttons.'
			},

			{ type: 'h3', id: 'structure', text: 'A deletion is not a mirror image' },
			code('src/lib/sheet/sheet.svelte.ts', 245, 263),
			code('src/lib/sheet/sheet.svelte.ts', 265, 324),
			{
				type: 'why',
				title: 'Why undoing a deletion needs a snapshot of formulas it did not delete',
				text: 'Delete row 2 from a sheet where A3 says `=SUM(A1:A2)`. The engine rewrites the formula to `=SUM(A1:A1)` and moves it up. Undo inserts a row at 2 — and `A1:A1` stays `A1:A1`, because an insertion *below* a range does not grow it. The inverse shift restores the shape of the sheet but not the text of the formulas, and a reference into the deleted band became `#REF!` for good. So a deletion snapshots two things: the cells in the band, and every formula the shift would rewrite, found by rewriting and comparing. Undo runs the inverse shift and then restores both. The browser test that undoes a deleted row, cells and all, is what found this; a snapshot-based undo would have hidden it and cost the memory instead.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 326, 361),

			{ type: 'h3', id: 'clipboard', text: 'The clipboard' },
			code('src/lib/sheet/sheet.svelte.ts', 363, 398),
			code('src/lib/sheet/sheet.svelte.ts', 400, 431),
			{
				type: 'p',
				text: 'A copy produces two things: the cells relative to the copied rectangle (with where it was, so a paste knows how far each formula moved) and tab-separated text for other applications. Pasting our own cells translates formulas with chapter 11’s `translateFormula`; pasting text from anywhere parses it as tab- or comma-separated with the CSV parser of chapter 23. The grid puts both on the clipboard under two MIME types (ch. 20).'
			},

			{ type: 'h3', id: 'fill', text: 'The fill handle' },
			code('src/lib/sheet/sheet.svelte.ts', 433, 488),
			{
				type: 'p',
				text: 'Drag the handle and the source extends over the target. Formulas are translated; a run of numbers continues its arithmetic series; text ending in a number counts up; anything else repeats. The lane arithmetic handles filling up and to the left too — `offset` goes negative and the modulo is written to stay positive.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 719, 734),

			{ type: 'h3', id: 'sort-find', text: 'Sorting, finding, replacing' },
			code('src/lib/sheet/sheet.svelte.ts', 490, 524),
			{
				type: 'p',
				text: 'Sorting is an edit like any other — the rows of the rectangle rewritten in a new order — which means it undoes for free, and a formula that moves with its row is translated by the distance it moved. Empties sort last in either direction, because that is what a person means by “sort”.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 526, 557),
			code('src/lib/sheet/sheet.svelte.test.ts', 74, 91),
			{
				type: 'p',
				text: 'The browser test for the deletion case, run in a real Chromium by the `client` Vitest project because the class uses runes and `flushSync`. It is short, and it is the reason the snapshot above exists.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what a deletion command snapshots and why inserting the rows back is not enough.',
					'You can explain why sorting undoes without any special code.',
					'You can predict what dragging `1, 2` down three cells produces, and what dragging `Item 7` down does.'
				]
			}
		]
	},

	{
		slug: 'the-reactivity-lesson',
		title: 'The lesson: the same engine, out of $derived',
		summary:
			'Nine cells whose values are `$derived`s that read each other through a lookup function and nothing else. No edges recorded, no order computed — and it agrees with the hand-written engine on every edit, because it is the same algorithm.',
		goal: 'See that Svelte’s runtime is a spreadsheet engine with the cells hidden, and know the two things a runtime cannot give a spreadsheet.',
		blocks: [
			code('src/lib/lesson/reactive.svelte.ts', 1, 29),
			{
				type: 'p',
				text: 'The header is the argument of the whole course in a comment. Read it, then read the class, and notice that there is no code anywhere that says “A3 depends on A1”.'
			},
			code('src/lib/lesson/reactive.svelte.ts', 37, 78),
			{
				type: 'p',
				text: '`value` is a `$derived.by` **as a class field**. It reads `this.input` and, through `#lookup`, whichever other cells the formula references — and those reads are the dependencies. Svelte records them as the derived runs. Change A1 and every derived that read A1, transitively, is marked and recomputed in dependency order, once each. That is steps one to three of chapter 09 with no code for any of them.'
			},
			{
				type: 'p',
				text: '`evaluations += 1` inside a derived is a side effect, and the comment admits it: counting is the lesson. The page shows, after every edit, how many cells each side evaluated, and they agree.'
			},
			code('src/lib/lesson/reactive.svelte.ts', 80, 115),

			{ type: 'h3', id: 'the-page', text: 'The page' },
			code('src/routes/(app)/lesson/+page.svelte', 17, 59),
			{
				type: 'p',
				text: 'Both sheets start from the same nine formulas. `edit` writes the same input into both and records how many cells each evaluated — the engine reports it in its `Recalc`; the reactive side is read in full so the deriveds run now, and the difference in the counter is the answer.'
			},
			code('src/routes/(app)/lesson/+page.svelte', 112, 148),
			{
				type: 'why',
				title: 'Why each reactive cell is wrapped in a boundary',
				text: 'Type `=C3` into A1 and the hand-written engine marks a cycle and carries on. The reactive sheet *throws* — a derived that reads itself is a bug in a program, not a mistake in a sheet — and the `<svelte:boundary>` around that one cell catches it and renders `cycle!` in its place while the other eight keep working. That is the first thing a runtime cannot give a spreadsheet: a cycle as a value. The second is a million cells that are not each a signal, which is chapter 15’s line. Both are why the engine exists; neither makes it a different algorithm.'
			},
			code('e2e/lesson.e2e.ts', 12, 44),
			{
				type: 'p',
				text: 'The end-to-end test edits one side, then the other, and asserts all eighteen outputs agree. It is the test that says the two are the same thing.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say where the dependency edges are in `ReactiveCell` and why there is no code for them.',
					'You can explain why the reactive sheet throws on a cycle where the engine does not, and which is right for which job.',
					'You can name the two reasons the hand-written engine exists even though `$derived` does the same thing.'
				]
			}
		]
	}
];
