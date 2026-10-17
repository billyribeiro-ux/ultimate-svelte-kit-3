/**
 * WHAT THE SERVER KNOWS ABOUT ITSELF
 * ==================================
 *
 * Read by `/diagnostics`, and deliberately public: there is no check inside
 * these three because there is nobody to check for. The app has no accounts
 * and no operators — a handle is a name a browser chose, not a permission —
 * so the decision is made on the other side, about what goes *in*. The spans
 * carry route names, paths and durations; not bodies, not query strings
 * (`lib/server/tracing.ts` drops them), and not who made the request
 * (`hooks.server.ts` no longer tags it). A deployment that wanted more in its
 * spans would want an operator secret checked here first.
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
