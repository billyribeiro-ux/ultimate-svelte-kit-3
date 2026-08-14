import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { db } from './db/index.ts';
import { business, staff, type Business, type Staff, type StaffRole } from './db/schema.ts';

/**
 * Authorisation, in one place.
 *
 * Every one of these throws rather than returning a boolean. That is deliberate:
 * a function that returns `false` can be ignored by a caller who forgets to
 * check it, and the failure mode is an unprotected page that looks fine in
 * review. A function that throws either stops the request or does not exist.
 *
 * They read the current request through `getRequestEvent()` rather than taking
 * an event parameter, so a remote function deep in the call stack can ask "who
 * is this?" without every layer above it having to pass the answer down.
 */

export interface StaffContext {
	readonly user: { id: string; name: string; email: string };
	readonly staff: Staff;
	readonly business: Business;
}

/**
 * Require somebody to be signed in.
 *
 * Redirects rather than 401s, because this guards pages a human is looking at.
 * The `redirectTo` parameter is what turns "you were logged out" from an
 * annoyance into a hiccup — they land back where they were trying to go.
 */
export function requireUser() {
	const event = getRequestEvent();

	if (!event.locals.user) {
		const target = event.url.pathname + event.url.search;
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(target)}`);
	}

	return event.locals.user;
}

/**
 * Require somebody to be signed in *and* to work at the business in the URL.
 *
 * This is the guard that matters. Signing in proves you are somebody; it does
 * not prove you are somebody *here*. Without the second check, any staff member
 * anywhere could read another salon's diary by editing the slug in the address
 * bar — the classic broken-object-level-authorisation bug, and the easiest one
 * in the world to ship.
 *
 * The 404 for "you do not work here" is not politeness, it is the right answer:
 * telling a stranger that `/manage/willow-lane` exists but is not theirs leaks
 * the customer list of every business on the platform one guess at a time.
 */
export async function requireStaff(businessSlug: string): Promise<StaffContext> {
	const user = requireUser();

	const found = await db.query.business.findFirst({ where: eq(business.slug, businessSlug) });
	if (!found) error(404, 'Not found');

	const membership = await db.query.staff.findFirst({
		where: and(eq(staff.businessId, found.id), eq(staff.userId, user.id))
	});

	if (!membership || !membership.isActive) error(404, 'Not found');

	return { user, staff: membership, business: found };
}

/**
 * Require the owner role.
 *
 * 403 rather than 404 here, because at this point we have already established
 * that they work here — hiding the page's existence from a colleague is not
 * protecting anything, it is just confusing them.
 */
export async function requireOwner(businessSlug: string): Promise<StaffContext> {
	const context = await requireStaff(businessSlug);

	if (context.staff.role !== 'owner') {
		error(403, 'Only an owner can change this.');
	}

	return context;
}

/**
 * Whether a role is allowed to act on a given staff member's diary.
 *
 * An owner may manage anyone's; a member may manage only their own. Written as
 * a pure function so the rule can be unit tested and reused by the UI to decide
 * what to render, without the UI having to restate it and drift.
 */
export function canManageDiaryOf(role: StaffRole, actorStaffId: string, targetStaffId: string) {
	return role === 'owner' || actorStaffId === targetStaffId;
}

/** The throwing version, for the server. */
export function assertCanManageDiaryOf(context: StaffContext, targetStaffId: string): void {
	if (!canManageDiaryOf(context.staff.role, context.staff.id, targetStaffId)) {
		error(403, 'You can only manage your own diary.');
	}
}

/**
 * Every business the signed-in user works at.
 *
 * Used by the account switcher and by the bare `/manage` route, which sends
 * somebody straight through if they only belong to one.
 */
export async function businessesForUser(userId: string) {
	const rows = await db
		.select({ business, staff })
		.from(staff)
		.innerJoin(business, eq(business.id, staff.businessId))
		.where(and(eq(staff.userId, userId), eq(staff.isActive, true)));

	return rows.map((row) => ({ business: row.business, staff: row.staff }));
}
