import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import {
	claim,
	createEndpoint,
	enqueue,
	listEndpoints,
	openStore,
	verify,
	withTransaction,
	type ClaimedMessage
} from '@sequent/store';
import { deliverEmail, deliverWebhook, type Fetch } from './deliver.ts';

/**
 * Delivery, with a fake `fetch`.
 *
 * Every interesting case here — a receiver that hangs, one that 500s, one that
 * redirects to localhost — would be miserable to arrange against a real HTTP
 * server, and several of them are impossible to arrange reliably. Passing
 * `fetch` in as a parameter is what makes them one line each.
 */

let client: Client;
let directory: string;

const T0 = 1_700_000_000_000;
const now = () => T0;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-deliver-'));
	client = await openStore({ url: `file:${join(directory, 'test.db')}` });

	for (const firmId of ['firm-a', 'firm-b']) {
		await client.execute({
			sql: 'INSERT INTO firm (firm_id, name, created_at) VALUES (?, ?, ?)',
			args: [firmId, firmId, 0]
		});
	}
});

afterEach(async () => {
	client.close();
	await rm(directory, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */

/** A `fetch` that records what it was asked to do and answers as instructed. */
function fakeFetch(reply: (url: string) => Response | Promise<Response>) {
	const calls: Array<{ url: string; headers: Headers; body: string }> = [];

	const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		calls.push({
			url,
			headers: new Headers(init?.headers),
			body: String(init?.body ?? '')
		});
		return reply(url);
	}) as Fetch;

	return { fetch, calls };
}

const ok = () => new Response('', { status: 200 });

async function queue(
	message: { kind: string; firmId?: string | undefined; payload: unknown; key?: string },
	seq = 1
): Promise<ClaimedMessage> {
	await withTransaction(client, (tx) =>
		enqueue(
			tx,
			{
				kind: message.kind,
				seq,
				firmId: message.firmId,
				idempotencyKey: message.key ?? `key-${seq}-${Math.random()}`,
				payload: message.payload
			},
			T0
		)
	);

	const [claimed] = await claim(client, 'test-worker', { limit: 1, now: T0 });
	return claimed!;
}

const tradePayload = {
	event: 'trade.executed',
	seq: 1,
	at: T0,
	data: { tradeId: 'T-1', quantity: 100 }
};

/* -------------------------------------------------------------------------- */

describe('delivering a webhook', () => {
	it('posts to a subscribed endpoint', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch, calls } = fakeFetch(ok);
		const message = await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload });

		const outcome = await deliverWebhook(client, message, { fetch, now });

		expect(outcome).toMatchObject({ delivered: 1, failed: 0, retry: false });
		expect(calls[0]?.url).toBe('https://api.example.com/hooks');
	});

	it('signs the body so the receiver can verify it', async () => {
		const endpoint = await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch, calls } = fakeFetch(ok);
		await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		const call = calls[0]!;
		const header = call.headers.get('Sequent-Signature')!;

		expect(verify(endpoint.secret, call.body, header, T0)).toBe(true);
		// And a different secret must not verify, or the signature proves nothing.
		expect(verify('whsec_wrong', call.body, header, T0)).toBe(false);
	});

	it('sends a stable delivery id, so a retry is recognisable', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const message = await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload });

		const first = fakeFetch(() => new Response('', { status: 500 }));
		await deliverWebhook(client, message, { fetch: first.fetch, now });

		const second = fakeFetch(ok);
		await deliverWebhook(client, message, { fetch: second.fetch, now });

		/*
		 * The same id on both attempts. Random per attempt would make de-duplication
		 * impossible at the receiver's end, which would make at-least-once delivery
		 * useless to them.
		 */
		expect(second.calls[0]?.headers.get('Sequent-Delivery-Id')).toBe(
			first.calls[0]?.headers.get('Sequent-Delivery-Id')
		);
	});

	it('does not post to an endpoint subscribed to something else', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/orders-only',
			events: ['order.accepted']
		});

		const { fetch, calls } = fakeFetch(ok);
		const outcome = await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		expect(calls).toHaveLength(0);
		// No destination is a success. Retrying it would keep the message in the
		// queue forever waiting for a subscriber that may never appear.
		expect(outcome.retry).toBe(false);
	});

	it('never posts one firm´s event to another firm´s endpoint', async () => {
		await createEndpoint(client, {
			firmId: 'firm-b',
			url: 'https://api.other.example/hooks',
			events: ['trade.executed']
		});

		const { fetch, calls } = fakeFetch(ok);
		await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		expect(calls).toHaveLength(0);
	});

	it('fans a venue-wide message out to every subscribed firm', async () => {
		for (const firmId of ['firm-a', 'firm-b']) {
			await createEndpoint(client, {
				firmId,
				url: `https://${firmId}.example/hooks`,
				events: ['instrument.phase_changed']
			});
		}

		const { fetch, calls } = fakeFetch(ok);
		const outcome = await deliverWebhook(
			client,
			await queue({
				kind: 'webhook',
				firmId: undefined,
				payload: { event: 'instrument.phase_changed', seq: 1, at: T0, data: { to: 'continuous' } }
			}),
			{ fetch, now }
		);

		// Resolved here, at delivery time — which is what lets a firm that
		// subscribed a minute ago receive the next one.
		expect(outcome.delivered).toBe(2);
		expect(calls.map((c) => c.url).sort()).toEqual([
			'https://firm-a.example/hooks',
			'https://firm-b.example/hooks'
		]);
	});
});

describe('when the receiver misbehaves', () => {
	it('retries a 500', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch } = fakeFetch(() => new Response('boom', { status: 500 }));
		const outcome = await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		expect(outcome).toMatchObject({ delivered: 0, failed: 1, retry: true });
		expect(outcome.error).toContain('500');
	});

	it('retries a 4xx as well', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch } = fakeFetch(() => new Response('nope', { status: 404 }));
		const outcome = await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		/*
		 * A 404 from a webhook receiver usually means their route is not deployed
		 * yet, not that the message is invalid. Treating 4xx as permanent would
		 * drop every message sent during somebody else's bad deploy.
		 */
		expect(outcome.retry).toBe(true);
	});

	it('retries a connection failure', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch } = fakeFetch(() => Promise.reject(new Error('ECONNREFUSED')));
		const outcome = await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		expect(outcome).toMatchObject({ retry: true });
		expect(outcome.error).toContain('ECONNREFUSED');
	});

	it('does not follow a redirect', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch, calls } = fakeFetch(
			() => new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } })
		);

		const outcome = await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		// `redirect: 'manual'` — a 3xx to somewhere else is how an SSRF check made
		// at registration time gets bypassed at delivery time.
		expect(calls[0]?.url).toBe('https://api.example.com/hooks');
		expect(outcome.retry).toBe(true);
	});

	it('sets a timeout, so one slow receiver cannot hold a worker forever', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://slow.example/hooks',
			events: ['trade.executed']
		});

		let sawSignal: AbortSignal | undefined;
		const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			sawSignal = init?.signal ?? undefined;
			return ok();
		}) as Fetch;

		await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now, timeoutMs: 5000 }
		);

		expect(sawSignal).toBeInstanceOf(AbortSignal);
	});
});

describe('partial success', () => {
	it('does not retry the message when one of several endpoints worked', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://good.example/hooks',
			events: ['trade.executed']
		});
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://bad.example/hooks',
			events: ['trade.executed']
		});

		const { fetch } = fakeFetch((url) =>
			url.includes('good') ? ok() : new Response('', { status: 503 })
		);

		const outcome = await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		/*
		 * Retrying would re-post to the endpoint that already succeeded, on every
		 * attempt, for as long as the broken one stays broken.
		 */
		expect(outcome).toMatchObject({ delivered: 1, failed: 1, retry: false });
	});

	it('retries when nothing got through', async () => {
		for (const host of ['one', 'two']) {
			await createEndpoint(client, {
				firmId: 'firm-a',
				url: `https://${host}.example/hooks`,
				events: ['trade.executed']
			});
		}

		const { fetch } = fakeFetch(() => new Response('', { status: 503 }));
		const outcome = await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		expect(outcome).toMatchObject({ delivered: 0, failed: 2, retry: true });
	});
});

describe('endpoint health', () => {
	it('records a failure against the endpoint', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch } = fakeFetch(() => new Response('', { status: 500 }));
		await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		expect((await listEndpoints(client, 'firm-a'))[0]?.consecutiveFailures).toBe(1);
	});

	it('resets the counter on a success', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const bad = fakeFetch(() => new Response('', { status: 500 }));
		await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }, 1),
			{ fetch: bad.fetch, now }
		);

		const good = fakeFetch(ok);
		await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }, 2),
			{ fetch: good.fetch, now }
		);

		const endpoint = (await listEndpoints(client, 'firm-a'))[0];
		expect(endpoint?.consecutiveFailures).toBe(0);
		expect(endpoint?.lastSuccessAt).toBe(T0);
	});

	it('records every attempt, so "we never got the fill" has an answer', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed']
		});

		const { fetch } = fakeFetch(ok);
		await deliverWebhook(
			client,
			await queue({ kind: 'webhook', firmId: 'firm-a', payload: tradePayload }),
			{ fetch, now }
		);

		const deliveries = await client.execute('SELECT * FROM webhook_delivery');
		expect(deliveries.rows).toHaveLength(1);
		expect(String(deliveries.rows[0]?.['status'])).toBe('delivered');
	});
});

describe('email', () => {
	beforeEach(async () => {
		const people = [
			['u1', 'ada@firm-a.test', 'trader'],
			['u2', 'rhys@firm-a.test', 'risk_manager'],
			['u3', 'mira@firm-a.test', 'firm_admin']
		];

		for (const [userId, email, role] of people) {
			await client.execute({
				sql: `INSERT INTO venue_user (user_id, firm_id, email, display_name, password_hash, role, created_at)
				      VALUES (?, 'firm-a', ?, ?, 'x', ?, 0)`,
				args: [userId!, email!, email!, role!]
			});
		}
	});

	it('goes to the people who can act on it, not everybody', async () => {
		const sent: string[] = [];

		await deliverEmail(
			client,
			await queue({
				kind: 'email',
				firmId: 'firm-a',
				payload: {
					template: 'kill_switch',
					firmId: 'firm-a',
					subject: 'Trading halted',
					data: {}
				}
			}),
			{ now, log: (line) => sent.push(line) }
		);

		/*
		 * The trader is not on the list. Their orders were just pulled — they will
		 * find out in four seconds by looking at their screen. The people who need
		 * an email are the ones who have to decide what to do about it.
		 */
		expect(sent).toHaveLength(2);
		expect(sent.join(' ')).not.toContain('ada@');
		expect(sent.join(' ')).toContain('rhys@');
	});

	it('does not send twice for the same message', async () => {
		const message = await queue({
			kind: 'email',
			firmId: 'firm-a',
			payload: { template: 'kill_switch', firmId: 'firm-a', subject: 'Halted', data: {} }
		});

		await deliverEmail(client, message, { now, log: () => {} });
		await deliverEmail(client, message, { now, log: () => {} });

		// The email id is derived from (outboxId, recipient), so a retry after a
		// crash does not look like a second email.
		const rows = await client.execute('SELECT * FROM email_sent');
		expect(rows.rows).toHaveLength(2);
	});

	it('succeeds when the firm has nobody to tell', async () => {
		const outcome = await deliverEmail(
			client,
			await queue({
				kind: 'email',
				firmId: 'firm-b',
				payload: { template: 'kill_switch', firmId: 'firm-b', subject: 'Halted', data: {} }
			}),
			{ now, log: () => {} }
		);

		expect(outcome.retry).toBe(false);
	});
});
