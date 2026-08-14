/**
 * "Something in this diary changed."
 *
 * A live query needs to know when to look again. The naive answer is to poll the
 * database every second, which works and is wasteful: a salon's diary changes a
 * few times an hour, so 3,599 of those queries find nothing.
 *
 * This is the other answer — an in-process notice board. A booking is made, the
 * writer says so, and every live query watching that business wakes up. Between
 * changes, nothing runs at all.
 *
 * **The honest limitation.** In-process means exactly that. Two Node instances
 * behind a load balancer have two notice boards, and a booking on one does not
 * wake a viewer connected to the other. The fix for that is a shared channel —
 * Postgres `LISTEN/NOTIFY`, Redis pub/sub, a message broker — and it is a
 * deliberate later problem. The interface below is the part that would survive
 * that change: swap this file's innards and every caller is unaffected. The
 * periodic tick also means a viewer on a second instance is never more than a
 * minute stale, which is the difference between "degraded" and "broken".
 */

type Listener = () => void;

/** Listeners by key. A key is a business id — the unit a diary belongs to. */
const listeners = new Map<string, Set<Listener>>();

/** Tell everyone watching `key` that something changed. */
export function publishDiaryChange(key: string): void {
	const set = listeners.get(key);
	if (!set) return;

	// Copy before iterating: a listener may unsubscribe itself in response, and
	// mutating a Set while looping over it silently skips entries.
	for (const listener of [...set]) listener();
}

/** How many streams are currently watching. Used by tests and health checks. */
export function watcherCount(key: string): number {
	return listeners.get(key)?.size ?? 0;
}

export interface WatchOptions {
	/** Ends the stream when the client disconnects. Always pass one. */
	readonly signal: AbortSignal;
	/**
	 * Also yield on a timer, in milliseconds.
	 *
	 * Not a fallback for missed events — a safety net for the passage of time
	 * itself. A slot two hours away disappears from the grid when the salon's
	 * notice period reaches it, and nothing "changed" in the database to say so.
	 * Without a tick, a page left open all morning would keep offering a time
	 * that has already passed.
	 */
	readonly intervalMs?: number;
}

/**
 * An async iterator that yields once per change.
 *
 * Written as a generator so a live query can simply write
 *
 *     for await (const _ of watchDiary(id, { signal })) yield await read();
 *
 * and never touch a subscription, a callback or a cleanup function.
 *
 * The mechanics worth noticing: a single `abort` listener is registered for the
 * whole stream rather than one per loop — the obvious version adds a listener
 * every iteration and leaks one per event until the connection closes. And
 * `pending` is a flag rather than a queue, because a change that arrives while
 * we are already about to re-read the diary does not need its own re-read; the
 * one we are about to do will see it.
 */
export async function* watchDiary(
	key: string,
	{ signal, intervalMs }: WatchOptions
): AsyncGenerator<void> {
	let wake: (() => void) | undefined;
	let pending = false;

	const bump = () => {
		pending = true;
		wake?.();
	};

	const onAbort = () => wake?.();
	signal.addEventListener('abort', onAbort, { once: true });

	let set = listeners.get(key);
	if (!set) listeners.set(key, (set = new Set()));
	set.add(bump);

	const timer = intervalMs ? setInterval(bump, intervalMs) : undefined;
	// Keep a periodic tick from holding the process open on shutdown.
	if (timer && typeof timer === 'object' && 'unref' in timer) timer.unref();

	try {
		while (!signal.aborted) {
			if (pending) {
				pending = false;
				yield;
				continue;
			}

			await new Promise<void>((resolve) => {
				wake = resolve;
			});
			wake = undefined;
		}
	} finally {
		if (timer) clearInterval(timer);
		set.delete(bump);
		if (set.size === 0) listeners.delete(key);
		signal.removeEventListener('abort', onAbort);
	}
}
