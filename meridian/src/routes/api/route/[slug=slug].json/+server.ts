import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '#lib/server/db/index.ts';
import { listStops } from '#lib/server/trips.ts';

/**
 * A TRIP FOR ANOTHER PAGE
 * =======================
 *
 * What the `<meridian-route>` custom element fetches: the trip's name, its
 * dates and its scheduled stops — nothing else. Only trips whose owner made
 * them visible by link answer here; a private trip is a 404 whether or not
 * the caller is signed in, because the element runs on somebody else's
 * page, where our cookies are not sent and should not matter.
 *
 * `access-control-allow-origin: *` is what makes it usable from another
 * origin at all, and is safe precisely because the response holds nothing
 * that was not already public by link.
 */
const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, OPTIONS'
};

export const GET: RequestHandler = async ({ params }) => {
	const trip = await db.query.trip.findFirst({ where: eq(schema.trip.slug, params.slug) });
	if (!trip || trip.visibility !== 'link') error(404, 'No such trip.');

	const stops = await listStops(trip.id);
	return json(
		{
			name: trip.name,
			slug: trip.slug,
			startDate: trip.startDate,
			endDate: trip.endDate,
			stops: stops
				.filter((stop) => stop.date !== null)
				.map((stop) => ({
					name: stop.name,
					kind: stop.kind,
					date: stop.date,
					lng: stop.lng,
					lat: stop.lat
				}))
		},
		{ headers: { ...CORS, 'cache-control': 'public, max-age=60' } }
	);
};

export const OPTIONS: RequestHandler = () => new Response(null, { status: 204, headers: CORS });
