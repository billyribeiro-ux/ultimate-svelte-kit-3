/**
 * PART 4 — The grid and the editor
 * (chapters 18–23)
 *
 * The interface: an axis of prefix sums, a grid that renders a thousand cells
 * out of a million, its keyboard and pointer model, the in-cell editor and
 * the formula bar, the toolbar and the workbench, and CSV in a worker.
 */

import { code } from './quote.js';

export const part4 = [
	{
		slug: 'the-axis',
		title: 'The axis: where row 40,000 starts',
		summary:
			'Rows have heights and a person may have changed a few of them. Where a row starts, which row is under a pixel, how tall the sheet is — all answered without an array of a million numbers, by storing only the exceptions with a running total.',
		goal: 'Understand the prefix-sum trick that makes a virtualised grid with resizable rows cheap, and how a pixel becomes an index.',
		blocks: [
			code('src/lib/grid/axis.ts', 1, 35, { partial: true }),
			{
				type: 'p',
				text: 'Almost every row is the default height. So the class stores only the exceptions, sorted, with a running total of how much each differs from the default. An offset is then `index × default + the deltas of the exceptions before it`, and “the exceptions before it” is a binary search over a short list. Ten custom heights in a million rows is ten entries.'
			},
			code('src/lib/grid/axis.ts', 37, 53),
			code('src/lib/grid/axis.ts', 55, 82),
			{
				type: 'p',
				text: '`indexAt` goes the other way: start from where a uniform axis would put the pixel, then correct for the custom sizes before that point. Each correction moves at most a few indexes and there are few custom sizes, so it converges at once in the common case; the guard is there for the case that is not common.'
			},
			code('src/lib/grid/axis.spec.ts', 4, 40),
			{
				type: 'p',
				text: 'The second test is the one worth copying: for every pixel in a range, the index found must contain that pixel. A property stated as a loop, which is the cheapest kind.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can compute `offset(6)` by hand for the axis in the test.',
					'You can say why `#deltas` is cumulative rather than per-index.',
					'You can explain what happens in `indexAt` when the estimate lands past a tall row.'
				]
			}
		]
	},

	{
		slug: 'the-grid',
		title: 'The grid: a thousand cells out of a million',
		summary:
			'Only the cells the scroll position reveals exist in the DOM, positioned absolutely inside a canvas the size of the whole sheet. Two numbers change on scroll, and the two numbers change which cells are rendered. One `cell` snippet, five layers.',
		goal: 'Build a two-axis virtualised grid with frozen panes as sticky layers, and know exactly what is reactive in it and what is not.',
		blocks: [
			code('src/lib/grid/Grid.svelte', 20, 59),
			{
				type: 'p',
				text: 'Three ideas in the header. Only visible cells exist. Cell values are not reactive — one signal, `sheet.version`, redraws the viewport. And every decoration — selection, formula-reference colours, other people’s cursors, the “changed by somebody else” flash — is a *class on a cell*, not an overlay, because an overlay would need its own copy of the geometry and would come apart at the frozen panes.'
			},

			{ type: 'h3', id: 'geometry', text: 'Geometry' },
			code('src/lib/grid/Grid.svelte', 61, 70),
			code('src/lib/grid/Grid.svelte', 72, 120),
			{
				type: 'p',
				text: 'The axes are `$derived` from the sheet’s `SvelteMap`s — iterating a `SvelteMap` is tracked, so a resize rebuilds them. The row and column counts grow with the content, with the scroll position, and with the active cell, so a sheet is always a little bigger than what is in it and never smaller than what has been reached. `rows` and `cols` are the indexes the scroll reveals, with two rows of overscan so a fast scroll does not show a blank band.'
			},
			{
				type: 'why',
				title: 'Why scroll position is state and not read from the element',
				text: 'Every visible cell’s position depends on where the viewport is scrolled. If the grid read `element.scrollTop` inside the template, nothing would re-run when it changed. Two `$state` numbers written by an `onscroll` handler are what let a scroll be a reactive event: the numbers change, `rows` and `cols` re-derive, and the each blocks add and remove cells. `bind:scrollTop` does not exist on elements — the first version tried it — so the handler is the honest way.'
			},

			{ type: 'h3', id: 'the-cell', text: 'One snippet, five layers' },
			code('src/lib/grid/Grid.svelte', 589, 646),
			{
				type: 'p',
				text: 'A snippet with parameters is a template function. `cell(r, c, top, left)` renders one cell at a position; its `{@const}`s compute everything the cell shows from the sheet and the decorations. The class array is the whole visual state: numeric alignment, selection edges, formula highlight edges, the flash, the fill target. The editor mounts *inside* the cell being edited, so it is positioned by the same geometry as everything else.'
			},
			code('src/lib/grid/Grid.svelte', 693, 745),
			{
				type: 'p',
				text: 'Frozen panes are the same snippet rendered in extra layers: frozen rows at the top, frozen columns at the left, and the corner where they meet, each with a different origin. The layers are sticky, and the trick that makes that work is in the stylesheet.'
			},
			code('src/lib/grid/Grid.svelte', 779, 821, { partial: true }),
			{
				type: 'p',
				text: 'Each sticky layer is *zero-sized*: it takes no space in the canvas’s flow, and its absolutely positioned children overflow visibly and move with the canvas on the other axis. That is how the column headers stay at the top while scrolling down and still scroll sideways — with no JavaScript synchronising two scrollers, which is the way every grid used to do it and the way every grid got out of step.'
			},

			{ type: 'h3', id: 'effects', text: 'The two effects' },
			code('src/lib/grid/Grid.svelte', 152, 183),
			{
				type: 'p',
				text: 'Both are real side effects, which is what `$effect` is for. The first clears the flash set after a timer and cancels the timer if the set changes first. The second keeps the active cell on screen by writing to the element’s `scrollTop` — `untrack` around the reads so that the effect depends only on `sheet.anchor`, not on the scroll position it is about to change, which would otherwise loop.'
			},
			code('src/lib/grid/Grid.svelte', 553, 588),
			{
				type: 'p',
				text: 'The outer element is `role="grid"` with `aria-rowcount`, `aria-colcount`, `aria-multiselectable` and `aria-activedescendant` pointing at the active cell’s id — the ARIA grid pattern, which is how a screen reader knows this is a spreadsheet and where in it the person is. A polite live region at the bottom announces the active cell’s address, value and formula on every move.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which four things are `$state` in the grid and why cell values are not.',
					'You can explain how a sticky zero-sized layer keeps column headers at the top while scrolling sideways.',
					'You can say why the scroll-into-view effect wraps its reads in `untrack`.'
				]
			}
		]
	},

	{
		slug: 'keyboard-and-pointer',
		title: 'Keyboard, pointer, clipboard',
		summary:
			'Arrows, Tab and Enter, typing to replace, F2 to edit, Ctrl+arrow to the edge of the data, Ctrl+A, undo and redo — then pointer drags for selection, references, the fill handle and column resizing, and copy, cut and paste through the clipboard events.',
		goal: 'Implement a spreadsheet’s input model on one element with one keydown handler and one pointer state machine, and put two formats on the clipboard at once.',
		blocks: [
			code('src/lib/grid/Grid.svelte', 228, 250, { partial: true }),
			{
				type: 'p',
				text: 'One handler on the grid element. `jump` is the arrow-key primitive: with Ctrl, to the edge of the data; with Shift, extend the selection instead of moving it. Every spreadsheet key a person expects is a case in the switch, and the last branch is the one that makes it feel like a spreadsheet: any printable character starts editing with that character, replacing the cell.'
			},
			code('src/lib/grid/Grid.svelte', 251, 323, { partial: true }),
			{
				type: 'p',
				text: 'Note the first line of the handler: while the in-cell editor is open, the grid does nothing — the editor handles its own keys and stops propagation (ch. 21). Two components on one keyboard is a coordination problem, and “the editor wins while it exists” is the whole of the coordination.'
			},

			{ type: 'h3', id: 'clipboard', text: 'The clipboard' },
			code('src/lib/grid/Grid.svelte', 329, 362),
			{
				type: 'why',
				title: 'Why two MIME types',
				text: 'A copy puts tab-separated text on the clipboard *and* the same cells as JSON under a private MIME type. Paste into another application and it reads the text. Paste back into Abacus and it finds its own JSON first: formulas travel as formulas and are translated by the distance they moved, and formats come with them. If the JSON is missing — the text came from somewhere else — the text path parses it as tab- or comma-separated with the CSV parser of chapter 23. This is what every spreadsheet does; the browser tests in `sheet.svelte.test.ts` check both paths.'
			},

			{ type: 'h3', id: 'pointer', text: 'The pointer' },
			code('src/lib/grid/Grid.svelte', 369, 387),
			{
				type: 'p',
				text: '`cellAt` turns a client coordinate into a cell: subtract the headers, add the scroll — except inside a frozen pane, where the screen position *is* the canvas position. `Drag` is a discriminated union of the four things a drag can be doing, and `drag` is `$state` so the class list can show a fill target while the pointer moves.'
			},
			code('src/lib/grid/Grid.svelte', 388, 462),
			{
				type: 'p',
				text: 'Pointer-down dispatches on what was hit, from most specific to least: a resize handle, the fill handle, a column header, a row header, an input, a cell. `setPointerCapture` is what keeps the drag alive when the pointer leaves the viewport — without it, dragging a selection past the edge would drop it. And the one spreadsheet gesture people never notice until it is missing: click a cell *while typing a formula* and its address is inserted at the caret instead of the selection moving.'
			},
			code('src/lib/grid/Grid.svelte', 461, 530, { partial: true }),
			{
				type: 'p',
				text: 'Move updates the drag; up commits it. A fill drag decides its direction by which way the pointer went furthest and extends the source rectangle that way. A resize drag holds the new width in the drag state until the pointer is released, so the column follows the pointer live and the sheet is written once.'
			},
			{
				type: 'checkpoint',
					items: [
					'You can say what `event.key.length === 1` is for and what would happen without the `!mod` check.',
					'You can explain why `setPointerCapture` is called on the viewport, not on the cell.',
					'You can trace a copy from Abacus and a paste into Abacus, and say which MIME type wins.'
				]
			}
		]
	},

	{
		slug: 'the-cell-editor-and-formula-bar',
		title: 'The cell editor and the formula bar',
		summary:
			'An input inside the cell, focused by an attachment. A formula bar whose coloured references are a mirror under a transparent input, with function-name completion and a syntax error that says where. Both bind to the same `editing.text`.',
		goal: 'Share one editing session between two inputs, colour text inside an input, and reset a piece of state without an effect.',
		blocks: [
			code('src/lib/grid/CellEditor.svelte', 1, 38),
			{
				type: 'p',
				text: 'The editor is an input that binds to `sheet.editing.text`. `focusAtEnd` is an attachment — a function that receives the element when it mounts — and it puts the caret at the end, which is where a person expects it after pressing F2. `bind:value` on a nested `$state` property works because `editing` is a reactive object.'
			},
			code('src/lib/grid/CellEditor.svelte', 40, 96),
			{
				type: 'p',
				text: 'The editor owns Enter, Tab and Escape, and *stops propagation* of everything so the grid’s handler never sees a keystroke meant for the input. `insertAtCaret` is an exported function, which is what the grid calls through `bind:this` when a cell is clicked during a formula: it splices the reference at the caret — or over the reference the last click inserted — and puts the caret after it.'
			},

			{ type: 'h3', id: 'the-mirror', text: 'The mirror' },
			code('src/lib/grid/FormulaBar.svelte', 11, 42),
			{
				type: 'p',
				text: 'A text input cannot colour its own characters. Underneath the input there is a `<div>` showing the same text as coloured spans, in the same font and padding, and the input’s text is transparent — the caret and the selection are the input’s, the colours are the mirror’s. Old trick, still the right one.'
			},
			code('src/lib/grid/FormulaBar.svelte', 44, 84),
			{
				type: 'p',
				text: 'Everything the bar shows is `$derived`: the text (the edit in progress, or the anchor cell’s input), the coloured segments, the syntax error with its position, and — when nothing is being edited — why the anchor cell shows an error. Note `void sheet.version` where a derived reads the engine: the same subscription the grid uses, for the same reason.'
			},
			code('src/lib/grid/FormulaBar.svelte', 179, 214),

			{ type: 'h3', id: 'completion', text: 'Completion, and a reset without an effect' },
			code('src/lib/grid/FormulaBar.svelte', 90, 119),
			{
				type: 'why',
				title: 'Why highlighted is a $derived that a key handler writes to',
				text: 'The arrow keys move a highlight through the suggestions, and the highlight must go back to the first suggestion whenever the list changes. The obvious code is `$state` plus an `$effect` that resets it — and the Svelte autofixer flags exactly that, because assigning state in an effect is how components loop. A `$derived` may be *reassigned*: the assignment holds until the expression re-runs, and it re-runs when `suggestions` changes because the body reads it. One declaration, no effect, and the reset is a consequence of the dependency rather than a second piece of code that has to agree with the first. The find bar does the same with its match index.'
			},
			code('src/lib/grid/FormulaBar.svelte', 121, 176),
			code('src/lib/grid/FormulaBar.svelte', 216, 244),
			{
				type: 'p',
				text: 'The list is a `listbox` of `option`s, the input is a `combobox` that says so with `aria-expanded` and `aria-controls`, and the syntax error is `role="alert"` so it is announced. `onpointerdown` on each option prevents default so the input does not lose focus before the click lands — the one line every custom completion needs and most forget.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the editor calls `stopPropagation` and what the grid would do otherwise.',
					'You can say how the mirror stays aligned with the input and what would break it.',
					'You can rewrite a `$state` + `$effect` reset as an assignable `$derived`.'
				]
			}
		]
	},

	{
		slug: 'toolbar-find-and-workbench',
		title: 'The toolbar, find and replace, and the workbench',
		summary:
			'Buttons that call the sheet model, with native popovers for menus and no `Menu` component. A find bar with a resettable index. A workbench that owns the two things that need a file, and clears a file input with a `DataTransfer`.',
		goal: 'Use the Popover API for menus, wire a component tree to a model without prop drilling, and handle a file input correctly.',
		blocks: [
			code('src/lib/grid/Toolbar.svelte', 21, 50),
			{
				type: 'p',
				text: 'Every button is a command, so every button undoes. The format menu is a native popover — `popovertarget` and a `popover` attribute, no JavaScript, dismissed by a click outside or Escape by the browser itself — which is the state of the art for a menu in 2026 and the reason there is no `Menu` component in this project.'
			},
			code('src/lib/grid/Toolbar.svelte', 102, 137),
			code('src/lib/grid/Toolbar.svelte', 262, 326),
			{
				type: 'p',
				text: 'The popover’s CSS is where the trade shows: without anchor positioning the browser positions nothing, so the menu is `position: fixed` and centred — which on a phone is the better menu anyway. `:popover-open` is the selector for the open state.'
			},

			{ type: 'h3', id: 'find', text: 'Find and replace' },
			code('src/lib/grid/FindReplace.svelte', 6, 45),
			code('src/lib/grid/FindReplace.svelte', 47, 88),
			{
				type: 'p',
				text: 'The matches are `$derived` from the query, the options and `sheet.version`, so the list updates as the sheet changes underneath it. `index` is the assignable-derived reset from the previous chapter. The bar is a `search` landmark, its inputs have visually hidden labels, and the count is a status region.'
			},

			{ type: 'h3', id: 'workbench', text: 'The workbench' },
			code('src/lib/grid/Workbench.svelte', 14, 45),
			code('src/lib/grid/Workbench.svelte', 47, 95),
			{
				type: 'why',
				title: 'Why the file input is cleared with a DataTransfer',
				text: '`bind:files` gives a `FileList`, and a `FileList` cannot be constructed or emptied. Choose the same file twice in a row and the second choice fires no `change` event, because the value did not change. The one way to make an empty `FileList` is to make an empty `DataTransfer` and read its `files`; assigning that clears the input, and the same file can be imported again. Two lines that took an afternoon to find, the first time.'
			},
			code('src/lib/grid/Workbench.svelte', 98, 138),
			{
				type: 'p',
				text: 'The workbench passes the sheet down and snippets up: `extra` is where a page puts the buttons only it has — publish, share, sign in — and `status` is where the stored sheet page shows its connection state. No props are drilled through the toolbar for things the toolbar does not understand.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can open a popover from a button with two attributes and no script.',
					'You can say what `find` is derived from and why `sheet.version` is one of the things.',
					'You can explain what goes wrong when the same file is chosen twice, and the fix.'
				]
			}
		]
	},

	{
		slug: 'csv-in-a-worker',
		title: 'CSV: a streaming parser in a worker, and a streamed export',
		summary:
			'RFC 4180 with the lenient parts every real file needs, as a state machine that takes chunks of any size. A Web Worker feeds it from `File.stream()` and reports progress. Export goes the other way as a `ReadableStream` response.',
		goal: 'Write a streaming parser, move it off the main thread with a typed protocol, and stream a response one row at a time.',
		blocks: [
			code('src/lib/csv/parse.ts', 1, 24),
			{
				type: 'p',
				text: 'The subtlety a streaming parser has that a whole-file parser does not: a `"` inside a quoted field means either “end of field” or, if another `"` follows, “a literal quote” — and the next character may be in the next chunk. The parser remembers that it is waiting to find out.'
			},
			code('src/lib/csv/parse.ts', 31, 73, { partial: true }),
			code('src/lib/csv/parse.ts', 103, 141),
			{
				type: 'p',
				text: '`#consume` is the state machine, one character at a time: in quotes, after a quote in quotes, after a carriage return, or plain. The delimiter is detected from the first line, which is buffered until the line ends and then replayed through the same machine.'
			},
			code('src/lib/csv/parse.spec.ts', 37, 64, { partial: true }),
			{
				type: 'p',
				text: 'The test that matters for a streaming parser: the same rows however the input is chunked. It feeds a nasty string one character at a time, in threes, and whole, and expects the same result each way.'
			},

			{ type: 'h3', id: 'the-worker', text: 'The worker' },
			code('src/lib/csv/protocol.ts', 1, 19),
			code('src/lib/csv/worker.ts', 1, 26),
			code('src/lib/csv/worker.ts', 28, 70),
			{
				type: 'p',
				text: 'The file is read as bytes from `file.stream()` and decoded with a `TextDecoder` in streaming mode, so a multi-byte character split across two chunks is reassembled. Rows go back in batches of five hundred with progress between them. The protocol module is imported by both sides, so a message the worker sends is a message the page expects — the compiler checks the conversation.'
			},
			code('src/lib/csv/import.ts', 24, 72),
			{
				type: 'p',
				text: 'The page’s side wraps the worker in a promise. `new Worker(new URL(\'./worker.ts\', import.meta.url), { type: \'module\' })` is the form Vite understands and bundles; the config’s `worker.format: \'es\'` lets the worker share the parser with the main thread rather than carrying a second copy. The worker is created per import and terminated when done, so a cancelled import leaves nothing running.'
			},
			code('tsconfig.worker.json', 1, 15),

			{ type: 'h3', id: 'export', text: 'Export: a stream the other way' },
			code('src/lib/sheet/render.ts', 55, 66, { partial: true }),
			code('src/routes/api/sheets/[id]/export.csv/+server.ts', 19, 47),
			{
				type: 'p',
				text: 'The response body is a `ReadableStream` that pulls one row at a time from a generator. The first bytes leave the server before the last row has been formatted, a sheet with a hundred thousand rows never exists as one string, and cancelling the download cancels the generator. Values travel *formatted*, as a person would read them, because a CSV is for people and other programs, not for the engine.'
			},
			code('src/lib/csv/export.ts', 10, 34),
			{
				type: 'checkpoint',
				items: [
					'You can say what `#quoteInQuotes` is for and give an input that needs it.',
					'You can explain why the worker decodes with `{ stream: true }`.',
					'You can trace one row from the generator to the wire in the export endpoint.'
				]
			}
		]
	}
];
