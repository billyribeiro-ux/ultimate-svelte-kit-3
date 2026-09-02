/**
 * WHO MAY DO WHAT
 * ===============
 *
 * Two completely separate ways in, and keeping them separate is the point.
 *
 *   a **session** is a person in a browser: a cookie, a CSRF story, a role on a
 *   tenant, and the ability to read anything that tenant has.
 *
 *   an **API key** is a machine: a header, no cookie, no CSRF, and a scope that
 *   is almost always write-only.
 *
 * Code that tries to accept both on one path ends up accepting a key from a
 * browser — which sounds harmless until you notice that a key in a browser is a
 * key in a bookmark, in a screenshot, and in somebody's shell history. The two
 * are checked by different functions and the types do not mix.
 *
 * READS ARE CHECKED TOO
 * ---------------------
 * The easy mistake in a telemetry product is to guard writes carefully and treat
 * reads as harmless. They are not: logs are the highest-density personal data
 * most companies hold, and a query language is a very effective exfiltration
 * tool. Every read path here goes through `requireTenant`, and there is no
 * "internal" query helper that skips it.
 */

import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from './db/index.ts';
import { apiKey, membership, tenant, type Role } from './db/schema.ts';

/** Most-privileged first, so `atLeast` is a comparison rather than a table of sets. */
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };

export function atLeast(role: Role, minimum: Role): boolean {
	return RANK[role] >= RANK[minimum];
}

export interface TenantAccess {
	readonly tenantId: string;
	readonly slug: string;
	readonly role: Role;
}

/**
 * The tenants a person belongs to.
 *
 * Used by the tenant switcher and by the redirect after sign-in. Ordered by
 * name, because the alternative — insertion order — puts a tenant somebody was
 * added to last year above the one they use every day, and looks random.
 */
export async function tenantsFor(userId: string): Promise<TenantAccess[]> {
	return db
		.select({ tenantId: tenant.id, slug: tenant.slug, role: membership.role })
		.from(membership)
		.innerJoin(tenant, eq(tenant.id, membership.tenantId))
		.where(eq(membership.userId, userId))
		.orderBy(tenant.name);
}

/**
 * Resolve a tenant slug for a signed-in person, or refuse.
 *
 * **404 for no membership, 403 for insufficient role.** A person with no access
 * must not be able to tell a real tenant slug from an invented one — otherwise
 * the sign-in page becomes a way to enumerate every customer this deployment
 * has, one guess at a time.
 *
 * One query with a join, for the same reason: fetching the tenant and then the
 * membership leaks existence in the gap between them.
 */
export async function requireTenant(
	userId: string | undefined,
	slug: string,
	minimum: Role = 'viewer'
): Promise<TenantAccess> {
	if (!userId) error(401, 'Sign in to continue.');

	const rows = await db
		.select({ tenantId: tenant.id, slug: tenant.slug, role: membership.role })
		.from(tenant)
		.innerJoin(membership, eq(membership.tenantId, tenant.id))
		.where(and(eq(tenant.slug, slug), eq(membership.userId, userId)))
		.limit(1);

	const access = rows[0];
	if (!access) error(404, 'No such workspace.');
	if (!atLeast(access.role, minimum)) error(403, refusalFor(access.role, minimum));

	return access;
}

/** The reason, phrased as something the reader can act on. */
export function refusalFor(role: Role, minimum: Role): string {
	if (minimum === 'owner') return 'Only the workspace owner can do that.';
	if (role === 'viewer') return 'You have read-only access to this workspace.';
	return 'You do not have permission to do that. Ask an admin for access.';
}

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

export type Scope = 'ingest' | 'read';

export interface KeyAccess {
	readonly keyId: string;
	readonly tenantId: string;
	readonly scopes: readonly Scope[];
}

/**
 * A key's visible prefix, for telling two apart in a list.
 *
 * `sxt_` then eight characters. The prefix is stored in clear and the rest never
 * is, which is what lets the interface show `sxt_a1b2c3d4…` beside "created by
 * Ada, last used 3 minutes ago" without the row being a live credential.
 */
export function prefixOf(key: string): string {
	return key.slice(0, 12);
}

/**
 * Hash a key for storage and lookup.
 *
 * SHA-256 rather than a password hash, and that is a deliberate difference from
 * how passwords are stored. A password is low-entropy and human-chosen, so it
 * needs a slow hash to make guessing expensive. An API key is 256 bits of
 * randomness from `crypto.getRandomValues`, so guessing is not a threat and the
 * only requirement is that the stored form is not usable — which SHA-256 gives.
 *
 * The practical consequence is that key lookup is an indexed equality on a hash
 * computed in microseconds, rather than a scan comparing bcrypt hashes one row
 * at a time. Using bcrypt here would mean ingest could not look a key up at all
 * without scanning every key the tenant has.
 */
export async function hashKey(key: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Mint a key. Returned once, in clear, and never recoverable afterwards. */
export function newKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const body = [...bytes].map((byte) => byte.toString(36).padStart(2, '0')).join('');
	return `sxt_${body.slice(0, 40)}`;
}

/**
 * Authenticate a machine.
 *
 * Returns `null` rather than throwing, because the caller decides the status —
 * ingest answers 401 with a `WWW-Authenticate` header, and the read API answers
 * 401 without one. Throwing here would put that decision in the wrong file.
 */
export async function authenticateKey(header: string | null): Promise<KeyAccess | null> {
	if (!header) return null;

	/*
	 * `Bearer <key>` or a bare key.
	 *
	 * Accepting both is not sloppiness: collectors are configured by people
	 * copying a value into a YAML field labelled "token", and roughly half of
	 * them include the word Bearer. Rejecting that produces a support question
	 * whose answer is "delete the first seven characters", every time.
	 */
	const key = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
	if (!key.startsWith('sxt_')) return null;

	const hash = await hashKey(key);

	const rows = await db
		.select({
			keyId: apiKey.id,
			tenantId: apiKey.tenantId,
			scopes: apiKey.scopes,
			revokedAt: apiKey.revokedAt
		})
		.from(apiKey)
		.where(eq(apiKey.hash, hash))
		.limit(1);

	const found = rows[0];
	if (!found || found.revokedAt !== null) return null;

	/*
	 * `lastUsedAt` is deliberately NOT updated here.
	 *
	 * It is the obvious place, and it would turn every ingest request — thousands
	 * a second — into a write to a single row, which is a write-lock convoy on
	 * exactly the table every request must read. The rollup job updates it in
	 * bulk instead, so the column is accurate to the minute rather than the
	 * millisecond, and nobody has ever needed it to be better than that.
	 */

	return {
		keyId: found.keyId,
		tenantId: found.tenantId,
		scopes: found.scopes.split(',').map((scope) => scope.trim()) as Scope[]
	};
}

export function hasScope(access: KeyAccess, scope: Scope): boolean {
	return access.scopes.includes(scope);
}
