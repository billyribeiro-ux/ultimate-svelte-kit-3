/**
 * COMPANIONS
 * ==========
 *
 * A trip's owner makes an invite link; whoever opens it, signed in, becomes
 * a member with the role the link carries. The link is single-use and
 * expires in a week, so a link pasted into the wrong chat is a bounded
 * mistake.
 *
 * `acceptInvite` is a `form` because the join page is a page: a person
 * arrives from a link in a message, possibly on a phone with a flaky
 * connection, and a button that works without JavaScript is the one that
 * works.
 */

import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { PUBLIC_ORIGIN } from '$app/env/public';
import { and, eq } from 'drizzle-orm';
import { localizeHref } from '#lib/paraglide/runtime.js';
import { newSlug } from '#lib/domain/ids.ts';
import { IdSchema, InviteInputSchema } from '#lib/domain/schemas.ts';
import { bump, requireMember, requireUser } from '#lib/server/access.ts';
import { db, schema } from '#lib/server/db/index.ts';
import { membership } from '#lib/server/trips.ts';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Twenty-four characters of the slug alphabet: ~118 bits. */
const TokenSchema = v.pipe(v.string(), v.regex(/^[a-z2-9]{24}$/, 'Expected an invite link'));

export const createInvite = command(InviteInputSchema, async ({ tripId, role }) => {
	const { user } = await requireMember(tripId, 'owner');
	const token = newSlug(24);

	await db.insert(schema.invite).values({
		token,
		tripId,
		role,
		createdBy: user.id,
		expiresAt: new Date(Date.now() + INVITE_TTL_MS)
	});

	return { token, url: `${PUBLIC_ORIGIN}${localizeHref(`/join/${token}`)}` };
});

/** What the join page shows before the button: which trip, which role, and whether the link still works. */
export const inviteByToken = query(TokenSchema, async (token) => {
	const invite = await db.query.invite.findFirst({
		where: eq(schema.invite.token, token),
		with: {
			trip: { columns: { id: true, name: true, slug: true, startDate: true, endDate: true } }
		}
	});
	if (!invite) error(404, 'Not found');

	const user = requireUser();
	const already = await membership(invite.tripId, user.id);

	return {
		trip: invite.trip,
		role: invite.role,
		expired: invite.expiresAt.getTime() < Date.now(),
		used: invite.usedAt !== null,
		alreadyMember: already !== undefined
	};
});

export const acceptInvite = form(v.object({ token: TokenSchema }), async ({ token }) => {
	const user = requireUser();

	const joined = await db.transaction(async (tx): Promise<{ tripId: string; slug: string }> => {
		const invite = await tx.query.invite.findFirst({
			where: eq(schema.invite.token, token),
			with: { trip: { columns: { slug: true } } }
		});
		if (!invite) error(404, 'Not found');
		if (invite.usedAt !== null) error(410, 'That invite has already been used.');
		if (invite.expiresAt.getTime() < Date.now()) error(410, 'That invite has expired.');

		const existing = await tx.query.member.findFirst({
			where: and(eq(schema.member.tripId, invite.tripId), eq(schema.member.userId, user.id))
		});
		// Already a member: the link is consumed and the existing role stands.
		if (!existing) {
			await tx
				.insert(schema.member)
				.values({ tripId: invite.tripId, userId: user.id, role: invite.role });
		}

		await tx
			.update(schema.invite)
			.set({ usedBy: user.id, usedAt: new Date() })
			.where(eq(schema.invite.token, token));

		return { tripId: invite.tripId, slug: invite.trip.slug };
	});

	await bump(joined.tripId);
	redirect(303, localizeHref(`/t/${joined.slug}`));
});

export const changeRole = command(
	v.object({ tripId: IdSchema, userId: v.string(), role: v.picklist(['editor', 'viewer']) }),
	async ({ tripId, userId, role }) => {
		const { trip } = await requireMember(tripId, 'owner');
		if (userId === trip.ownerId) error(400, 'The owner stays the owner.');

		await db
			.update(schema.member)
			.set({ role })
			.where(and(eq(schema.member.tripId, tripId), eq(schema.member.userId, userId)));
		await bump(tripId);
	}
);

export const removeMember = command(
	v.object({ tripId: IdSchema, userId: v.string() }),
	async ({ tripId, userId }) => {
		const { trip } = await requireMember(tripId, 'owner');
		if (userId === trip.ownerId) error(400, 'The owner cannot be removed.');

		await db
			.delete(schema.member)
			.where(and(eq(schema.member.tripId, tripId), eq(schema.member.userId, userId)));
		await bump(tripId);
	}
);

/** A member walks away from a trip that is not theirs. */
export const leaveTrip = form(v.object({ tripId: IdSchema }), async ({ tripId }) => {
	const { user, trip } = await requireMember(tripId);
	if (user.id === trip.ownerId) error(400, 'An owner can delete the trip but not leave it.');

	await db
		.delete(schema.member)
		.where(and(eq(schema.member.tripId, tripId), eq(schema.member.userId, user.id)));
	await bump(tripId);
	redirect(303, localizeHref('/trips'));
});
