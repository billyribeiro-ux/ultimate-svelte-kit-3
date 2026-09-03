/**
 * STOPS
 * =====
 *
 * Add, change, move, remove. Every one is a `command` — a stop is placed by
 * clicking a map or dropping a card, neither of which exists without
 * JavaScript — and every one ends with `bump`, which wakes the room.
 *
 * `moveStop` is the one with a shape worth reading: it takes *where the
 * card was dropped* (a day and an index), asks `place()` in the domain what
 * has to change to make that true, and writes exactly those rows. The same
 * `place()` runs in the browser first, optimistically, so the card lands
 * before the server answers and lands in the same spot when it does.
 */

import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import { STOP_LIMIT } from '$app/env/private';
import { and, eq } from 'drizzle-orm';
import { nextPosition, place } from '#lib/domain/itinerary.ts';
import { IdSchema, MoveStopSchema, StopInputSchema, StopPatchSchema } from '#lib/domain/schemas.ts';
import { bump, requireMember } from '#lib/server/access.ts';
import { db, schema } from '#lib/server/db/index.ts';
import * as trips from '#lib/server/trips.ts';

export const addStop = command(StopInputSchema, async (input) => {
	const { user, trip } = await requireMember(input.tripId, 'editor');

	if ((await trips.countStops(trip.id)) >= STOP_LIMIT) {
		error(422, `A trip holds at most ${STOP_LIMIT} stops`);
	}

	const position = nextPosition(await trips.listStops(trip.id), input.date);
	const [row] = await db
		.insert(schema.stop)
		.values({ ...input, position, createdBy: user.id })
		.returning();

	await bump(trip.id);
	return row!;
});

export const updateStop = command(StopPatchSchema, async ({ id, ...patch }) => {
	const existing = await db.query.stop.findFirst({ where: eq(schema.stop.id, id) });
	if (!existing) error(404, 'Not found');
	await requireMember(existing.tripId, 'editor');

	await db.update(schema.stop).set(patch).where(eq(schema.stop.id, id));
	await bump(existing.tripId);
});

export const moveStop = command(MoveStopSchema, async ({ tripId, id, date, index }) => {
	await requireMember(tripId, 'editor');

	const stops = await trips.listStops(tripId);
	if (!stops.some((s) => s.id === id)) error(404, 'Not found');

	const changes = place(stops, id, date, index);
	if (changes.length > 0) {
		await db.transaction(async (tx) => {
			for (const change of changes) {
				await tx
					.update(schema.stop)
					.set({ date: change.date, position: change.position })
					.where(and(eq(schema.stop.id, change.id), eq(schema.stop.tripId, tripId)));
			}
		});
		await bump(tripId);
	}
	return changes;
});

export const removeStop = command(
	v.object({ tripId: IdSchema, id: IdSchema }),
	async ({ tripId, id }) => {
		await requireMember(tripId, 'editor');
		await db.delete(schema.stop).where(and(eq(schema.stop.id, id), eq(schema.stop.tripId, tripId)));
		await bump(tripId);
	}
);

/** The person's own id, for the client to tell its own presence chip apart. */
export const me = command(async () => getRequestEvent().locals.user?.id ?? null);
