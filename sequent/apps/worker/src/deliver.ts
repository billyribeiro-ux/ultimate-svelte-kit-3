/**
 * Delivering one outbox message.
 *
 * Split from the loop so it can be tested by handing it a fake `fetch`. A
 * delivery function that reaches for the global `fetch` is one you can only
 * test by starting an HTTP server, and the interesting cases — a receiver that
 * hangs forever, one that returns 500, one that redirects to `localhost` — are
 * exactly the ones that are miserable to arrange that way.
 */

import type { Client } from '@libsql/client';
import {
	assertDeliverable,
	endpointsFor,
	listEndpoints,
	recordDelivery,
	recordFailure,
	recordSuccess,
	sign,
	type ClaimedMessage,
	type Endpoint
} from '@sequent/store';

export type Fetch = typeof globalThis.fetch;

export interface DeliverOptions {
	readonly fetch?: Fetch;
	readonly timeoutMs?: number;
	readonly now?: () => number;
	/** Loosens the SSRF checks. For local development only. */
	readonly allowInsecure?: boolean;
}

/**
 * What happened, in three dispositions rather than two.
 *
 * `retry: false` on its own means **done** — either delivered, or there was
 * nobody to deliver to, which is equally finished. `permanent: true` means it
 * will never succeed and should go straight to the dead letters.
 *
 * The third case is the one a boolean cannot express, and leaving it out is how
 * a message that is broken forever gets marked delivered: `retry: false` and
 * the loop calls `succeed()`.
 */
export interface DeliveryOutcome {
	readonly delivered: number;
	readonly failed: number;
	/** True if the whole message should be tried again later. */
	readonly retry: boolean;
	/** True if it will never succeed. Dead-letter it now rather than in an hour. */
	readonly permanent?: boolean;
	readonly error?: string;
}

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                    */
/* -------------------------------------------------------------------------- */

interface WebhookPayload {
	readonly event: string;
	readonly seq: number;
	readonly at: number;
	readonly data: Record<string, unknown>;
}

/**
 * Post one message to every endpoint that wants it.
 *
 * ## Which endpoints
 *
 * A message with a `firmId` goes to that firm's endpoints. A message without
 * one is venue-wide — a phase change — and fans out to **every** subscribed
 * firm, resolved here at delivery time rather than when the event was
 * projected. That is what lets a firm that subscribed a minute ago receive the
 * next one.
 *
 * ## Partial success
 *
 * A firm with three endpoints, one of which is down, is the case that decides
 * the design. Retrying the whole message would re-deliver to the two that
 * worked — so the outcome distinguishes "some endpoint failed" from "nothing
 * got through", and the caller only retries the message when *nothing* did.
 *
 * The remaining duplicate — retrying does re-post to endpoints that succeeded
 * on a previous attempt — is inherent to at-least-once and is why every
 * delivery carries a stable id. It is not a bug to be engineered away; it is
 * the contract, and receivers de-duplicate on the id.
 */
export async function deliverWebhook(
	client: Client,
	message: ClaimedMessage,
	options: DeliverOptions = {}
): Promise<DeliveryOutcome> {
	const doFetch = options.fetch ?? globalThis.fetch;
	const timeoutMs = options.timeoutMs ?? 10_000;
	const now = options.now ?? Date.now;

	const payload = message.payload as WebhookPayload;

	const endpoints: Endpoint[] =
		message.firmId === null
			? await allSubscribed(client, payload.event)
			: await endpointsFor(client, message.firmId, payload.event);

	// Nobody is listening. That is a success, not a failure — retrying a message
	// with no destination would keep it in the queue forever.
	if (endpoints.length === 0) return { delivered: 0, failed: 0, retry: false };

	const body = JSON.stringify(payload);
	let delivered = 0;
	let failed = 0;
	let lastError: string | undefined;

	for (const endpoint of endpoints) {
		/*
		 * A stable id per (message, endpoint).
		 *
		 * Derived, not random, so a retry sends the *same* id and the receiver can
		 * recognise it as the delivery it already processed. A random id per
		 * attempt would make de-duplication impossible at their end, which would
		 * make at-least-once delivery useless to them.
		 */
		const deliveryId = `whd_${message.outboxId}_${endpoint.endpointId}`;
		const startedAt = now();

		try {
			// Re-checked at send time, not only at registration. An endpoint stored
			// months ago may now point at a hostname that resolves somewhere else.
			assertDeliverable(endpoint.url, { allowInsecure: options.allowInsecure ?? false });

			// Milliseconds. `sign` converts to the seconds the wire format uses.
			const signature = sign(endpoint.secret, body, startedAt);

			/*
			 * A timeout, always.
			 *
			 * `fetch` without one waits as long as the other end feels like — and a
			 * receiver that accepts the connection and never answers would hold a
			 * worker slot forever. One slow member should not be able to stop
			 * deliveries to everybody else, and this line is what stops them.
			 */
			const response = await doFetch(endpoint.url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'user-agent': 'Sequent-Webhooks/1',
					'Sequent-Signature': signature.header,
					'Sequent-Delivery-Id': deliveryId,
					'Sequent-Event': payload.event
				},
				body,
				signal: AbortSignal.timeout(timeoutMs),
				// A 3xx to somewhere else is how an SSRF check at registration time
				// gets bypassed at delivery time.
				redirect: 'manual'
			});

			const duration = now() - startedAt;

			if (response.ok) {
				delivered += 1;
				await recordSuccess(client, endpoint.endpointId, now());
				await recordDelivery(client, {
					deliveryId,
					endpointId: endpoint.endpointId,
					outboxId: message.outboxId,
					event: payload.event,
					status: 'delivered',
					statusCode: response.status,
					durationMs: duration,
					at: now()
				});
			} else {
				failed += 1;
				lastError = `HTTP ${response.status} from ${endpoint.url}`;
				await recordFailure(client, endpoint.endpointId);
				await recordDelivery(client, {
					deliveryId,
					endpointId: endpoint.endpointId,
					outboxId: message.outboxId,
					event: payload.event,
					status: 'failed',
					statusCode: response.status,
					durationMs: duration,
					error: lastError,
					at: now()
				});
			}
		} catch (thrown) {
			failed += 1;
			lastError = thrown instanceof Error ? thrown.message : String(thrown);

			await recordFailure(client, endpoint.endpointId);
			await recordDelivery(client, {
				deliveryId,
				endpointId: endpoint.endpointId,
				outboxId: message.outboxId,
				event: payload.event,
				status: 'failed',
				durationMs: now() - startedAt,
				error: lastError,
				at: now()
			});
		}
	}

	return {
		delivered,
		failed,
		// Retry only if *nothing* got through. Otherwise the endpoints that worked
		// would be posted to again on every attempt.
		retry: delivered === 0 && failed > 0,
		...(lastError ? { error: lastError } : {})
	};
}

/** Every firm's endpoints subscribed to an event. For venue-wide messages. */
async function allSubscribed(client: Client, event: string): Promise<Endpoint[]> {
	const firms = await client.execute(
		'SELECT DISTINCT firm_id FROM webhook_endpoint WHERE is_active = 1'
	);

	const found: Endpoint[] = [];
	for (const row of firms.rows) {
		found.push(...(await endpointsFor(client, String(row['firm_id']), event)));
	}

	return found;
}

/** For an admin screen that wants to show a firm what it has configured. */
export { listEndpoints };

/* -------------------------------------------------------------------------- */
/* Email                                                                       */
/* -------------------------------------------------------------------------- */

interface EmailPayload {
	readonly template: string;
	readonly firmId: string;
	readonly subject: string;
	readonly data: Record<string, unknown>;
}

/**
 * "Send" an email.
 *
 * Simulated: it resolves the recipients, renders a subject and body, records
 * what was sent, and logs it. Wiring a real provider means replacing the one
 * `console.log` — everything difficult about email in a system like this is the
 * part that is already here.
 *
 * Which is worth saying plainly, because the instinct is that the provider is
 * the hard bit. It is not. The hard bits are: *did we already send this*
 * (idempotency key), *who should get it* (a query, and a tenant boundary), and
 * *what happens when the provider is down* (the outbox's retry). A provider SDK
 * is a function call.
 */
export async function deliverEmail(
	client: Client,
	message: ClaimedMessage,
	options: { now?: () => number; log?: (line: string) => void } = {}
): Promise<DeliveryOutcome> {
	const now = options.now ?? Date.now;
	const log = options.log ?? console.log;
	const payload = message.payload as EmailPayload;

	/*
	 * A malformed payload is permanent, not transient.
	 *
	 * Retrying it eight times with exponential backoff spends an hour proving
	 * something that was knowable on the first attempt, and buries the real error
	 * under seven identical ones. `retry: false` sends it straight to the dead
	 * letters with a message that says what is actually wrong.
	 *
	 * This is here because it happened: a command written directly to the log,
	 * bypassing the gateway, produced an event missing its `firmId`, and the
	 * resulting email retried six times with `undefined cannot be passed as
	 * argument to the database` — an error about the database, describing a
	 * problem three layers upstream.
	 */
	if (typeof payload?.firmId !== 'string' || typeof payload.subject !== 'string') {
		return {
			delivered: 0,
			failed: 1,
			retry: false,
			permanent: true,
			error: `Email payload is missing firmId or subject: ${JSON.stringify(payload).slice(0, 200)}`
		};
	}

	/*
	 * Who gets a kill-switch email? Risk managers and firm admins.
	 *
	 * Not every user at the firm. A trader whose orders were just pulled will
	 * find out in about four seconds by looking at their screen; the people who
	 * need an email are the ones who have to decide what to do about it.
	 */
	const recipients = await client.execute({
		sql: `SELECT email, display_name FROM venue_user
		      WHERE firm_id = ? AND is_active = 1 AND role IN ('risk_manager', 'firm_admin')`,
		args: [payload.firmId]
	});

	if (recipients.rows.length === 0) return { delivered: 0, failed: 0, retry: false };

	for (const row of recipients.rows) {
		const recipient = String(row['email']);

		await client.execute({
			sql: `INSERT INTO email_sent (email_id, outbox_id, firm_id, recipient, subject, template, at)
			      VALUES (?, ?, ?, ?, ?, ?, ?)
			      ON CONFLICT (email_id) DO NOTHING`,
			args: [
				// Same reasoning as the webhook delivery id: derived, so a retry does
				// not look like a second email.
				`eml_${message.outboxId}_${recipient}`,
				message.outboxId,
				payload.firmId,
				recipient,
				payload.subject,
				payload.template,
				now()
			]
		});

		log(`[email] to ${recipient}: ${payload.subject}`);
	}

	return { delivered: recipients.rows.length, failed: 0, retry: false };
}
