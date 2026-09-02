/**
 * LIVE TAIL
 * =========
 *
 * Server-sent events carrying matching rows as they arrive.
 *
 * WHY THIS IS A ROUTE AND NOT A LIVE QUERY
 * ----------------------------------------
 * `query.live` streams *query results*, and re-running a query is the wrong
 * shape for "here are the eleven lines that just matched". The board list in
 * chapter 32 of the previous project used it correctly, because a list genuinely
 * is a query result. This is a log tail, and a log tail wants a push.
 *
 * BACKPRESSURE IS THE FEATURE
 * ---------------------------
 * A tail is opened precisely when something is going wrong, which is precisely
 * when volume is highest. A naive implementation enqueues every matching row and
 * discovers that a browser rendering ten thousand lines a second cannot, so the
 * stream's internal buffer grows until the tab dies — and the last thing anybody
 * saw was two minutes stale.
 *
 * So this one buffers a bounded number of rows, **counts what it dropped**, and
 * sends the count. "Showing 200 of 4,182 lines a second" is a true and useful
 * sentence. Silently showing 200 is a lie that makes somebody conclude the error
 * stopped happening.
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { check } from '#lib/sqf/check.ts';
import { evaluate } from '#lib/sqf/eval.ts';
import { parse } from '#lib/sqf/parser.ts';
import type { Row } from '#lib/sqf/value.ts';
import { requireTenant } from '#lib/server/access.ts';
import { subscribe, type Signal } from '#lib/server/bus.ts';

/**
 * The most rows to hold between flushes.
 *
 * Sized against what a person can read rather than what a socket can carry: past
 * a few hundred lines a second nobody is reading individual lines anyway, they
 * are watching the shape — and the shape is better served by the dropped count
 * than by more lines nobody sees.
 */
const BUFFER = 200;

/** How often the buffer is flushed. 100ms reads as instant and batches usefully. */
const FLUSH_MS = 100;

/**
 * A comment frame every twenty seconds.
 *
 * Proxies close an idle connection after thirty to sixty seconds, and to the
 * browser that looks like a failure worth retrying — so a quiet tail reconnects
 * every minute forever, replaying its catch-up query each time. Two bytes ends
 * the cycle.
 */
const PING_MS = 20_000;

export const GET: RequestHandler = async ({ url, locals }) => {
	const slug = url.searchParams.get('tenant') ?? '';
	const access = await requireTenant(locals.user?.id, slug, 'viewer');

	const text = url.searchParams.get('q') ?? 'from logs';
	const { query, errors } = parse(text);

	if (!query || errors.length > 0) {
		error(400, { message: errors[0]?.message ?? 'Could not parse the query.' });
	}

	const checked = check(query);
	if (checked.errors.length > 0) {
		error(400, { message: checked.errors[0]!.message });
	}

	/*
	 * A tail only makes sense over raw rows.
	 *
	 * `summarize` produces one row per group over a *window*, and there is no
	 * meaningful streaming answer to "the p95 so far" that is not either wrong or
	 * a different feature. Refusing with a sentence that says what to do instead
	 * is better than streaming something that looks like an answer.
	 */
	if (query.stages.some((stage) => stage.kind === 'summarize')) {
		error(400, {
			message: 'A tail cannot summarize. Remove the summarize, or use the chart instead.'
		});
	}

	const signal: Signal = query.source;

	let unsubscribe: (() => void) | null = null;
	let ping: ReturnType<typeof setInterval> | null = null;
	let flush: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			/** Rows waiting to be flushed, and how many were dropped because they could not be. */
			let pending: Row[] = [];
			let dropped = 0;
			let matched = 0;

			const send = (event: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					// The client went away between the check and the write. `cancel` will
					// run and clean up; there is nothing useful to do here.
					closed = true;
				}
			};

			send('open', { signal, query: text });

			unsubscribe = subscribe(access.tenantId, (batch) => {
				if (batch.signal !== signal) return;

				/*
				 * The filter runs here, on the server, against the same evaluator the
				 * query path uses.
				 *
				 * Sending everything and filtering in the browser would be simpler and
				 * would send a tenant's entire firehose to every open tab — which is
				 * both a bandwidth problem and, more seriously, a permissions one: a
				 * viewer scoped to one service would receive every other service's log
				 * lines and be trusted not to look.
				 */
				const kept = evaluate(query, batch.rows, { maxRows: BUFFER * 4 }).rows;
				matched += kept.length;

				for (const row of kept) {
					if (pending.length >= BUFFER) {
						dropped += 1;
						continue;
					}
					pending.push(row);
				}
			});

			flush = setInterval(() => {
				if (pending.length === 0 && dropped === 0) return;

				send('rows', { rows: pending, dropped, matched });

				pending = [];
				dropped = 0;
				matched = 0;
			}, FLUSH_MS);

			ping = setInterval(() => {
				if (!closed) {
					try {
						controller.enqueue(encoder.encode(': ping\n\n'));
					} catch {
						closed = true;
					}
				}
			}, PING_MS);
		},

		cancel() {
			// The tab closed or the network dropped. Both the subscription and the
			// timers go now rather than at the next tick — an interval on a closed
			// stream is a leak that accumulates one per abandoned tail.
			unsubscribe?.();
			if (flush) clearInterval(flush);
			if (ping) clearInterval(ping);
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			/*
			 * `no-transform` as well as `no-store`.
			 *
			 * Without it a reverse proxy will happily buffer the whole stream and
			 * deliver it when the connection closes — which for an endless stream is
			 * never. The symptom is a tail that works locally and is dead behind
			 * nginx, and `x-accel-buffering` is the same instruction said again in
			 * the dialect nginx actually reads.
			 */
			'cache-control': 'no-store, no-transform',
			'x-accel-buffering': 'no',
			connection: 'keep-alive'
		}
	});
};
