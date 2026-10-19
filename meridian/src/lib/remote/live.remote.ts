/**
 * THE LIVE TRIP
 * =============
 *
 * `watchTrip` is a `query.live`: an async generator on the server, a
 * `.current` in the browser. It yields the whole trip document plus who is
 * looking at it, first immediately and then every time the room is woken —
 * by a command bumping the version, by somebody arriving or leaving, by a
 * pointer moving onto a different stop.
 *
 * The whole document, not a diff. A trip is a few hundred rows at most,
 * the serialisation is a millisecond, and "the client holds exactly what
 * the server holds" is a property worth more than the bytes it costs. The
 * mailbox makes sure a burst of ten changes becomes one send.
 *
 * The generator ends when the request's abort signal fires — the tab
 * closed, the person navigated away — which is what closes the mailbox
 * and, through `finally`, unsubscribes from the room. Without that, every
 * visitor who ever opened the trip would be a listener forever.
 *
 * It also ends when the person may no longer read the trip. A connection
 * is not a permission: a companion removed while their tab stays open, or
 * somebody reading by link after the owner makes the trip private, would
 * otherwise go on receiving every snapshot for as long as the tab lives.
 * So access is asked again on every wake, before anything is read.
 */

import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { IdSchema, PresenceSchema, SlugSchema } from '#lib/domain/schemas.ts';
import { readableTrip, requireMember } from '#lib/server/access.ts';
import { Mailbox, subscribe } from '#lib/server/live.ts';
import * as presence from '#lib/server/presence.ts';
import * as trips from '#lib/server/trips.ts';
import type { TripDocument } from '#lib/server/trips.ts';

export interface LiveTrip {
	readonly document: TripDocument;
	readonly presence: presence.Presence[];
}

export const watchTrip = query.live(SlugSchema, async function* (slug) {
	const viewer = await readableTrip(slug);
	const tripId = viewer.trip.id;

	const mailbox = new Mailbox();
	const unsubscribe = subscribe(tripId, () => mailbox.put());

	const { signal } = getRequestEvent().request;
	signal.addEventListener('abort', () => mailbox.close(), { once: true });

	try {
		while (true) {
			const document = await trips.loadDocument(tripId);
			// Deleted between the check and the read: send the fact and stop.
			if (!document) {
				yield null;
				break;
			}
			const snapshot: LiveTrip = { document, presence: presence.list(tripId) };
			yield snapshot;

			if (!(await mailbox.next())) break;

			/*
			 * Woken: may this person still read it? The same question, asked
			 * the same way, as when the stream opened. A refusal is thrown out
			 * of the generator, SvelteKit sends it down the stream as an error
			 * and closes it, and the browser marks the live query failed
			 * instead of reconnecting — so nothing written after it is read.
			 *
			 * This works after a `yield` because SvelteKit runs every step of
			 * the generator — each call to `next()` — inside the request's
			 * context, so `getRequestEvent()`, and with it the signed-in person
			 * on `locals`, still answers. A deleted trip ends the same way.
			 */
			await readableTrip(slug);
		}
	} finally {
		unsubscribe();
	}
});

/** "I am here, looking at this stop." Sent on arrival, on hover, and every fifteen seconds. */
export const heartbeat = command(PresenceSchema, async ({ tripId, stopId }) => {
	const { user } = await requireMember(tripId);
	presence.touch(tripId, { userId: user.id, name: user.name, stopId });
});

/** Sent from `beforeunload`, so the chip disappears now rather than in thirty seconds. */
export const leave = command(v.object({ tripId: IdSchema }), async ({ tripId }) => {
	const { user } = await requireMember(tripId);
	presence.leave(tripId, user.id);
});
