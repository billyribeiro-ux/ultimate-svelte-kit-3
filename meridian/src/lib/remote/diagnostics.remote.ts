/**
 * WHAT THE SERVER SAW
 * ===================
 *
 * One query for the diagnostics page: the last spans the tracing exporter
 * kept, which live queries are open on which trips, and the three facts
 * about the process a person asks first. It requires a signed-in person —
 * the spans carry route names and timings, which are not secrets but are
 * not for strangers either.
 */

import { version } from '$app/env';
import { query } from '$app/server';
import { requireUser } from '#lib/server/access.ts';
import { liveRooms } from '#lib/server/live.ts';
import { recentSpans } from '#lib/server/tracing.ts';

const startedAt = Date.now();

export const diagnostics = query(async () => {
	requireUser();
	return {
		version,
		node: process.version,
		startedAt,
		now: Date.now(),
		spans: recentSpans(80).sort((a, b) => b.start - a.start),
		rooms: liveRooms()
	};
});
