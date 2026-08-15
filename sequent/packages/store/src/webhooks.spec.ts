import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { openStore } from './client.ts';
import {
	assertDeliverable,
	createEndpoint,
	deleteEndpoint,
	endpointsFor,
	InvalidEndpointUrl,
	listEndpoints,
	recordFailure,
	recordSuccess,
	sign,
	UnknownWebhookEvent,
	verify
} from './webhooks.ts';

let client: Client;
let directory: string;

const T0 = 1_700_000_000_000;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'sequent-webhooks-'));
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

describe('signing', () => {
	it('round trips', () => {
		const body = JSON.stringify({ event: 'trade.executed' });
		const { header } = sign('whsec_abc', body, T0);

		expect(verify('whsec_abc', body, header, T0)).toBe(true);
	});

	it('rejects a body that was tampered with', () => {
		const { header } = sign('whsec_abc', '{"quantity":100}', T0);

		expect(verify('whsec_abc', '{"quantity":1000000}', header, T0)).toBe(false);
	});

	it('rejects the wrong secret', () => {
		const body = '{"a":1}';
		const { header } = sign('whsec_abc', body, T0);

		expect(verify('whsec_xyz', body, header, T0)).toBe(false);
	});

	it('rejects a replay outside the tolerance window', () => {
		const body = '{"a":1}';
		const { header } = sign('whsec_abc', body, T0);

		/*
		 * The timestamp is inside the signed material, so an attacker who captured
		 * this delivery cannot restamp it — changing `t` invalidates the HMAC.
		 * Signing the body alone would make every captured delivery replayable
		 * forever.
		 */
		expect(verify('whsec_abc', body, header, T0 + 6 * 60_000)).toBe(false);
		expect(verify('whsec_abc', body, header, T0 + 4 * 60_000)).toBe(true);
	});

	it('rejects a forged timestamp', () => {
		const body = '{"a":1}';
		const { header, timestamp } = sign('whsec_abc', body, T0);
		const forged = header.replace(`t=${timestamp}`, `t=${timestamp + 360}`);

		expect(verify('whsec_abc', body, forged, T0 + 6 * 60_000)).toBe(false);
	});

	it('puts seconds on the wire but takes milliseconds in', () => {
		// The wire format is seconds because that is what `t=` means everywhere a
		// receiver has seen it. Everything in this codebase is milliseconds. The
		// conversion lives in `sign`/`verify` so no caller has to remember.
		expect(sign('s', 'b', T0).timestamp).toBe(Math.floor(T0 / 1000));
		expect(sign('s', 'b', T0).header).toContain(`t=${Math.floor(T0 / 1000)}`);
	});

	it('rejects a malformed header without throwing', () => {
		// A verifier that throws on rubbish input is a denial of service on
		// whoever calls it.
		expect(verify('s', 'b', 'garbage', T0)).toBe(false);
		expect(verify('s', 'b', '', T0)).toBe(false);
		expect(verify('s', 'b', 't=abc,v1=def', T0)).toBe(false);
		expect(verify('s', 'b', 't=1', T0)).toBe(false);
	});

	it('rejects a signature of the wrong length without throwing', () => {
		const body = '{"a":1}';
		const { header } = sign('whsec_abc', body, T0);

		// `timingSafeEqual` throws on differing lengths, and a throw is itself a
		// timing signal. Checked before the comparison.
		expect(verify('whsec_abc', body, `${header}ff`, T0)).toBe(false);
	});

	it('is versioned, so the scheme can change', () => {
		expect(sign('s', 'b', T0).header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
	});
});

/* -------------------------------------------------------------------------- */

describe('URL safety', () => {
	it('accepts an ordinary https URL', () => {
		expect(assertDeliverable('https://api.northgate.example/hooks').hostname).toBe(
			'api.northgate.example'
		);
	});

	it('refuses plain http', () => {
		expect(() => assertDeliverable('http://api.example.com/hooks')).toThrow(InvalidEndpointUrl);
	});

	it('refuses the cloud metadata endpoint', () => {
		/*
		 * The canonical SSRF target. Without this check, a member can have our
		 * server fetch the cloud provider's instance credentials on their behalf.
		 */
		expect(() => assertDeliverable('https://169.254.169.254/latest/meta-data/')).toThrow(
			InvalidEndpointUrl
		);
	});

	it('refuses loopback and private ranges', () => {
		for (const url of [
			'https://localhost/hooks',
			'https://127.0.0.1/hooks',
			'https://10.0.0.5/hooks',
			'https://192.168.1.1/hooks',
			'https://172.16.0.1/hooks',
			'https://[::1]/hooks',
			'https://[fe80::1]/hooks',
			'https://[fd00::1]/hooks',
			// An IPv6 address that resolves to IPv4 loopback. The form that gets
			// past checks which only know one address family.
			'https://[::ffff:127.0.0.1]/hooks'
		]) {
			expect(() => assertDeliverable(url), url).toThrow(InvalidEndpointUrl);
		}
	});

	it('allows 172.32, which is outside the private range', () => {
		// The private block is 172.16–172.31. A regex of `^172\.` would be wrong
		// and would refuse a legitimate address.
		expect(assertDeliverable('https://172.32.0.1/hooks').hostname).toBe('172.32.0.1');
	});

	it('refuses link-local even with the development escape hatch open', () => {
		/*
		 * `allowInsecure` lets a student webhook their own laptop. It must not also
		 * let anybody reach the cloud metadata service — and it did, until a
		 * browser test noticed the admin form accepting `169.254.169.254` on a dev
		 * server.
		 */
		expect(() =>
			assertDeliverable('http://169.254.169.254/latest/meta-data/', { allowInsecure: true })
		).toThrow(InvalidEndpointUrl);

		expect(() => assertDeliverable('http://[fe80::1]/hooks', { allowInsecure: true })).toThrow(
			InvalidEndpointUrl
		);

		// And the hatch still does what it is for.
		expect(assertDeliverable('http://localhost:3000/hooks', { allowInsecure: true }).port).toBe(
			'3000'
		);
	});

	it('refuses credentials in the URL', () => {
		expect(() => assertDeliverable('https://user:pass@example.com/hooks')).toThrow(
			InvalidEndpointUrl
		);
	});

	it('refuses something that is not a URL at all', () => {
		expect(() => assertDeliverable('not a url')).toThrow(InvalidEndpointUrl);
	});
});

/* -------------------------------------------------------------------------- */

describe('endpoints', () => {
	it('is created with a secret', async () => {
		const endpoint = await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/hooks',
			events: ['trade.executed'],
			now: T0
		});

		expect(endpoint.secret).toMatch(/^whsec_/);
		expect(endpoint.endpointId).toMatch(/^whe_/);
	});

	it('refuses an unknown event', async () => {
		await expect(
			createEndpoint(client, {
				firmId: 'firm-a',
				url: 'https://api.example.com/hooks',
				events: ['everything']
			})
		).rejects.toThrow(UnknownWebhookEvent);
	});

	it('refuses an empty subscription', async () => {
		await expect(
			createEndpoint(client, { firmId: 'firm-a', url: 'https://api.example.com/h', events: [] })
		).rejects.toThrow();
	});

	it('matches only the events it subscribed to', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/trades',
			events: ['trade.executed']
		});

		expect(await endpointsFor(client, 'firm-a', 'trade.executed')).toHaveLength(1);
		expect(await endpointsFor(client, 'firm-a', 'order.accepted')).toHaveLength(0);
	});

	it('does not match a prefix of a subscribed event', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/h',
			events: ['order.accepted']
		});

		// The LIKE is padded with spaces on both sides for exactly this: without
		// the padding, `order.accept` would match `order.accepted`.
		expect(await endpointsFor(client, 'firm-a', 'order.accept')).toHaveLength(0);
	});

	it('matches a middle entry in a multi-event subscription', async () => {
		await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/h',
			events: ['order.accepted', 'trade.executed', 'order.cancelled']
		});

		expect(await endpointsFor(client, 'firm-a', 'trade.executed')).toHaveLength(1);
		expect(await endpointsFor(client, 'firm-a', 'order.cancelled')).toHaveLength(1);
	});

	it('never returns another firm´s endpoints', async () => {
		await createEndpoint(client, {
			firmId: 'firm-b',
			url: 'https://api.other.example/h',
			events: ['trade.executed']
		});

		expect(await endpointsFor(client, 'firm-a', 'trade.executed')).toHaveLength(0);
		expect(await listEndpoints(client, 'firm-a')).toHaveLength(0);
	});

	it('stops matching once deleted', async () => {
		const endpoint = await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/h',
			events: ['trade.executed']
		});

		expect(await deleteEndpoint(client, 'firm-a', endpoint.endpointId)).toBe(true);
		expect(await endpointsFor(client, 'firm-a', 'trade.executed')).toHaveLength(0);

		// Deactivated, not deleted — the delivery history still references it.
		expect(await listEndpoints(client, 'firm-a')).toHaveLength(1);
	});

	it('cannot be deleted by another firm', async () => {
		const endpoint = await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://api.example.com/h',
			events: ['trade.executed']
		});

		expect(await deleteEndpoint(client, 'firm-b', endpoint.endpointId)).toBe(false);
	});
});

/* -------------------------------------------------------------------------- */

describe('failing endpoints', () => {
	it('is switched off after enough consecutive failures', async () => {
		const endpoint = await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://gone.example/h',
			events: ['trade.executed']
		});

		let disabled = false;
		for (let attempt = 0; attempt < 20; attempt += 1) {
			({ disabled } = await recordFailure(client, endpoint.endpointId, 20));
		}

		expect(disabled).toBe(true);
		expect(await endpointsFor(client, 'firm-a', 'trade.executed')).toHaveLength(0);
	});

	it('is not switched off one failure early', async () => {
		const endpoint = await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://flaky.example/h',
			events: ['trade.executed']
		});

		for (let attempt = 0; attempt < 19; attempt += 1) {
			await recordFailure(client, endpoint.endpointId, 20);
		}

		expect(await endpointsFor(client, 'firm-a', 'trade.executed')).toHaveLength(1);
	});

	it('has its counter reset by a success', async () => {
		const endpoint = await createEndpoint(client, {
			firmId: 'firm-a',
			url: 'https://flaky.example/h',
			events: ['trade.executed']
		});

		for (let attempt = 0; attempt < 19; attempt += 1) {
			await recordFailure(client, endpoint.endpointId, 20);
		}
		await recordSuccess(client, endpoint.endpointId, T0);

		// Nineteen failures then a success is a flaky receiver, not a dead one.
		// Without the reset, one more failure at any point in the future kills it.
		for (let attempt = 0; attempt < 19; attempt += 1) {
			await recordFailure(client, endpoint.endpointId, 20);
		}

		expect(await endpointsFor(client, 'firm-a', 'trade.executed')).toHaveLength(1);
	});
});
