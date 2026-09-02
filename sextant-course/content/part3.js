/**
 * PART 3 — Time, shape and state (chapters 17–20)
 *
 * Four small modules that each remove a whole category of wrongness from the
 * screens above them: buckets that line up, downsampling that keeps the spikes,
 * a trace that renders whatever arrives, and an alert that does not flap.
 */

import { code } from './quote.js';

export const part3 = [
	{
		slug: 'buckets-and-rollups',
		title: 'Buckets, steps and rollups',
		summary:
			'A fixed ladder of steps where every rung divides the next, absolute rather than now-relative boundaries, and the gap a chart must draw as a gap.',
		goal: 'Bucket a time range so that two charts of the same data agree, and a coarse series can be built from a finer one.',
		blocks: [
			code('src/lib/series/bucket.ts', 1, 29),
			{
				type: 'p',
				text: 'Two decisions, both of which look like details and are not.'
			},

			{ type: 'h3', id: 'absolute', text: 'Absolute boundaries, not now-relative' },
			{
				type: 'p',
				text: 'A bucket starts at a multiple of its step **since the epoch**, not at "now minus n steps". The difference only shows up when two things bucket the same data a second apart — a chart and the alert evaluator, say — and disagree about which minute a point belongs to. Absolute boundaries mean everything that buckets at 1m produces the same buckets, forever, everywhere.'
			},
			code('src/lib/series/bucket.ts', 91, 99),

			{ type: 'h3', id: 'the-ladder', text: 'A ladder where every rung divides the next' },
			code('src/lib/series/bucket.ts', 36, 62),
			{
				type: 'why',
				title: 'The property that makes rollups possible',
				text: 'Because `10s` divides `30s` divides `1m` divides `5m`, a coarser series can always be built by merging finer buckets — which is what lets an hourly rollup answer a six-hour query without touching raw data. Add a step that breaks the property and the rollup merge silently produces buckets that straddle boundaries, which is a wrong chart rather than an error.'
			},
			code('src/lib/series/bucket.ts', 71, 89, { partial: true }),
			{
				type: 'p',
				text: '`maxBuckets` is the chart’s pixel width, near enough. Drawing more buckets than there are pixels is work whose result is thrown away by the rasteriser, and it is the single most common reason a metrics interface is slow.'
			},

			{ type: 'h3', id: 'gaps', text: 'A gap has to be a gap' },
			code('src/lib/series/bucket.ts', 140, 160),
			{
				type: 'p',
				text: 'A query returns rows for the buckets that had data. Handing those straight to a chart draws a straight line across the outage — and a straight line is indistinguishable from a steady value. `densify` fills the missing buckets explicitly, so the drawing code can see the hole and leave it.'
			},
			{
				type: 'warn',
				text: 'This is the one in the list most likely to ship broken, because the chart looks *better* without it. A line with no gaps looks tidy. It also means the most important minute of the day is drawn as if nothing happened.'
			},

			{
				type: 'checkpoint',
				items: [
					'Two components bucketing the same range a second apart produce identical bucket starts.',
					'Every step in your ladder divides the next one that is a multiple of it.',
					'A range with a missing minute produces a point for that minute, not a shorter array.'
				]
			}
		]
	},

	{
		slug: 'lttb',
		title: 'LTTB: keeping the shape',
		summary:
			'Why averaging a series to fit a chart destroys the thing you are looking for, and how largest-triangle-three-buckets keeps real samples.',
		goal: 'Reduce twenty thousand points to two thousand without losing a single spike.',
		blocks: [
			{
				type: 'p',
				text: 'A metric query over a fortnight at one-minute resolution is twenty thousand points. A chart is a thousand pixels wide. Something has to give, and the obvious choice is the wrong one.'
			},
			code('src/lib/series/downsample.ts', 1, 45),
			{
				type: 'p',
				text: 'Averaging every twenty points removes exactly the thing somebody is looking at a latency chart to find. A single 4-second spike among nineteen 40ms samples averages to 238ms — visible as a small bump, indistinguishable from ordinary noise, and completely wrong about what happened.'
			},

			{ type: 'h3', id: 'the-algorithm', text: 'Largest triangle, three buckets' },
			code('src/lib/series/downsample.ts', 52, 74, { partial: true }),
			{
				type: 'p',
				text: 'Split the series into as many buckets as you want output points. For each bucket, keep the **one real sample** that forms the largest triangle with the point already chosen and the average of the next bucket. Largest triangle means "most visually significant", which turns out to be an excellent proxy for "the bit you would have pointed at".'
			},
			{
				type: 'why',
				title: 'The property that matters is that the samples are real',
				text: 'Every point on the drawn line actually occurred, at the time it is drawn. That is what lets the crosshair say "1.9s at 14:32" and be telling the truth. An averaged series has no such property: every point is a number that never happened.'
			},

			{ type: 'h3', id: 'the-trap', text: 'The trap this leaves' },
			{
				type: 'p',
				text: 'Real samples at real times is a feature for *reading* a chart and a trap for *reading a number off* one. LTTB keeps a real sample, but it keeps a **subset** — so the point nearest the pointer in the drawn array is not necessarily the point nearest the pointer in the data.'
			},
			{
				type: 'p',
				text: 'The chart in chapter 34 therefore reads its crosshair from the **full** series and draws its line from the downsampled one. The distinction matters exactly when it is hardest to notice: the drawn array is right most of the time and wrong on the spikes, which is where people put the pointer.'
			},

			{ type: 'h3', id: 'the-axis', text: 'And an axis with two opinions' },
			code('src/lib/series/downsample.ts', 155, 177),
			{
				type: 'p',
				text: 'A latency chart auto-scaled to [198, 202] turns millisecond noise into a mountain range, and people react to mountain ranges. Starting at zero for an always-positive series is a decision about how the chart will be *read*, not about the data.'
			},

			{
				type: 'checkpoint',
				items: [
					'Twenty thousand points reduce to two thousand with every spike still visible.',
					'Every point in the output is a point that was in the input.',
					'A flat series still gets a non-zero axis range.'
				]
			}
		]
	},

	{
		slug: 'assembling-a-trace',
		title: 'Assembling a trace from spans that arrive in any order',
		summary:
			'Four things that are true of real trace data, each of which breaks the obvious implementation — and the four fixes, each a few lines.',
		goal: 'Turn a flat list of spans into one tree that always renders, and say out loud what was missing.',
		blocks: [
			code('src/lib/trace/assemble.ts', 1, 33),
			{
				type: 'p',
				text: 'Read the four numbered points, because each is a different failure of `groupBy(parentId)` and each is common enough to hit within a day of real data.'
			},

			{ type: 'h3', id: 'index-first', text: 'Index first, link second' },
			code('src/lib/trace/assemble.ts', 87, 128, { partial: true }),
			{
				type: 'p',
				text: 'Indexing every span by id **before** linking anything is what makes arrival order irrelevant. The version that links as it walks works perfectly on data sorted by start time and drops children on data that is not — and the database returns rows in arrival order, which is neither.'
			},
			{
				type: 'p',
				text: 'A span whose parent is absent is not dropped. It becomes a root and is counted, because the service that would have sent the parent is very often the one that failed.'
			},

			{ type: 'h3', id: 'cycles', text: 'Cycles, and why they are worth checking for' },
			code('src/lib/trace/assemble.ts', 205, 245, { partial: true }),
			{
				type: 'warn',
				text: 'A cycle in a span tree is always a data bug — a malformed sender, a replayed span with a rewritten id. The cost of not checking is not a wrong picture: it is a stack overflow during render, which takes the tab with it. Twenty lines to turn a crash into a note in the interface.'
			},

			{ type: 'h3', id: 'self-time', text: 'Self time, which is the number people want' },
			code('src/lib/trace/assemble.ts', 47, 62),
			{
				type: 'p',
				text: 'A span that took 900ms is not interesting if 890ms of it was one child. A span that took 900ms with 40ms of children is 860ms of unexplained work in *that* service — which is where the problem is. The clamp at zero matters too: children can legitimately sum to more than the parent when they ran concurrently, and a negative "self time" is a number nobody can interpret.'
			},

			{ type: 'h3', id: 'iterative', text: 'Flatten iteratively, and reverse the push' },
			code('src/lib/trace/assemble.ts', 247, 275, { partial: true }),
			{
				type: 'p',
				text: 'Recursion here would be simpler and would blow the stack on exactly the traces that most need looking at — a service retrying in a loop produces a chain thousands deep, and *that* trace is the bug report.'
			},
			{
				type: 'note',
				text: 'The reversed push is a one-line detail with a visible symptom: without it, each level’s children render backwards, and the waterfall looks like the request happened in the wrong order.'
			},

			{ type: 'h3', id: 'say-so', text: 'And then say what was missing' },
			{
				type: 'p',
				text: '`orphanCount` and `hadCycle` are on the returned trace so that the interface can say "3 spans have no parent in this trace" rather than rendering a plausible tree in silence. A missing gateway span is frequently the answer, and a viewer that hides it is a viewer that costs somebody an hour.'
			},

			{
				type: 'checkpoint',
				items: [
					'Spans shuffled into a random order assemble into the same tree.',
					'A trace with no root renders as one tree under a synthetic one, and says so.',
					'A trace with a cycle renders rather than crashing.'
				]
			}
		]
	},

	{
		slug: 'the-alert-machine',
		title: 'The alert state machine',
		summary:
			'`for` duration, hysteresis, and the one case that decides whether an alerting system is trustworthy: no data is not zero.',
		goal: 'Write alert evaluation as a pure function, and get the three cases right that make alerts worth having.',
		blocks: [
			code('src/lib/alert/machine.ts', 1, 40),
			{
				type: 'p',
				text: 'Three states, and the middle one is the whole point. `pending` is "the threshold has been crossed but not for long enough", which is what stops a single bad sample paging somebody at 3am.'
			},

			{ type: 'h3', id: 'hysteresis', text: 'Hysteresis, and why it is not optional' },
			code('src/lib/alert/machine.ts', 44, 73),
			{
				type: 'p',
				text: 'With one threshold, a metric sitting exactly on the line fires and resolves on alternate evaluations, forever. Two thresholds give it somewhere to be that is neither firing nor resolving, and the gap only has to be bigger than the metric’s noise.'
			},
			{
				type: 'p',
				text: 'It does a **different** job from `for`, and conflating them is common. `for` stops a *brief* excursion from paging. `clearsAt` stops a *sustained* value near the line from paging repeatedly. A rule can need both.'
			},

			{ type: 'h3', id: 'no-data', text: 'No data is not zero' },
			code('src/lib/alert/machine.ts', 113, 130, { partial: true }),
			{
				type: 'warn',
				text: 'This is the single most important case in the file. A rule on error rate whose query returns nothing means **no requests were served** — not that the error rate is fine. Treating it as zero silently resolves the alert during a total outage, which is the worst thing an alerting system can do, and it is the default behaviour of the obvious implementation.'
			},
			{
				type: 'p',
				text: 'The machine therefore *holds* its state on `null`. A firing alert stays firing; an ok alert stays ok. Neither is perfect and both are better than a confident wrong answer.'
			},

			{ type: 'h3', id: 'pure', text: 'Pure, and what that buys' },
			code('src/lib/alert/machine.ts', 101, 114),
			{
				type: 'p',
				text: '`step` returns the new status **and** what should happen to the outside world, rather than performing it. That is what lets the caller decide: write a row and send a notification during normal evaluation, and neither during a backfill that replays six hours of history to see whether a rule would have fired.'
			},
			{
				type: 'p',
				text: 'It is also what makes the tests trivial. No clock, no database, no mocks — a table of `(rule, status, value, at)` in and `(status, effect)` out.'
			},
			code('src/lib/alert/machine.spec.ts', 33, 60, { partial: true }),

			{
				type: 'checkpoint',
				items: [
					'A rule with `for: 5m` does not fire on a single bad sample.',
					'A metric sitting on the threshold does not flap.',
					'A query returning no rows holds the state instead of resolving it.'
				]
			}
		]
	}
];
