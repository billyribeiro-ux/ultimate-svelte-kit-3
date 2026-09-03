/**
 * THE OPERATION STREAM
 * ====================
 *
 * Server-sent events, one connection per open board, carrying both the
 * operations somebody else made and the presence roster.
 *
 * WHY NOT A WEBSOCKET
 * -------------------
 * Because nothing here needs one. The traffic is almost entirely
 * server-to-client; the client's two outbound messages are ordinary
 * `command()` calls that benefit from validation, CSRF protection and typing.
 * SSE is a `GET` that never ends, so it works through every proxy that
 * understands HTTP, reconnects on its own, and — the part that matters most —
 * resumes from a cursor, because the client tells us where it got to.
 *
 * A WebSocket would need its own authentication, its own reconnect logic, its
 * own framing, and adapter-specific support for the upgrade. It would earn all
 * of that if the client were also sending sixty messages a second. It is not.
 *
 * WHY NOT `query.live`
 * --------------------
 * `query.live` streams *query results*, and re-running a query is the wrong
 * shape for "here are the fourteen operations you missed". `myBoards` uses it,
 * because a board list genuinely is a query result. This is a log tail, and a
 * log tail wants a cursor.
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { CATCHUP_PAGE, STREAM_PING_MS, frame, type ServerEvent } from '#lib/sync/protocol.ts';
import { publish, subscribe } from '#lib/server/hub.ts';
import { depart, roster } from '#lib/server/presence.ts';
import { since, watermarkOf } from '#lib/server/ingest.ts';
import { AccessError, requireAccess } from '#lib/server/rbac.ts';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) error(401, 'Sign in to continue.');

	const boardId = params.board;
	await requireAccess(boardId, locals.user.id, 'viewer').catch((thrown: unknown) => {
		if (thrown instanceof AccessError) error(thrown.status, thrown.message);
		throw thrown;
	});

	/*
	 * Where to start.
	 *
	 * `Number(...) || 0` rather than `parseInt`: a missing parameter, an empty
	 * one and `"abc"` all become 0, which replays the board from the beginning.
	 * That is the safe direction to be wrong in — a client that sends nonsense
	 * gets a slow, correct answer instead of a fast, incomplete one.
	 */
	const cursor = Math.max(0, Math.floor(Number(url.searchParams.get('since')) || 0));
	const actor = url.searchParams.get('actor') ?? '';

	let unsubscribe: (() => void) | null = null;
	let ping: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			const send = (event: ServerEvent) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(frame(event)));
				} catch {
					// The client went away between the check and the write. Nothing to do;
					// `cancel` will run and clean up.
					closed = true;
				}
			};

			/*
			 * Subscribe BEFORE the catch-up read.
			 *
			 * The other order has a hole exactly one query wide: an operation
			 * committed after the read and before the subscription reaches nobody,
			 * and the client never learns about it until its next reconnect. Doing it
			 * this way can deliver an operation twice instead, which every replica
			 * here is built to shrug off.
			 */
			unsubscribe = subscribe(boardId, send);

			send({ type: 'hello', watermark: await watermarkOf(boardId) });

			/*
			 * Catch up in pages.
			 *
			 * A client returning after a week may be tens of thousands of operations
			 * behind. One array means the server builds the whole string in memory and
			 * the browser parses it in a single blocking task — a spinner, then a
			 * frozen tab. Each page carries its own watermark, so an interrupted
			 * catch-up resumes rather than restarting.
			 */
			let seq = cursor;
			for (;;) {
				const page = await since(boardId, seq, CATCHUP_PAGE);
				if (page.ops.length === 0) break;

				send({ type: 'ops', ops: page.ops, watermark: page.watermark });
				seq = page.watermark;

				if (page.ops.length < CATCHUP_PAGE) break;
			}

			send({ type: 'presence', peers: roster(boardId) });

			/*
			 * Keep-alive.
			 *
			 * Proxies close an idle connection after thirty to sixty seconds, and to
			 * the browser that looks like a failure worth retrying — so a board nobody
			 * is touching reconnects every minute forever, replaying a catch-up query
			 * each time. A comment frame every twenty seconds ends the cycle for two
			 * bytes.
			 */
			ping = setInterval(() => send({ type: 'ping' }), STREAM_PING_MS);
		},

		cancel() {
			/*
			 * The tab closed, or the network dropped.
			 *
			 * Both the subscription and the presence entry go now rather than waiting
			 * for the timeout, so the remaining collaborators see the avatar disappear
			 * immediately instead of fifteen seconds later. The timeout still exists
			 * for the case this does not fire — a laptop that goes to sleep holds the
			 * connection nominally open for minutes.
			 */
			unsubscribe?.();
			if (ping) clearInterval(ping);
			if (actor) {
				depart(boardId, actor);
				publish(boardId, { type: 'presence', peers: roster(boardId) });
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			// Without this, a reverse proxy will happily buffer the whole stream and
			// deliver it when the connection closes — which for an endless stream is
			// never. The symptom is a board that works locally and is dead behind nginx.
			'cache-control': 'no-store, no-transform',
			'x-accel-buffering': 'no',
			connection: 'keep-alive'
		}
	});
};
