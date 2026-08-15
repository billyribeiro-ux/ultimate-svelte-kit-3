/**
 * Feature flags, and the one thing they must never touch.
 *
 * ## The rule
 *
 * **A flag may change what the venue offers. It may never change what the
 * engine decides.**
 *
 * That is not a style preference; it is what keeps replay meaningful. The
 * engine is a pure function from (state, command) to events, and replaying the
 * log reproduces history exactly. Put a flag inside it and that stops being
 * true: the same log replayed tomorrow, with the flag in a different position,
 * produces different events. The venue would no longer be able to answer "what
 * happened in March" — it could only answer "what would happen in March if the
 * flags were as they are now".
 *
 * So flags live out here, in the layer that decides whether a *command is
 * accepted at all*, and never inside `@sequent/core`. The dependency graph
 * enforces it: `core` does not depend on `store`, and cannot import this file.
 *
 * ## What they are for
 *
 * Turning a feature off in an incident, without a deploy. That is the entire
 * value, and it is enormous — the difference between a five-minute fix and a
 * forty-minute rollback with a merge conflict in the middle.
 *
 * They are not for A/B tests, gradual rollouts of engine behaviour, or "config
 * that changes sometimes". A flag that has been on for a year is not a flag; it
 * is a branch nobody deletes, and it doubles the number of states the venue can
 * be in.
 *
 * ## Cached, and why the staleness is acceptable
 *
 * Every request reading the database for every flag would put a query on the
 * hot path of every order. Flags are cached for a few seconds, which means a
 * flag flipped during an incident takes a few seconds to take hold everywhere.
 *
 * That is the right trade *because of what flags are for*: nobody flips one and
 * needs it in the same 200ms. It would be the wrong trade for a permission,
 * which is why permissions are not flags.
 */

import type { Client } from '@libsql/client';

/* -------------------------------------------------------------------------- */
/* The flags                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every flag, declared. Not a free-form key-value store.
 *
 * A typo'd flag name in a `get('new_chekout')` call returns the default
 * forever, silently, and the feature simply never turns on. Declaring them
 * makes that a type error instead of a bad afternoon — and gives the list of
 * "things that can be switched off" a single place to be read from.
 *
 * The `default` is what applies when the database says nothing, which includes
 * the moment before anybody has ever set the flag. Every default here is the
 * *safe* value, so a fresh venue behaves conservatively rather than shipping
 * whatever the newest code does.
 */
export const FLAGS = {
	accept_orders: {
		default: true,
		description:
			'Accept new orders at the gateway. Off is a venue-wide pause that leaves existing orders resting.'
	},
	accept_api_writes: {
		default: true,
		description: 'Allow the public API to place and cancel orders. Off leaves the browser working.'
	},
	deliver_webhooks: {
		default: true,
		description: 'Let the worker deliver webhooks. Off queues them, it does not drop them.'
	},
	send_email: {
		default: true,
		description: 'Let the worker send email. Off queues it.'
	},
	live_market_data: {
		default: true,
		description:
			'Stream the book to browsers. Off falls back to a static snapshot per page load, which is far cheaper.'
	},
	new_firm_signup: {
		default: false,
		description: 'Allow a new member firm to be created. Off by default: onboarding is manual.'
	}
} as const;

export type FlagName = keyof typeof FLAGS;

export const FLAG_NAMES = Object.keys(FLAGS) as FlagName[];

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

interface CacheEntry {
	readonly value: boolean;
	readonly readAt: number;
}

/**
 * How long a flag's value is trusted before re-reading.
 *
 * Five seconds. Long enough that a busy venue does one query per flag per five
 * seconds rather than one per request; short enough that "I turned it off" and
 * "it is off" are the same sentence in an incident.
 */
export const CACHE_MS = 5_000;

export class Flags {
	readonly #client: Client;
	readonly #cache = new Map<FlagName, CacheEntry>();
	readonly #cacheMs: number;

	constructor(client: Client, cacheMs = CACHE_MS) {
		this.#client = client;
		this.#cacheMs = cacheMs;
	}

	/**
	 * Is this flag on?
	 *
	 * Never throws. A flag lookup that can fail is a flag lookup that has to be
	 * wrapped in a try/catch at every call site, and the one time somebody
	 * forgets, a transient database hiccup takes the whole venue down — for a
	 * question whose answer has a perfectly good default.
	 */
	async enabled(name: FlagName, now = Date.now()): Promise<boolean> {
		const cached = this.#cache.get(name);
		if (cached && now - cached.readAt < this.#cacheMs) return cached.value;

		try {
			const result = await this.#client.execute({
				sql: 'SELECT enabled FROM feature_flag WHERE name = ?',
				args: [name]
			});

			const row = result.rows[0];
			const value = row === undefined ? FLAGS[name].default : Number(row['enabled']) === 1;

			this.#cache.set(name, { value, readAt: now });
			return value;
		} catch {
			/*
			 * Fall back to the last known value, or the declared default.
			 *
			 * Not to `false`. "Database unreachable" and "somebody turned this off"
			 * are different facts, and conflating them means a blip in the flag
			 * store halts trading — an outage caused entirely by the mechanism
			 * meant to prevent one.
			 */
			return cached?.value ?? FLAGS[name].default;
		}
	}

	/** Drop the cache, for a test or right after a deliberate flip. */
	forget(): void {
		this.#cache.clear();
	}
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

export class UnknownFlag extends Error {
	constructor(name: string) {
		super(`Unknown flag: ${name}. Declare it in FLAGS first.`);
		this.name = 'UnknownFlag';
	}
}

/**
 * Set a flag, and record who did it and why.
 *
 * The reason is required, not optional. Six weeks later, "why is
 * `deliver_webhooks` off" is the whole question, and a flag table that only
 * records the value cannot answer it. Making the field mandatory is the
 * cheapest possible way to get an answer written down at the moment somebody
 * still knows it.
 */
export async function setFlag(
	client: Client,
	name: string,
	enabled: boolean,
	input: { by: string; reason: string; now?: number }
): Promise<void> {
	if (!(name in FLAGS)) throw new UnknownFlag(name);

	if (!input.reason.trim()) {
		throw new Error('A flag change needs a reason. "Why is this off" is the question.');
	}

	const now = input.now ?? Date.now();

	await client.execute({
		sql: `INSERT INTO feature_flag (name, enabled, changed_by, reason, changed_at)
		      VALUES (?, ?, ?, ?, ?)
		      ON CONFLICT (name) DO UPDATE SET
		        enabled = excluded.enabled,
		        changed_by = excluded.changed_by,
		        reason = excluded.reason,
		        changed_at = excluded.changed_at`,
		args: [name, enabled ? 1 : 0, input.by, input.reason.trim(), now]
	});

	// The history is a separate append-only table, because the current value and
	// the story of how it got there are different questions.
	await client.execute({
		sql: `INSERT INTO feature_flag_change (name, enabled, changed_by, reason, changed_at)
		      VALUES (?, ?, ?, ?, ?)`,
		args: [name, enabled ? 1 : 0, input.by, input.reason.trim(), now]
	});
}

export interface FlagState {
	readonly name: FlagName;
	readonly description: string;
	readonly enabled: boolean;
	readonly isDefault: boolean;
	readonly changedBy: string | null;
	readonly reason: string | null;
	readonly changedAt: number | null;
}

/**
 * Every flag with its current value.
 *
 * Driven by the **declaration**, not by the table. A flag that has never been
 * set still appears, at its default — which is what somebody looking for
 * "what can I turn off" needs to see. Listing the table instead would show only
 * the flags somebody has already touched.
 */
export async function listFlags(client: Client): Promise<FlagState[]> {
	const rows = await client.execute(
		'SELECT name, enabled, changed_by, reason, changed_at FROM feature_flag'
	);

	const stored = new Map(rows.rows.map((row) => [String(row['name']), row]));

	return FLAG_NAMES.map((name) => {
		const row = stored.get(name);

		return {
			name,
			description: FLAGS[name].description,
			enabled: row === undefined ? FLAGS[name].default : Number(row['enabled']) === 1,
			isDefault: row === undefined,
			changedBy: row === undefined ? null : String(row['changed_by']),
			reason: row === undefined ? null : String(row['reason']),
			changedAt: row === undefined ? null : Number(row['changed_at'])
		};
	});
}

export async function flagHistory(
	client: Client,
	limit = 50
): Promise<
	Array<{ name: string; enabled: boolean; changedBy: string; reason: string; changedAt: number }>
> {
	const rows = await client.execute({
		sql: `SELECT name, enabled, changed_by, reason, changed_at
		      FROM feature_flag_change ORDER BY changed_at DESC, rowid DESC LIMIT ?`,
		args: [limit]
	});

	return rows.rows.map((row) => ({
		name: String(row['name']),
		enabled: Number(row['enabled']) === 1,
		changedBy: String(row['changed_by']),
		reason: String(row['reason']),
		changedAt: Number(row['changed_at'])
	}));
}
