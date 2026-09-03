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
	/** When the server took this snapshot; the header shows "updated 3s ago". */
	readonly at: number;
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
			// Deleted under us: send the fact and stop.
			if (!document) {
				yield null;
				break;
			}
			const snapshot: LiveTrip = { document, presence: presence.list(tripId), at: Date.now() };
			yield snapshot;

			if (!(await mailbox.next())) break;
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
