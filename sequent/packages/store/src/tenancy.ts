/**
 * Firms, their people, and the credentials that stand in for them.
 *
 * The read side of tenancy: turning a session cookie or an API key into a
 * `Viewer` that `authz.ts` can decide about. Everything here is a lookup; every
 * decision is next door, in a pure function.
 *
 * Keeping those apart matters more than it looks. A permission check that
 * queries the database as it goes is a permission check nobody can enumerate,
 * and a permission system nobody can enumerate is one nobody can audit.
 */

import type { Client } from '@libsql/client';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role, Viewer } from './authz.ts';

/* -------------------------------------------------------------------------- */
/* Secrets                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Hash a password or an API secret.
 *
 * scrypt with a per-secret salt. Deliberately slow — that is the entire point
 * of a password hash, and a fast one is a vulnerability rather than an
 * optimisation.
 */
export function hashSecret(secret: string): string {
	const salt = randomBytes(16);
	const derived = scryptSync(secret, salt, 64);
	return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * Check a secret against a stored hash, in constant time.
 *
 * `timingSafeEqual` rather than `===`. String comparison stops at the first
 * differing byte, so how long it takes leaks how much of the guess was right —
 * enough, over many attempts, to recover a secret one character at a time. The
 * attack is fiddly over a network and completely practical against a local
 * service, and the defence costs nothing.
 */
export function verifySecret(secret: string, stored: string): boolean {
	const [saltHex, expectedHex] = stored.split(':');
	if (!saltHex || !expectedHex) return false;

	const expected = Buffer.from(expectedHex, 'hex');
	const actual = scryptSync(secret, Buffer.from(saltHex, 'hex'), expected.length);

	return timingSafeEqual(actual, expected);
}

/* -------------------------------------------------------------------------- */
/* Resolving a viewer                                                          */
/* -------------------------------------------------------------------------- */

/** Every active trading account at a firm. */
async function allAccountsOf(client: Client, firmId: string): Promise<string[]> {
	const all = await client.execute({
		sql: 'SELECT account_id FROM trading_account WHERE firm_id = ? AND is_active = 1',
		args: [firmId]
	});
	return all.rows.map((row) => String(row['account_id']));
}

/** The accounts a user may act on, or all of the firm's for firm-wide roles. */
async function accountsFor(client: Client, userId: string, firmId: string, role: Role): Promise<string[]> {
	if (role === 'firm_admin' || role === 'risk_manager' || role === 'venue_operator') {
		return allAccountsOf(client, firmId);
	}

	const assigned = await client.execute({
		sql: 'SELECT account_id FROM account_assignment WHERE user_id = ?',
		args: [userId]
	});
	return assigned.rows.map((row) => String(row['account_id']));
}

/** Turn a session id into a viewer, or `undefined` if it is not usable. */
export async function viewerFromSession(
	client: Client,
	sessionId: string,
	now: number
): Promise<Viewer | undefined> {
	const result = await client.execute({
		sql: `SELECT u.user_id AS user_id, u.firm_id AS firm_id, u.role AS role, u.is_active AS is_active,
					f.is_active AS firm_active, s.expires_at AS expires_at
			  FROM session s
			  JOIN venue_user u ON u.user_id = s.user_id
			  JOIN firm f ON f.firm_id = u.firm_id
			  WHERE s.session_id = ?`,
		args: [sessionId]
	});

	const row = result.rows[0];
	if (!row) return undefined;

	// Expiry, the user and the firm are all checked here rather than at the call
	// sites. A suspended firm's staff must stop working immediately, not at the
	// next login.
	if (Number(row['expires_at']) <= now) return undefined;
	if (Number(row['is_active']) !== 1 || Number(row['firm_active']) !== 1) return undefined;

	const userId = String(row['user_id']);
	const firmId = String(row['firm_id']);
	const role = String(row['role']) as Role;

	return { userId, firmId, role, accountIds: await accountsFor(client, userId, firmId, role) };
}

/**
 * Turn an API key into a viewer.
 *
 * The key is presented as `keyId.secret`. The id is looked up and the secret
 * verified against its hash — so a stolen database gives an attacker hashes
 * rather than working keys, and a stolen key identifies itself without a scan.
 */
export async function viewerFromApiKey(
	client: Client,
	presented: string,
	now: number
): Promise<{ viewer: Viewer; keyId: string; ratePerSecond: number } | undefined> {
	const separator = presented.indexOf('.');
	if (separator <= 0) return undefined;

	const keyId = presented.slice(0, separator);
	const secret = presented.slice(separator + 1);

	const result = await client.execute({
		sql: `SELECT k.firm_id AS firm_id, k.account_id AS account_id, k.secret_hash AS secret_hash,
					k.scopes AS scopes, k.rate_per_second AS rate_per_second, k.revoked_at AS revoked_at,
					f.is_active AS firm_active
			  FROM api_key k JOIN firm f ON f.firm_id = k.firm_id
			  WHERE k.key_id = ?`,
		args: [keyId]
	});

	const row = result.rows[0];
	if (!row) return undefined;
	if (row['revoked_at'] !== null) return undefined;
	if (Number(row['firm_active']) !== 1) return undefined;
	if (!verifySecret(secret, String(row['secret_hash']))) return undefined;

	const firmId = String(row['firm_id']);
	const accountId = row['account_id'] === null ? undefined : String(row['account_id']);

	/*
	 * A key is always a `trader`, whatever its scopes say.
	 *
	 * Scopes narrow; they never promote. A key cannot be an admin because no
	 * human reviews what an algorithm decides to do at 400 orders a second, and
	 * the blast radius of a compromised key should not include the firm's user
	 * list.
	 */
	/*
	 * A pinned key trades exactly one account; an unpinned one trades all of the
	 * firm's.
	 *
	 * The `account_assignment` table is keyed on `venue_user`, and a key is not a
	 * user — so looking a key up there returns nothing, always. An earlier
	 * version of this function did exactly that, and the result was an unpinned
	 * key that authenticated perfectly and then refused every order it sent, for
	 * a reason no log line explained.
	 *
	 * Pinning stays the recommendation for an algorithm: a key that can only
	 * trade one desk cannot, when it misbehaves at three in the morning,
	 * misbehave on all of them.
	 */
	const accountIds = accountId
		? [accountId]
		: await allAccountsOf(client, firmId);

	const viewer: Viewer = {
		userId: `key:${keyId}`,
		firmId,
		role: 'trader',
		accountIds,
		scopes: String(row['scopes']).split(' ').filter(Boolean)
	};

	// Best effort, and deliberately not awaited into the request's critical path.
	void client.execute({
		sql: 'UPDATE api_key SET last_used_at = ? WHERE key_id = ?',
		args: [now, keyId]
	});

	return { viewer, keyId, ratePerSecond: Number(row['rate_per_second']) };
}
