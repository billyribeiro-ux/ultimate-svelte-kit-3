/**
 * A queue of one.
 *
 * SQLite allows exactly one writer at a time. That is not a limitation to work
 * around — it is the trade it makes in exchange for being a single file with no
 * server — but it does mean two write transactions in the same process will
 * collide, and the second one gets `SQLITE_BUSY: database is locked`.
 *
 * The instinctive fix is `PRAGMA busy_timeout`, which makes a blocked writer
 * wait instead of failing. In Node that is actively dangerous. The local SQLite
 * driver is synchronous underneath its promises, so a waiting writer blocks the
 * one and only thread — including the thread the *first* transaction needs in
 * order to finish and release the lock. The two wait for each other until the
 * timeout expires. A deadlock with a stopwatch on it is still a deadlock.
 *
 * So writers queue in JavaScript instead. Each one waits for the previous to
 * settle, which is what the database was going to enforce anyway, except now the
 * waiting happens at an `await` where the event loop is free to do the work that
 * releases the lock.
 *
 * **This is not what makes booking safe.** It is a single process's politeness,
 * and it evaporates the moment the app runs on two instances or moves to a
 * hosted libSQL. The guarantee that two customers cannot take the same slot
 * lives in the primary key on `slot_claim` and nowhere else. This queue exists
 * so that the normal case is a clean error instead of a lock timeout.
 */

/**
 * Runs functions one at a time, in the order they arrived.
 *
 * Implemented as a promise chain rather than a list of waiters: each call
 * appends itself to the tail, and the tail is always a promise that settles when
 * everything before it has finished. It is a handful of lines and has no queue
 * to leak, no timers, and no way to lose a waiter.
 */
export class WriteQueue {
	/**
	 * The end of the chain. `catch` is attached immediately so that a rejected
	 * task does not poison the queue for everyone behind it — the rejection is
	 * still delivered to that task's own caller, which is where it belongs.
	 */
	#tail: Promise<unknown> = Promise.resolve();

	/** How many tasks are queued or running. Useful in tests and health checks. */
	#depth = 0;

	get depth(): number {
		return this.#depth;
	}

	async run<T>(task: () => Promise<T>): Promise<T> {
		this.#depth += 1;

		const result = this.#tail.then(task, task);

		// The chain must continue whether this task resolved or threw, so the next
		// waiter runs either way. The swallowed rejection here is not lost: it is
		// the same promise `result` returns to the caller.
		this.#tail = result.then(
			() => undefined,
			() => undefined
		);

		try {
			return await result;
		} finally {
			this.#depth -= 1;
		}
	}
}

/**
 * The one queue every write in the app goes through.
 *
 * A module-level singleton, which is the right shape here: it is guarding a
 * process-wide resource, so having two of them would guard nothing.
 */
export const writeQueue = new WriteQueue();
