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
			code('src/lib/sheet/templates.ts', 19, 57, { partial: true }),
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
			code('src/lib/sheet/sheet.svelte.ts', 1, 28),
			{
				type: 'p',
				text: 'The header states the two ideas of the class. The engine is plain `Map`s; this class publishes one number. Undo is commands with inverses rather than snapshots, because a sheet can be megabytes and project 6’s two-kilobyte snapshots would not survive contact with it.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 47, 66),
			code('src/lib/sheet/sheet.svelte.ts', 68, 112, { partial: true }),
			{
				type: 'p',
				text: 'Every `$state` field is something a component renders directly: the selection, the editing session, the title, the flags. `columns`, `rows` and `flashes` are `SvelteMap` and `SvelteSet` because the grid iterates them and wants to know when an entry changes. The engine is `readonly engine` with no rune at all.'
			},

			{ type: 'h3', id: 'the-line', text: 'The line' },
			code('src/lib/sheet/sheet.svelte.ts', 118, 149),
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
			code('src/lib/sheet/sheet.svelte.ts', 159, 174),
			code('src/lib/sheet/sheet.svelte.ts', 176, 203),
			{
				type: 'p',
				text: 'The in-cell editor and the formula bar both bind to `editing.text`. Type in either; both show it. The session lives here rather than in a component so that a click on the grid while a formula is open can insert a reference into it (ch. 20), and so that it can be tested without rendering anything.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 205, 244),
			{
				type: 'p',
				text: '`edit` is the one door every change goes through: prepare the edits (an implied format, ch. 13), snapshot what the cells held, and run a command whose `revert` applies the snapshot. `setFormat` refuses more than twenty thousand cells, because a format on an empty cell is *kept* — so selecting a column and pressing “Currency” would otherwise create a million entries.'
			},

			{ type: 'h3', id: 'documents', text: 'In and out: documents and remote operations' },
			code('src/lib/sheet/sheet.svelte.ts', 593, 633),
			code('src/lib/sheet/sheet.svelte.ts', 635, 659),
			{
				type: 'p',
				text: '`applyRemote` is somebody else’s change: applied to the engine with no undo entry — you cannot undo another person’s typing — and flashed, so a cell that changed under you is briefly highlighted. `load` ends by setting `dirty` back to false *after* `#sync`, because what was just loaded is, by definition, what is saved; the browser test that asserts it caught the first version doing that in the wrong order.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 661, 713),
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
			code('src/lib/sheet/sheet.svelte.ts', 560, 591),
			{
				type: 'p',
				text: '`#run` applies a command, pushes it, and clears the redo stack — a new action after an undo forks history, and the old branch is gone. `HISTORY_LIMIT` keeps a long session from holding two hundred megabytes of snapshots. `canUndo` and `canRedo` are `$state` mirrors of the private stacks so the toolbar can disable its buttons.'
			},

			{ type: 'h3', id: 'structure', text: 'A deletion is not a mirror image' },
			code('src/lib/sheet/sheet.svelte.ts', 246, 264),
			code('src/lib/sheet/sheet.svelte.ts', 266, 325),
			{
				type: 'why',
				title: 'Why undoing a deletion needs a snapshot of formulas it did not delete',
				text: 'Delete row 2 from a sheet where A3 says `=SUM(A1:A2)`. The engine rewrites the formula to `=SUM(A1:A1)` and moves it up. Undo inserts a row at 2 — and `A1:A1` stays `A1:A1`, because an insertion *below* a range does not grow it. The inverse shift restores the shape of the sheet but not the text of the formulas, and a reference into the deleted band became `#REF!` for good. So a deletion snapshots two things: the cells in the band, and every formula the shift would rewrite, found by rewriting and comparing. Undo runs the inverse shift and then restores both. The browser test that undoes a deleted row, cells and all, is what found this; a snapshot-based undo would have hidden it and cost the memory instead.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 327, 362),

			{ type: 'h3', id: 'clipboard', text: 'The clipboard' },
			code('src/lib/sheet/sheet.svelte.ts', 364, 399),
			code('src/lib/sheet/sheet.svelte.ts', 401, 432),
			{
				type: 'p',
				text: 'A copy produces two things: the cells relative to the copied rectangle (with where it was, so a paste knows how far each formula moved) and tab-separated text for other applications. Pasting our own cells translates formulas with chapter 11’s `translateFormula`; pasting text from anywhere parses it as tab- or comma-separated with the CSV parser of chapter 23. The grid puts both on the clipboard under two MIME types (ch. 20).'
			},

			{ type: 'h3', id: 'fill', text: 'The fill handle' },
			code('src/lib/sheet/sheet.svelte.ts', 434, 489),
			{
				type: 'p',
				text: 'Drag the handle and the source extends over the target. Formulas are translated; a run of numbers continues its arithmetic series; text ending in a number counts up; anything else repeats. The lane arithmetic handles filling up and to the left too — `offset` goes negative and the modulo is written to stay positive.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 720, 735),

			{ type: 'h3', id: 'sort-find', text: 'Sorting, finding, replacing' },
			code('src/lib/sheet/sheet.svelte.ts', 491, 525),
			{
				type: 'p',
				text: 'Sorting is an edit like any other — the rows of the rectangle rewritten in a new order — which means it undoes for free, and a formula that moves with its row is translated by the distance it moved. Empties sort last in either direction, because that is what a person means by “sort”.'
			},
			code('src/lib/sheet/sheet.svelte.ts', 527, 558),
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
			'Nine cells whose values are `$derived`s that read each other through a lookup function and nothing else. No edges recorded, no order computed — and it agrees with the hand-written engine on every edit, count for count, because it is the same algorithm. Until a cycle, where it needs a graph of its own.',
		goal: 'See that Svelte’s runtime is a spreadsheet engine with the cells hidden, and know the two things a runtime cannot give a spreadsheet.',
		blocks: [
			code('src/lib/lesson/reactive.svelte.ts', 1, 36),
			{
				type: 'p',
				text: 'The header is the argument of the whole course in a comment. Read it, then read the class, and notice that there is no code anywhere that says “A3 depends on A1”. The one place that reads a formula’s references, further down, does it only to find cycles, and the blocks after the class say why it must.'
			},
			code('src/lib/lesson/reactive.svelte.ts', 45, 103),
			{
				type: 'p',
				text: '`value` is a `$derived.by` **as a class field**. It reads `this.input` and, through the sheet, whichever other cells the formula references — and those reads are the dependencies. Svelte records them as the derived runs. Change A1 and every derived that read A1, transitively, is marked and recomputed in dependency order, once each. That is steps one to three of chapter 09 with no code for any of them.'
			},
			{
				type: 'p',
				text: '`onCycle` is derived too, and it is made in the constructor rather than beside its siblings. A `$derived` can be the first assignment to a field inside the constructor, exactly as `$state` can, and here that is the honest place: the expression reads `this.name` and `this.#sheet`, which only exist once the constructor has set them. (The derived would not run before then anyway — deriveds are lazy — but TypeScript, reading a field initialiser, cannot know that, and says so.)'
			},
			{
				type: 'p',
				text: '`evaluations += 1` inside a derived is a side effect, and the comment admits it: counting is the lesson. It is counted the way the engine counts — after the cycle check and after the literal check — because the engine evaluates formulas, not cells: a typed number is read, not evaluated, and a cell on a cycle is marked, not evaluated. Count anything else on one side and the two numbers the page puts side by side are measuring different things.'
			},
			code('src/lib/lesson/reactive.svelte.ts', 105, 137, { partial: true }),
			{
				type: 'p',
				text: 'The sheet is nine cells in a plain `Map` — the map never changes; the cells inside it are what is reactive — and `set` is one assignment. There is nothing else for it to do, because nothing about a cycle is kept by hand.'
			},
			code('src/lib/lesson/reactive.svelte.ts', 139, 191),
			{
				type: 'why',
				title: 'Why a cell works out whether it is on a cycle before it reads another cell',
				text: 'Type `=C3` into A1 and C3, which averages A1, now feeds A1: a derived that reads itself. Svelte has no answer to that but an exception. In development it notices and throws `derived_references_self`; that check sits behind `if (DEV)` in the runtime, so a production build has none, and the deriveds call each other until the stack runs out. The first version of this file caught the overflow in the formula’s `catch` and showed `#ERROR!` — after hundreds of evaluations for one edit — and the page never recovered. So a cell asks first, from the formulas alone, whether following its references leads back to it, and a cell that does answers `#CYCLE!` without reading another cell. `reachesItself` reads inputs and never values, so it cannot be caught in the cycle it is looking for. That is a graph again — the engine’s, for nine cells — which is the lesson: a cycle is a value only because somebody kept one.'
			},
			{
				type: 'why',
				title: 'Why each cell derives its own answer, and not one set for the sheet',
				text: 'The second version kept a `$state` flag on every cell and had `set` write all nine after each edit. It worked, but a value that is a pure function of other state was being copied by hand, and only `set` kept it right: write `cell.input` directly and the flags went stale, and the crash came back. The obvious repair is one `$derived` set of cyclic cells for the whole sheet, with each cell’s flag derived from it. That is correct, and it costs. Every cell then depends on every input, so every edit asks all nine cells whether they are still right — and Svelte moves a derived’s version forward only when its value changes, so a cell whose last re-run came out the same, like A3’s `"A1"`, looks older than the cells it reads and is worked out again for nothing. Measured: once A1 had changed, changing B2 evaluated five formulas where the engine evaluated four, and the fifth was A3, which reads neither. Deriving the answer *per cell*, from the inputs that cell can reach, gives each flag exactly the dependencies its value already has. An edit wakes the same cells it would have woken anyway, and across eighteen thousand random edits — half of them direct writes to `input` — the two sides never disagreed on a value and the deriveds never did more work than the engine.'
			},

			{ type: 'h3', id: 'the-page', text: 'The page' },
			code('src/routes/(app)/lesson/+page.svelte', 18, 71),
			{
				type: 'p',
				text: 'Both sheets start from the same nine formulas. `edit` writes the same input into both and records how many formulas each evaluated — the engine reports it in its `Recalc`; the reactive side is read in full so the deriveds run now, and the difference in the counter is the answer. The engine is not reactive, so `engineInput` and `engineValue` read `engineVersion` before they read the engine: the one number `edit` bumps is what makes the template ask again, the same contract the grid has with the sheet.'
			},
			code('src/routes/(app)/lesson/+page.svelte', 90, 121),
			{
				type: 'p',
				text: 'Three declaration tags open each engine cell, and only the third is a `$derived`. The name and its address are fixed for as long as the item exists — the `each` is keyed by the column letter — so they are plain tags, worked out once when the item is made. The value is not fixed: `engineValue` reads `engineVersion`, which every edit changes while the item lives, so `{const value = $derived(…)}` is what keeps the number and its error colouring following the engine. Written as a plain tag it would be worked out once, and the left-hand sheet would never change.'
			},
			code('src/routes/(app)/lesson/+page.svelte', 123, 159),
			{
				type: 'p',
				text: 'The reactive side needs no `$derived` in its markup at all. `{const name = …}` and `{const cell = …}` are plain for the same reason as the engine’s name and address, and the cell’s value is already a `$derived` inside the class, so reading `cell.value` in the markup is enough to follow it. Chapter 19 has the rule that decides between the two kinds of tag.'
			},
			{
				type: 'why',
				title: 'Why no reactive cell is wrapped in a boundary',
				text: 'The first version put a `<svelte:boundary>` round each reactive output, with a `failed` snippet that said `cycle!`. Driving the page in a real browser showed that snippet never ran: the formula’s `catch` got to the exception first. With the `catch` taken out so the exception could reach it, the whole page became the error page instead. Svelte hands an exception thrown inside a `$derived` to the boundary of the effect that *created* the derived, and these deriveds were created by the page’s script — so the page’s boundary, the root `+error.svelte`, is the one that heard about it. A boundary catches what its own content throws while it renders; a value computed somewhere else fails where it was made. With cycles found before any cell is read, nothing here throws, and the comment in the markup says why there is no boundary. The engine still has two things the runtime cannot give a spreadsheet: cycles as values for a million cells, and a million cells that are not each a signal, which is chapter 15’s line. Neither makes it a different algorithm.'
			},
			{
				type: 'why',
				title: 'Where the two counts part, and why that is Svelte doing less',
				text: 'Type `5.0` into A2 while it holds 5. The engine evaluates the five formulas downstream of an edited cell, because its dirty set is worked out before anything is evaluated. The deriveds evaluate none: A2’s derived runs, produces the same number, and Svelte compares each new value with the old one — a derived whose value is unchanged notifies nobody. The engine could do the same, by stopping the wave at a cell whose value came out equal. It does not, because it finds cycles as whatever is left of the dirty set when the sort runs out, and that only works if the whole dirty set is evaluated. It is the one place the two part ways on a sheet with no cycle, and the page says so rather than claiming a perfect match.'
			},
			code('e2e/lesson.e2e.ts', 15, 52),
			code('e2e/lesson.e2e.ts', 54, 86),
			code('e2e/lesson.e2e.ts', 88, 104),
			{
				type: 'p',
				text: 'The first end-to-end test edits one side, then the other, and asserts all eighteen outputs agree — and that both hints name the same count: seven formulas for A1, four for B2. It is the test that says the two are the same thing. The second makes the cycle the page tells you to make, checks both sides call it `#CYCLE!` in the same cells and both evaluated two formulas, and breaks it again: every value must come back. The third pins down the one difference, so that a change to either side that made it disappear — or grow — would be noticed.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say where the dependency edges are in `ReactiveCell` and why there is no code for them.',
					'You can say what Svelte does with a derived that reads itself, in development and in a production build, and why each reactive cell looks at references before it reads another cell.',
					'You can explain why one derived set of cyclic cells for the whole sheet makes the counts disagree, and per-cell derivation does not.',
					'You can say which boundary hears about an exception thrown inside a `$derived`.',
					'You can name the two reasons the hand-written engine exists even though `$derived` does the same thing.'
				]
			}
		]
	}
];
