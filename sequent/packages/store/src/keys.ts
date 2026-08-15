/**
 * Issuing and revoking API keys.
 *
 * ## Shown once, stored never
 *
 * The secret is returned from `createApiKey` and then it is gone. What the
 * database holds is a scrypt hash, exactly as for a password, and there is no
 * code path anywhere that can recover the original.
 *
 * People find this annoying, and every venue that has softened it has regretted
 * it. A system that can show you your own key can be made to show it to
 * somebody wearing your face — a support agent talked into it, a database
 * backup on a laptop, a subpoena. "Lost it? Here is a new one" costs a member
 * firm ninety seconds and removes the entire category.
 *
 * ## The two-part key, and what the prefix is for
 *
 * A key looks like `ak_7f2c…` + `.` + a long random secret. The first half is
 * an identifier and is stored in clear; the second is the secret.
 *
 * The split is what makes verification a single indexed lookup. With one opaque
 * blob you would have to scrypt the presented key against *every* stored hash
 * to find out whose it is — which is O(keys) scrypt calls per request, and
 * scrypt is deliberately slow. Thousands of keys would make authentication cost
 * more than the query it guards.
 *
 * The prefix has a second use: it is greppable. Secret scanners find
 * `ak_`-prefixed strings in a pushed commit precisely because the shape is
 * recognisable, which is a good reason to make credentials *look* like
 * credentials rather than like random noise.
 */

import type { Client } from '@libsql/client';
import { randomBytes } from 'node:crypto';
import { hashSecret } from './tenancy.ts';

export const SCOPES = ['read', 'trade', 'admin'] as const;
export type Scope = (typeof SCOPES)[number];

export interface NewKey {
	readonly keyId: string;
	/** The full credential, `keyId.secret`. Returned once and never again. */
	readonly secret: string;
	readonly label: string;
	readonly scopes: readonly Scope[];
	readonly ratePerSecond: number;
}

export class InvalidScope extends Error {
	constructor(scope: string) {
		super(`Unknown scope: ${scope}. Valid scopes are ${SCOPES.join(', ')}.`);
		this.name = 'InvalidScope';
	}
}

/**
 * Mint a key for a firm.
 *
 * `account_id` may be pinned, and pinning it is the useful default for an
 * algorithm: a key that can only trade one desk cannot, when it goes wrong at
 * three in the morning, go wrong on all of them.
 */
export async function createApiKey(
	client: Client,
	input: {
		firmId: string;
		label: string;
		scopes: readonly string[];
		accountId?: string;
		ratePerSecond?: number;
		now?: number;
	}
): Promise<NewKey> {
	for (const scope of input.scopes) {
		if (!SCOPES.includes(scope as Scope)) throw new InvalidScope(scope);
	}

	if (input.scopes.length === 0) {
		// A key with no scopes can do nothing and looks like a working key. Making
		// it an error beats letting somebody debug it for an afternoon.
		throw new Error('A key needs at least one scope.');
	}

	/*
	 * 9 bytes of id, 32 of secret, both from `randomBytes`.
	 *
	 * `randomBytes` and not `Math.random()`. The latter is a fast
	 * pseudo-random generator seeded from something guessable, and its output is
	 * predictable from a handful of prior values — fine for picking a colour,
	 * catastrophic for a credential. This distinction is the single most common
	 * way a competent codebase ends up with a forgeable token.
	 *
	 * 32 bytes is 256 bits. There is no attack on that; guessing is not a threat
	 * model, leakage is, which is why the rest of this file is about leakage.
	 */
	const keyId = `ak_${randomBytes(9).toString('base64url')}`;
	const secret = randomBytes(32).toString('base64url');
	const now = input.now ?? Date.now();

	await client.execute({
		sql: `INSERT INTO api_key
				(key_id, firm_id, account_id, label, secret_hash, scopes, rate_per_second, created_at)
			  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			keyId,
			input.firmId,
			input.accountId ?? null,
			input.label,
			hashSecret(secret),
			input.scopes.join(' '),
			input.ratePerSecond ?? 20,
			now
		]
	});

	return {
		keyId,
		secret: `${keyId}.${secret}`,
		label: input.label,
		scopes: input.scopes as readonly Scope[],
		ratePerSecond: input.ratePerSecond ?? 20
	};
}

/**
 * Revoke a key by stamping it, not by deleting the row.
 *
 * The row is the only record that the key existed. Delete it and the question
 * "what was this key allowed to do when it made that trade in March" has no
 * answer — and that is exactly the question asked after an incident.
 *
 * Scoped by firm so that one member cannot revoke another's key by guessing an
 * id. The scoping lives in the `WHERE` clause for the same reason it does
 * everywhere else here: a row that is never fetched cannot be leaked by the
 * next person to edit the function.
 */
export async function revokeApiKey(
	client: Client,
	firmId: string,
	keyId: string,
	now = Date.now()
): Promise<boolean> {
	const result = await client.execute({
		sql: `UPDATE api_key SET revoked_at = ?
			  WHERE key_id = ? AND firm_id = ? AND revoked_at IS NULL`,
		args: [now, keyId, firmId]
	});

	return result.rowsAffected > 0;
}

export interface KeySummary {
	readonly keyId: string;
	readonly label: string;
	readonly scopes: readonly string[];
	readonly accountId: string | null;
	readonly ratePerSecond: number;
	readonly createdAt: number;
	readonly lastUsedAt: number | null;
	readonly revokedAt: number | null;
}

/**
 * A firm's keys, revoked ones included.
 *
 * Never the hash. It is not the secret, but it is the material an offline
 * attack runs against, and a list endpoint that returns it turns "read access
 * to the admin page" into "every key at this firm, given enough GPU time".
 */
export async function listApiKeys(client: Client, firmId: string): Promise<KeySummary[]> {
	const result = await client.execute({
		sql: `SELECT key_id, label, scopes, account_id, rate_per_second,
					 created_at, last_used_at, revoked_at
			  FROM api_key WHERE firm_id = ? ORDER BY created_at DESC`,
		args: [firmId]
	});

	return result.rows.map((row) => ({
		keyId: String(row['key_id']),
		label: String(row['label']),
		scopes: String(row['scopes']).split(' ').filter(Boolean),
		accountId: row['account_id'] === null ? null : String(row['account_id']),
		ratePerSecond: Number(row['rate_per_second']),
		createdAt: Number(row['created_at']),
		lastUsedAt: row['last_used_at'] === null ? null : Number(row['last_used_at']),
		revokedAt: row['revoked_at'] === null ? null : Number(row['revoked_at'])
	}));
}
