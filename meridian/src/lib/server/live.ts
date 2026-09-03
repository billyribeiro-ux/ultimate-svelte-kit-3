/**
 * THE BROADCASTER
 * ===============
 *
 * One room per trip. A change anywhere under a trip calls `publish(tripId)`;
 * every live query watching that trip wakes up and re-reads what it needs.
 *
 * In-process, on purpose. A single adapter-node container is the deployment
 * this project ships; the chapter on it names Postgres `NOTIFY` and a Redis
 * stream as the two ways to make it span instances, and neither changes
 * this file's shape — a `subscribe` and a `publish`.
 *
 * `Mailbox` is the piece that keeps a slow reader from being buried. A live
 * query is an async generator; if ten changes land while it is still
 * serialising the last one, it should send the *current* state once, not
 * ten stale states in a row. The mailbox holds at most one pending signal.
 */

type Listener = () => void;

const rooms = new Map<string, Set<Listener>>();

export function subscribe(tripId: string, listener: Listener): () => void {
	let room = rooms.get(tripId);
	if (!room) {
		room = new Set();
		rooms.set(tripId, room);
	}
	room.add(listener);

	return () => {
		room.delete(listener);
		if (room.size === 0) rooms.delete(tripId);
	};
}

export function publish(tripId: string): void {
	for (const listener of rooms.get(tripId) ?? []) listener();
}

/** How many live queries are watching a trip right now. The diagnostics page reads it. */
export function watchers(tripId: string): number {
	return rooms.get(tripId)?.size ?? 0;
}

/** Every room with somebody in it, for the diagnostics page. */
export function liveRooms(): { tripId: string; watchers: number }[] {
	return [...rooms.entries()].map(([tripId, room]) => ({ tripId, watchers: room.size }));
}

/**
 * A one-slot queue. `put` coalesces — a second signal before the first is
 * read replaces it — and `next` resolves with `true` for a signal or `null`
 * once the box is closed, which is how the generator that owns it knows the
 * request went away.
 */
export class Mailbox {
	#pending = false;
	#closed = false;
	#wake: (() => void) | null = null;

	put(): void {
		this.#pending = true;
		this.#wake?.();
	}

	close(): void {
		this.#closed = true;
		this.#wake?.();
	}

	async next(): Promise<true | null> {
		while (!this.#pending) {
			if (this.#closed) return null;
			await new Promise<void>((resolve) => {
				this.#wake = resolve;
			});
			this.#wake = null;
		}
		this.#pending = false;
		return true;
	}
}
