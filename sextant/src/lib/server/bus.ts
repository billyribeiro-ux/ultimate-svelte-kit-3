/**
 * THE TAIL BUS
 * ============
 *
 * When a batch is accepted, anybody tailing that tenant needs to hear about it.
 * This is the in-memory registry of who is listening.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not durable, and it is not a delivery guarantee. A tail that misses a
 * batch — its connection dropped, the process restarted — recovers by running
 * the query again, which is an indexed read it was going to do anyway. The bus
 * only makes that rare enough that it is not the normal path.
 *
 * Building it the other way round is the classic mistake: a "reliable" pub/sub
 * with acknowledgements and retries, in front of a database that already has
 * every row and can already answer "what did I miss". The queue then becomes a
 * second source of truth that can disagree with the first.
 *
 * ONE PROCESS
 * -----------
 * A `Map` in one Node process, which is right behind a single instance and
 * wrong behind two: a tail connected to A never sees a batch that landed on B
 * until it re-queries. The fix is to replace `publish` with Redis or Postgres
 * `LISTEN/NOTIFY`, and nothing else changes — which is why this is a module
 * with an interface rather than a `Set` inlined into the route.
 */

import type { Row } from '#lib/sqf/value.ts';

export type Signal = 'logs' | 'spans' | 'metrics';

export interface TailEvent {
	readonly signal: Signal;
	readonly rows: readonly Row[];
}

type Listener = (event: TailEvent) => void;

const tenants = new Map<string, Set<Listener>>();

/**
 * Attach a listener. Returns the function that detaches it.
 *
 * Returning the unsubscribe rather than exposing `unsubscribe(tenant, listener)`
 * removes the possibility of detaching the wrong one — in a fan-out that is a
 * leak which only shows up as memory growth under load.
 */
export function subscribe(tenantId: string, listener: Listener): () => void {
	const listeners = tenants.get(tenantId) ?? new Set<Listener>();
	listeners.add(listener);
	tenants.set(tenantId, listeners);

	return () => {
		listeners.delete(listener);
		// Drop the entry when the last listener leaves, so a server up for a month
		// is not holding an empty Set for every tenant that ever tailed.
		if (listeners.size === 0) tenants.delete(tenantId);
	};
}

/**
 * Tell everybody tailing a tenant.
 *
 * Each listener runs in its own try/catch: one dead connection throwing on write
 * must not stop the others being told, and a listener that throws is not
 * hypothetical — it is what a closed stream does on the next enqueue.
 */
export function publish(tenantId: string, event: TailEvent): void {
	const listeners = tenants.get(tenantId);
	if (!listeners) return;

	for (const listener of listeners) {
		try {
			listener(event);
		} catch {
			// The listener's own cleanup removes it. Logging every write to a closing
			// stream is noise that arrives in bursts precisely when something else is
			// already wrong.
		}
	}
}

/** How many tails a tenant has. Used by the usage screen and by the tests. */
export function tailCount(tenantId: string): number {
	return tenants.get(tenantId)?.size ?? 0;
}
