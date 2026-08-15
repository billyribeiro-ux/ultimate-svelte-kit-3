import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { openStore } from './client.ts';
import { FLAGS, Flags, flagHistory, listFlags, setFlag, UnknownFlag } from './flags.ts';
import { health, logLine, THRESHOLDS, verdict, type Health } from './observe.ts';

let client: Client;
let directory: string;

const T0 = 1_700_000_000_000;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-flags-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

describe('reading a flag', () => {
	it('falls back to the declared default when nothing is stored', async () => {
		const flags = new Flags(client);

		expect(await flags.enabled('accept_orders')).toBe(true);
		expect(await flags.enabled('new_firm_signup')).toBe(false);
	});

	it('reads what was set', async () => {
		await setFlag(client, 'accept_orders', false, { by: 'rhys', reason: 'incident 42' });

		expect(await new Flags(client).enabled('accept_orders')).toBe(false);
	});

	it('caches, so a busy venue does not query per request', async () => {
		const flags = new Flags(client, 5_000);

		expect(await flags.enabled('accept_orders', T0)).toBe(true);
		await setFlag(client, 'accept_orders', false, { by: 'rhys', reason: 'incident' });

		// Still the cached value inside the window.
		expect(await flags.enabled('accept_orders', T0 + 4_999)).toBe(true);
		// And the new one once it expires.
		expect(await flags.enabled('accept_orders', T0 + 5_001)).toBe(false);
	});

	it('does not throw when the database is unreachable', async () => {
		const flags = new Flags(client);
		expect(await flags.enabled('accept_orders', T0)).toBe(true);

		client.close();

		/*
		 * Falls back to the last known value rather than to `false`.
		 *
		 * "Database unreachable" and "somebody turned this off" are different
		 * facts. Conflating them means a blip in the flag store halts trading —
		 * an outage caused entirely by the mechanism meant to prevent one.
		 */
		expect(await flags.enabled('accept_orders', T0 + 100_000)).toBe(true);

		// And a flag never read before falls back to its declared default.
		expect(await flags.enabled('deliver_webhooks', T0 + 100_000)).toBe(true);
	});
});

describe('setting a flag', () => {
	it('refuses an undeclared name', async () => {
		/*
		 * A free-form key-value store makes a typo permanent and silent: the
		 * feature simply never turns on, and nothing anywhere says why.
		 */
		await expect(
			setFlag(client, 'accpet_orders', false, { by: 'rhys', reason: 'typo' })
		).rejects.toThrow(UnknownFlag);
	});

	it('requires a reason', async () => {
		// "Why is this off" is the question somebody has six weeks later, and a
		// blank field cannot answer it.
		await expect(
			setFlag(client, 'accept_orders', false, { by: 'rhys', reason: '   ' })
		).rejects.toThrow(/reason/);
	});

	it('records who and why', async () => {
		await setFlag(client, 'deliver_webhooks', false, {
			by: 'rhys',
			reason: 'receiver at Lowfield is 500ing',
			now: T0
		});

		const flag = (await listFlags(client)).find((f) => f.name === 'deliver_webhooks');

		expect(flag?.changedBy).toBe('rhys');
		expect(flag?.reason).toContain('Lowfield');
		expect(flag?.changedAt).toBe(T0);
	});

	it('keeps the history, not just the latest value', async () => {
		await setFlag(client, 'accept_orders', false, { by: 'rhys', reason: 'incident 42', now: T0 });
		await setFlag(client, 'accept_orders', true, { by: 'mira', reason: 'resolved', now: T0 + 1000 });

		const history = await flagHistory(client);

		// The current row was upserted and lost the first reason. The append-only
		// table is what remembers there was an incident at all.
		expect(history).toHaveLength(2);
		expect(history[0]?.reason).toBe('resolved');
		expect(history[1]?.reason).toBe('incident 42');
	});
});

describe('listing', () => {
	it('shows every declared flag, including ones never set', async () => {
		const flags = await listFlags(client);

		/*
		 * Driven by the declaration, not the table. Somebody asking "what can I
		 * turn off during an incident" needs the whole list, and listing the table
		 * would show only what has already been touched.
		 */
		expect(flags).toHaveLength(Object.keys(FLAGS).length);
		expect(flags.every((flag) => flag.isDefault)).toBe(true);
	});

	it('marks which ones have been changed from their default', async () => {
		await setFlag(client, 'accept_orders', false, { by: 'rhys', reason: 'incident' });

		const flags = await listFlags(client);
		const changed = flags.filter((flag) => !flag.isDefault);

		expect(changed.map((flag) => flag.name)).toEqual(['accept_orders']);
	});

	it('carries the description, so the list explains itself', async () => {
		const flags = await listFlags(client);
		expect(flags.every((flag) => flag.description.length > 10)).toBe(true);
	});
});

/* -------------------------------------------------------------------------- */

const healthy: Health = {
	engineLag: 0,
	projectorLag: 0,
	outboxAgeMs: 0,
	outboxPending: 0,
	outboxDead: 0,
	trialBalance: 0,
	lastSeq: 100,
	checkedAt: T0
};

describe('health', () => {
	it('reads zero lag on a fresh venue', async () => {
		const status = await health(client, T0);

		expect(status.engineLag).toBe(0);
		expect(status.projectorLag).toBe(0);
		expect(status.trialBalance).toBe(0);
	});

	it('measures the engine falling behind', async () => {
		await client.execute({
			sql: `INSERT INTO command_log (seq, received_at, version, kind, firm_id, body)
			      VALUES (?, ?, 1, 'tick', 'venue', '{}')`,
			args: [50, T0]
		});
		await client.execute({
			sql: 'INSERT INTO consumer_checkpoint (consumer, last_seq, updated_at) VALUES (?, ?, ?)',
			args: ['engine', 20, T0]
		});

		expect((await health(client, T0)).engineLag).toBe(30);
	});
});

describe('the verdict', () => {
	it('is ok when everything is keeping up', () => {
		expect(verdict(healthy).level).toBe('ok');
	});

	it('is degraded when the engine is behind, and down when it is far behind', () => {
		expect(verdict({ ...healthy, engineLag: THRESHOLDS.engineLagDegraded }).level).toBe('degraded');
		expect(verdict({ ...healthy, engineLag: THRESHOLDS.engineLagDown }).level).toBe('down');
	});

	it('is down whenever the ledger does not balance, however small the amount', () => {
		/*
		 * The one threshold that is not a matter of degree. Lag is a judgement
		 * about tolerance; a ledger that does not balance means money has been
		 * created or destroyed, and no amount of that is acceptable.
		 */
		expect(verdict({ ...healthy, trialBalance: 1 }).level).toBe('down');
		expect(verdict({ ...healthy, trialBalance: -1 }).level).toBe('down');
	});

	it('does not go red just because a member´s webhook URL is wrong', () => {
		// A health check that goes down over somebody else's misconfiguration is a
		// health check people learn to ignore.
		const status = verdict({ ...healthy, outboxDead: 12 });

		expect(status.level).toBe('ok');
		expect(status.problems.join(' ')).toContain('12 messages');
	});

	it('reports every problem, not only the worst', () => {
		const status = verdict({
			...healthy,
			engineLag: 600,
			projectorLag: 1_200,
			trialBalance: 5
		});

		expect(status.level).toBe('down');
		expect(status.problems).toHaveLength(3);
	});

	it('never lowers the level once something is down', () => {
		// A `down` followed by a `degraded` check must stay down.
		const status = verdict({ ...healthy, trialBalance: 5, engineLag: 600 });
		expect(status.level).toBe('down');
	});
});

describe('structured logs', () => {
	it('emits one line of JSON', () => {
		const line = logLine('info', 'order accepted', { orderId: 'O-1', seq: 42 });

		expect(JSON.parse(line)).toEqual({
			level: 'info',
			message: 'order accepted',
			orderId: 'O-1',
			seq: 42
		});
	});

	it('redacts anything that looks like a credential', () => {
		const line = logLine('info', 'authenticated', {
			userId: 'u1',
			secret: 'whsec_hunter2',
			authorization: 'Bearer ak_x.y'
		});

		expect(line).not.toContain('hunter2');
		expect(line).not.toContain('ak_x.y');
		expect(JSON.parse(line).userId).toBe('u1');
	});

	it('drops undefined rather than serialising it', () => {
		// `{"aggressor":null}` and a missing key mean different things; an
		// `undefined` that JSON silently drops means neither on purpose.
		expect(JSON.parse(logLine('info', 'x', { a: undefined, b: null }))).toEqual({
			level: 'info',
			message: 'x',
			b: null
		});
	});
});
