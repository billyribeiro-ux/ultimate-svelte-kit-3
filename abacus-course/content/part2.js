/**
 * PART 2 — The engine
 * (chapters 09–12)
 *
 * The dependency graph, written by hand: cells, edges, a dirty set, Kahn's
 * topological sort, Tarjan for cycles, and reference rewriting when the sheet
 * changes shape. Then the property test that lets all of it be optimised
 * later without fear.
 */

import { code } from './quote.js';

export const part2 = [
	{
		slug: 'the-dependency-graph',
		title: 'The dependency graph',
		summary:
			'A spreadsheet is a graph that recalculates itself. Cells in a `Map`, edges recorded when a formula is compiled, and the four-step procedure — dirty set, in-degrees, Kahn’s sort, leftovers — that recomputes exactly what changed.',
		goal: 'Understand incremental recalculation well enough to explain why a `$derived` recomputes when it does, and read the engine’s `evaluated` count as proof.',
		blocks: [
			code('src/lib/engine/engine.ts', 1, 35),
			{
				type: 'p',
				text: 'Read the four steps twice; they are the chapter. Everything else in the file is bookkeeping in service of them. The header also records the one performance trade the engine makes: single-cell references are indexed in a `Map` from cell to readers, but *range* references are a list of rectangles scanned per changed cell. That is linear in the number of range formulas, which is honest for a sheet a browser holds, and the tests in this part are what would let you replace it with an interval tree safely.'
			},

			{ type: 'h3', id: 'a-cell', text: 'What a cell is' },
			code('src/lib/engine/engine.ts', 55, 93),
			{
				type: 'p',
				text: '`input` is the truth: what the person typed. Everything else — the parsed formula, the value, the rectangles it reads — is derived from it and can be rebuilt. `Recalc` is what a batch of edits returns, and its `evaluated` count is the number that proves the engine is incremental: change one cell in a thousand and it should be small.'
			},
			code('src/lib/engine/engine.ts', 95, 130, { partial: true }),
			{
				type: 'p',
				text: 'The engine is plain TypeScript. `version` is a number, not `$state` — the sheet model in chapter 15 mirrors it into a rune. The `Context` handed to the evaluator closes over `this.value`, which is how `=A1` reaches another cell without the evaluator ever knowing what a sheet is.'
			},

			{ type: 'h3', id: 'editing', text: 'Editing is a batch' },
			code('src/lib/engine/engine.ts', 182, 226),
			{
				type: 'p',
				text: 'A paste of a hundred cells is one batch, one topological sort and one version bump, rather than a hundred. Note the three outcomes per edit: an empty input with a general format *deletes* the entry — empty is the absence of a cell — an unchanged input keeps the compiled cell and only updates its format, and anything else is compiled, indexed and added to the seeds.'
			},
			code('src/lib/engine/engine.ts', 293, 337),
			{
				type: 'p',
				text: 'Compiling a formula parses it once and turns its references into rectangles. A formula that does not parse becomes an `#ERROR!` cell with the syntax error’s message and position in it — the person sees where, and the rest of the sheet keeps working.'
			},
			code('src/lib/engine/engine.ts', 339, 381),
			{
				type: 'p',
				text: 'The two indexes. A one-cell rectangle goes into `#direct` under the cell it reads; anything bigger goes into `#ranges` under the formula. `#dependents` combines them: the direct readers of a cell, plus every range formula whose rectangle contains it. Unindexing on edit is what keeps a deleted formula from being notified forever.'
			},

			{ type: 'h3', id: 'recalculation', text: 'The recalculation' },
			code('src/lib/engine/engine.ts', 383, 461),
			{
				type: 'p',
				text: 'Step one collects the dirty set: the seeds, every volatile cell (`RAND()`, `NOW()`), and everything downstream, transitively. Step two counts in-degrees — but only among dirty *formulas*. A dirty literal was just typed and is already final; it holds nothing back. That distinction is the bug the first version had, and the comment is where it was fixed.'
			},
			{
				type: 'p',
				text: 'Step three is Kahn’s algorithm. Evaluate every formula with no unevaluated precedents, then `release` its dependents — decrement their counts and enqueue any that reach zero. A formula is evaluated only after everything it reads has been, which is the guarantee that makes the value right the first time rather than eventually.'
			},
			{
				type: 'why',
				title: 'Why this is what $derived does',
				text: 'Svelte’s runtime keeps, for each `$derived`, the set of signals it read last time. When a signal changes, the runtime marks the deriveds that read it dirty, transitively, and recomputes them on demand in dependency order — never reading a stale value, never computing a diamond twice. Rename `Map` to “signal”, `#direct` to “reactions”, and the dirty set to “marked”, and this function is the scheduler. The difference is that the framework discovers edges by running the function, where the engine reads them out of a parsed formula — and that the framework has no notion of a cycle being a *value*. Chapter 17 puts the two next to each other.'
			},
			code('src/lib/engine/engine.ts', 438, 461, { partial: true }),
			{
				type: 'p',
				text: 'Step four is the leftovers, and it is the next chapter.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what the dirty set contains after editing A1 when B1 reads A1 and C1 reads B1.',
					'You can explain why a dirty *literal* has no in-degree entry and what goes wrong if it does.',
					'You can point at the line where a formula is evaluated and the line that releases its dependents.'
				]
			}
		]
	},

	{
		slug: 'cycles',
		title: 'Cycles: an error that is a value',
		summary:
			'`A1 = B1 + 1`, `B1 = A1 + 1`. A program with that in it has a bug; a spreadsheet with that in it has a person who made a mistake, and must keep working. Tarjan’s algorithm finds the members, and everything downstream carries on.',
		goal: 'Know how the engine finds cycle members precisely — not just “something is left over” — and why cells downstream of a cycle are evaluated normally.',
		blocks: [
			{
				type: 'p',
				text: 'When Kahn’s queue empties, anything still unevaluated has an in-degree that never reached zero. That means it is on a cycle — or merely *downstream* of one, which is a different thing. `=A1+1` where A1 is in a cycle is not itself circular; it should evaluate, see `#CYCLE!` as a value, and produce `#CYCLE!` the way it would produce `#DIV/0!` from a division by zero next door.'
			},
			code('src/lib/engine/engine.ts', 438, 461, { partial: true }),
			{
				type: 'p',
				text: 'So the leftovers are split. The strongly connected components of the remaining graph with more than one node — plus any node that reads itself — are the cycle members. They are marked, counted as done, and *released*, and the queue is drained again. The downstream cells evaluate with the error as an input.'
			},
			code('src/lib/engine/engine.ts', 464, 509),
			{
				type: 'p',
				text: 'Tarjan’s algorithm in thirty lines: one depth-first pass, an index and a low-link per node, and a stack. When a node’s low-link equals its own index it is the root of a component, and everything above it on the stack belongs to that component. A component of one node is a cycle only if the node points at itself.'
			},
			{
				type: 'why',
				title: 'Why IFERROR can catch a cycle',
				text: 'Because `#CYCLE!` is an `ErrorValue` like any other. `=IFERROR(A1, 0)` where A1 is circular gives 0; `=COUNT(A1:A3)` skips the circular cell and counts the rest. The first version of the engine marked everything left over as circular and stopped, which made a single mistake poison every total in the sheet. The test in `engine.spec.ts` that asserts `cycles` has exactly three members — and that a downstream `IFERROR` recovers — is the test that forced the split.'
			},
			code('src/lib/engine/engine.spec.ts', 113, 149),
			{
				type: 'p',
				text: 'The engine’s own tests for cycles, in the language the sheet uses. `sheet()` is a tiny helper that builds an engine from a record of `A1: "=B1"` pairs, which is what every engine test in the file wants.'
			},
			code('src/lib/engine/engine.ts', 511, 544),
			{
				type: 'p',
				text: 'Three small helpers finish the file. `isVolatile` walks a tree looking for a function the library marked volatile. `toScalar` is the rule that this engine does not spill: `=A1:B2` in one cell is an error unless the range is one cell. `same` treats two errors with the same code as equal, so a recalculation does not report a cell as changed when its `#DIV/0!` was replaced with another `#DIV/0!`.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can draw the graph for `A1=B1`, `B1=C1`, `C1=A1`, `D1=A1+1` and say which cells are members and which is downstream.',
					'You can explain what “low-link equals index” means in Tarjan’s algorithm.',
					'You can say why `same()` exists and what would flicker without it.'
				]
			}
		]
	},

	{
		slug: 'moving-references',
		title: 'Moving references: insert, delete, copy',
		summary:
			'Insert a row above `A5` and every `A5` becomes `A6`. Delete the column a formula reads and the reference becomes `#REF!`. Copy `=A1*2` one row down and it becomes `=A2*2` — unless it said `$A$1`. One mechanism does all three.',
		goal: 'Understand how a formula’s text is rewritten without disturbing the parts a person wrote, and what the engine does to the whole sheet when its shape changes.',
		blocks: [
			code('src/lib/engine/rewrite.ts', 1, 34),
			code('src/lib/engine/rewrite.ts', 36, 58),
			{
				type: 'p',
				text: 'The mechanism: parse, walk the references in source order, decide the new text of each, and splice it back into the original string *from the end* so that earlier spans stay valid. Everything that is not a reference — spacing, casing, the person’s own choices — is left as it was. `null` from the mapper means “this reference points nowhere now”, and `#REF!` is written in its place: a value the evaluator understands, so the cell shows an error rather than failing to parse.'
			},

			{ type: 'h3', id: 'structural', text: 'A structural change' },
			code('src/lib/engine/rewrite.ts', 60, 81),
			{
				type: 'p',
				text: '`shiftIndex` is the one function every structural change reduces to: where does an index land after inserting or deleting `count` at `at`? Before the change, unchanged; inserted, moved by `count`; inside a deleted band, gone; after it, moved back by `count`.'
			},
			code('src/lib/engine/rewrite.ts', 83, 117),
			{
				type: 'p',
				text: 'A range is subtler than a cell. Deleting row 5 from `SUM(A1:A10)` gives `SUM(A1:A9)` — the range *shrinks* — and it vanishes only when all of it is deleted. An insertion inside a range grows it; at or before its start moves it. Those are what a person means, and they are the cases the property test in the next chapter checks by inserting rows and deleting them again.'
			},
			code('src/lib/engine/engine.ts', 256, 287),
			{
				type: 'p',
				text: 'The engine’s side of a shift is deliberately blunt: every cell moves, every formula is rewritten, and everything is recalculated. A structural change is rare, and a full pass is the right price for a procedure with no special cases — the comment says so, and the alternative (tracking exactly which formulas a shift touched) is the kind of cleverness that arrives with its own bugs.'
			},

			{ type: 'h3', id: 'copy', text: 'Copying: relative and absolute' },
			code('src/lib/engine/rewrite.ts', 119, 139),
			{
				type: 'p',
				text: 'Copying a formula is *translation*: relative parts move by the distance, absolute parts (`$`) stay. A reference pushed off the top or left of the sheet becomes `#REF!`, which is what every spreadsheet shows when you paste `=A1` into row 1 from row 2. The sheet model uses this for paste, for the fill handle and for sorting rows (ch. 16).'
			},
			code('src/lib/engine/engine.spec.ts', 202, 225),
			{
				type: 'checkpoint',
				items: [
					'You can say what `SUM(B2:B9)` becomes after inserting two rows at row 4, and after deleting rows 8–12.',
					'You can explain why references are spliced from the end of the string.',
					'You can predict what `=$A1+B$2` becomes when copied one row down and one column right.'
				]
			}
		]
	},

	{
		slug: 'proving-the-engine',
		title: 'Proving the engine: a from-scratch evaluator and ten thousand random edits',
		summary:
			'A property test: after any sequence of edits, the incremental engine must hold exactly the values a from-scratch evaluation would produce. A thousand random sheets, ten thousand edits, a printed seed.',
		goal: 'Write a property test for an incremental system by building the naive version of it and comparing, and know why that is a stronger statement than any list of cases.',
		blocks: [
			code('src/lib/engine/engine.property.spec.ts', 10, 36),
			{
				type: 'p',
				text: 'The idea is old and underused: build the *obviously correct* version — no indexes, no dirty sets, rebuild the whole graph every time — and check that the clever version agrees with it on inputs nobody chose. The two share the parser and the evaluator, which have their own tests, and nothing else. `mulberry32` is a seedable generator so that a failure prints a seed and can be replayed.'
			},
			code('src/lib/engine/engine.property.spec.ts', 38, 82),
			{
				type: 'p',
				text: 'Random inputs are the part that takes judgement. A quarter numbers, some empties, a few awkward literals (`TRUE`, `\'abc`), and formulas over random cells and ranges with the whole operator set — including divisions that will be by zero and references that will be circular. A generator that only produces valid, sensible formulas tests only valid, sensible formulas.'
			},
			code('src/lib/engine/engine.property.spec.ts', 83, 144),
			{
				type: 'p',
				text: 'The from-scratch evaluator finds cycle members on the *static* graph with the same `cyclicMembers` — that function is shared on purpose, because its correctness is a graph-theory fact tested elsewhere — then resolves every formula recursively, memoising as it goes. It is twenty lines because it does not have to be fast.'
			},
			code('src/lib/engine/engine.property.spec.ts', 146, 204),
			{
				type: 'p',
				text: 'Then the test: a thousand seeds, ten edits each, agreement checked after every edit, and a `checks` count asserted so that a loop that silently did nothing would fail. The second test proves a batch of edits gives the same result as the same edits one at a time — and bumps `version` exactly once, which is the promise chapter 15 builds on.'
			},
			code('src/lib/engine/engine.property.spec.ts', 206, 232),
			{
				type: 'why',
				title: 'Why the failure message prints the whole sheet',
				text: 'A property test that says “expected 7, got 8 on seed 412” is a puzzle. One that prints every input on the sheet at the moment of the disagreement is a bug report. Ten lines of formatting in `agree()` turned three real engine bugs — the literal in-degree, the cycle split, and a range that shrank to nothing — into ten-minute fixes.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm exec vitest run --project server src/lib/engine
 ✓ src/lib/engine/engine.spec.ts (20 tests)
 ✓ src/lib/engine/engine.property.spec.ts (4 tests) 1.6s
   ✓ after ten thousand random edits across a thousand sheets
   ✓ after a batch of edits, exactly as after the same edits one at a time
   ✓ inserting rows and deleting them again restores every formula
   ✓ translating a formula there and back is the identity when nothing falls off`
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what the from-scratch evaluator shares with the engine and what it deliberately does not.',
					'You can explain why the `checks` count is asserted.',
					'You can add a fifth property — “clearing every cell leaves the engine empty” — in the same style.'
				]
			}
		]
	}
];
