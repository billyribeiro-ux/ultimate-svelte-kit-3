/**
 * WHO MAY DO WHAT
 * ===============
 *
 * Every remote function that touches a trip starts with one of these. They
 * answer three questions in a fixed order — is anybody signed in, may they
 * see this trip, may they change it — and they answer "no" in the shape
 * that gives away the least:
 *
 *   not signed in            → redirect to sign in, and come back afterwards
 *   not a member             → 404, the same as a trip that does not exist
 *   a member without the role → 403, because they already know it exists
 *
 * A 403 for "not yours" would tell a stranger that the slug they guessed is
 * real. A 404 for "yours, but read-only" would leave a viewer wondering
 * where the trip went.
 */

import { error, redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { and, eq, sql } from 'drizzle-orm';
import type { User } from 'better-auth';
import { localizeHref } from '#lib/paraglide/runtime.js';
import type { ViewerRole } from '#lib/domain/roles.ts';
import type { Role } from '#lib/domain/schemas.ts';
import { db, schema } from './db/index.ts';
import type { Trip } from './db/schema.ts';
import { publish } from './live.ts';

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export function currentUser(): User | undefined {
	return getRequestEvent().locals.user;
}

/** The signed-in person, or a redirect to sign in that comes back here. */
export function requireUser(): User {
	const event = getRequestEvent();
	if (!event.locals.user) {
		const back = `${event.url.pathname}${event.url.search}`;
		redirect(303, localizeHref(`/signin?redirectTo=${encodeURIComponent(back)}`));
	}
	return event.locals.user;
}

export interface Access {
	readonly user: User;
	readonly trip: Trip;
	readonly role: Role;
}

/** A member of the trip with at least `minimum` rights. */
export async function requireMember(tripId: string, minimum: Role = 'viewer'): Promise<Access> {
	const user = requireUser();

	const membership = await db.query.member.findFirst({
		where: and(eq(schema.member.tripId, tripId), eq(schema.member.userId, user.id)),
		with: { trip: true }
	});
	if (!membership) error(404, 'Not found');

	if (RANK[membership.role] < RANK[minimum]) {
		error(403, 'You can look at this trip but not change it.');
	}

	return { user, trip: membership.trip, role: membership.role };
}

export type Viewer = { readonly trip: Trip; readonly role: ViewerRole; readonly user?: User };

/**
 * A trip somebody may *read* by its slug: a member, or anybody at all when
 * the owner has made it visible by link. `role: 'link'` is what a stranger
 * gets, and the page renders read-only for it.
 */
export async function readableTrip(slug: string): Promise<Viewer> {
	const trip = await db.query.trip.findFirst({ where: eq(schema.trip.slug, slug) });
	if (!trip) error(404, 'Not found');

	const user = currentUser();
	if (user) {
		const membership = await db.query.member.findFirst({
			where: and(eq(schema.member.tripId, trip.id), eq(schema.member.userId, user.id))
		});
		if (membership) return { trip, role: membership.role, user };
	}

	if (trip.visibility === 'link') return { trip, role: 'link', user };

	error(404, 'Not found');
}

/**
 * Something under the trip changed: bump its version and wake the room.
 * Every command calls this last, after its own writes.
 */
export async function bump(tripId: string): Promise<number> {
	const [row] = await db
		.update(schema.trip)
		.set({ version: sql`${schema.trip.version} + 1`, updatedAt: new Date() })
		.where(eq(schema.trip.id, tripId))
		.returning({ version: schema.trip.version });
	publish(tripId);
	return row?.version ?? 0;
}
