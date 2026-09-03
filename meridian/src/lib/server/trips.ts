/**
 * THE TRIP STORE
 * ==============
 *
 * Every read and write of a trip and the rows under it, as plain functions
 * over Drizzle. The remote functions in `src/lib/remote` decide *who* may do
 * a thing and then call one of these to do it; nothing here checks a
 * session, which is what makes these testable with a database and no
 * request.
 *
 * `loadDocument` is the one read that matters: it assembles everything the
 * trip page shows — trip, companions, stops, expenses with their shares, the
 * note — in four queries. The live query calls it after every change, so it
 * is worth keeping cheap; the indexes in `schema.ts` are for it.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { User } from 'better-auth';
import { newSlug } from '#lib/domain/ids.ts';
import type { NoteDoc, Role, TripInput, TripPatch } from '#lib/domain/schemas.ts';
import { db, schema } from './db/index.ts';
import type { Expense, ExpenseShare, Stop, Trip } from './db/schema.ts';

export interface TripSummary {
	readonly trip: Trip;
	readonly role: Role;
	readonly members: number;
	readonly stops: number;
}

/** Every trip the person belongs to, newest departure first. */
export async function listTrips(userId: string): Promise<TripSummary[]> {
	return db
		.select({
			trip: schema.trip,
			role: schema.member.role,
			members: sql<number>`(select count(*) from ${schema.member} m where m.trip_id = ${schema.trip.id})`,
			stops: sql<number>`(select count(*) from ${schema.stop} s where s.trip_id = ${schema.trip.id})`
		})
		.from(schema.member)
		.innerJoin(schema.trip, eq(schema.member.tripId, schema.trip.id))
		.where(eq(schema.member.userId, userId))
		.orderBy(desc(schema.trip.startDate));
}

export interface Companion {
	readonly userId: string;
	readonly name: string;
	readonly role: Role;
}

export interface TripDocument {
	readonly trip: Trip;
	readonly members: Companion[];
	readonly stops: Stop[];
	readonly expenses: (Expense & { shares: ExpenseShare[] })[];
	readonly note: NoteDoc | null;
}

/** Everything the trip page shows, or `null` when the trip is gone. */
export async function loadDocument(tripId: string): Promise<TripDocument | null> {
	const trip = await db.query.trip.findFirst({
		where: eq(schema.trip.id, tripId),
		with: {
			members: { with: { user: { columns: { id: true, name: true } } } },
			stops: { orderBy: [asc(schema.stop.date), asc(schema.stop.position)] },
			expenses: {
				with: { shares: true },
				orderBy: [asc(schema.expense.date), asc(schema.expense.createdAt)]
			},
			note: true
		}
	});
	if (!trip) return null;

	const { members, stops, expenses, note, ...plain } = trip;
	return {
		trip: plain,
		members: members.map((m) => ({ userId: m.user.id, name: m.user.name, role: m.role })),
		stops,
		expenses,
		note: note?.doc ?? null
	};
}

export function listStops(tripId: string): Promise<Stop[]> {
	return db.query.stop.findMany({
		where: eq(schema.stop.tripId, tripId),
		orderBy: [asc(schema.stop.date), asc(schema.stop.position)]
	});
}

export async function countStops(tripId: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)` })
		.from(schema.stop)
		.where(eq(schema.stop.tripId, tripId));
	return row?.n ?? 0;
}

/**
 * A new trip and its owner, in one transaction. The slug is random and
 * unique; the loop exists for the one-in-a-quadrillion collision, because
 * "retry once" is cheaper to write than to explain in an incident.
 */
export async function createTrip(owner: User, input: TripInput): Promise<Trip> {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const slug = newSlug();
		const taken = await db.query.trip.findFirst({
			where: eq(schema.trip.slug, slug),
			columns: { id: true }
		});
		if (taken) continue;

		return db.transaction(async (tx) => {
			const [trip] = await tx
				.insert(schema.trip)
				.values({ ...input, slug, ownerId: owner.id })
				.returning();
			await tx.insert(schema.member).values({ tripId: trip!.id, userId: owner.id, role: 'owner' });
			return trip!;
		});
	}
	throw new Error('could not find a free slug in three tries');
}

export async function updateTrip(patch: TripPatch): Promise<void> {
	const { id, ...fields } = patch;
	await db.update(schema.trip).set(fields).where(eq(schema.trip.id, id));
}

export async function deleteTrip(tripId: string): Promise<void> {
	// Members, stops, expenses, shares and the note cascade from the trip.
	await db.delete(schema.trip).where(eq(schema.trip.id, tripId));
}

export async function membership(tripId: string, userId: string) {
	return db.query.member.findFirst({
		where: and(eq(schema.member.tripId, tripId), eq(schema.member.userId, userId))
	});
}
