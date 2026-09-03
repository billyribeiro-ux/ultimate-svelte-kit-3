/**
 * PART 2 — Answering the question (chapters 12–16)
 *
 * A checked tree, and rows. This part turns one into the other, and then deals
 * with the two questions you cannot answer by holding the data: percentiles and
 * distinct counts.
 */

import { code } from './quote.js';

export const part2 = [
	{
		slug: 'three-valued-logic',
		title: 'Values, and three-valued logic',
		summary:
			'What `null` means in a query language, why `false and null` is `false`, and the one place comparison coerces a numeric string.',
		goal: 'Define the runtime value type and the comparison rules — and know which of them are conventions rather than facts.',
		blocks: [
			{
				type: 'p',
				text: 'Before evaluating anything we have to say what a value *is*, and what happens when one is missing. Telemetry is full of missing values: a log line with no `trace_id`, an attribute bag without the key somebody asked for, a metric label that only some series carry.'
			},
			code('src/lib/sqf/value.ts', 1, 30),
			{
				type: 'p',
				text: '`null` means **absent** rather than "empty". That distinction is what forces three-valued logic: `a == 1` where `a` is absent is not false, it is *unknown*, and the difference shows up the moment somebody writes `not (a == 1)` and expects the rows where `a` is missing to come back.'
			},

			{ type: 'h3', id: 'kleene', text: 'Kleene logic, in nine lines' },
			code('src/lib/sqf/value.ts', 32, 59),
			{
				type: 'p',
				text: '`false and null` is **`false`**, not `null`, and that is not an optimisation — it is the definition. One operand being definitely false settles the conjunction whatever the other one is. The mirror holds for `true or null`.'
			},
			{
				type: 'p',
				text: 'And then `isTrue` is where the three values collapse back to two: `where` keeps only definite truth. A row whose predicate is unknown is not kept, which is the same choice SQL makes and is worth being explicit about, because "unknown" and "no" are not the same and we are about to treat them the same.'
			},

			{ type: 'h3', id: 'comparison', text: 'Comparison, and one deliberate coercion' },
			code('src/lib/sqf/value.ts', 61, 114, { partial: true }),
			{
				type: 'why',
				title: 'Why comparison coerces and grouping does not',
				text: 'A JSON attribute bag stores `"status": "500"` as a string about as often as it stores `500` as a number, because that is what senders do. `attributes.status >= 500` has to work in both cases or the feature is useless. Grouping is the opposite: `by status` must not merge `"500"` and `500` into one bucket, because those really are two distinct values as far as the sender is concerned, and merging them hides a bug in the sender.'
			},
			code('src/lib/sqf/value.ts', 146, 166),
			{
				type: 'note',
				text: 'Two functions, two rules, both written down. The trap is a single `normalise()` used by both — it makes one of the two behaviours wrong and the wrongness is invisible until somebody notices a group that should have been two.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can say what `null` means in SQF and why it is not "empty".',
					'You can explain why `false and null` is `false` without appealing to short-circuiting.',
					'You can say why `compareValues` coerces a numeric string and `groupKey` does not.'
				]
			}
		]
	},

	{
		slug: 'the-evaluator',
		title: 'The evaluator',
		summary:
			'Rows in, rows out, one stage at a time — plus the regex cache, the truncation flag, and why `summarize` builds its groups in one pass.',
		goal: 'Run a checked query over an array of rows, and know where every allocation goes.',
		blocks: [
			code('src/lib/sqf/eval.ts', 1, 45),
			{
				type: 'p',
				text: 'The evaluator assumes its input has been **checked**. That is a real precondition, not a wish: it means `evalBinary` never has to ask whether a duration is being compared to a string, because the checker refused that query before anything reached here.'
			},

			{ type: 'h3', id: 'truncation', text: 'Truncation, said out loud' },
			code('src/lib/sqf/eval.ts', 47, 66),
			{
				type: 'p',
				text: 'A result that was cut off must never look complete. The evaluator is handed a ceiling and reports whether it hit it, and every layer above passes that upwards until the table can say "showing the first 20,000 rows" rather than implying it is all of them.'
			},
			{
				type: 'warn',
				text: 'There is a subtlety here that bit this project and we will meet again in chapter 24: the storage layer reads `maxRows + 1` rows from SQL. Without the extra row, a query that fills the ceiling exactly is indistinguishable from one that stopped there, and the result silently claims to be complete.'
			},

			{ type: 'h3', id: 'stages', text: 'One pass per stage' },
			code('src/lib/sqf/eval.ts', 68, 100, { partial: true }),
			{
				type: 'p',
				text: 'Nothing clever: a fold over the stages, each one taking an array and returning an array. It allocates more than a fused implementation would, and the fused version would be a compiler — which is the right answer at a hundred times this data and the wrong one here.'
			},

			{ type: 'h3', id: 'summarize', text: 'Grouping in one pass' },
			code('src/lib/sqf/eval.ts', 328, 337),
			{
				type: 'p',
				text: 'One accumulator per group, built as the rows go past. The alternative — collect the rows per group, then aggregate — needs memory proportional to the *data* rather than to the number of groups, and the number of groups is the small number.'
			},
			{
				type: 'p',
				text: 'This is also where DDSketch and HyperLogLog appear: an accumulator for `percentile` holds a sketch rather than a list of samples, so a percentile over ten million rows costs a few kilobytes. Those are the next two chapters.'
			},

			{ type: 'h3', id: 'regex-cache', text: 'A cache with a bound, and why the bound exists' },
			code('src/lib/sqf/eval.ts', 600, 631),
			{
				type: 'why',
				title: 'Every cache in a query engine needs a bound',
				text: 'The pattern in `=~` comes from the query, and queries come from people. An unbounded cache keyed by pattern is a memory leak with an attacker-controlled key: a loop of distinct patterns fills it forever. The bound is 256 and the eviction is "clear it" rather than LRU, because an LRU here would be forty lines to avoid re-compiling a handful of regexes.'
			},

			{
				type: 'checkpoint',
				items: [
					'`evaluate(parse("from logs | where level == \\"error\\" | take 5").query, rows)` gives five rows.',
					'A result that hit the ceiling reports `truncated: true`.',
					'You can say why `summarize` accumulates rather than collecting.'
				]
			}
		]
	},

	{
		slug: 'testing-an-evaluator',
		title: 'Testing an evaluator against a reference',
		summary:
			'Differential testing: a naive implementation nobody would ship, used as an oracle for the one we do.',
		goal: 'Get real confidence in an evaluator without writing a thousand assertions by hand.',
		blocks: [
			{
				type: 'p',
				text: 'The hard part of testing an evaluator is that the interesting bugs are in the *combinations*: a filter after a summarize, a sort on a computed column, a group key that is null. Writing an assertion per combination is a losing race.'
			},
			{
				type: 'p',
				text: 'The technique that wins is **differential testing**: write a second implementation that is obviously correct and far too slow, then assert the two agree on generated input. The slow one is the specification, and it is much easier to believe.'
			},
			code('src/lib/sqf/eval.spec.ts', 341, 361, { partial: true }),
			{
				type: 'p',
				text: 'It is allowed to be naive, to allocate freely, and to share no code at all with the implementation. That last constraint is the important one: two implementations that share a helper agree about the helper’s bugs.'
			},

			{ type: 'h3', id: 'the-property', text: 'One property, two hundred seeded inputs' },
			code('src/lib/sqf/eval.spec.ts', 363, 392, { partial: true }),
			{
				type: 'p',
				text: 'Note the last assertion: it compares `i` rather than whole rows, so a failure names *which* rows differ instead of printing sixty objects into the terminal. A differential test that fails unreadably is a test people delete.'
			},
			{
				type: 'p',
				text: 'And a second property for grouping, where the oracle is a `Map` and the extra assertion is the one a spot check always misses — that every input row is accounted for. A grouping that silently loses rows produces perfectly plausible counts.'
			},
			code('src/lib/sqf/eval.spec.ts', 394, 419, { partial: true }),
			{
				type: 'why',
				title: 'Why this beats a hundred hand-written assertions',
				text: 'Because a hand-written assertion encodes what you *thought* the answer was. When the two implementations disagree, one of them is wrong and you have to work out which — and about a third of the time it is the oracle, which means you have just discovered that you did not understand your own semantics. That is the most valuable outcome a test can have.'
			},

			{
				type: 'checkpoint',
				items: [
					'You have a reference evaluator that is obviously correct and much too slow.',
					'Your generated rows include nulls, numeric strings and duplicate keys.',
					'You can explain why a disagreement is interesting even when the oracle is at fault.'
				]
			}
		]
	},

	{
		slug: 'ddsketch',
		title: 'DDSketch: percentiles you are allowed to merge',
		summary:
			'Why you cannot average a p95, what relative error means, and the log-bucket trick that makes a percentile cost a few kilobytes.',
		goal: 'Implement a mergeable percentile sketch with a guaranteed relative error, and understand what it does not guarantee.',
		blocks: [
			{
				type: 'p',
				text: 'Start with the thing everybody does and why it is wrong. You have p95 latency per minute, and you want p95 for the hour. Averaging the sixty numbers is the obvious move and it produces a figure with no meaning at all.'
			},
			code('src/lib/sketch/ddsketch.ts', 1, 44),
			{
				type: 'p',
				text: 'The tests in this project construct two cases to show how wrong: a one-minute spike where the average **overstates** the hour’s p95 by 165%, and a rolling outage where it **understates** by more than a factor of thirteen. Neither is a contrived pathology; both are ordinary shapes of incident.'
			},
			{
				type: 'note',
				text: 'The first draft of this course said averaging "always understates". The tests said otherwise. It does both, depending on the shape, which is the point — the error has no sign you can correct for.'
			},

			{ type: 'h3', id: 'relative-error', text: 'Relative error, not absolute' },
			code('src/lib/sketch/ddsketch.ts', 46, 64),
			{
				type: 'p',
				text: 'The guarantee is that the reported value is within **α relative** of the true one. At α = 0.02, a true p95 of 40ms comes back within 0.8ms and a true p95 of 4s comes back within 80ms. That is exactly the right shape for latency, where being 80ms out at four seconds is irrelevant and being 80ms out at forty milliseconds would be useless.'
			},
			{
				type: 'why',
				title: 'Why this beats t-digest here',
				text: 't-digest gives better accuracy at the extreme tails and its merge is more complicated, its serialisation is larger, and its error bound is not a simple statement you can put in a tooltip. "Within 2% of the true value, always" is a sentence somebody can act on. Choosing the simpler guarantee is a real engineering decision, not a compromise.'
			},

			{ type: 'h3', id: 'the-buckets', text: 'The whole trick, in one line' },
			code('src/lib/sketch/ddsketch.ts', 136, 179, { partial: true }),
			{
				type: 'p',
				text: 'A value goes into bucket `ceil(log(v) / log(γ))` where `γ = (1+α)/(1−α)`. Because the buckets are *logarithmically* spaced, each one spans a fixed **ratio** rather than a fixed width — which is precisely the relative-error guarantee, falling out of the indexing rather than being enforced afterwards.'
			},
			{
				type: 'p',
				text: 'And because two sketches with the same α use the same bucket boundaries, merging is adding two maps together. That is the property the whole design exists for: a rollup table can store one sketch per minute and answer an hour by merging sixty of them, exactly.'
			},

			{ type: 'h3', id: 'the-tests', text: 'The tests, and the one that was wrong' },
			code('src/lib/sketch/ddsketch.spec.ts', 44, 65, { partial: true }),
			{
				type: 'p',
				text: 'The relative-error test needed a `SLACK` term, and working out why is worth the minute. The boundary case — a value landing exactly at the α limit — fails on floating-point rounding roughly half the time, and a test that fails half the time is worse than no test. The slack is a tenth of a percent and it makes the assertion about the algorithm rather than about IEEE 754.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can explain why averaging percentiles has no meaning, with an example in each direction.',
					'You can state the guarantee DDSketch gives, in a sentence.',
					'Your sketch merges, and a merged sketch answers the same as one built from all the data.'
				]
			}
		]
	},

	{
		slug: 'hyperloglog',
		title: 'HyperLogLog: counting things you cannot hold',
		summary:
			'Estimating distinct counts in 2KB, the avalanche finaliser that makes it work, and the small-cardinality correction that makes it usable.',
		goal: 'Implement `dcount` with a bounded memory cost, and know where it is inaccurate.',
		blocks: [
			{
				type: 'p',
				text: '"How many distinct users hit this endpoint today" is an ordinary question with an extraordinary cost: an exact answer needs a set of every distinct value, which for a busy endpoint is millions of strings held in memory for the duration of the query.'
			},
			code('src/lib/sketch/hyperloglog.ts', 1, 34),
			{
				type: 'p',
				text: 'HyperLogLog answers it in a fixed 2KB with about 1.6% error, and the idea behind it is genuinely beautiful: hash each value, look at how many leading zeroes the hash has, and remember the maximum. A hash with 10 leading zeroes turns up about once in 1024 values, so seeing one is evidence you have seen roughly that many.'
			},

			{ type: 'h3', id: 'registers', text: 'Registers, and why 2048 of them' },
			code('src/lib/sketch/hyperloglog.ts', 36, 55),
			{
				type: 'p',
				text: 'One estimate from one maximum is terrible — it is a single sample of a very skewed distribution. So the hash is split: the first 11 bits choose one of 2048 registers, the rest are counted for leading zeroes, and the estimate is a harmonic mean over the registers. That is the whole algorithm.'
			},

			{ type: 'h3', id: 'the-hash', text: 'The finaliser is not optional' },
			code('src/lib/sketch/hyperloglog.ts', 161, 194, { partial: true }),
			{
				type: 'warn',
				text: 'The avalanche step at the end — the xor-shift-multiply sequence — is the part people leave out because it "looks like padding". Without it, the low bits of the hash are correlated with the input, similar strings land in the same register, and the estimate is systematically wrong in a way that only shows up on real data. Every id in a real system is similar to every other id.'
			},

			{ type: 'h3', id: 'small-cardinality', text: 'The correction that makes it usable' },
			code('src/lib/sketch/hyperloglog.ts', 99, 130, { partial: true }),
			{
				type: 'p',
				text: 'The raw estimator is badly biased at small counts — it will confidently tell you there are 34 distinct values when there are 50. So below a threshold the sketch switches to **linear counting**: with 2048 registers and 50 values, most registers are still empty, and the number of empty ones is a much better estimator than the harmonic mean.'
			},
			{
				type: 'p',
				text: 'The test for this originally asserted that linear counting is *exact* at n = 50. It is not, and the reason is a birthday problem: with 50 values in 2048 registers there is a real chance two of them collide, and a collision loses a value permanently. Within 2 is the honest bound, and stating it that way is more useful than a test that passes on one seed.'
			},
			code('src/lib/sketch/hyperloglog.spec.ts', 29, 55, { partial: true }),

			{ type: 'h3', id: 'saying-so', text: 'Say that it is an estimate' },
			{
				type: 'p',
				text: 'The schema entry for `dcount` says "Approximate by design" in its documentation string, which is what completion shows. That sentence is the difference between a number somebody trusts appropriately and a number somebody reports to a customer.'
			},

			{
				type: 'checkpoint',
				items: [
					'`dcount` over a million values costs 2KB and lands within a couple of per cent.',
					'You can explain what the avalanche finaliser fixes and why real data makes it necessary.',
					'You can say why linear counting is not exact even when it looks like it should be.'
				]
			}
		]
	}
];
