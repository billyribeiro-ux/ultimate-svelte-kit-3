/**
 * Webhooks: telling somebody else's server what happened, safely.
 *
 * ## Why the secret is stored in clear, when the API key's is not
 *
 * An API key's secret is scrypt-hashed, because we only ever need to *verify*
 * one somebody presents. A webhook secret is different: we have to **compute**
 * a signature with it on every delivery, so we need the original bytes. It
 * cannot be hashed, and pretending otherwise produces a system that cannot
 * sign.
 *
 * That asymmetry is worth internalising, because it is regularly got wrong in
 * both directions — passwords stored reversibly "in case we need them", and
 * signing keys hashed on the theory that hashing is always safer.
 *
 * What follows from it is that this table is more sensitive than `api_key`: a
 * dump of it lets somebody forge our webhooks to our members. In production
 * these belong in a KMS or encrypted at rest with a key the database does not
 * hold. That is out of scope here, and saying so is better than a comment
 * claiming it is fine.
 *
 * ## What the signature is for
 *
 * A webhook arrives at a URL that is usually public. Without a signature, the
 * receiver has no way to tell our delivery from anybody else's POST — and
 * "trades happened" messages that anyone can forge are worse than none.
 *
 * So we sign `timestamp.body` with HMAC-SHA256 and send both. The receiver
 * recomputes it. Two details matter:
 *
 *   The **timestamp is inside the signed material**. Signing only the body
 *   means a delivery captured once can be replayed forever; with the timestamp
 *   signed, the receiver can reject anything older than a few minutes and an
 *   attacker cannot restamp it.
 *
 *   Comparison at the receiver must be **constant time**. That is their job,
 *   not ours, but the documentation says so because a receiver using `===`
 *   leaks the expected signature one byte at a time.
 */

import type { Client } from '@libsql/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/* -------------------------------------------------------------------------- */
/* What can be subscribed to                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The event types a firm may subscribe to.
 *
 * A closed list, and deliberately smaller than the engine's event union. Not
 * every internal event is something a member should receive: `phase_changed`
 * is public and useful, while the engine's own bookkeeping is not. Publishing
 * an event type is a promise to keep sending it.
 */
export const WEBHOOK_EVENTS = [
	'order.accepted',
	'order.rejected',
	'order.cancelled',
	'order.filled',
	'trade.executed',
	'instrument.phase_changed',
	'risk.kill_switch_engaged'
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export class UnknownWebhookEvent extends Error {
	constructor(event: string) {
		super(`Unknown webhook event: ${event}`);
		this.name = 'UnknownWebhookEvent';
	}
}

/* -------------------------------------------------------------------------- */
/* Signing                                                                     */
/* -------------------------------------------------------------------------- */

export interface Signature {
	readonly header: string;
	/** Unix **seconds**, as it appears on the wire. */
	readonly timestamp: number;
}

/**
 * The `Sequent-Signature` header for a delivery.
 *
 * Versioned as `t=<unix-seconds>,v1=<hex>`, copying the shape Stripe
 * popularised — not out of deference, but because a receiver's parsing code is
 * the hardest thing in the world to change once written, and a version prefix
 * is what lets the signing scheme move without breaking every integration.
 *
 * ## One unit in the API, another on the wire
 *
 * `at` is **milliseconds**, like every other timestamp in this codebase. The
 * header carries **seconds**, because that is what `t=` means everywhere a
 * receiver has seen it before.
 *
 * The conversion happens here, once, in both directions. An earlier version
 * left it to the caller and the caller got it wrong immediately: the signer
 * passed seconds, `verify` compared them against a millisecond clock, and every
 * signature failed the freshness check while the HMAC itself was perfect —
 * which is an entertaining afternoon to spend debugging.
 */
export function sign(secret: string, body: string, at: number): Signature {
	const timestamp = Math.floor(at / 1000);
	const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

	return { header: `t=${timestamp},v1=${digest}`, timestamp };
}

/**
 * Verify a signature the way a receiver should.
 *
 * Exported because it belongs in the documentation, and because a signing
 * scheme with no reference verifier is one every integrator implements slightly
 * differently and slightly wrong.
 *
 * `toleranceMs` is the replay window. Five minutes is enough for clock skew
 * between two servers and short enough that a captured delivery is stale before
 * anybody can use it.
 */
export function verify(
	secret: string,
	body: string,
	header: string,
	now: number,
	toleranceMs = 5 * 60_000
): boolean {
	const parts = new Map(
		header.split(',').map((part) => {
			const index = part.indexOf('=');
			return [part.slice(0, index), part.slice(index + 1)] as const;
		})
	);

	const seconds = Number(parts.get('t'));
	const presented = parts.get('v1');

	if (!Number.isFinite(seconds) || presented === undefined) return false;

	// Seconds on the wire, milliseconds in `now`. Converted here rather than
	// asking every caller to remember which side is which.
	if (Math.abs(now - seconds * 1000) > toleranceMs) return false;

	const expected = createHmac('sha256', secret).update(`${seconds}.${body}`).digest('hex');

	// Lengths must match before `timingSafeEqual`, which throws on a mismatch —
	// and a throw is itself a timing signal.
	if (presented.length !== expected.length) return false;

	return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

export interface Endpoint {
	readonly endpointId: string;
	readonly firmId: string;
	readonly url: string;
	readonly secret: string;
	readonly events: readonly string[];
	readonly isActive: boolean;
	readonly createdAt: number;
	readonly lastSuccessAt: number | null;
	readonly consecutiveFailures: number;
}

export class InvalidEndpointUrl extends Error {
	constructor(url: string, why: string) {
		super(`Refusing that webhook URL (${why}): ${url}`);
		this.name = 'InvalidEndpointUrl';
	}
}

/**
 * Check a URL before we agree to send anything to it.
 *
 * ## This is SSRF prevention, and it is not optional
 *
 * A webhook URL is an address chosen by a user that our server will then make
 * requests to. That is *server-side request forgery* by construction: without
 * checks, a member can point a webhook at `http://169.254.169.254/` and have us
 * fetch the cloud provider's instance credentials on their behalf, or at
 * `http://localhost:8080/admin` and reach services that are only "safe" because
 * they are not exposed.
 *
 * The rules here are the minimum: HTTPS only, no credentials in the URL, and no
 * private or loopback addresses. In production the DNS resolution must also be
 * checked at request time — a hostname that resolves publicly now can resolve
 * to 127.0.0.1 on the next lookup, which is the DNS-rebinding version of the
 * same attack — and the outbound request should go through a proxy that
 * enforces it. Named because the gap should be visible, not because it is fine.
 */
export function assertDeliverable(url: string, { allowInsecure = false } = {}): URL {
	let parsed: URL;

	try {
		parsed = new URL(url);
	} catch {
		throw new InvalidEndpointUrl(url, 'not a URL');
	}

	if (parsed.protocol !== 'https:' && !(allowInsecure && parsed.protocol === 'http:')) {
		throw new InvalidEndpointUrl(url, 'must be https');
	}

	// Credentials in a URL end up in logs, in error messages, and in the browser
	// history of whoever pasted it into the admin form.
	if (parsed.username || parsed.password) {
		throw new InvalidEndpointUrl(url, 'must not contain credentials');
	}

	/*
	 * `URL.hostname` keeps the brackets around an IPv6 literal — `[::1]`, not
	 * `::1`. An earlier version compared against the bare form, so every IPv6
	 * loopback and link-local address sailed straight through a check that looked
	 * complete. Stripping them is one line and it was the difference between this
	 * function working and merely appearing to.
	 */
	const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

	if (isPrivateHost(host) && !allowInsecure) {
		throw new InvalidEndpointUrl(url, 'private address');
	}

	return parsed;
}

/**
 * Is this host somewhere our own network can reach but the internet cannot?
 *
 * Both address families, because supporting only IPv4 is the same as supporting
 * neither: an attacker picks whichever one is unchecked.
 *
 * The IPv4-mapped IPv6 form (`::ffff:127.0.0.1`) is the one that catches people
 * out. It is an IPv6 address that a socket resolves to an IPv4 destination, so
 * a check that reads it as "some IPv6 host, not in my private list" lets a
 * connection to localhost through.
 */
function isPrivateHost(host: string): boolean {
	if (host === 'localhost' || host.endsWith('.localhost')) return true;

	// IPv6, including the unspecified address and IPv4-mapped forms.
	if (host === '::1' || host === '::') return true;
	if (/^fe[89ab]/.test(host)) return true; // fe80::/10, link-local
	if (/^f[cd]/.test(host)) return true; // fc00::/7, unique local

	/*
	 * IPv4-mapped IPv6, and the reason this needs its own branch.
	 *
	 * `https://[::ffff:127.0.0.1]/` looks like it would be caught by recursing on
	 * the dotted part, and it is not — the WHATWG URL parser **normalises** it to
	 * `::ffff:7f00:1`, the hex form. So by the time we see the hostname, the
	 * dotted quad is gone and a string check for `127.` finds nothing.
	 *
	 * The last two hextets are the IPv4 address. Reassembling them is the only
	 * way to notice that this address points at localhost.
	 */
	if (host.startsWith('::ffff:')) {
		const rest = host.slice('::ffff:'.length);
		if (rest.includes('.')) return isPrivateHost(rest);

		const groups = rest.split(':');
		if (groups.length === 2) {
			const high = Number.parseInt(groups[0]!, 16);
			const low = Number.parseInt(groups[1]!, 16);

			if (Number.isFinite(high) && Number.isFinite(low)) {
				return isPrivateHost(
					`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
				);
			}
		}
	}

	// IPv4.
	return (
		host === '0.0.0.0' ||
		/^127\./.test(host) ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^169\.254\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host)
	);
}

export async function createEndpoint(
	client: Client,
	input: {
		firmId: string;
		url: string;
		events: readonly string[];
		now?: number;
		allowInsecure?: boolean;
	}
): Promise<Endpoint> {
	for (const event of input.events) {
		if (!WEBHOOK_EVENTS.includes(event as WebhookEvent)) throw new UnknownWebhookEvent(event);
	}

	if (input.events.length === 0) {
		throw new Error('An endpoint must subscribe to at least one event.');
	}

	assertDeliverable(input.url, { allowInsecure: input.allowInsecure ?? false });

	const endpointId = `whe_${randomBytes(9).toString('base64url')}`;
	const secret = `whsec_${randomBytes(24).toString('base64url')}`;
	const now = input.now ?? Date.now();

	await client.execute({
		sql: `INSERT INTO webhook_endpoint (endpoint_id, firm_id, url, secret, events, created_at)
		      VALUES (?, ?, ?, ?, ?, ?)`,
		args: [endpointId, input.firmId, input.url, secret, input.events.join(' '), now]
	});

	return {
		endpointId,
		firmId: input.firmId,
		url: input.url,
		secret,
		events: input.events,
		isActive: true,
		createdAt: now,
		lastSuccessAt: null,
		consecutiveFailures: 0
	};
}

/**
 * The endpoints that should receive a given event for a given firm.
 *
 * Matching happens here, in SQL, rather than by fetching everything and
 * filtering — so a firm with one endpoint subscribed to one event type does not
 * pay for the venue's whole endpoint table on every trade.
 */
export async function endpointsFor(
	client: Client,
	firmId: string,
	event: string
): Promise<Endpoint[]> {
	const result = await client.execute({
		sql: `SELECT endpoint_id, firm_id, url, secret, events, is_active, created_at,
		             last_success_at, consecutive_failures
		      FROM webhook_endpoint
		      WHERE firm_id = ? AND is_active = 1
		        AND (' ' || events || ' ') LIKE ('% ' || ? || ' %')`,
		args: [firmId, event]
	});

	return result.rows.map(toEndpoint);
}

export async function listEndpoints(client: Client, firmId: string): Promise<Endpoint[]> {
	const result = await client.execute({
		sql: `SELECT endpoint_id, firm_id, url, secret, events, is_active, created_at,
		             last_success_at, consecutive_failures
		      FROM webhook_endpoint WHERE firm_id = ? ORDER BY created_at DESC`,
		args: [firmId]
	});

	return result.rows.map(toEndpoint);
}

function toEndpoint(row: Record<string, unknown>): Endpoint {
	return {
		endpointId: String(row['endpoint_id']),
		firmId: String(row['firm_id']),
		url: String(row['url']),
		secret: String(row['secret']),
		events: String(row['events']).split(' ').filter(Boolean),
		isActive: Number(row['is_active']) === 1,
		createdAt: Number(row['created_at']),
		lastSuccessAt: row['last_success_at'] === null ? null : Number(row['last_success_at']),
		consecutiveFailures: Number(row['consecutive_failures'] ?? 0)
	};
}

export async function deleteEndpoint(
	client: Client,
	firmId: string,
	endpointId: string
): Promise<boolean> {
	const result = await client.execute({
		sql: 'UPDATE webhook_endpoint SET is_active = 0 WHERE endpoint_id = ? AND firm_id = ?',
		args: [endpointId, firmId]
	});

	return result.rowsAffected > 0;
}

/* -------------------------------------------------------------------------- */
/* Delivery health                                                             */
/* -------------------------------------------------------------------------- */

/**
 * How many consecutive failures before an endpoint is switched off.
 *
 * An endpoint that has failed this many times in a row is not having a bad
 * afternoon — it has been decommissioned and nobody told us. Continuing to
 * deliver to it burns the queue's throughput on a URL that will never answer,
 * and it slows down every firm that *is* listening.
 */
export const DISABLE_AFTER_FAILURES = 20;

export async function recordSuccess(
	client: Client,
	endpointId: string,
	now = Date.now()
): Promise<void> {
	await client.execute({
		sql: `UPDATE webhook_endpoint SET last_success_at = ?, consecutive_failures = 0
		      WHERE endpoint_id = ?`,
		args: [now, endpointId]
	});
}

/**
 * Count a failure, and disable the endpoint if it has been failing long enough.
 *
 * Both in one statement, so the counter and the decision cannot disagree. Two
 * statements would leave a window in which a concurrent worker reads the old
 * count and neither of them crosses the threshold.
 */
export async function recordFailure(
	client: Client,
	endpointId: string,
	limit = DISABLE_AFTER_FAILURES
): Promise<{ disabled: boolean }> {
	await client.execute({
		sql: `UPDATE webhook_endpoint
		      SET consecutive_failures = consecutive_failures + 1,
		          is_active = CASE WHEN consecutive_failures + 1 >= ? THEN 0 ELSE is_active END
		      WHERE endpoint_id = ?`,
		args: [limit, endpointId]
	});

	const result = await client.execute({
		sql: 'SELECT is_active FROM webhook_endpoint WHERE endpoint_id = ?',
		args: [endpointId]
	});

	return { disabled: Number(result.rows[0]?.['is_active'] ?? 1) === 0 };
}

export async function recordDelivery(
	client: Client,
	input: {
		deliveryId: string;
		endpointId: string;
		outboxId: number;
		event: string;
		status: 'delivered' | 'failed';
		statusCode?: number | undefined;
		durationMs: number;
		error?: string | undefined;
		at: number;
	}
): Promise<void> {
	await client.execute({
		sql: `INSERT INTO webhook_delivery
		        (delivery_id, endpoint_id, outbox_id, event, status, status_code, duration_ms, error, at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		      ON CONFLICT (delivery_id) DO NOTHING`,
		args: [
			input.deliveryId,
			input.endpointId,
			input.outboxId,
			input.event,
			input.status,
			input.statusCode ?? null,
			input.durationMs,
			input.error?.slice(0, 500) ?? null,
			input.at
		]
	});
}
