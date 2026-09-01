/**
 * THE FAN-OUT HUB
 * ===============
 *
 * When a batch of operations is accepted, everybody else looking at that board
 * needs to hear about it. This is the in-memory registry of who is listening.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not durable, and it is not the delivery guarantee. A client that misses
 * a broadcast — its connection dropped, it was mid-reconnect, the process
 * restarted — recovers by asking for everything after its cursor, which is a
 * plain indexed read from the operation log. The hub only makes that recovery
 * rare enough that it is not the normal path.
 *
 * Building it the other way round is the classic mistake: a "reliable" pub/sub
 * with acknowledgements and retries, sitting in front of a database that already
 * has the data and can already answer "what did I miss". The queue then becomes
 * a second source of truth that can disagree with the first.
 *
 * ONE PROCESS
 * -----------
 * This is a `Map` in one Node process, which is exactly right for adapter-node
 * behind a single instance and exactly wrong for two. Running a second instance
 * means a client connected to A never hears about a write that landed on B —
 * until it reconnects and catches up, which it will, but seconds later rather
 * than milliseconds.
 *
 * The fix is to replace `publish` with something that goes through Redis, NATS
 * or Postgres `LISTEN/NOTIFY`, and nothing else changes: the interface below is
 * the seam. That is why it is an interface at all rather than a set inlined into
 * the SSE route.
 */

import type { ServerEvent } from '#lib/sync/protocol.ts';

type Listener = (event: ServerEvent) => void;

/** Board id to the listeners currently attached to it. */
const boards = new Map<string, Set<Listener>>();

/**
 * Attach a listener. Returns the function that detaches it.
 *
 * Returning the unsubscribe rather than exposing `unsubscribe(board, listener)`
 * removes the possibility of detaching the wrong one, which in a fan-out is a
 * leak that only shows up as memory growth under load.
 */
export function subscribe(boardId: string, listener: Listener): () => void {
	const listeners = boards.get(boardId) ?? new Set<Listener>();
	listeners.add(listener);
	boards.set(boardId, listeners);

	return () => {
		listeners.delete(listener);
		// Drop the entry entirely when the last person leaves, so a server that has
		// been up for a month is not holding an empty Set for every board ever opened.
		if (listeners.size === 0) boards.delete(boardId);
	};
}

/**
 * Send an event to everybody watching a board.
 *
 * Each listener is called inside its own try/catch. One dead connection throwing
 * on write must not stop the others being told — and a listener that throws is
 * not hypothetical, it is what a closed stream does on the next enqueue.
 */
export function publish(boardId: string, event: ServerEvent): void {
	const listeners = boards.get(boardId);
	if (!listeners) return;

	for (const listener of listeners) {
		try {
			listener(event);
		} catch {
			// The listener's own cleanup will remove it; there is nothing useful to do
			// here, and logging every write to a closing stream is noise.
		}
	}
}

/** How many connections a board has. Used by the presence roster and by tests. */
export function watcherCount(boardId: string): number {
	return boards.get(boardId)?.size ?? 0;
}
