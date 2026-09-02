/**
 * PART 4 — Storage, ingest and access (chapters 21–26)
 *
 * Where the data lives, how it gets in, and who is allowed to ask about it. This
 * part contains the strangest bug in the project and the one security decision
 * that shapes everything else.
 */

import { code } from './quote.js';

export const part4 = [
	{
		slug: 'the-storage-schema',
		title: 'The schema, and the indexes that decide everything',
		summary:
			'Three tables of telemetry, one composite index that every query uses, and two timestamps that must never be conflated.',
		goal: 'Design tables where the common query is an index seek, and know why each index is in that order.',
		blocks: [
			code('src/lib/server/db/schema.ts', 1, 52, { partial: true }),
			{
				type: 'p',
				text: 'Every table is scoped to a tenant and every query is bounded by time. That pair is the access path for the entire product, and the index order follows from it rather than from what looks reasonable.'
			},

			{ type: 'h3', id: 'two-timestamps', text: 'Two timestamps, and why both' },
			code('src/lib/server/db/schema.ts', 154, 163),
			{
				type: 'why',
				title: 'The bug you get from having one',
				text: 'A query filters on `timestamp` because that is when the thing happened. Retention deletes on `receivedAt` because that is when we became responsible for it. Use one column for both and a sender with a wrong clock either escapes retention forever — a timestamp in 2030 is never old enough to delete — or is deleted the moment it arrives.'
			},

			{ type: 'h3', id: 'the-index', text: 'The index every query uses' },
			code('src/lib/server/db/schema.ts', 187, 209, { partial: true }),
			{
				type: 'p',
				text: '`(tenant, timestamp)` and nothing before it. Putting `service` first looks reasonable — most queries also filter on a service — and makes every query *without* a service filter scan the table. The rule is that the column present in **all** queries goes first.'
			},

			{ type: 'h3', id: 'series', text: 'Series, and the column that makes cardinality countable' },
			code('src/lib/server/db/schema.ts', 289, 320, { partial: true }),
			{
				type: 'p',
				text: 'A metric sample does not store its labels; it stores a **series key**, and the labels live once on the series row. That is what makes "how many distinct label combinations does this tenant have for this metric" a `count(*)` on an indexed table rather than a scan over every sample — and cheap cardinality counting is the difference between a limit that is enforced and a limit that is documented.'
			},
			{
				type: 'p',
				text: 'How that key is built is the subject of chapter 23, and it is where this project’s strangest bug lived.'
			},

			{ type: 'h3', id: 'wal', text: 'And three PRAGMAs' },
			code('src/lib/server/db/index.ts', 1, 40, { partial: true }),
			{
				type: 'p',
				text: 'WAL mode so a reader is not blocked by a writer, a busy timeout so a writer waits rather than failing, and `synchronous = normal` because on a WAL database that is the setting that trades an fsync per commit for an fsync per checkpoint — which for telemetry, where losing the last few milliseconds of a crash is survivable, is the right trade.'
			},

			{
				type: 'checkpoint',
				items: [
					'Every telemetry table is `(tenant, timestamp)`-indexed first.',
					'You can say what breaks if `timestamp` and `receivedAt` are the same column.',
					'You can explain why a series key exists rather than storing labels per sample.'
				]
			}
		]
	},

	{
		slug: 'ingest',
		title: 'Ingest: streamed, bounded, idempotent',
		summary:
			'Reading a body without buffering it, refusing before parsing, and a unique index that makes a retry free.',
		goal: 'Write an endpoint that survives the day the thing it is watching breaks.',
		blocks: [
			code('src/lib/server/ingest.ts', 1, 37),
			{
				type: 'p',
				text: 'The whole file is arranged around one scenario: the service being watched has broken, telemetry volume is up a hundredfold, and this endpoint is the thing standing between a bad day and a worse one.'
			},

			{ type: 'h3', id: 'refuse-early', text: 'Refuse before you read' },
			code('src/routes/api/v1/ingest/+server.ts', 26, 34),
			{
				type: 'p',
				text: 'The size check reads `content-length` **before** the body, so an oversized request costs one header parse rather than eight megabytes of buffering. A sender without a content-length is still bounded, because the read below counts as it goes — but the header check is what makes the common case cheap.'
			},

			{ type: 'h3', id: 'validation', text: 'The schema is the documentation' },
			code('src/lib/server/ingest.ts', 54, 93, { partial: true }),
			{
				type: 'p',
				text: 'A timestamp has bounds, and they are not arbitrary. A sender with a clock a year out is a real thing that happens, and accepting its data means a retention job that never deletes it and a chart with a point in 2030 that ruins every axis.'
			},
			{
				type: 'p',
				text: 'The attribute bag has a size limit checked on the *serialised* form, because that is the thing that is stored. A limit on the number of keys is easy to satisfy with one enormous value.'
			},

			{ type: 'h3', id: 'idempotence', text: 'A retry has to be free' },
			{
				type: 'p',
				text: 'Collectors retry. They retry on a timeout, on a 5xx, and on a connection reset — and a timeout means the request may well have succeeded. Every ingest endpoint therefore receives duplicates, and the question is only whether it notices.'
			},
			code('src/lib/server/db/schema.ts', 236, 245, { partial: true }),
			{
				type: 'why',
				title: 'Why the database enforces this and not the code',
				text: 'A "check then insert" in application code has a window between the two, and two collector replicas retrying the same batch will find it. A unique index has no window. `onConflictDoNothing` then makes the retry a no-op rather than an error, which is what lets a collector be simple.'
			},

			{ type: 'h3', id: 'rate-limit', text: 'A limiter that says when to come back' },
			code('src/lib/server/ingest.ts', 171, 215, { partial: true }),
			{
				type: 'p',
				text: 'A token bucket per tenant, and — importantly — a `Retry-After` in the refusal. A 429 with no `Retry-After` is an invitation to retry immediately, which turns a rate limit into a hot loop.'
			},

			{
				type: 'checkpoint',
				items: [
					'A batch sent twice inserts once and returns success both times.',
					'An oversized body is refused without being read.',
					'A tenant over its rate gets a 429 with a `Retry-After`.'
				]
			}
		]
	},

	{
		slug: 'cardinality-and-the-nul-byte',
		title: 'Cardinality, and the NUL byte that ate every series',
		summary:
			'A series key built from labels, a limit that has to be per metric, and a separator that SQLite quietly truncated at.',
		goal: 'Enforce a cardinality limit — and see how a plausible encoding choice produced a bug with no error message at all.',
		blocks: [
			{
				type: 'p',
				text: 'A series is a metric name plus a set of labels. Two samples belong to the same series when the metric and every label agree, so we need a **canonical key**: the same labels in a different order must produce the same string.'
			},
			code('src/lib/server/ingest.ts', 226, 253),
			{
				type: 'p',
				text: 'Sorting the keys is the canonicalisation, and getting it wrong doubles a tenant’s cardinality for no reason — two keys for what is really one series, which is a bill and a limit hit for nothing.'
			},

			{ type: 'h3', id: 'the-bug', text: 'The bug' },
			{
				type: 'p',
				text: 'The first version separated the parts with control characters — a NUL between a key and its value, another between pairs. That is the standard trick, because a control character cannot appear in a label name. It is also completely wrong here, and the reason is one sentence of SQLite behaviour.'
			},
			{
				type: 'terminal',
				code: `
key built as:   metric \\0 label \\0 value \\0 label \\0 value
stored:         metric
                       ^ SQLite stores TEXT as a NUL-terminated string,
                         so the column truncates at the first NUL byte.

symptom:        every series for a metric collapses into ONE row.
                cardinality counting says 1, forever.
                the limit rejects the second label value of every metric.
                no error, no warning, no failing test.`
			},
			{
				type: 'warn',
				text: 'Nothing about this produces an error. The insert succeeds. The key is a valid string. The count is a plausible number. The only symptom is a limit rejecting data it should not, discovered by noticing that a test asserting two distinct series found one.'
			},
			{
				type: 'p',
				text: 'The fix is to use a separator that is *printable*, and JSON-encoding both halves gets it for free — a quote and a colon cannot appear unescaped inside a JSON string, so the encoding is unambiguous without any control characters at all.'
			},
			code('src/lib/server/ingest.spec.ts', 213, 240, { partial: true }),
			{
				type: 'why',
				title: 'The lesson, which is not "avoid NUL bytes"',
				text: 'It is that an encoding is a contract with **every layer it passes through**, and a separator is part of the encoding. The control-character trick is correct in memory, correct in a file, and wrong in a TEXT column — and the layer that broke it is the one nobody thought of as part of the encoding.'
			},

			{ type: 'h3', id: 'the-limit', text: 'The limit, and what happens at it' },
			code('src/lib/server/ingest.ts', 370, 400, { partial: true }),
			{
				type: 'p',
				text: 'Rejected samples are **counted and returned in the response body**, not logged. A platform that silently drops data and writes about it in its own logs is asking somebody to watch the watchman — and the collector is the only thing in a position to do anything about it.'
			},

			{
				type: 'checkpoint',
				items: [
					'The same labels in two different orders produce one series.',
					'Two distinct label values produce two series, and you have a test that would catch the truncation.',
					'Exceeding the limit returns a count rather than failing silently.'
				]
			}
		]
	},

	{
		slug: 'pushdown',
		title: 'Storage: pushdown, and the rule for when not to',
		summary:
			'Compiling a predicate to SQL when — and only when — SQL’s answer is identical, including nulls.',
		goal: 'Make queries fast without ever making them different.',
		blocks: [
			code('src/lib/server/storage.ts', 1, 48, { partial: true }),
			{
				type: 'p',
				text: 'The evaluator can answer any query. The database can answer some of them much faster. The whole of this file is one question: which ones, and how do you stay honest about it?'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule' },
			code('src/lib/server/storage.ts', 279, 296, { partial: true }),
			{
				type: 'p',
				text: '`null` from `compile` is not a failure — it means "the evaluator will do this one", which is always correct and sometimes slower. Returning something *approximate* would be faster and wrong, in the way that is hardest to notice: a filter that returns nearly the right rows.'
			},
			{
				type: 'p',
				text: 'The specific case worth knowing is `attributes.status >= 500`. SQLite has `json_extract`, so it looks pushable. It is not: SQLite compares an extracted value as text, and the evaluator compares a numeric string numerically, so the two would silently return different rows.'
			},

			{ type: 'h3', id: 'stop-at-the-first', text: 'Stop at the first predicate you cannot push' },
			code('src/lib/server/storage.ts', 209, 231, { partial: true }),
			{
				type: 'warn',
				text: 'Skipping an unpushable predicate and continuing is the tempting version and it is wrong. A `summarize` in the middle changes what the columns *mean*, so a `where` after it refers to computed columns that do not exist in the table. Pushing a later filter because an earlier one was pushable applies it to the wrong thing.'
			},

			{ type: 'h3', id: 'limit-above-filter', text: 'The classic pushdown bug' },
			code('src/lib/server/storage.ts', 228, 251, { partial: true }),
			{
				type: 'p',
				text: 'If the evaluator still has filtering to do, the database’s idea of "the first 100" is the first 100 of a *larger* set. Taking them at the database is the classic mistake: a `LIMIT` moved above a filter, producing a page of results that is stable, plausible and missing rows.'
			},

			{ type: 'h3', id: 'the-projection', text: 'And a projection, added because a test found what was missing' },
			code('src/lib/server/storage.ts', 95, 122, { partial: true }),
			{
				type: 'p',
				text: 'The first version used `db.select()` with no projection. That returns every column — including `id`, `tenant_id` and `received_at` — and keys them by Drizzle’s JavaScript names, so a row arrived with `traceId` while SQF calls the column `trace_id`.'
			},
			{
				type: 'p',
				text: 'Both halves were bugs and both were invisible from inside. Internal columns reached the results table, and the chart view — which picks the first numeric column — found `id` and drew a beautiful straight line of primary keys. Worse, a predicate on `trace_id` worked when it was pushed to SQL and matched nothing when it fell back to the evaluator, so the answer depended on whether the planner happened to push it.'
			},

			{ type: 'h3', id: 'differential-again', text: 'Testing a planner the same way we tested the evaluator' },
			code('src/lib/server/storage.spec.ts', 85, 112, { partial: true }),
			{
				type: 'p',
				text: 'The oracle loads every row in the window and runs only the evaluator. A disagreement is *always* a pushdown bug, because the oracle has nothing to be wrong about. That is the same technique as chapter 14, applied one layer down, and it is how the two projection bugs above got their regression tests.'
			},

			{
				type: 'checkpoint',
				items: [
					'A pushed query and an evaluator-only query return identical rows, nulls included.',
					'A `take` after an unpushable filter is applied by the evaluator, not by SQL.',
					'`from logs` returns only the columns the schema documents.'
				]
			}
		]
	},

	{
		slug: 'sessions-and-keys',
		title: 'Sessions for people, keys for machines',
		summary:
			'Two authentication paths that never meet, 404 versus 403, and why an API key is hashed with SHA-256 rather than bcrypt.',
		goal: 'Let a browser and a collector both in, without letting either use the other’s credential.',
		blocks: [
			code('src/lib/server/access.ts', 1, 25),
			{
				type: 'p',
				text: 'Two ways in, checked by different functions, with types that do not mix. Code that tries to accept both on one path ends up accepting a key from a browser — which sounds harmless until you notice that a key in a browser is a key in a bookmark, in a screenshot, and in somebody’s shell history.'
			},

			{ type: 'h3', id: 'reads-too', text: 'Reads are checked too' },
			{
				type: 'p',
				text: 'The easy mistake in a telemetry product is to guard writes carefully and treat reads as harmless. They are not: logs are the highest-density personal data most companies hold, and a query language is a very effective exfiltration tool. Every read path goes through `requireTenant`, and there is no "internal" helper that skips it.'
			},
			code('src/lib/server/access.ts', 63, 100, { partial: true }),
			{
				type: 'why',
				title: '404 for no membership, 403 for the wrong role',
				text: 'A person with no access must not be able to tell a real tenant slug from an invented one. Answering 403 for a tenant that exists and 404 for one that does not turns the sign-in page into a way to enumerate every customer this deployment has, one guess at a time. And it is one query with a join for the same reason: fetching the tenant and then the membership leaks existence in the gap between them.'
			},

			{ type: 'h3', id: 'hashing', text: 'SHA-256, deliberately, and not bcrypt' },
			code('src/lib/server/keys.ts', 19, 47),
			{
				type: 'p',
				text: 'A password is low-entropy and human-chosen, so it needs a slow hash to make guessing expensive. An API key is 256 bits from `crypto.getRandomValues`, so guessing is not a threat and the only requirement is that the stored form is unusable.'
			},
			{
				type: 'p',
				text: 'The practical consequence is what makes this a design decision rather than a preference: key lookup becomes an indexed equality on a hash computed in microseconds. With bcrypt, ingest could not look a key up at all without scanning every key the tenant has and comparing one at a time.'
			},

			{ type: 'h3', id: 'last-used', text: 'The column that is deliberately not updated here' },
			code('src/lib/server/access.ts', 148, 162, { partial: true }),
			{
				type: 'p',
				text: 'Updating `lastUsedAt` on authentication is the obvious place, and it would turn every ingest request — thousands a second — into a write to a single row: a write-lock convoy on exactly the table every request must read. The rollup job updates it in bulk instead, so the column is accurate to the minute, and nobody has ever needed better.'
			},

			{
				type: 'checkpoint',
				items: [
					'A session cannot ingest and a key cannot browse.',
					'A tenant you are not a member of is a 404, whether or not it exists.',
					'Key lookup is one indexed query regardless of how many keys a tenant has.'
				]
			}
		]
	},

	{
		slug: 'live-tail',
		title: 'Live tail: backpressure as a feature',
		summary:
			'Server-sent events with a bounded buffer, a dropped count that is shown rather than logged, and the ping that stops a proxy killing the stream.',
		goal: 'Stream matching rows as they arrive, and be honest when there are more than anybody can read.',
		blocks: [
			code('src/routes/api/tail/+server.ts', 1, 26),
			{
				type: 'p',
				text: 'A tail is opened precisely when something is going wrong, which is precisely when volume is highest. The naive implementation enqueues every matching row and discovers that a browser rendering ten thousand lines a second cannot — the stream’s internal buffer grows until the tab dies, and the last thing anybody saw was two minutes stale.'
			},

			{ type: 'h3', id: 'the-buffer', text: 'A bounded buffer, and a number' },
			code('src/routes/api/tail/+server.ts', 37, 58),
			{
				type: 'p',
				text: 'Two hundred rows between flushes, sized against what a person can read rather than what a socket can carry. Past a few hundred lines a second nobody is reading individual lines anyway — they are watching the shape, and the shape is better served by the dropped count than by more lines nobody sees.'
			},
			{
				type: 'p',
				text: '"Showing 200 of 4,182 lines a second" is a true and useful sentence. Silently showing 200 is a lie that makes somebody conclude the error stopped happening.'
			},

			{ type: 'h3', id: 'filter-on-the-server', text: 'The filter runs on the server' },
			code('src/routes/api/tail/+server.ts', 119, 142, { partial: true }),
			{
				type: 'p',
				text: 'Sending everything and filtering in the browser would be simpler and would send a tenant’s entire firehose to every open tab. That is a bandwidth problem and, more seriously, a permissions one: a viewer scoped to one service would receive every other service’s log lines and be trusted not to look.'
			},

			{ type: 'h3', id: 'refusals', text: 'What a tail refuses' },
			code('src/routes/api/tail/+server.ts', 76, 88),
			{
				type: 'p',
				text: 'There is no meaningful streaming answer to "the p95 so far" that is not either wrong or a different feature. Refusing with a sentence that says what to do instead is better than streaming something that looks like an answer.'
			},

			{ type: 'h3', id: 'the-headers', text: 'Two headers and a ping' },
			code('src/routes/api/tail/+server.ts', 175, 191, { partial: true }),
			{
				type: 'p',
				text: '`no-transform` as well as `no-store`, because without it a reverse proxy will happily buffer the whole stream and deliver it when the connection closes — which for an endless stream is never. The symptom is a tail that works locally and is dead behind nginx, and `x-accel-buffering` is the same instruction said again in the dialect nginx reads.'
			},
			code('src/routes/api/tail/+server.ts', 47, 56),
			{
				type: 'p',
				text: 'And a comment frame every twenty seconds, because proxies close an idle connection after thirty to sixty — which to the browser looks like a failure worth retrying. Without it a quiet tail reconnects every minute forever, replaying its catch-up query each time.'
			},

			{
				type: 'checkpoint',
				items: [
					'A tail under load shows a bounded number of lines and a count of what it dropped.',
					'A tail on a `summarize` query is refused with a sentence.',
					'An idle tail stays open for an hour.'
				]
			}
		]
	}
];
