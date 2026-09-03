/**
 * GEOGRAPHY OVER THE WIRE
 * =======================
 *
 * Two remote functions with two different shapes of laziness.
 *
 * `places` is a `prerender`: it runs once, at build time, and its result is
 * written to disk as a static JSON asset. The client's first call is a plain
 * GET of a file a CDN can cache forever. The gazetteer is a hundred cities
 * in a JSON module — small enough to prerender whole, and the explore page,
 * the place search and the custom element all read the same copy.
 *
 * `tripPreview` is a `query.batch`: the trips page renders one card per
 * trip and each card asks for its own preview, and SvelteKit collects every
 * call made in the same tick into one request. The function receives the
 * whole list of ids, answers with one database query, and returns a lookup
 * so each card gets its own answer.
 *
 * (The world's coastlines are the third piece of geography, and they come
 * from `src/routes/api/world.json` — a prerendered endpoint, for a reason
 * that file explains.)
 */

import { prerender, query } from '$app/server';
import { asc, inArray } from 'drizzle-orm';
import { pathLength } from '@meridian/waypoint/geo';
import gazetteer from '#lib/data/places.json' with { type: 'json' };
import { IdSchema } from '#lib/domain/schemas.ts';
import { requireUser } from '#lib/server/access.ts';
import { db, schema } from '#lib/server/db/index.ts';

export interface Place {
	readonly id: string;
	readonly name: string;
	/** ISO 3166-1 alpha-2 */
	readonly country: string;
	readonly lng: number;
	readonly lat: number;
}

export const places = prerender(async (): Promise<Place[]> => gazetteer);

export interface TripPreview {
	readonly id: string;
	/** `[lng, lat]` per scheduled stop, in itinerary order. */
	readonly points: [number, number][];
	/** metres, end to end */
	readonly total: number;
}

export const tripPreview = query.batch(IdSchema, async (ids) => {
	const user = requireUser();

	// Only the trips this person belongs to; anything else answers as empty.
	const memberships = await db.query.member.findMany({
		where: inArray(schema.member.tripId, ids),
		columns: { tripId: true, userId: true }
	});
	const allowed = new Set(memberships.filter((m) => m.userId === user.id).map((m) => m.tripId));

	const stops = allowed.size
		? await db.query.stop.findMany({
				where: inArray(schema.stop.tripId, [...allowed]),
				columns: { tripId: true, lng: true, lat: true, date: true, position: true },
				orderBy: [asc(schema.stop.date), asc(schema.stop.position)]
			})
		: [];

	const byTrip = new Map<string, [number, number][]>();
	for (const stop of stops) {
		if (stop.date === null) continue;
		let list = byTrip.get(stop.tripId);
		if (!list) byTrip.set(stop.tripId, (list = []));
		list.push([stop.lng, stop.lat]);
	}

	return (id): TripPreview => {
		const points = byTrip.get(id) ?? [];
		return { id, points, total: pathLength(points.map(([lng, lat]) => ({ lng, lat }))) };
	};
});
