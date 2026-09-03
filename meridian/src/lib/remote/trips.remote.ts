/**
 * TRIPS
 * =====
 *
 * The list, the document, and the four things an owner can do to a trip.
 * Authorisation is the first line of every function and comes from
 * `server/access.ts`; the work is in `server/trips.ts`.
 *
 * `createTrip` and `deleteTrip` are `form`s because they are pages with a
 * button and must work with JavaScript off. `updateTrip` and `setVisibility`
 * are `command`s because they are called from settings controls that only
 * exist once JavaScript is running.
 */

import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query, requested } from '$app/server';
import { localizeHref } from '#lib/paraglide/runtime.js';
import { IdSchema, SlugSchema, TripInputSchema, TripPatchSchema } from '#lib/domain/schemas.ts';
import { bump, readableTrip, requireMember, requireUser } from '#lib/server/access.ts';
import { publish } from '#lib/server/live.ts';
import * as trips from '#lib/server/trips.ts';

/** Every trip the signed-in person belongs to. */
export const myTrips = query(async () => trips.listTrips(requireUser().id));

/**
 * The trip page's first paint: the whole document, plus what the viewer may
 * do with it. After this, `watchTrip` in `live.remote.ts` keeps it current.
 */
export const tripBySlug = query(SlugSchema, async (slug) => {
	const viewer = await readableTrip(slug);
	const document = await trips.loadDocument(viewer.trip.id);
	if (!document) error(404, 'Not found');
	return { document, role: viewer.role, viewerId: viewer.user?.id ?? null };
});

export const createTrip = form(TripInputSchema, async (input) => {
	const user = requireUser();
	const trip = await trips.createTrip(user, input);
	redirect(303, localizeHref(`/t/${trip.slug}`));
});

export const updateTrip = command(TripPatchSchema, async (patch) => {
	await requireMember(patch.id, 'owner');
	await trips.updateTrip(patch);
	await bump(patch.id);
	/*
	 * SINGLE-FLIGHT: the client that sent this command asked for `tripBySlug`
	 * to be refreshed in the same response, so the settings panel shows the
	 * new dates without a second round trip. `requested` hands back exactly
	 * the instances that client is holding — at most one here.
	 */
	await requested(tripBySlug, 1).refreshAll();
});

export const deleteTrip = form(v.object({ id: IdSchema }), async ({ id }) => {
	await requireMember(id, 'owner');
	await trips.deleteTrip(id);
	// Wake anybody still watching, so their live query ends rather than hangs.
	publish(id);
	redirect(303, localizeHref('/trips'));
});
