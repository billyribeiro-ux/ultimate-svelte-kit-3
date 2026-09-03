/**
 * KEYS AND SAVED VIEWS
 * ====================
 *
 * The two things a workspace owns besides its data. Both are small; the API key
 * half is the one with a security story worth reading.
 */

import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import * as v from 'valibot';
import { form, getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { apiKey, view } from '#lib/server/db/schema.ts';
import { hashKey, newKey, prefixOf, requireTenant } from '#lib/server/access.ts';

const tenantSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

/**
 * The keys, with no keys in them.
 *
 * Only the prefix is stored in clear, so this list can show `sxt_a1b2c3d4…` next
 * to "created 3 weeks ago, last used 4 minutes ago" without any row being a live
 * credential. A settings page that could re-display a key would mean the key is
 * recoverable from the database, which is the property that makes a leaked
 * backup a leaked fleet.
 */
export const keys = query(v.object({ tenant: tenantSlug }), async ({ tenant }) => {
	const { user } = requireUser();
	// `admin`: knowing which integrations exist is itself worth restricting, and a
	// viewer has no reason to.
	const access = await requireTenant(user.id, tenant, 'admin');

	const rows = await db
		.select({
			id: apiKey.id,
			name: apiKey.name,
			prefix: apiKey.prefix,
			scopes: apiKey.scopes,
			createdAt: apiKey.createdAt,
			lastUsedAt: apiKey.lastUsedAt,
			revokedAt: apiKey.revokedAt
		})
		.from(apiKey)
		.where(eq(apiKey.tenantId, access.tenantId))
		.orderBy(apiKey.createdAt);

	return rows;
});

/**
 * Mint a key.
 *
 * The clear value is returned **once**, from this call, and never stored. That
 * is not a convenience decision: a system that can show you a key again is a
 * system where the key is at rest somewhere readable, and every subsequent
 * control is decoration.
 */
export const createKey = form(
	v.object({
		tenant: tenantSlug,
		name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give the key a name.'), v.maxLength(80)),
		scopes: v.optional(v.string(), 'ingest')
	}),
	async ({ tenant, name, scopes }) => {
		const { user } = requireUser();
		const access = await requireTenant(user.id, tenant, 'admin');

		const clear = newKey();

		await db.insert(apiKey).values({
			id: crypto.randomUUID(),
			tenantId: access.tenantId,
			name,
			prefix: prefixOf(clear),
			hash: await hashKey(clear),
			scopes: scopes === 'read' ? 'read' : 'ingest'
		});

		await keys({ tenant }).refresh();

		// The one and only time this value exists outside the caller's memory.
		return { key: clear, name };
	}
);

/**
 * Revoke, not delete.
 *
 * The row stays, with `revokedAt` set. Deleting it would remove the record that
 * a key existed at all — which is precisely the record somebody wants during an
 * incident review, when the question is "what was this thing and who made it".
 */
export const revokeKey = form(
	v.object({ tenant: tenantSlug, id: v.string() }),
	async ({ tenant, id }) => {
		const { user } = requireUser();
		const access = await requireTenant(user.id, tenant, 'admin');

		await db
			.update(apiKey)
			.set({ revokedAt: new Date() })
			.where(and(eq(apiKey.id, id), eq(apiKey.tenantId, access.tenantId)));

		await keys({ tenant }).refresh();

		return { revoked: true };
	}
);

/* ------------------------------------------------------------------ */
/* Saved views                                                         */
/* ------------------------------------------------------------------ */

export const views = query(v.object({ tenant: tenantSlug }), async ({ tenant }) => {
	const { user } = requireUser();
	const access = await requireTenant(user.id, tenant, 'viewer');

	return db
		.select({ id: view.id, name: view.name, query: view.query, range: view.range })
		.from(view)
		.where(eq(view.tenantId, access.tenantId))
		.orderBy(view.name);
});

export const saveView = form(
	v.object({
		tenant: tenantSlug,
		name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give the view a name.'), v.maxLength(120)),
		query: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4_000)),
		/*
		 * The range as it was *written*, not as it resolved.
		 *
		 * A saved view of "the last six hours" must mean the last six hours when it
		 * is opened, not the six hours that happened to be current when it was
		 * saved. Storing two timestamps would make every saved view a historical
		 * snapshot, which is a different and much less useful feature.
		 */
		range: v.pipe(v.string(), v.maxLength(64))
	}),
	async ({ tenant, name, query: text, range }) => {
		const { user } = requireUser();
		const access = await requireTenant(user.id, tenant, 'member');

		await db.insert(view).values({
			id: crypto.randomUUID(),
			tenantId: access.tenantId,
			name,
			query: text,
			range,
			authorId: user.id
		});

		await views({ tenant }).refresh();

		return { saved: true };
	}
);

export const deleteView = form(
	v.object({ tenant: tenantSlug, id: v.string() }),
	async ({ tenant, id }) => {
		const { user } = requireUser();
		const access = await requireTenant(user.id, tenant, 'member');

		await db.delete(view).where(and(eq(view.id, id), eq(view.tenantId, access.tenantId)));
		await views({ tenant }).refresh();

		return { deleted: true };
	}
);

function requireUser() {
	const event = getRequestEvent();
	if (!event.locals.user) error(401, 'Sign in to continue.');
	return { user: event.locals.user };
}
