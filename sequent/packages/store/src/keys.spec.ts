import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { openStore } from './client.ts';
import { createApiKey, InvalidScope, listApiKeys, revokeApiKey } from './keys.ts';
import { viewerFromApiKey } from './tenancy.ts';
import { can } from './authz.ts';

/**
 * API keys.
 *
 * The tests worth reading twice are the ones about what a key *cannot* do: it
 * is never an admin however its scopes are set, and it stops working the moment
 * its firm is suspended. Those are the properties that keep a leaked key from
 * being a catastrophe rather than an incident.
 */

let client: Client;
let directory: string;

beforeEach(async () => {
	// A real file, not `:memory:`. libSQL's `transaction()` opens a *second*
	// connection, and two in-memory connections are two different databases.
	directory = await mkdtemp(join(tmpdir(), 'sequent-keys-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });

	await client.execute({
		sql: 'INSERT INTO firm (firm_id, name, created_at) VALUES (?, ?, ?)',
		args: ['firm-a', 'Northgate', 0]
	});
	await client.execute({
		sql: 'INSERT INTO trading_account (account_id, firm_id, name, created_at) VALUES (?, ?, ?, ?)',
		args: ['acc-a', 'firm-a', 'Equities', 0]
	});
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

describe('minting', () => {
	it('returns a credential in two parts', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		expect(key.secret.startsWith(`${key.keyId}.`)).toBe(true);
		expect(key.keyId.startsWith('ak_')).toBe(true);
	});

	it('never stores the secret', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		const stored = await client.execute('SELECT secret_hash FROM api_key');
		const hash = String(stored.rows[0]?.['secret_hash']);

		// The full credential must not appear anywhere in what was written, and
		// neither must the secret half on its own.
		expect(hash).not.toContain(key.secret.split('.')[1]);
		expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
	});

	it('gives two keys different secrets', async () => {
		const a = await createApiKey(client, { firmId: 'firm-a', label: 'one', scopes: ['read'] });
		const b = await createApiKey(client, { firmId: 'firm-a', label: 'two', scopes: ['read'] });

		expect(a.secret).not.toBe(b.secret);
		expect(a.keyId).not.toBe(b.keyId);
	});

	it('refuses an unknown scope', async () => {
		await expect(
			createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['superuser'] })
		).rejects.toThrow(InvalidScope);
	});

	it('refuses a key with no scopes at all', async () => {
		// It would authenticate and then fail every request, which is a worse
		// afternoon than an error at creation.
		await expect(
			createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: [] })
		).rejects.toThrow();
	});
});

describe('presenting a key', () => {
	it('resolves to a viewer at the right firm', async () => {
		const key = await createApiKey(client, {
			firmId: 'firm-a',
			label: 'algo',
			scopes: ['read', 'trade']
		});

		const resolved = await viewerFromApiKey(client, key.secret, Date.now());

		expect(resolved?.viewer.firmId).toBe('firm-a');
		expect(resolved?.viewer.scopes).toEqual(['read', 'trade']);
	});

	it('rejects the right key id with the wrong secret', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		expect(await viewerFromApiKey(client, `${key.keyId}.wrong`, Date.now())).toBeUndefined();
	});

	it('rejects an id that was never issued', async () => {
		expect(await viewerFromApiKey(client, 'ak_nope.whatever', Date.now())).toBeUndefined();
	});

	it('rejects a credential with no separator', async () => {
		expect(await viewerFromApiKey(client, 'not-a-key', Date.now())).toBeUndefined();
	});

	it('records when it was last used', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });
		await viewerFromApiKey(client, key.secret, 1_700_000_000_000);

		// The update is fire-and-forget, so give the microtask queue a turn.
		await new Promise((resolve) => setImmediate(resolve));

		const stored = await client.execute('SELECT last_used_at FROM api_key');
		expect(Number(stored.rows[0]?.['last_used_at'])).toBe(1_700_000_000_000);
	});
});

describe('what a key may do', () => {
	it('is a trader whatever its scopes say', async () => {
		const key = await createApiKey(client, {
			firmId: 'firm-a',
			label: 'algo',
			scopes: ['read', 'trade', 'admin']
		});

		const resolved = await viewerFromApiKey(client, key.secret, Date.now());

		/*
		 * The `admin` scope did not make it an admin. Scopes narrow what a role can
		 * already do; they never promote. No human reviews what an algorithm
		 * decides at 400 orders a second, so the blast radius of a leaked key must
		 * not include the firm's user list.
		 */
		expect(resolved?.viewer.role).toBe('trader');
		expect(can(resolved!.viewer, 'manage_users').allowed).toBe(false);
	});

	it('cannot trade with a read-only scope', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'reader', scopes: ['read'] });
		const resolved = await viewerFromApiKey(client, key.secret, Date.now());

		expect(can(resolved!.viewer, 'place_order', { accountId: 'acc-a' })).toEqual({
			allowed: false,
			reason: 'missing_scope'
		});
	});

	it('is confined to its pinned account', async () => {
		await client.execute({
			sql: 'INSERT INTO trading_account (account_id, firm_id, name, created_at) VALUES (?, ?, ?, ?)',
			args: ['acc-other', 'firm-a', 'Derivatives', 0]
		});

		const key = await createApiKey(client, {
			firmId: 'firm-a',
			label: 'equities algo',
			scopes: ['trade'],
			accountId: 'acc-a'
		});

		const resolved = await viewerFromApiKey(client, key.secret, Date.now());

		expect(can(resolved!.viewer, 'place_order', { accountId: 'acc-a' }).allowed).toBe(true);
		expect(can(resolved!.viewer, 'place_order', { accountId: 'acc-other' })).toEqual({
			allowed: false,
			reason: 'account_not_assigned'
		});
	});

	it('cannot reach another firm', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });
		const resolved = await viewerFromApiKey(client, key.secret, Date.now());

		expect(can(resolved!.viewer, 'view_orders', { firmId: 'firm-b' })).toEqual({
			allowed: false,
			reason: 'not_found'
		});
	});
});

describe('revocation', () => {
	it('stops the key working', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		expect(await revokeApiKey(client, 'firm-a', key.keyId)).toBe(true);
		expect(await viewerFromApiKey(client, key.secret, Date.now())).toBeUndefined();
	});

	it('keeps the row, so the audit trail survives', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });
		await revokeApiKey(client, 'firm-a', key.keyId, 1234);

		const keys = await listApiKeys(client, 'firm-a');

		// "What was this key allowed to do when it made that trade in March" is a
		// question a deleted row cannot answer.
		expect(keys[0]?.revokedAt).toBe(1234);
		expect(keys[0]?.scopes).toEqual(['read']);
	});

	it('cannot be done by another firm', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		expect(await revokeApiKey(client, 'firm-b', key.keyId)).toBe(false);
		expect(await viewerFromApiKey(client, key.secret, Date.now())).toBeDefined();
	});

	it('is idempotent', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		expect(await revokeApiKey(client, 'firm-a', key.keyId)).toBe(true);
		// Second call changes nothing and says so, rather than throwing at a
		// caller who has already got what they wanted.
		expect(await revokeApiKey(client, 'firm-a', key.keyId)).toBe(false);
	});
});

describe('a suspended firm', () => {
	it('stops its keys immediately, without touching them', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		await client.execute({
			sql: 'UPDATE firm SET is_active = 0 WHERE firm_id = ?',
			args: ['firm-a']
		});

		// Suspending a member must stop their trading now, not at the next time
		// somebody remembers to walk their key list.
		expect(await viewerFromApiKey(client, key.secret, Date.now())).toBeUndefined();
	});
});

describe('listing', () => {
	it('never returns the hash', async () => {
		const key = await createApiKey(client, { firmId: 'firm-a', label: 'algo', scopes: ['read'] });

		const stored = await client.execute('SELECT secret_hash FROM api_key');
		const hash = String(stored.rows[0]?.['secret_hash']);
		const serialised = JSON.stringify(await listApiKeys(client, 'firm-a'));

		/*
		 * The hash is not the secret, but it is what an offline attack runs
		 * against. A list endpoint that returns it turns read access to the admin
		 * page into every key at the firm, given enough GPU time.
		 *
		 * Asserted against the *actual* stored hash and the *actual* secret, not
		 * against a guess at what they look like — a test that checks for the
		 * absence of a pattern passes happily when the pattern changes.
		 */
		expect(serialised).not.toContain(hash);
		expect(serialised).not.toContain(key.secret.split('.')[1]);
		expect(serialised).not.toContain('secretHash');
	});

	it('shows only the asking firm´s keys', async () => {
		await client.execute({
			sql: 'INSERT INTO firm (firm_id, name, created_at) VALUES (?, ?, ?)',
			args: ['firm-b', 'Lowfield', 0]
		});
		await createApiKey(client, { firmId: 'firm-a', label: 'ours', scopes: ['read'] });
		await createApiKey(client, { firmId: 'firm-b', label: 'theirs', scopes: ['read'] });

		const keys = await listApiKeys(client, 'firm-a');

		expect(keys).toHaveLength(1);
		expect(keys[0]?.label).toBe('ours');
	});
});
