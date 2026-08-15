/**
 * The admin surface: keys, webhooks, instruments and phases.
 *
 * Two audiences in one file, and the split is by **permission**, not by route.
 *
 *   A `firm_admin` manages their own firm's credentials and integrations.
 *   A `venue_operator` lists instruments and moves the market between phases.
 *
 * Neither can do the other's job, and the venue operator explicitly cannot see
 * a member firm's API keys — being above the tenant boundary means being able
 * to administer the *venue*, not to read its members' secrets. That is a
 * distinction a naive "admin can do anything" model destroys, and it is the one
 * a member firm would care most about.
 */

import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, form, getRequestEvent, query } from '$app/server';
import { asInstrumentId, price } from '@sequent/protocol';
import {
	assertCan,
	createApiKey,
	createEndpoint,
	deadLetters,
	deleteEndpoint,
	InvalidEndpointUrl,
	listApiKeys,
	listEndpoints,
	NotAllowed,
	revive,
	revokeApiKey,
	stats,
	tailEvents,
	UnknownWebhookEvent,
	WEBHOOK_EVENTS,
	type Viewer
} from '@sequent/store';
import { db } from '#lib/server/db.ts';
import { submit } from '#lib/server/gateway.ts';

/* -------------------------------------------------------------------------- */
/* Who is asking                                                               */
/* -------------------------------------------------------------------------- */

function requireViewer(): Viewer {
	const { locals } = getRequestEvent();
	if (!locals.viewer) error(401, 'Sign in to continue.');
	return locals.viewer;
}

function requireCan(viewer: Viewer, action: Parameters<typeof assertCan>[1]): void {
	try {
		assertCan(viewer, action, { firmId: viewer.firmId });
	} catch (thrown) {
		if (thrown instanceof NotAllowed) error(thrown.status as 403, thrown.message);
		throw thrown;
	}
}

/* -------------------------------------------------------------------------- */
/* API keys                                                                    */
/* -------------------------------------------------------------------------- */

export const getApiKeys = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'manage_api_keys');

	const keys = await listApiKeys(db, viewer.firmId);

	const accounts = await db.execute({
		sql: 'SELECT account_id, name FROM trading_account WHERE firm_id = ? AND is_active = 1',
		args: [viewer.firmId]
	});

	return {
		keys: keys.map((key) => ({
			...key,
			// A key that has never been used is a key somebody made and forgot, and
			// that is worth showing plainly rather than as an empty cell.
			lastUsedLabel: key.lastUsedAt === null ? 'never used' : new Date(key.lastUsedAt).toISOString().slice(0, 16).replace('T', ' '),
			revoked: key.revokedAt !== null
		})),
		accounts: accounts.rows.map((row) => ({
			accountId: String(row['account_id']),
			name: String(row['name'])
		}))
	};
});

/**
 * Mint a key and return the secret **once**.
 *
 * The returned value is the only time this string exists outside the holder's
 * hands. There is no endpoint that can retrieve it later, and that is the
 * feature: a venue that can show you your own key can be made to show it to
 * somebody wearing your face.
 */
export const createKey = command(
	v.object({
		label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
		scopes: v.pipe(v.array(v.picklist(['read', 'trade', 'admin'] as const)), v.minLength(1)),
		accountId: v.optional(v.string()),
		ratePerSecond: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))
	}),
	async (input) => {
		const viewer = requireViewer();
		requireCan(viewer, 'manage_api_keys');

		/*
		 * The pinned account is checked against the viewer's firm.
		 *
		 * Without this, a firm admin could pin a key to another firm's account by
		 * typing its id — and `viewerFromApiKey` trusts the pinned account
		 * because it assumes whoever wrote the row was allowed to.
		 *
		 * The general shape: a foreign key supplied by a client is a permission
		 * question, not a lookup.
		 */
		if (input.accountId) {
			const owned = await db.execute({
				sql: 'SELECT 1 FROM trading_account WHERE account_id = ? AND firm_id = ?',
				args: [input.accountId, viewer.firmId]
			});

			if (owned.rows.length === 0) error(404, 'No such trading account.');
		}

		const key = await createApiKey(db, {
			firmId: viewer.firmId,
			label: input.label,
			scopes: input.scopes,
			ratePerSecond: input.ratePerSecond,
			...(input.accountId ? { accountId: input.accountId } : {})
		});

		await getApiKeys().refresh();

		return { keyId: key.keyId, secret: key.secret };
	}
);

export const revokeKey = command(v.object({ keyId: v.string() }), async ({ keyId }) => {
	const viewer = requireViewer();
	requireCan(viewer, 'manage_api_keys');

	const revoked = await revokeApiKey(db, viewer.firmId, keyId);
	if (!revoked) error(404, 'No such key.');

	await getApiKeys().refresh();
	return { revoked: true };
});

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                    */
/* -------------------------------------------------------------------------- */

export const getWebhooks = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'manage_api_keys');

	const endpoints = await listEndpoints(db, viewer.firmId);

	const recent = await db.execute({
		sql: `SELECT d.delivery_id, d.event, d.status, d.status_code, d.duration_ms, d.at, e.url
		      FROM webhook_delivery d
		      JOIN webhook_endpoint e ON e.endpoint_id = d.endpoint_id
		      WHERE e.firm_id = ?
		      ORDER BY d.at DESC LIMIT 25`,
		args: [viewer.firmId]
	});

	return {
		/*
		 * The secret is returned here, unlike an API key's.
		 *
		 * It has to be: the firm needs it to verify the signatures we send, and
		 * unlike a key secret it is not a credential *they* present to *us* — it
		 * is a shared secret for checking our messages. Losing it does not let
		 * anybody act as them; it lets somebody forge messages from us, which is
		 * why rotating it means creating a new endpoint.
		 */
		endpoints: endpoints.map((endpoint) => ({
			endpointId: endpoint.endpointId,
			url: endpoint.url,
			secret: endpoint.secret,
			events: endpoint.events,
			isActive: endpoint.isActive,
			consecutiveFailures: endpoint.consecutiveFailures,
			lastSuccessLabel:
				endpoint.lastSuccessAt === null
					? 'never'
					: new Date(endpoint.lastSuccessAt).toISOString().slice(0, 16).replace('T', ' ')
		})),
		deliveries: recent.rows.map((row) => ({
			deliveryId: String(row['delivery_id']),
			event: String(row['event']),
			status: String(row['status']),
			statusCode: row['status_code'] === null ? null : Number(row['status_code']),
			durationMs: Number(row['duration_ms']),
			url: String(row['url']),
			at: new Date(Number(row['at'])).toISOString().slice(11, 19)
		})),
		available: WEBHOOK_EVENTS
	};
});

export const addWebhook = command(
	v.object({
		url: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
		events: v.pipe(v.array(v.string()), v.minLength(1))
	}),
	async (input) => {
		const viewer = requireViewer();
		requireCan(viewer, 'manage_api_keys');

		try {
			const endpoint = await createEndpoint(db, {
				firmId: viewer.firmId,
				url: input.url,
				events: input.events,
				// Loosened only when the venue itself is running in development, so a
				// student can point a webhook at their own laptop.
				allowInsecure: process.env['ALLOW_INSECURE_WEBHOOKS'] === 'true'
			});

			await getWebhooks().refresh();
			return { endpointId: endpoint.endpointId, secret: endpoint.secret };
		} catch (thrown) {
			/*
			 * An SSRF refusal is a 400 with the reason, not a 500.
			 *
			 * The person typing the URL made a correctable mistake and the message
			 * tells them what it was. Swallowing it into "something went wrong"
			 * turns a five-second fix into a support ticket.
			 */
			if (thrown instanceof InvalidEndpointUrl) error(400, thrown.message);
			if (thrown instanceof UnknownWebhookEvent) error(400, thrown.message);
			throw thrown;
		}
	}
);

export const removeWebhook = command(
	v.object({ endpointId: v.string() }),
	async ({ endpointId }) => {
		const viewer = requireViewer();
		requireCan(viewer, 'manage_api_keys');

		const removed = await deleteEndpoint(db, viewer.firmId, endpointId);
		if (!removed) error(404, 'No such endpoint.');

		await getWebhooks().refresh();
		return { removed: true };
	}
);

/* -------------------------------------------------------------------------- */
/* The queue                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The outbox's health, for whoever is on call.
 *
 * `oldestPendingAgeMs` is the number worth an alert, and the UI says so.
 * Queue *depth* is the metric everybody reaches for first and it is nearly
 * useless: ten thousand messages that drain in a second is a healthy queue, and
 * one message stuck for an hour is not.
 */
export const getQueue = query(async () => {
	const viewer = requireViewer();
	requireCan(viewer, 'view_audit_log');

	return {
		stats: await stats(db),
		dead: await deadLetters(db, 20)
	};
});

export const retryDead = command(v.object({ outboxIds: v.array(v.number()) }), async (input) => {
	const viewer = requireViewer();
	requireCan(viewer, 'view_audit_log');

	const count = await revive(db, input.outboxIds);
	await getQueue().refresh();

	return { revived: count };
});

/* -------------------------------------------------------------------------- */
/* The venue's own controls                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The venue's instruments and their phases, **live**.
 *
 * ## Why this had to become a live query
 *
 * A plain query with a `.refresh()` after `setPhase` looked correct and was
 * subtly wrong, in the way this whole architecture is designed to make you
 * confront: the command is *sequenced*, not *applied*. The engine reads it a
 * moment later and writes the `phase_changed` event; the refresh runs before
 * that and re-reads the old phase.
 *
 * So the operator clicked "halt", the venue genuinely halted, and the badge
 * kept saying "continuous" until somebody reloaded. The most alarming possible
 * version of a stale read.
 *
 * There is no version of `refresh()` that fixes this, because the answer does
 * not exist yet at the moment of the request. The honest fix is the same one
 * the terminal uses for the book: tail the event log and yield when the answer
 * changes.
 */
export const getVenue = query.live(async function* () {
	const viewer = requireViewer();
	requireCan(viewer, 'set_phase');

	const { request } = getRequestEvent();

	yield await venueSnapshot();

	for await (const batch of tailEvents(db, await currentSeq(), {
		signal: request.signal,
		idleMs: 60
	})) {
		// Only the two event kinds that can change this answer. A venue with a
		// busy book would otherwise re-render the admin page on every trade.
		const relevant = batch.some(
			(record) => record.body.kind === 'phase_changed' || record.body.kind === 'instrument_listed'
		);

		if (relevant) yield await venueSnapshot();
	}
});

async function currentSeq(): Promise<number> {
	const result = await db.execute('SELECT COALESCE(MAX(seq), 0) AS seq FROM event_log');
	return Number(result.rows[0]?.['seq'] ?? 0);
}

async function venueSnapshot() {
	const listed = await db.execute(
		`SELECT body FROM event_log WHERE kind = 'instrument_listed' ORDER BY seq`
	);

	const phases = await db.execute(
		`SELECT instrument_id, body FROM event_log WHERE kind = 'phase_changed' ORDER BY seq`
	);

	const phaseOf = new Map<string, string>();
	for (const row of phases.rows) {
		const body = JSON.parse(String(row['body'])) as { instrumentId: string; to: string };
		phaseOf.set(body.instrumentId, body.to);
	}

	return listed.rows.map((row) => {
		const body = JSON.parse(String(row['body'])) as {
			instrumentId: string;
			name: string;
			currency: string;
			tickSize: number;
			lotSize: number;
			referencePrice: number;
		};

		return { ...body, phase: phaseOf.get(body.instrumentId) ?? 'closed' };
	});
}

/**
 * Move an instrument between phases.
 *
 * The phases are not arbitrary labels — `pre_open` accumulates orders without
 * matching, `auction` clears them all at one price, `continuous` matches
 * arrival by arrival. Going straight from `pre_open` to `continuous` would work,
 * and it would skip the most interesting thing the venue does, so the UI orders
 * them in the sequence a real session runs.
 */
export const setPhase = command(
	v.object({
		instrumentId: v.string(),
		phase: v.picklist(['closed', 'pre_open', 'auction', 'continuous', 'halted'] as const),
		reason: v.pipe(v.string(), v.trim(), v.maxLength(200))
	}),
	async (input) => {
		const viewer = requireViewer();

		const seq = await submit(viewer, {
			kind: 'set_phase',
			instrumentId: asInstrumentId(input.instrumentId),
			phase: input.phase,
			reason: input.reason || 'operator'
		});

		/*
		 * No `.refresh()` here, deliberately.
		 *
		 * `getVenue` is a live query: it is already watching the event log and will
		 * yield the new phase the instant the engine writes it. A refresh would
		 * re-read *now*, before the engine has applied anything, and push the old
		 * phase over the top of a correct answer that is seconds away.
		 */
		return { seq };
	}
);

/**
 * List a new instrument.
 *
 * A `form()` rather than a `command()`, because this one has enough fields that
 * it wants native validation, a submit button, and to work without JavaScript.
 * A command is right for a button; a form is right for a form.
 */
export const listInstrument = form(
	v.object({
		symbol: v.pipe(
			v.string(),
			v.trim(),
			v.toUpperCase(),
			v.regex(/^[A-Z][A-Z0-9.]{0,15}$/, 'A symbol is letters, digits and dots, starting with a letter.')
		),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
		currency: v.pipe(v.string(), v.trim(), v.toUpperCase(), v.length(3)),
		// Typed in pounds, stored in scaled integer units. The conversion happens
		// here, once, rather than in the component — a UI that has to know the
		// scale is a UI that will eventually get it wrong.
		referencePrice: v.pipe(v.string(), v.trim(), v.regex(/^\d+(\.\d{1,4})?$/, 'A price like 455.00')),
		tickSize: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1)),
		lotSize: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1))
	}),
	async (input) => {
		const viewer = requireViewer();

		const scaled = Math.round(Number(input.referencePrice) * 10_000);

		await submit(viewer, {
			kind: 'list_instrument',
			instrumentId: asInstrumentId(input.symbol),
			name: input.name,
			currency: input.currency,
			tickSize: input.tickSize,
			lotSize: input.lotSize,
			referencePrice: price(scaled)
		});

		// Same as `setPhase`: the live query picks up `instrument_listed` itself.
		return { listed: input.symbol };
	}
);
