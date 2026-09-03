/**
 * PART 1 — The formula language
 * (chapters 04–08)
 *
 * Five chapters with no framework in them at all: addresses, values, a lexer,
 * a parser, an evaluator and a function library. Pure TypeScript, tested in
 * a millisecond, and the reason everything above it can be certain.
 */

import { code } from './quote.js';

export const part1 = [
	{
		slug: 'addresses',
		title: 'Addresses: where a cell is',
		summary:
			'`B3` is column 1, row 2. One small module translates between the letters people use and the numbers the code uses, and packs a cell’s position into one number for a `Map` key.',
		goal: 'Understand why cells are stored sparsely, how a position becomes one number, and where the letters live and where they do not.',
		blocks: [
			{
				type: 'p',
				text: 'Start with the smallest decision, because every later file leans on it. Inside the app a cell is `{ row, col }`, counting from zero. The letters — `B3`, `$A$1`, `A1:C3` — exist only at the edges: the formula bar, the column headers, a URL. This file is the translation.'
			},
			code('src/lib/sheet/address.ts', 1, 25),
			{
				type: 'p',
				text: 'The comment at the top says the thing that matters: a sheet is *sparse*. A million-row grid with forty cells in it must not allocate the million rows. So cells live in a `Map` keyed by one number, and the number is `row * MAX_COLS + col`. With 16,384 columns and 1,048,576 rows that is 2³⁴, comfortably inside the 2⁵³ a JavaScript number can hold exactly, and cheaper to hash than the string `"B3"` would be.'
			},

			{ type: 'h3', id: 'letters', text: 'Letters to numbers and back' },
			code('src/lib/sheet/address.ts', 27, 49),
			{
				type: 'p',
				text: 'Column names are base 26 with a twist: there is no zero. `A` is 1, `Z` is 26, `AA` is 27. That is why `colName` subtracts one before each modulo — a plain base-26 conversion would print column 26 as `BA`. If you have never hand-traced a “bijective base” conversion, do it once for 26, 27 and 702 (`ZZ`); it is the kind of thing that is obvious afterwards.'
			},
			code('src/lib/sheet/address.ts', 51, 66),
			{
				type: 'why',
				title: 'Why parseA1 ignores dollar signs',
				text: '`$A$1` means “do not move this reference when the formula is copied”. That is a fact about *formulas*, not about *addresses*: the cell is the same cell either way. So the address module does not know about dollars at all, and the parser (ch. 07) records them on the reference node where they belong. A module that knows less has fewer ways to be wrong.'
			},

			{ type: 'h3', id: 'the-key', text: 'The key, and the rectangle' },
			code('src/lib/sheet/address.ts', 68, 79),
			code('src/lib/sheet/address.ts', 81, 120),
			{
				type: 'p',
				text: 'A `Rect` is inclusive at both corners and *normalised*: `rect(a, b)` always puts the smaller row on top, so nothing downstream has to handle a selection dragged upwards. `rectToA1` prints `A1:C3`, or just `A1` for a single cell, which is what the formula bar inserts when you click a cell while typing a formula.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can convert `AB` to a column index by hand and say why the arithmetic subtracts one.',
					'You can say what `key(row, col)` returns for `B3` and why it fits in a JavaScript number.',
					'You know which module knows about `$` and which does not.'
				]
			}
		]
	},

	{
		slug: 'values',
		title: 'Values: what a cell can hold',
		summary:
			'A number, a string, a boolean, nothing, or an error — and, during evaluation, a range of those. Coercion rules every spreadsheet shares, and an ordering for comparisons.',
		goal: 'Know the value types, why errors are a class, what `null` means, and the exact rules that turn `"3"` into 3 and `TRUE` into 1.',
		blocks: [
			code('src/lib/formula/values.ts', 1, 39),
			{
				type: 'p',
				text: 'Numbers, strings and booleans are the JavaScript primitives, because wrapping them would buy nothing. Empty is `null`. Errors are a *class* so that `instanceof` tells `#REF!` the error apart from `"#REF!"` the text somebody typed — and so that the `transport` hook in chapter 29 can carry an error across the wire as itself. `toJSON` exists for the same reason: a published sheet’s values are serialised, and an error must serialise as something a reader can recognise.'
			},
			{
				type: 'p',
				text: 'The second comment is the one people miss: **dates are numbers**. `DATE(2026, 9, 2)` is 46267, and adding 7 is a week later without a date library. Which epoch — and what a person sees — is chapter 13.'
			},

			{ type: 'h3', id: 'ranges', text: 'A range, only while evaluating' },
			code('src/lib/formula/values.ts', 41, 78),
			{
				type: 'p',
				text: '`SUM(A1:B2)` receives a `RangeValue`; a cell never stores one. The constructor checks that the cell count matches the shape, because a range with the wrong number of cells is a bug that would otherwise show up as a wrong total three functions later. The error constructors are functions, not constants, so that every error has its own message.'
			},

			{ type: 'h3', id: 'coercion', text: 'Coercion: the rules every spreadsheet shares' },
			code('src/lib/formula/values.ts', 84, 101),
			{
				type: 'p',
				text: 'In arithmetic, empty is zero, a boolean is one or zero, and a string is a number if it *looks* like one and an error if it does not — `"12%"` is 0.12, `"twelve"` is `#VALUE!`. A range where a scalar was expected is an error; there is no implicit intersection here, because nobody can explain it.'
			},
			code('src/lib/formula/values.ts', 103, 121),
			{
				type: 'why',
				title: 'Why toText rounds to fifteen significant digits',
				text: '`0.1 + 0.2` is `0.30000000000000004` in floating point, and always will be. Every spreadsheet hides that at the *edge* — when a number becomes text — by printing fifteen significant digits, which is exactly the precision a double reliably carries. The engine never rounds; only the text does. That keeps `=A1*3` exact and `A1 & ""` readable, which is the right pair.'
			},
			code('src/lib/formula/values.ts', 123, 138),

			{ type: 'h3', id: 'ordering', text: 'An ordering for comparisons and sorting' },
			code('src/lib/formula/values.ts', 140, 168),
			{
				type: 'p',
				text: 'Numbers sort before text, text before booleans, and text compares case-insensitively — the spreadsheet convention, and the reason `2 < "a"` is `TRUE`. Empty takes the rank of whatever it is compared against: zero next to a number, the empty string next to text. `rank` is recursive for exactly that case and nothing else.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `toNumber("")`, `toNumber(null)` and `toNumber(TRUE)` return, and why they differ.',
					'You can explain why `ErrorValue` is a class and a string would not do.',
					'You can predict the result of `="b" > 10` and `="" = 0`.'
				]
			}
		]
	},

	{
		slug: 'the-lexer',
		title: 'The lexer: characters into tokens',
		summary:
			'`SUM(A1:B2)*1.1` becomes a name, a paren, a reference, a colon, a reference, a paren, an operator, a number. Each token remembers where it started, so an error can point at a character.',
		goal: 'Write a hand-rolled lexer for a small language and understand the one rule that tells `A1` from `SUM` from `SUM1`.',
		blocks: [
			code('src/lib/formula/lexer.ts', 1, 21),
			{
				type: 'p',
				text: 'Two decisions live in this comment. First, what is a reference: letters-then-digits with at most three letters, which is the spreadsheet rule and the reason `SUM1` is a cell (column SUM, row 1) rather than a typo. Second, the formula language is **the same everywhere**: numbers use `.` and arguments use `,` whatever the person’s locale. It is *values typed into cells* that are localised, and that is a different file (ch. 13). Mixing the two is how a formula that works in Berlin breaks in Boston.'
			},
			code('src/lib/formula/lexer.ts', 23, 52),
			{
				type: 'p',
				text: 'A token is a type, its text, and where it was. `FormulaSyntaxError` carries a `position`, and the formula bar turns that into “at character 7” under the input. That number is the most useful thing a formula language can say when it is confused.'
			},

			{ type: 'h3', id: 'the-loop', text: 'The loop' },
			code('src/lib/formula/lexer.ts', 54, 76, { partial: true }),
			{
				type: 'p',
				text: 'The shape is the classic one: look at the current character, decide what kind of token starts here, consume it, push it, repeat. `push` records the slice so no token has to be assembled character by character.'
			},
			code('src/lib/formula/lexer.ts', 78, 102),
			{
				type: 'p',
				text: 'Numbers: digits, an optional fraction, an optional exponent. `.5` is a number, `5.` is a number, `1e3` is a number. `1.2.3` is deliberately *two* tokens and a syntax error at the parser — which is where the message can say something clear, rather than the lexer guessing.'
			},
			code('src/lib/formula/lexer.ts', 102, 130, { partial: true }),
			{
				type: 'p',
				text: 'Strings use `""` for a literal quote, as spreadsheets do. Error literals are tokens too, so `=IFERROR(#REF!, 0)` parses, and an unknown `#…` is refused at once.'
			},
			code('src/lib/formula/lexer.ts', 133, 143),
			{
				type: 'why',
				title: 'Why the reference test is a regular expression on the whole word',
				text: 'The lexer reads a run of letters, digits, underscores and dollars first, then decides what it was. `$A$1` matches the reference pattern; `TRUE` is a boolean; anything else is a name and will have to be followed by `(` or the parser will say so. Deciding *after* reading the whole word is what keeps `SUM1` a reference and `SUM` a function without special cases.'
			},
			code('src/lib/formula/lexer.ts', 145, 182, { partial: true }),
			{
				type: 'checkpoint',
				items: [
					'You can list the tokens for `=IF(A1>10, "big", B2*2)`.',
					'You can say why `1.2.3` is not rejected by the lexer.',
					'You know why the decimal point is always `.` in a formula and where locales are handled instead.'
				]
			}
		]
	},

	{
		slug: 'the-parser',
		title: 'The parser: a Pratt parser in a hundred lines',
		summary:
			'Binding powers instead of a grammar. Each operator has a number; an expression is a prefix followed by every operator that binds tighter than the one we are inside. The precedence table is the readable part.',
		goal: 'Understand Pratt parsing well enough to add an operator, and know the one place the table is a decision rather than mathematics.',
		blocks: [
			{ type: 'h3', id: 'the-tree', text: 'The tree it builds' },
			code('src/lib/formula/ast.ts', 1, 47),
			{
				type: 'p',
				text: 'Every node carries its `span`. The second-best thing a formula can do is be right; the best thing it can do when it is wrong is say *where*. The engine reads references out of this tree to build its graph, the evaluator walks it, and the formula bar colours the source by span.'
			},
			code('src/lib/formula/ast.ts', 55, 83),
			{
				type: 'p',
				text: '`references` is the function the dependency graph is built from. Note `node satisfies never` in the default branch: if somebody adds a node type and forgets this function, the compiler says so.'
			},

			{ type: 'h3', id: 'binding-power', text: 'Binding power' },
			code('src/lib/formula/parser.ts', 1, 50),
			{
				type: 'p',
				text: 'Read the table before the code. Comparison binds loosest, then `&`, then `+ -`, then `* /`, then `^`, then unary sign, then percent. One line in it is a *decision*: unary minus binds tighter than `^`, so `-2^2` is 4. Mathematics says −4; every spreadsheet says 4; a formula language that disagreed with the sheet it lives in would be wrong in the way that matters, because a person pasting `=-2^2` from somewhere else expects the answer they got there.'
			},
			code('src/lib/formula/parser.ts', 52, 68, { partial: true }),
			code('src/lib/formula/parser.ts', 70, 103),
			{
				type: 'p',
				text: 'This is the whole algorithm. Parse a prefix. Then loop: look at the next operator; if it binds *less* tightly than `minBp`, stop and hand back what we have; otherwise consume it and parse its right side. The right side is parsed with `lbp + 1` so that `1 - 2 - 3` groups as `(1 - 2) - 3` — and with the *same* power for `^`, so `2^3^2` groups as `2^(3^2)`. That one-character difference is the entire theory of associativity.'
			},
			{
				type: 'why',
				title: 'Why Pratt and not a grammar',
				text: 'A recursive-descent parser for this language needs a function per precedence level: `comparison` calls `concatenation` calls `addition` calls `multiplication` calls `power` calls `unary` calls `primary`. Seven functions that differ only in which operators they check. Pratt collapses them into one loop and a table. Adding an operator is adding a row; changing a precedence is changing a number. For a language a person types into a cell, that is the right trade.'
			},

			{ type: 'h3', id: 'prefix', text: 'Prefixes, references, calls' },
			code('src/lib/formula/parser.ts', 105, 159),
			{
				type: 'p',
				text: 'A parenthesised group is parsed with `minBp` zero — everything is allowed inside — and its span is widened to include the parens, so a highlight covers `(A1+A2)` rather than `A1+A2`. Unary minus parses its operand at `UNARY_BP`, which is why `-A1^2` is `(-A1)^2`.'
			},
			code('src/lib/formula/parser.ts', 161, 206),
			{
				type: 'p',
				text: 'A range is two references with a colon between, normalised so `B2:A1` is the same rectangle as `A1:B2`. A name that is not followed by `(` is an error with a suggestion in it — “did you mean a function? Add ()” — because the most common cause is somebody typing `SUM A1:A3`.'
			},
			code('src/lib/formula/parser.ts', 208, 233, { partial: true }),
			{
				type: 'p',
				text: '`cellRef` is where the dollar signs are read (ch. 04 promised this), and where a reference outside the sheet — `A1048577` — is refused at parse time rather than at evaluation.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can trace `expression(0)` on `1 + 2 * 3` and say which call parses the `*`.',
					'You can say what changes if `^` used `lbp + 1` like the others.',
					'You can add a `MOD` operator `%%` at multiplication precedence by editing one table and one type.'
				]
			}
		]
	},

	{
		slug: 'evaluation-and-functions',
		title: 'Evaluation and the function library',
		summary:
			'The evaluator walks the tree with a `Context` and knows nothing about sheets. Fifty functions register themselves in a `Map`, receive their arguments as thunks so `IF` is lazy, and share a few coercion helpers.',
		goal: 'Know how a formula becomes a value, why arguments are thunks, and how criteria, rounding and lookups are done the way a spreadsheet does them.',
		blocks: [
			code('src/lib/formula/evaluate.ts', 1, 43),
			{
				type: 'p',
				text: 'The evaluator does not know what a sheet is. The cells it needs come through a `Context` — the engine provides one, a test provides a `Map`, the lesson page in chapter 17 provides a closure over nine `$derived`s. The clock and the random source are injected for the same reason: `TODAY()` in a test must give the same answer tomorrow.'
			},
			code('src/lib/formula/evaluate.ts', 45, 94),
			{
				type: 'p',
				text: 'The `call` branch is the one to read slowly. A function receives its arguments as **thunks** — `() => evaluate(arg, ctx)` — not as values. `IF` must not evaluate the branch it does not take (it might be `1/0`), and `IFERROR` must be able to *catch* an error rather than receive it. Laziness costs a closure per argument and buys the semantics every spreadsheet has.'
			},
			code('src/lib/formula/evaluate.ts', 96, 107),
			{
				type: 'p',
				text: 'A range larger than a million cells is refused with `#NUM!` rather than allocated. `=SUM(A:A)` does not exist in this language — ranges are always two corners — but `=SUM(A1:XFD1048576)` does, and a person who types it should get an error, not a frozen tab.'
			},
			code('src/lib/formula/evaluate.ts', 109, 168),

			{ type: 'h3', id: 'the-library', text: 'The library' },
			code('src/lib/formula/functions.ts', 1, 22),
			code('src/lib/formula/functions.ts', 46, 63),
			{
				type: 'p',
				text: 'Every entry carries a `signature` and a `description` because the formula bar’s completion list reads this same table. A function that exists but is not documented is a function nobody finds.'
			},
			code('src/lib/formula/functions.ts', 69, 100),
			{
				type: 'p',
				text: '`numbers` is the rule that makes `SUM(A1:A3)` ignore a heading in A1 while `SUM("3", TRUE)` is 4: in a *range*, only numbers count; a *scalar* argument is coerced. Both are what every spreadsheet does, and they are different rules, so they are written as two branches rather than one clever one.'
			},
			code('src/lib/formula/functions.ts', 125, 152),

			{ type: 'h3', id: 'criteria', text: 'Criteria: ">5", "<>done", "a*"' },
			code('src/lib/formula/functions.ts', 158, 215),
			{
				type: 'p',
				text: '`COUNTIF` and `SUMIF` take a criterion that is half a comparison: `">5"`, `"<>done"`, `"a*"`. This function turns one into a predicate once, so a range of a thousand cells is not re-parsing the string a thousand times. The comment in the middle records a decision the tests forced: a numeric criterion sees only numbers. In a column of prices with a heading, the heading is not “greater than six”; it is a heading.'
			},

			{ type: 'h3', id: 'rounding', text: 'Rounding in decimal, not in binary' },
			code('src/lib/formula/functions.ts', 428, 461),
			{
				type: 'why',
				title: 'Why ROUND shifts the decimal point as text',
				text: '`1.005 * 100` is `100.49999999999999` in floating point, so `Math.round` gives 100 and a person who typed 1.005 and asked for two places sees 1.00 and stops trusting the sheet. `Number("1.005e2")` is exactly 100.5 — the shift happens in the decimal string, before the binary error can. This is the trick every spreadsheet uses under the hood, and it fell out of a failing test rather than a plan.'
			},

			{ type: 'h3', id: 'text-and-lookup', text: 'Text functions and lookups' },
			code('src/lib/formula/functions.ts', 607, 631),
			{
				type: 'p',
				text: 'Text functions share one wrapper. `LEN` counts code points with `[...t]`, so an emoji is one character, which is what a person means.'
			},
			code('src/lib/formula/functions.ts', 832, 855),
			{
				type: 'p',
				text: '`INDEX` counts from one, as the language does everywhere a person types a number. `VLOOKUP` and `HLOOKUP` are one definition in a loop over a boolean, because they are the same function with the axes swapped and writing them twice would let them drift.'
			},

			{ type: 'h3', id: 'dates', text: 'Serial dates' },
			code('src/lib/sheet/dates.ts', 1, 32),
			{
				type: 'p',
				text: 'The epoch is 30 December 1899, which agrees with Google Sheets and with Excel from 1 March 1900 onwards. Excel’s serial 60 is 29 February 1900 — a day that never happened, kept since 1987 for Lotus compatibility — and this project declines to inherit it. Everything is UTC on purpose: a date in a cell has no time zone, and a serial computed in one zone and displayed in another must not shift by a day.'
			},
			code('src/lib/sheet/dates.ts', 53, 69),

			{ type: 'h3', id: 'highlights', text: 'Colouring references from tokens' },
			code('src/lib/formula/highlight.ts', 1, 27),
			code('src/lib/formula/highlight.ts', 29, 75),
			{
				type: 'p',
				text: 'The formula bar colours references while a formula is *being typed*, and a formula being typed is unfinished more often than not: `=SUM(A1:` does not parse. So this works from tokens, not from the tree, and the colours do not vanish at every keystroke that makes the text unparseable. The hue cycles through six, defined in `tokens.css`, and the same hue outlines the range on the grid.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why `IF(TRUE, 1, 1/0)` is 1 and not `#DIV/0!`, and which line makes it so.',
					'You can predict `COUNTIF(A1:A3, ">6")` over `{"Price", 7, "8"}`.',
					'You can add a function with a signature, a description and a lazy argument in under ten lines.'
				]
			}
		]
	}
];
