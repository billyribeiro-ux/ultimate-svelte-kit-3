/**
 * PART 5 — The interface (chapters 27–34)
 *
 * Eight chapters of Svelte 5 doing things that are hard: a virtualizer that
 * measures, a snippet that renders itself, a canvas, and an editor built out of
 * a textarea and the language front end from part 1.
 */

import { code } from './quote.js';

export const part5 = [
	{
		slug: 'design-tokens',
		title: 'Design tokens for a tool used at three in the morning',
		summary:
			'Why the default theme is dark and why that is not fashion, four status colours and no more, and a line height chosen for how many rows fit on a laptop.',
		goal: 'Build a token layer that a component can use without ever knowing what the theme is.',
		blocks: [
			code('src/lib/styles/tokens.css', 1, 27),
			{
				type: 'p',
				text: 'Every colour is a semantic token — `--surface-raised`, never `--slate-800` — because a component that asks for slate-800 has decided what the theme is, and the second theme then needs a second component. If a component stylesheet mentions a palette step, that is a bug.'
			},

			{ type: 'h3', id: 'rationed-colour', text: 'Signal colour is rationed' },
			{
				type: 'p',
				text: 'There are exactly four status colours and they are used for status only. Everything else — panels, borders, headings, chrome — is neutral. In an interface whose job is to make an anomaly obvious, every decorative use of red spends some of the attention that red is supposed to buy.'
			},
			code('src/lib/styles/tokens.css', 64, 84),
			{
				type: 'why',
				title: 'Colour blindness is not an edge case here',
				text: 'Red and green as the only difference between "error" and "ok" is unusable for about eight per cent of men. The hues here are chosen so the difference is carried by **lightness** as well, and every place the colour appears also carries an icon or a pattern. The flame graph draws error bars with diagonal stripes for exactly this reason.'
			},

			{ type: 'h3', id: 'levels', text: 'Five log levels, two of them coloured' },
			code('src/lib/styles/tokens.css', 123, 137),
			{
				type: 'p',
				text: '`debug` and `info` are the overwhelming majority of lines. Colouring them means a screen that is entirely coloured, at which point the colour on the `error` rows carries no information at all. Neutral for the common case is what makes the uncommon case visible.'
			},

			{ type: 'h3', id: 'type', text: 'A line height chosen by counting rows' },
			code('src/lib/styles/tokens.css', 165, 174),
			{
				type: 'p',
				text: '1.45 on a log table is about 21px a row, which puts roughly forty lines on a laptop screen. Going to 1.6 "for readability" costs eight lines — and eight lines is often the difference between seeing the error and its cause on one screen.'
			},
			{
				type: 'p',
				text: 'And the data font is monospace, not because it is code but because a column of durations in a proportional face cannot be scanned downwards: `1` and `8` are different widths and the decimal points do not line up. `tabular-nums` fixes that for one family; a mono face fixes it for every number in the product, including the ones drawn into a canvas where that CSS property does not reach.'
			},

			{ type: 'h3', id: 'motion', text: 'Motion, and a budget' },
			code('src/lib/styles/tokens.css', 206, 227, { partial: true }),
			{
				type: 'p',
				text: 'Anything over 200ms in a tool people use for eight hours becomes a wait. Motion exists to show *where a thing came from* — a drawer sliding in from the side it can be dismissed towards — and never to be noticed.'
			},

			{
				type: 'checkpoint',
				items: [
					'No component stylesheet names a palette step.',
					'Switching themes changes one attribute on the root and nothing else.',
					'You can say why `debug` and `info` have no colour.'
				]
			}
		]
	},

	{
		slug: 'the-virtualizer',
		title: 'A virtualizer for variable-height rows, and `flushSync`',
		summary:
			'Why `rows.slice(start, end)` fails on log lines, measuring after render, and the one place in this project that genuinely needs a synchronous flush.',
		goal: 'Render a hundred thousand rows at sixty frames a second, with a scrollbar that does not lie.',
		blocks: [
			code('src/lib/components/Virtualizer.svelte.ts', 1, 32),
			{
				type: 'p',
				text: 'With fixed-height rows a virtualizer very nearly *is* `rows.slice(start, end)`: the index at a scroll offset is a division and the total height is a multiplication. Log lines are not fixed height — a stack trace is twelve lines and a heartbeat is one — and every simplification that assumes otherwise fails on exactly the rows people care about, because the long rows are the interesting ones.'
			},

			{ type: 'h3', id: 'the-map', text: 'A plain Map, on purpose' },
			code('src/lib/components/Virtualizer.svelte.ts', 75, 91),
			{
				type: 'p',
				text: 'This is the one place in the project that argues *against* `SvelteMap`, and the argument is about write frequency. A measurement pass sets thirty heights in a loop — thirty reactive invalidations for one visual change, in the hot path of scrolling. Replacing the map wholesale is one invalidation.'
			},
			{
				type: 'note',
				text: 'The linter objects, and it is right to: a plain `Map` in `$state` is usually somebody expecting `.set()` to be reactive and quietly finding it is not. The suppression carries the reasoning, and it is per-site rather than per-file so a fourth map added later is still checked.'
			},

			{ type: 'h3', id: 'offsets', text: 'Cumulative offsets, and an honest complexity note' },
			code('src/lib/components/Virtualizer.svelte.ts', 99, 128, { partial: true }),
			{
				type: 'p',
				text: 'O(n) in the row count, recomputed only when a measurement actually changed something. A prefix-sum tree makes it O(log n) and is the right answer at a million rows; at ten thousand it is a data structure to maintain in exchange for nothing measurable. Saying which side of that line you are on is more useful than picking the clever one.'
			},

			{ type: 'h3', id: 'flushsync', text: 'The anchor, and why `flushSync`' },
			code('src/lib/components/Virtualizer.svelte.ts', 192, 226, { partial: true }),
			{
				type: 'why',
				title: 'The one place a synchronous flush is not a smell',
				text: 'A live tail inserts at the top. The browser preserves `scrollTop`, which is a distance from the top of the *content* — so when content grows above you, the row you were reading moves down. Correcting it means computing the new offsets and *then* setting the scroll position, in that order, in the same frame. Svelte batches state changes into a microtask, so without `flushSync()` the read happens against the old layout and the correction is one frame stale — which looks exactly like the jump it was meant to prevent.'
			},
			{
				type: 'p',
				text: 'Note that this is a *method*, not an effect. That is not incidental: an effect runs after the batch, which is precisely too late.'
			},

			{ type: 'h3', id: 'scrollto', text: 'And `tick`, which is the other one' },
			code('src/lib/components/Virtualizer.svelte.ts', 228, 250, { partial: true }),
			{
				type: 'p',
				text: '`await tick()` rather than `flushSync()`, because nothing here reads layout immediately afterwards — one tick is enough, and it is cheaper. Knowing which of the two you need is knowing whether a layout read follows.'
			},

			{
				type: 'checkpoint',
				items: [
					'A hundred thousand rows scroll smoothly with about thirty in the DOM.',
					'Rows arriving at the top do not move the row you are reading.',
					'You can say why the anchor is a method rather than an effect.'
				]
			}
		]
	},

	{
		slug: 'the-results-table',
		title: 'The results table',
		summary:
			'One component for every result shape, attachments that do not thrash, and the ARIA that makes a virtualized grid tell the truth.',
		goal: 'Render whatever columns a query produced, formatted by what the values are.',
		blocks: [
			{
				type: 'p',
				text: 'Every query lands in one table, whatever its shape: a hundred thousand log lines, a six-row summary, one column of numbers. Rather than three components with a conditional between them, this renders whatever columns the result has and formats each cell by what the value *is*.'
			},
			code('src/lib/components/ResultTable.svelte', 7, 18),
			{
				type: 'p',
				text: 'That is a constraint on the query language too, and a useful one: because the table is generic, a new SQF function needs no interface work at all.'
			},

			{ type: 'h3', id: 'attachments', text: 'An attachment factory, and why not an inline arrow' },
			code('src/lib/components/ResultTable.svelte', 68, 90),
			{
				type: 'warn',
				text: 'The inline version — `{@attach (el) => …}` — looks identical and is a performance bug. An attachment re-runs whenever its expression produces a new function, and an arrow written in markup is new on every render, so an inline version detaches and reattaches a `ResizeObserver` per row per frame.'
			},

			{ type: 'h3', id: 'aria', text: 'The ARIA a virtualized grid needs' },
			code('src/lib/components/ResultTable.svelte', 159, 175),
			{
				type: 'p',
				text: 'A virtualized table renders a window of rows, so a screen reader that counted the DOM would announce "row 3 of 12" while the person is at row 4,000 of 100,000. `aria-rowcount` on the grid and `aria-rowindex` on each row tell it the truth — and are the reason a virtualizer does not have to choose between being usable and being fast.'
			},

			{ type: 'h3', id: 'formatting', text: 'Format by value, not by column name' },
			code('src/lib/components/ResultTable.svelte', 104, 127),
			{
				type: 'p',
				text: 'A column called `duration` is a duration; so is `p95` from `percentile(duration, 95)`, and `slowest` from `max(duration)`. Keying off the name formats the first and misses the other two — which is exactly the case where a raw number is least readable.'
			},
			{
				type: 'p',
				text: 'The heuristic that follows is honest about being one. The evaluator knows each column’s SQF type and this component does not, because the result crosses the wire as plain rows; threading the type through would be the correct fix and would mean the result shape carries a schema.'
			},

			{ type: 'h3', id: 'truncation', text: 'Truncation, said plainly' },
			code('src/lib/components/ResultTable.svelte', 206, 219),
			{
				type: 'p',
				text: 'A truncated result that looks complete is how somebody concludes an error stopped happening. The count shown is the *shown* count, because the true one is not known — and "of many" is more honest than a number that would have to be guessed.'
			},

			{ type: 'h3', id: 'mobile', text: 'And a phone gets a different table' },
			code('src/lib/components/ResultTable.svelte', 234, 247),
			{
				type: 'p',
				text: 'Mobile first, and the breakpoint adds columns rather than removing them. A six-column grid at 390px gives each column sixty pixels, which is narrower than a timestamp; stacked, each row is a small record — which is how a log line reads on a phone anyway.'
			},

			{
				type: 'checkpoint',
				items: [
					'The same component renders a log table and a two-column summary.',
					'A screen reader announces the true row number at row 4,000.',
					'A truncated result says so above the fold.'
				]
			}
		]
	},

	{
		slug: 'the-flame-graph',
		title: 'A flame graph that renders itself',
		summary:
			'The one shape a component system is traditionally bad at, and the Svelte 5 feature that makes it four lines.',
		goal: 'Render a tree without a component that imports itself.',
		blocks: [
			{
				type: 'p',
				text: 'A trace is a tree, and a tree is the one shape a component system is traditionally bad at. Rendering it means a component that imports itself — which works and produces a module cycle — or a separate `<svelte:self>` dialect, or a flattening pass that throws away the structure and rebuilds it with `padding-left`.'
			},
			code('src/lib/components/FlameGraph.svelte', 34, 62),
			{
				type: 'p',
				text: 'Svelte 5 snippets can recurse. `{@render flame(child, depth + 1)}` **inside the definition of `flame`** is legal, terminates on the base case like any other recursion, and needs no second file.'
			},
			code('src/lib/components/FlameGraph.svelte', 105, 135),

			{ type: 'h3', id: 'the-depth-guard', text: 'The guard, and where it lives' },
			code('src/lib/components/FlameGraph.svelte', 1, 27),
			{
				type: 'p',
				text: '`depthOf` is in a `<script module>` block because it is a pure function of its argument and has no business being recreated per instance — and it is **iterative**, for the same reason everything else that walks a span tree is: a service retrying in a loop produces a chain thousands deep, and that trace is the bug report.'
			},

			{ type: 'h3', id: 'truncation', text: 'Truncating honestly' },
			code('src/lib/components/FlameGraph.svelte', 83, 91),
			{
				type: 'p',
				text: 'A flame graph past about twenty levels is a solid block: each bar is two pixels tall and none of them can be read or clicked. Truncating with a visible marker is more honest than rendering something unusable — and the waterfall next to it, which is a list and scrolls, has no such limit.'
			},

			{ type: 'h3', id: 'colour', text: 'A colour per service, derived rather than assigned' },
			code('src/lib/trace/colour.ts', 1, 19),
			{
				type: 'why',
				title: 'Why a pool is the wrong answer',
				text: 'Assigning colours from a pool means the same service is teal in one trace and amber in the next, because the pool is handed out in whatever order the spans happened to arrive. "The teal one" then stops being a way to refer to anything, and comparing two traces side by side — which is most of what anybody does with a trace viewer — means re-reading every label. Hashing costs a collision now and then, which makes two rows look similar; an unstable palette makes every row unrecognisable.'
			},
			code('src/lib/trace/colour.ts', 21, 38),
			{
				type: 'p',
				text: 'And the bars are `oklch`, not `hsl`. In HSL, yellow at 50% lightness is far brighter than blue at 50% — the number means "halfway between black and full colour", which is a different amount of light for every hue. A palette built from it has bars whose white label is unreadable and bars that glare. `oklch` lightness is perceptual, so one lightness value gives every hue the same apparent brightness and one contrast decision holds for all 360.'
			},

			{
				type: 'checkpoint',
				items: [
					'A trace renders as nested bars with no second component file.',
					'A trace two hundred levels deep renders twenty and says so.',
					'The same service is the same colour in every trace, on every machine.'
				]
			}
		]
	},

	{
		slug: 'the-waterfall',
		title: 'The waterfall',
		summary:
			'A flat list that behaves like a tree, collapse as "skip while deeper", and `content-visibility` instead of a virtualizer.',
		goal: 'Render every span as a keyboard-navigable row, and know when CSS is enough.',
		blocks: [
			code('src/lib/components/Waterfall.svelte', 7, 44),
			{
				type: 'p',
				text: 'The flame graph recurses because it draws a tree and the tree is the point. A waterfall is a **list** that happens to be indented, and rendering it as a list is what makes three things possible at once: collapsing a subtree is a filter over one array, keyboard navigation is `index ± 1`, and the browser can skip the rows that are off screen.'
			},

			{ type: 'h3', id: 'collapse', text: 'Collapse, without a tree walk' },
			code('src/lib/components/Waterfall.svelte', 82, 124),
			{
				type: 'p',
				text: 'Because `trace.flat` is depth-first, every descendant of a collapsed node sits immediately after it and has a greater depth. So "collapse" is: remember a depth, skip while deeper, stop at the first row that is not. No recursion, no second index — and the count of what was skipped falls out of the same loop, so a collapsed row can say how much it is hiding.'
			},

			{ type: 'h3', id: 'content-visibility', text: 'When CSS is enough' },
			code('src/lib/components/Waterfall.svelte', 494, 513, { partial: true }),
			{
				type: 'why',
				title: 'Reaching for the virtualizer here would be carrying a data structure to solve a problem CSS already solved',
				text: '`Virtualizer.svelte.ts` is right when rows have unpredictable heights, which log lines do and these rows do not — every row here is one line. `content-visibility: auto` gets the same result from the browser for free, while leaving the rows in the DOM for find-in-page, for screen readers and for `scrollIntoView`. The half people leave out is `contain-intrinsic-size`: without it the browser does not know how tall a skipped row would be, and the scrollbar resizes under the thumb.'
			},

			{ type: 'h3', id: 'keyboard', text: 'A tree, as ARIA defines one' },
			code('src/lib/components/Waterfall.svelte', 148, 161, { partial: true }),
			{
				type: 'p',
				text: 'Down and up move, Right expands or descends, Left collapses or goes to the parent, Home and End jump to the ends. On a trace viewer this is not a nicety: the row somebody wants is often the four-hundredth, and finding it by scrolling and clicking is slower than holding an arrow key.'
			},
			{
				type: 'p',
				text: 'The handler is on each **row** rather than on the container. Both work — key events bubble — and the per-row version is the one that keeps its promise to accessibility tooling, which checks that an element carrying `onclick` can also be operated from a keyboard. That check is not pedantry here: the container version depends on focus having been tracked correctly, and the row version cannot get out of step with itself.'
			},

			{ type: 'h3', id: 'self-time', text: 'Two numbers as text, and no geometry for the second' },
			code('src/lib/components/Waterfall.svelte', 380, 403),
			{
				type: 'warn',
				text: 'The tempting design is a darker segment inside the bar sized to self time. It is wrong: self time is not one contiguous interval — it is whatever was left over between the children — so drawing it as a block puts it at a *position in time* where nothing happened. Saying the number is less pretty and is not a lie.'
			},

			{
				type: 'checkpoint',
				items: [
					'A five-thousand-span trace scrolls smoothly with no virtualizer.',
					'Collapsing a subtree removes its rows and says how many.',
					'You can move through the whole trace with the arrow keys.'
				]
			}
		]
	},

	{
		slug: 'the-query-editor',
		title: 'A query editor with no editor library',
		summary:
			'Three layers in one grid cell, highlighting from the real lexer, and a caret measured from the mirror that already exists.',
		goal: 'Build syntax highlighting, error underlines and a completion popup out of a textarea.',
		blocks: [
			code('src/lib/components/QueryEditor.svelte', 9, 45),
			{
				type: 'why',
				title: 'Why not CodeMirror',
				text: 'Because the thing that makes an editor good for *your* language is not the editing — it is that the highlighting, the completion and the errors all come from the same front end that will run the query. Wiring a general-purpose editor to a language means a grammar for its highlighter, a source for its completion and a linter for its diagnostics: three adapters, each able to drift from the compiler. Here there are no adapters, because there is one lexer, one parser and one checker, and this file calls them.'
			},
			{
				type: 'p',
				text: 'The cost is real and worth naming: no multi-cursor, no bracket matching, no code folding, no undo beyond the browser’s own. For a one-line pipeline — which is what every SQF query is — that list is entirely things nobody would use.'
			},

			{ type: 'h3', id: 'highlighting', text: 'Highlighting from the real lexer' },
			code('src/lib/editor/highlight.ts', 1, 21),
			{
				type: 'p',
				text: 'Every editor on the web highlights with a pile of regular expressions, and every one of them is subtly wrong: `"a | b"` gets a pipe coloured inside a string, `1e-5` becomes a number and a minus, `contains` inside an identifier lights up as a keyword. Those are not bugs to fix one at a time — they are what happens when the highlighter and the parser disagree about the language.'
			},
			{
				type: 'p',
				text: 'There is a lexer four files away that is already correct, already tested, and already produces a span for every token. Using it means the highlighting is *by construction* the same tokenisation the query will be parsed with — and adding a keyword to the language highlights it with no further work.'
			},
			code('src/lib/editor/highlight.ts', 61, 98),
			{
				type: 'note',
				text: 'The gap-filling is the part that is easy to skip and impossible to omit. The lexer emits nothing for whitespace, because a parser has no use for it — and the overlay is positioned by nothing but the text itself, so a single dropped space shifts every character after it out of step with the caret. There is a test for exactly that: the chunks must concatenate back to the source, byte for byte.'
			},

			{ type: 'h3', id: 'three-layers', text: 'Three layers, one grid cell' },
			code('src/lib/components/QueryEditor.svelte', 258, 276),
			{
				type: 'p',
				text: 'An error underlay in transparent text with a wavy underline, the highlighted source, and a transparent textarea with a visible caret. The grid cell sizes to the tallest — which is the `<pre>` — so the editor grows with the query and never scrolls independently of its own highlighting. No `scrollHeight` read per keystroke, no resize effect.'
			},
			{
				type: 'warn',
				text: 'Every metric must match in all three layers: font, size, line height, letter spacing, padding, wrapping, tab size. A single mismatch and the highlighting drifts from the caret by a fraction of a character per line, which looks like a browser bug and is not. They are declared once on a shared selector for exactly that reason.'
			},

			{ type: 'h3', id: 'the-caret', text: 'Measuring the caret without a hidden mirror' },
			code('src/lib/editor/highlight.ts', 98, 129, { partial: true }),
			{
				type: 'p',
				text: 'Placing a completion popup at the caret is famously fiddly, and the standard solution is a second hidden div that mirrors the textarea purely to be measured. This project already has a character-perfect mirror — the highlight layer — so the caret position is a zero-width `<span>` rendered into it, and `offsetLeft` is the answer.'
			},
			{
				type: 'p',
				text: 'That works with proportional fonts, with wrapped lines, and with no arithmetic at all. Reusing the mirror that has to exist anyway is the whole trick.'
			},

			{ type: 'h3', id: 'no-debounce', text: 'And no debounce' },
			code('src/lib/components/QueryEditor.svelte', 77, 104),
			{
				type: 'p',
				text: 'Parse and check run on every keystroke. The whole front end takes well under a millisecond on a few hundred characters, so a debounce would make the underline appear a quarter of a second after the mistake — which is exactly long enough to have started typing the next thing. Hiding a fast thing behind a timer makes it feel slow.'
			},

			{
				type: 'checkpoint',
				items: [
					'A pipe inside a string is not coloured as an operator.',
					'The caret and the highlighted text never drift, at any width.',
					'An error is underlined as you type, with the message beside the editor.'
				]
			}
		]
	},

	{
		slug: 'completion',
		title: 'Completion that knows where the caret is',
		summary:
			'Why completion cannot use the parser, the five places a caret can be, and the hyphen that broke the replacement range.',
		goal: 'Offer exactly what is legal at the caret, and nothing else.',
		blocks: [
			code('src/lib/editor/completion.ts', 1, 27),
			{
				type: 'p',
				text: 'The obvious approach is to parse and ask the tree what belongs at the offset. It does not work, and the reason is structural: **the text under a caret is almost always syntactically invalid.** Somebody typing `from logs | where sta` has an incomplete expression, and `| ` on its own has no stage at all. A parser built to reject invalid input has nothing useful to say about either.'
			},
			{
				type: 'p',
				text: 'So completion works off the **token stream**, which the lexer produces for any input at all, and reconstructs just enough structure to know what is legal. That is a few dozen lines, and it is robust precisely because it understands so little.'
			},

			{ type: 'h3', id: 'five-places', text: 'Five places a caret can be' },
			code('src/lib/editor/completion.ts', 78, 96, { partial: true }),
			code('src/lib/editor/completion.ts', 140, 155, { partial: true }),
			code('src/lib/editor/completion.ts', 193, 204, { partial: true }),
			{
				type: 'p',
				text: 'One left-to-right pass over the tokens before the caret. No stack and no nesting: SQF pipelines are flat, and the only nesting is inside parentheses, where the answer — "an expression" — is the same as outside them.'
			},

			{ type: 'h3', id: 'aggregates', text: 'The rule that makes the list worth reading' },
			{
				type: 'p',
				text: '`summarize` has two halves and they allow different things. Before `by`, aggregations are required and bare columns are an error; after it, the opposite. Offering `count()` in a `by` list is offering something that will always fail the check — which is worse than offering nothing, because a completion list reads as a list of things that are *allowed*.'
			},
			code('src/lib/editor/editor.spec.ts', 50, 74),

			{ type: 'h3', id: 'ranking', text: 'And no fuzzy matching' },
			code('src/lib/editor/completion.ts', 316, 373, { partial: true }),
			{
				type: 'why',
				title: 'Fuzzy matching is wonderful in a file finder and wrong here',
				text: 'In a file finder you know the answer and are recalling it, so `dur` matching `p95_duration_ms` is a shortcut. In a schema you are still learning, it puts things you have never heard of at the top of the list, and you cannot tell whether they are relevant or noise. Prefix beats substring, shorter beats longer, alphabetical breaks the tie.'
			},

			{ type: 'h3', id: 'the-hyphen', text: 'The hyphen that broke the replacement range' },
			{
				type: 'p',
				text: 'The first version found the word under the caret by walking backwards over `[A-Za-z0-9_.]`. Inside a string that is wrong, and the failure is specific:'
			},
			{
				type: 'terminal',
				code: `
typed:      service == "payments-w
walk back:  stops at the hyphen, prefix is "w"
accepted:   service == "payments-payments-worker"

Every test passed. None of the fixtures had a hyphen in a
partially typed name — which is the whole argument for
writing the fixture that does.`
			},
			code('src/lib/editor/completion.ts', 112, 138),
			{
				type: 'p',
				text: 'The fix uses the lexer again: an unterminated string still produces a `string` token, so the replacement range can start at the opening quote. The bug and the fix are both consequences of the same decision — that this file asks the real lexer rather than a regular expression.'
			},

			{
				type: 'checkpoint',
				items: [
					'`from ` offers three sources and nothing else.',
					'`where ` offers columns and scalar functions but not `count`.',
					'Accepting a completion inside a string replaces the whole string, hyphens included.'
				]
			}
		]
	},

	{
		slug: 'canvas-charts',
		title: 'Canvas charts, and a worker that earns its keep',
		summary:
			'Why SVG is the wrong answer at eight series, transferable typed arrays, device pixels, and a summary table that is not a consolation prize.',
		goal: 'Draw a time series that stays smooth while a range is dragged, and is readable without eyes.',
		blocks: [
			code('src/lib/components/MetricChart.svelte', 20, 56),
			{
				type: 'p',
				text: 'SVG is the better answer for most charts and the wrong one here. An SVG line of two thousand points is two thousand path segments in the DOM; eight series of those is sixteen thousand nodes that the browser lays out, styles and hit-tests on every frame of a range drag. Canvas draws the same picture as pixels and the DOM stays empty.'
			},

			{ type: 'h3', id: 'the-worker', text: 'When a worker is worth it' },
			code('src/lib/charts/downsample.worker.ts', 1, 33),
			{
				type: 'why',
				title: 'The honest rule',
				text: 'A worker is worth it when the work is long enough to drop a frame **and** happens while something is animating. Both halves matter. LTTB on ten thousand points takes well under a millisecond, so for one chart a worker is pure overhead — the structured clone costs more than the work. A fortnight at one-minute resolution across eight series, re-cut on every drag of the time selector, is a different question.'
			},
			code('src/lib/charts/downsampler.ts', 33, 44),
			{
				type: 'p',
				text: 'Below two thousand points it does not use the worker at all, because there the message is the expensive part. Having a threshold matters more than the exact number.'
			},

			{ type: 'h3', id: 'transfer', text: 'Transfer, do not clone' },
			code('src/lib/charts/downsample.worker.ts', 66, 74, { partial: true }),
			{
				type: 'p',
				text: 'An array of `{x, y}` objects clones to twenty thousand JavaScript objects, and the clone shows up in a profile as more time than the algorithm. Two `Float64Array`s **transfer** instead: ownership moves, nothing is copied, and the cost is constant regardless of length.'
			},
			{
				type: 'warn',
				text: 'Forgetting the transfer list is not an error — it silently copies. Which is why this is the kind of optimisation that quietly stops working, and why the arrays are allocated per call so that detaching them is safe.'
			},

			{ type: 'h3', id: 'ordering', text: 'Replies are unordered, and most are stale' },
			code('src/lib/charts/downsampler.ts', 1, 30),
			{
				type: 'p',
				text: 'Two requests in flight can come back either way round, so every message carries an id — without which a fast small series overtakes a slow big one and each chart draws the other’s data. And dragging a range fires a request per frame, so by the time the tenth reply lands, nine of them answer questions nobody is asking.'
			},

			{ type: 'h3', id: 'device-pixels', text: 'Device pixels, and colours from the stylesheet' },
			code('src/lib/components/MetricChart.svelte', 134, 165),
			{
				type: 'p',
				text: 'A canvas sized in CSS pixels on a 2× display is drawn at half resolution and scaled up, which is why so many web charts have soft, slightly blurry lines. And the colours are read with `getComputedStyle` on the canvas itself, so the chart follows the theme with no wiring at all — hard-coding them would give a chart that ignores the light theme, and threading them in as props would make every caller responsible for knowing the token names.'
			},

			{ type: 'h3', id: 'gaps-again', text: 'A gap, drawn as a gap' },
			code('src/lib/components/MetricChart.svelte', 205, 234, { partial: true }),
			{
				type: 'p',
				text: 'The alternative is to join across it, which draws a straight line through a period when nothing was reported — and a straight line is indistinguishable from a steady value. An outage is exactly when somebody is looking at this chart.'
			},

			{ type: 'h3', id: 'the-table', text: 'The table is not a consolation prize' },
			code('src/lib/components/MetricChart.svelte', 347, 368),
			{
				type: 'p',
				text: 'A canvas is a rectangle of pixels with no structure at all. That is not a reason to avoid canvas — it is a reason to supply the structure separately, which is what the min/mean/max/latest table below the chart is. For "what was the peak", it is faster than reading the picture.'
			},

			{
				type: 'checkpoint',
				items: [
					'Eight series of twenty thousand points redraw smoothly while a range is dragged.',
					'Lines are crisp on a high-DPI screen and follow the theme.',
					'The crosshair reads the full series, not the drawn one.'
				]
			}
		]
	}
];
