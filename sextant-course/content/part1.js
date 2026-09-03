/**
 * PART 1 — The front end of a language (chapters 05–11)
 *
 * Characters in, a checked syntax tree out. Seven chapters, about a thousand
 * lines, and nothing in them is specific to telemetry — this is the part of the
 * project you will reuse somewhere else within a year.
 */

import { code } from './quote.js';

export const part1 = [
	{
		slug: 'tokens',
		title: 'Tokens, and why every one carries a position',
		summary:
			'The vocabulary of SQF, and the single decision — a span on every token — that makes every error message in the language point at a column.',
		goal: 'Define the token type and understand why positions are decided in the smallest file, before anything is built on it.',
		blocks: [
			{
				type: 'p',
				text: 'A lexer turns characters into tokens. Before writing one, we decide what a token *is*, and there is exactly one decision in that definition that cannot be taken back later.'
			},
			code('src/lib/sqf/token.ts', 1, 17),
			{
				type: 'why',
				title: 'Why this is not a detail you can add later',
				text: 'A parser that throws away positions can never get them back. Retrofitting them means touching every node type, every constructor, every test and every error site — which is why the decision is made in the smallest file in the project, before there is anything to retrofit.'
			},
			{
				type: 'p',
				text: 'A `Span` is a half-open range into the original string. Half-open because that is what `String#slice` wants for quoting the offending text back, and what a text editor wants for drawing an underline.'
			},
			code('src/lib/sqf/token.ts', 19, 30),

			{ type: 'h3', id: 'keywords-are-kinds', text: 'Keywords are their own kinds' },
			{
				type: 'p',
				text: 'The alternative is one `ident` kind plus a lookup wherever it matters. That works and it means the parser asks "is this string `where`?" in nine places, and the checker asks again.'
			},
			code('src/lib/sqf/token.ts', 32, 41),
			{
				type: 'p',
				text: 'The cost is real and worth stating: a keyword cannot be used as a column name. That is a language-design decision rather than an accident — SQF column names come from telemetry that people control, and a label called `where` would be hostile to read even if it parsed.'
			},
			code('src/lib/sqf/token.ts', 100, 113),

			{ type: 'h3', id: 'the-two-equals', text: 'The two kinds of equals' },
			{
				type: 'p',
				text: 'Both `=` and `==` exist, which is a famous source of bugs in C-like languages. The mitigation here is structural rather than stylistic:'
			},
			code('src/lib/sqf/token.ts', 65, 76),
			{
				type: 'p',
				text: 'Because they are never interchangeable *anywhere*, writing the wrong one is always a parse error with a specific message, rather than a query that runs and quietly means something else. We will see the guard that produces that message in chapter 8, and the mistake that made it fire in the wrong place.'
			},

			{
				type: 'checkpoint',
				items: [
					'You have a `Token` type with a `Span` on it.',
					'You can explain why positions cannot be added to a parser later.',
					'You can say why keywords are token kinds rather than identifiers plus a lookup.'
				]
			}
		]
	},

	{
		slug: 'the-lexer',
		title: 'The lexer',
		summary:
			'A hand-written scanner: why not regular expressions, how a duration differs from a number, and why an unterminated string must not eat the rest of the query.',
		goal: 'Turn text into tokens, with recovery, so that a query with three mistakes reports three.',
		blocks: [
			code('src/lib/sqf/lexer.ts', 1, 23),
			{
				type: 'p',
				text: 'Read the last paragraph twice. **The lexer never throws.** It records an error, skips the character, and keeps going. That single decision is most of what makes a language front end pleasant to use rather than merely correct — an error list that shrinks as you type beats one that reveals your mistakes one at a time.'
			},

			{ type: 'h3', id: 'the-loop', text: 'The loop' },
			code('src/lib/sqf/lexer.ts', 44, 66, { partial: true }),
			{
				type: 'p',
				text: 'Three closures over `at`, and then a `while` that dispatches on the first character. `push` slices the original text for `text` and records the span, so no branch has to remember to do either.'
			},

			{ type: 'h3', id: 'durations', text: 'Numbers, and the thing that makes them durations' },
			{
				type: 'p',
				text: 'This is the first of the two places a regular-expression lexer struggles. `5m` is a duration; `5` followed by a column named `m` is not. One lookahead in a scanner:'
			},
			code('src/lib/sqf/lexer.ts', 75, 89),
			{
				type: 'p',
				text: 'And the unit table decodes to milliseconds **here**, not in the parser, so that `5m` and `300s` are indistinguishable by the time anything downstream sees them — and so the units live in exactly one place.'
			},
			code('src/lib/sqf/lexer.ts', 28, 36),
			{
				type: 'note',
				text: 'Longest suffix first is not decoration. `ms` and `m` are both valid, and a table scanned in the wrong order reads `500ms` as five hundred *minutes* followed by a stray `s`.'
			},

			{ type: 'h3', id: 'strings', text: 'Strings, and the newline that saves the query' },
			code('src/lib/sqf/lexer.ts', 93, 129, { partial: true }),
			{
				type: 'p',
				text: 'The interesting part is what happens at a newline. A naive loop consumes to the end of the input looking for a closing quote, swallows the rest of the query, and reports one error at the very end — which tells you nothing about where the mistake is.'
			},
			code('src/lib/sqf/lexer.ts', 131, 155, { partial: true }),
			{
				type: 'why',
				title: 'Why this matters more than it looks',
				text: 'An unterminated string is *the* most common thing somebody has in their editor at any given moment, because it is the state of every string halfway through being typed. Getting it wrong means the whole query goes red between the opening quote and the closing one, on every keystroke.'
			},

			{ type: 'h3', id: 'recovery', text: 'The unknown character' },
			code('src/lib/sqf/lexer.ts', 181, 193, { partial: true }),
			{
				type: 'p',
				text: 'Recorded, skipped, and lexing continues — and then an `eof` token is always pushed, which is why every `peek()` downstream is total and no caller has to check for the end of the array.'
			},

			{ type: 'h3', id: 'testing', text: 'Testing a lexer' },
			{
				type: 'p',
				text: 'The tests that matter are not "it lexes `from`". They are the ones that pin the decisions above:'
			},
			code('src/lib/sqf/lexer.spec.ts', 40, 61),
			{
				type: 'checkpoint',
				items: [
					'`lex("from logs | take 5")` gives you tokens with correct spans.',
					'`lex("5m")` is one duration token worth 300000, and `lex("5 m")` is two tokens.',
					'A query with three unknown characters reports three errors, not one.'
				]
			}
		]
	},

	{
		slug: 'the-ast',
		title: 'The syntax tree',
		summary:
			'A source and a pipeline of stages — and why pipelines rather than SQL’s clause order is the decision that makes completion possible.',
		goal: 'Define the node types, and understand what the shape of the tree buys the editor.',
		blocks: [
			code('src/lib/sqf/ast.ts', 1, 23),
			{
				type: 'p',
				text: 'The paragraph about completion is the whole argument for the shape. After `| where ` the editor knows which columns exist, because everything before that point has already been resolved. In SQL, `SELECT` comes first and the tables are named last — which is why SQL completion is either wrong or has to parse ahead speculatively and guess.'
			},

			{ type: 'h3', id: 'expressions', text: 'Expressions' },
			code('src/lib/sqf/ast.ts', 50, 86),
			{
				type: 'p',
				text: 'Two of those nodes exist for reasons worth naming. A `duration` is its own kind rather than a number with a flag, so the checker can *insist* on one where a window is wanted. And a `path` — `attributes.http.status` — is its own kind rather than a chain of binary `.` operators, because a bag lookup is a different operation from a field access and pretending otherwise pushes the difference into the evaluator.'
			},

			{ type: 'h3', id: 'aliases', text: 'Aliases, and a field that only exists for an error message' },
			code('src/lib/sqf/ast.ts', 92, 105),
			{
				type: 'why',
				title: 'A field that exists purely to make one message better',
				text: '`explicit` changes nothing about evaluation. It exists so that when two outputs collide, the checker can say "two outputs are both called `count`, name one of them" — which is only sayable if it knows the person did not choose the name. That is a fair trade: one boolean for a message that tells somebody what to type.'
			},

			{ type: 'h3', id: 'walking', text: 'Walking the tree' },
			{
				type: 'p',
				text: 'Two helpers, and the choice of generators over visitors is deliberate.'
			},
			code('src/lib/sqf/ast.ts', 140, 171),
			{
				type: 'p',
				text: 'A generator can be `break`-ed out of, which the completion code does constantly: it wants the innermost node containing a cursor and nothing else. A visitor with callbacks would have to run to completion and throw to stop early.'
			},

			{
				type: 'checkpoint',
				items: [
					'You have an `Expr` union and a `Stage` union, every node carrying a span.',
					'You can explain why pipeline order rather than SQL clause order makes completion possible.',
					'You can say why `walkExpr` is a generator.'
				]
			}
		]
	},

	{
		slug: 'the-pratt-parser',
		title: 'The Pratt parser',
		summary:
			'One loop and a table instead of six near-identical functions — and the guard that was written in the wrong place and could never fire.',
		goal: 'Parse the pipeline with recursive descent and expressions with Pratt, recovering at each `|`.',
		blocks: [
			code('src/lib/sqf/parser.ts', 1, 30),
			{
				type: 'p',
				text: 'The textbook alternative is one function per precedence level: `parseOr` calls `parseAnd` calls `parseComparison` calls `parseAdditive`. It works, and it produces six near-identical functions, and adding an operator means inserting a seventh in the right place and rewiring its neighbours.'
			},

			{ type: 'h3', id: 'the-table', text: 'Precedence as data' },
			code('src/lib/sqf/parser.ts', 46, 79),
			{
				type: 'p',
				text: 'Read it top to bottom: that is the entire precedence of the language, printable and arguable. Comparison sits at 30, **above** `and`, so `a == 1 and b == 2` needs no parentheses — which is the single most common thing anybody writes, and the place where a language that gets precedence "technically right" (C, where `&` binds looser than `==`) annoys people forever.'
			},

			{ type: 'h3', id: 'the-loop', text: 'The whole of precedence, in eight lines' },
			code('src/lib/sqf/parser.ts', 322, 358),
			{
				type: 'p',
				text: 'Parse a prefix; then, while the next infix operator binds at least as tightly as the caller asked for, consume it and parse a right operand that must bind *strictly* tighter. That last word is the associativity: passing `power` instead of `power + 1` makes subtraction right-associative, so `a - b - c` becomes `a - (b - c)` and the arithmetic is silently wrong.'
			},

			{ type: 'h3', id: 'the-guard-in-the-wrong-place', text: 'A guard that could never fire' },
			{
				type: 'p',
				text: 'The `=` check inside that loop is the most instructive twenty lines in the file, and it was originally somewhere else.'
			},
			{
				type: 'terminal',
				code: `
from logs | where level = "error"
                        ^
first attempt: a guard in #parsePrefix
        result: never fires. \`level\` is consumed as a prefix,
                so the \`=\` is reached in INFIX position.
      symptom: "Expected \`|\` before the next stage", pointing
                at the end of the query rather than at the \`=\`.`
			},
			{
				type: 'p',
				text: 'The guard compiled. It read correctly. It was in the wrong position in the grammar, so the error surfaced twenty tokens later pointing at something unrelated. The rule that comes out of it is general: **put the error where the token actually appears.**'
			},
			{
				type: 'note',
				text: 'This is a good argument for writing the test that produces the *message* rather than the one that produces the failure. A test asserting "this query fails" passed the whole time.'
			},

			{ type: 'h3', id: 'recovery', text: 'Recovery at the pipe, and nothing else' },
			code('src/lib/sqf/parser.ts', 166, 191, { partial: true }),
			code('src/lib/sqf/parser.ts', 193, 203),
			{
				type: 'why',
				title: 'Why one dumb synchronisation point beats a clever one',
				text: 'Trying to resume at the next keyword produces cascading nonsense, because the token after a mistake is usually still part of the mistake. `|` is unambiguous, it is where a stage begins, and a person editing a broken query is nearly always inside one stage.'
			},

			{ type: 'h3', id: 'testing-a-parser', text: 'Testing a parser' },
			code('src/lib/sqf/parser.spec.ts', 77, 101),
			{
				type: 'checkpoint',
				items: [
					'`parse("from logs | where a == 1 and b == 2")` gives one `and` with two comparisons under it.',
					'A four-stage query with a broken second stage still reports an error in the fourth.',
					'`where level = "error"` produces a message about `=` that points at the `=`.'
				]
			}
		]
	},

	{
		slug: 'errors-that-point',
		title: 'Errors that point at something',
		summary:
			'One error type for the whole front end, the difference between a message and a hint, and did-you-mean by edit distance.',
		goal: 'Produce errors somebody can act on, and know when a suggestion is worse than no suggestion.',
		blocks: [
			code('src/lib/sqf/errors.ts', 1, 13),
			{
				type: 'p',
				text: 'One type for the lexer, the parser and the checker, because a person typing a query does not care which phase objected — only where and why.'
			},
			code('src/lib/sqf/errors.ts', 17, 27, { partial: true }),

			{ type: 'h3', id: 'message-vs-hint', text: 'Message and hint are different jobs' },
			{
				type: 'p',
				text: 'The message says **what is wrong**. The hint says **what to do**. Mixing them produces the "expected one of: 47 tokens" style of message that is technically complete and practically useless.'
			},
			{
				type: 'terminal',
				code: `
message   A duration cannot be compared with a plain number
hint      write a duration, like \`500ms\` or \`2s\`

message   No column called \`servce\` on \`logs\`
hint      did you mean \`service\`?

message   \`count\` is an aggregation and can only appear in \`summarize\`
hint      move it into a \`summarize\`, or use \`where\` on a column`
			},
			{
				type: 'p',
				text: 'And a text rendering, for the tests and for the command line. The editor never uses it — it has the span and draws its own underline — but having one means a failing test says what went wrong instead of `expected true to be false`.'
			},
			code('src/lib/sqf/errors.ts', 29, 51),

			{ type: 'h3', id: 'did-you-mean', text: 'Did-you-mean, and when to keep quiet' },
			code('src/lib/sqf/errors.ts', 54, 75),
			{
				type: 'why',
				title: 'A wrong suggestion is worse than none',
				text: 'The bound is the interesting part: distance 2, **and** at most a third of the word’s length. Proposing `duration` for a typo of `d` is worse than proposing nothing, because a wrong suggestion is followed more often than no suggestion is ignored. Somebody will type `duration`, get a different wrong answer, and conclude the tool is confused.'
			},

			{
				type: 'checkpoint',
				items: [
					'Every error carries a span, and a hint when there is something concrete to say.',
					'`format()` prints a compiler-style caret under the offending text.',
					'You can explain why the edit-distance bound scales with the word’s length.'
				]
			}
		]
	},

	{
		slug: 'the-schema',
		title: 'The schema: what a column is, and what a function promises',
		summary:
			'Three tables, a function table, and the parameter type that exists solely to make one error message lead somewhere.',
		goal: 'Write the single source of truth that the checker, the planner, completion and the documentation all read.',
		blocks: [
			{
				type: 'p',
				text: 'Everything the language knows about the world is in one file. A column has a name, a type, and a sentence; a function has parameters, a return type and a sentence. Four consumers read it and none of them has its own copy.'
			},
			code('src/lib/sqf/schema.ts', 42, 58),
			{
				type: 'p',
				text: '`bag: true` marks a column you can path into — `attributes.http.status` — and `common: true` marks the handful worth putting at the top of a completion list. Both are metadata *for other code*, which is the whole point of a schema.'
			},
			code('src/lib/sqf/schema.ts', 101, 131),

			{ type: 'h3', id: 'functions', text: 'Functions, and a return type that depends on its argument' },
			code('src/lib/sqf/schema.ts', 167, 183),
			{
				type: 'p',
				text: '`returnsArg` is the mechanism that keeps units alive through an aggregation. `min(duration)` is a duration and `min(value)` is a number; without this the aggregate would have to return `dynamic`, and every unit check downstream of a `summarize` would be lost — which is exactly where people compare a p95 against a threshold.'
			},

			{ type: 'h3', id: 'numeric', text: 'The parameter type that exists for one message' },
			{
				type: 'p',
				text: 'There is a `ParamType` called `numeric` that is neither `number` nor `any`, and it exists entirely so that one error message leads somewhere useful.'
			},
			code('src/lib/sqf/schema.ts', 148, 165),
			{
				type: 'why',
				title: 'The checker’s job is to produce the message that leads somewhere',
				text: '`any` would let `percentile(service, 95)` through — it runs, sorts strings, and returns a service name where a latency belongs. `number` would reject it and say "needs a number", which sends somebody towards `toint(service)` rather than towards realising the question is wrong. `numeric` rejects it and says the argument has to be something you can take a percentile *of*.'
			},

			{
				type: 'checkpoint',
				items: [
					'You have three tables and a function list in one file.',
					'You can explain what `returnsArg` preserves and where it would otherwise be lost.',
					'You can say why `numeric` is not the same as `number` or `any`.'
				]
			}
		]
	},

	{
		slug: 'the-type-checker',
		title: 'The type checker',
		summary:
			'Scope threading through pipeline stages, aggregates that may only appear in `summarize`, and units as a type error.',
		goal: 'Reject the four things the language must refuse, with a message that says what to type instead.',
		blocks: [
			code('src/lib/sqf/check.ts', 1, 31),
			{
				type: 'p',
				text: 'The checker walks the stages in order, carrying a **scope**: the columns that exist at this point in the pipeline, and their types. That is the piece of state that makes a pipeline language checkable at all.'
			},
			code('src/lib/sqf/check.ts', 38, 49),

			{ type: 'h3', id: 'scope-threading', text: 'How a stage changes the scope' },
			{
				type: 'p',
				text: '`where` leaves the scope alone. `project` **replaces** it with exactly the columns it names. `summarize` replaces it with the aggregations plus the grouping keys — which is why a `where` after a `summarize` can only see the summary’s columns, and why a query that filters on `service` after summarising by `bucket` is an error rather than a filter that matches nothing.'
			},
			{
				type: 'terminal',
				code: `
from logs                                   scope: timestamp, service, level, …
| where level == "error"                    scope: unchanged
| summarize n = count() by service          scope: service, n
| where message contains "timeout"          ← error: no column \`message\`
                 ^^^^^^^                       hint: it was dropped by the summarize`
			},

			{ type: 'h3', id: 'aggregates', text: 'Aggregates, and where they may appear' },
			code('src/lib/sqf/check.ts', 168, 182, { partial: true }),
			{
				type: 'p',
				text: 'An `ExprContext` carries one boolean down the expression walk: whether an aggregation is legal here. `summarize`’s aggregation list sets it; every other position clears it. `where count() > 5` therefore fails in the checker with a sentence, rather than in the evaluator with something.'
			},

			{ type: 'h3', id: 'units', text: 'Units, as a type error' },
			{
				type: 'p',
				text: 'This is the rule from chapter 2, finally written down. It is about forty lines, and it removes the whole class of "the threshold was in the wrong unit".'
			},
			code('src/lib/sqf/check.ts', 244, 262, { partial: true }),
			{
				type: 'p',
				text: 'A `timestamp` compared against a bare number is *allowed* — epoch milliseconds are how a range arrives from a URL, and refusing it would make the common case awkward. A `duration` against a bare number is not, because there is no default unit anybody agrees on.'
			},
			{
				type: 'note',
				text: 'That asymmetry looks arbitrary until you notice which one has a universal convention and which one does not. Rules like this are worth stating in the code, because the next person will read it as an inconsistency and "fix" it.'
			},

			{ type: 'h3', id: 'testing', text: 'The tests are the specification' },
			code('src/lib/sqf/check.spec.ts', 67, 78),
			{
				type: 'p',
				text: 'A checker’s test suite is the only readable statement of what a language rejects. Each of these is one sentence of the specification, and they are worth writing before the code they check.'
			},

			{
				type: 'checkpoint',
				items: [
					'`from logs | summarize n = count() by service | where message == "x"` is an error naming the column.',
					'`where count() > 5` is an error that says where an aggregation may appear.',
					'`where duration > 500` is an error and `where duration > 500ms` is not.'
				]
			}
		]
	}
];
