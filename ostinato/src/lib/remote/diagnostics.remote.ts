/**
 * WHAT THE SERVER KNOWS ABOUT ITSELF
 * ==================================
 *
 * Read by `/diagnostics`. Nothing here is secret — the spans carry route
 * names and durations, not bodies — and the page exists so that "what did
 * that request do" can be answered without a second service.
 */

import * as v from 'valibot';
import { getRequestEvent, query } from '$app/server';
import { openConnections } from '#lib/server/rooms.ts';
import { stats } from '#lib/server/patterns.ts';
import { recentSpans, trace } from '#lib/server/tracing.ts';

export const getSpans = query(
	v.object({
		limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 120)
	}),
	({ limit }) => recentSpans(limit)
);

export const getTrace = query(v.string(), (id) => trace(id));

/**
 * `getRequestEvent()` inside a query: the request's `platform`, which the
 * adapter filled in — or its emulator did, in development — and the flags
 * SvelteKit sets about *how* this function was reached.
 */
export const getRuntime = query(async () => {
	const event = getRequestEvent();
	return {
		platform: event.platform ?? null,
		isRemoteRequest: event.isRemoteRequest,
		isSubRequest: event.isSubRequest,
		connections: openConnections(),
		...(await stats())
	};
});
