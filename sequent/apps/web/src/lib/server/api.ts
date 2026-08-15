/**
 * The public API's plumbing: authenticate, rate limit, answer in JSON.
 *
 * A browser and an algorithm want different things from the same venue, and
 * pretending otherwise produces an API that is bad at both. A person gets a
 * redirect to a sign-in page; a trading system gets a 401 with a code it can
 * branch on. A person sees a nice error page; a trading system needs to know
 * whether to retry.
 *
 * So this file exists to make every `/api/v1/*` route answer the same way,
 * because the single most valuable property of an API is that its failures are
 * as predictable as its successes.
 *
 * ## The error shape, and why it is fixed
 *
 * Every failure is:
 *
 *     { "error": { "code": "rate_limited", "message": "…", "requestId": "…" } }
 *
 * `code` is the part a machine reads, and it never changes once published — it
 * is as much a part of the contract as the URL. `message` is for the human
 * reading the log, and it may change freely. Getting this the wrong way round
 * is how clients end up matching on error text, and how a copy-edit becomes an
 * outage at somebody else's firm.
 *
 * `requestId` is in the body *and* the headers, so a support conversation that
 * starts with a screenshot can still find the log line.
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import {
	bucketFor,
	rateLimitHeaders,
	RateLimiter,
	viewerFromApiKey,
	type Viewer
} from '@sequent/store';
import { db } from './db.ts';

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The codes this API will ever return.
 *
 * A closed list, in one place. Every one of these is documented, and adding a
 * sixth means deciding it is worth a client writing a branch for — which is a
 * higher bar than "this felt different from the others at the time".
 */
export type ApiErrorCode =
	| 'unauthenticated'
	| 'forbidden'
	| 'not_found'
	| 'invalid_request'
	| 'rate_limited'
	| 'internal';

const STATUS_FOR: Record<ApiErrorCode, number> = {
	unauthenticated: 401,
	forbidden: 403,
	not_found: 404,
	invalid_request: 400,
	rate_limited: 429,
	internal: 500
};

/**
 * A thrown API failure.
 *
 * Deliberately *not* SvelteKit's `error()`. That helper renders the app's HTML
 * error page for a browser, which is precisely the wrong answer here — a
 * trading system parsing `<!doctype html>` as JSON gets a `SyntaxError` and no
 * idea what actually went wrong.
 */
export class ApiError extends Error {
	readonly code: ApiErrorCode;
	readonly details: Record<string, unknown> | undefined;

	constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
		super(message);
		this.name = 'ApiError';
		this.code = code;
		this.details = details;
	}

	get status(): number {
		return STATUS_FOR[this.code];
	}
}

export function jsonError(
	error: ApiError,
	requestId: string,
	headers: Record<string, string> = {}
): Response {
	return Response.json(
		{
			error: {
				code: error.code,
				message: error.message,
				requestId,
				...(error.details ? { details: error.details } : {})
			}
		},
		{ status: error.status, headers: { 'X-Request-Id': requestId, ...headers } }
	);
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One limiter for the process.
 *
 * Module scope is right here and wrong in the tests, which is why `RateLimiter`
 * is a class you can instantiate — the unit tests build their own, and this
 * shared one exists only because the server has exactly one.
 */
const limiter = new RateLimiter();

// Idle buckets are dropped every five minutes. `unref` so the timer never holds
// the process open during a shutdown — a server that will not exit because of a
// housekeeping timer is a deploy that hangs.
setInterval(() => limiter.sweep(Date.now()), 5 * 60_000).unref();

/* -------------------------------------------------------------------------- */
/* Authentication                                                              */
/* -------------------------------------------------------------------------- */

export interface ApiContext {
	readonly viewer: Viewer;
	readonly requestId: string;
	/** Rate-limit headers to attach to the successful response too. */
	readonly headers: Record<string, string>;
}

/**
 * Authenticate the caller and charge them a token.
 *
 * Accepts either an API key (`Authorization: Bearer <keyId>.<secret>`) or the
 * browser session cookie. Supporting both is not indulgence: it is what lets
 * the venue's own admin screens call the same endpoints an algorithm does,
 * which in turn is what stops the public API drifting into a second-class
 * citizen that nobody notices is broken.
 *
 * ## The order of operations
 *
 * Authenticate **first**, then rate limit. The other way round would mean
 * unauthenticated traffic shares one bucket, and one broken client could lock
 * every other client out. Keyed on the credential, a client can only ever spend
 * its own budget.
 *
 * The cost of that choice is that a flood of *invalid* credentials is not
 * limited here — that belongs at the edge, in front of the app, where it can be
 * dropped without a database round trip.
 */
export async function authenticate(requestId: string, cost = 1): Promise<ApiContext> {
	const event = getRequestEvent();
	const now = Date.now();

	const header = event.request.headers.get('authorization');

	if (header) {
		const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

		if (!presented) {
			throw new ApiError('unauthenticated', 'Send `Authorization: Bearer <key-id>.<secret>`.');
		}

		const resolved = await viewerFromApiKey(db, presented, now);

		/*
		 * One message for "no such key", "wrong secret" and "revoked".
		 *
		 * Distinguishing them would let somebody with a list of key ids find out
		 * which exist, and a revoked key is exactly as unwelcome as a fictional one.
		 */
		if (!resolved) throw new ApiError('unauthenticated', 'That API key is not usable.');

		const config = bucketFor(resolved.ratePerSecond);
		const verdict = limiter.take(`key:${resolved.keyId}`, config, now, cost);
		const headers = rateLimitHeaders(verdict, config);

		if (!verdict.allowed) {
			throw Object.assign(new ApiError('rate_limited', 'Too many requests.'), { headers });
		}

		return { viewer: resolved.viewer, requestId, headers };
	}

	// A browser, on the same endpoints. `locals.viewer` was resolved in hooks.
	if (event.locals.viewer) {
		const config = bucketFor(50);
		const verdict = limiter.take(`user:${event.locals.viewer.userId}`, config, now, cost);
		const headers = rateLimitHeaders(verdict, config);

		if (!verdict.allowed) {
			throw Object.assign(new ApiError('rate_limited', 'Too many requests.'), { headers });
		}

		return { viewer: event.locals.viewer, requestId, headers };
	}

	throw new ApiError('unauthenticated', 'Authentication required.');
}

/* -------------------------------------------------------------------------- */
/* The handler wrapper                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Wrap a route so that every failure comes out as the same JSON.
 *
 * Without this, each `+server.ts` grows its own try/catch, they drift, and one
 * of them eventually leaks a stack trace containing a file path and a SQL
 * statement to whoever asked for it.
 *
 * The unknown-error branch is the important one. It logs the real thing with a
 * request id and returns a sentence that says nothing — because an exception
 * message is written for whoever wrote the code, not for whoever is calling.
 */
export function handler(
	run: (context: ApiContext, event: RequestEvent) => Promise<Response>,
	options: { cost?: number } = {}
): RequestHandler {
	return async (event) => {
		/*
		 * The request id is minted **here**, before anything can fail.
		 *
		 * An earlier version generated it inside `authenticate`, which meant every
		 * 401 and every rate-limit refusal came back with `requestId: "unknown"` —
		 * exactly the responses somebody is most likely to be holding when they
		 * open a support ticket.
		 */
		const requestId = crypto.randomUUID().slice(0, 12);

		try {
			const context = await authenticate(requestId, options.cost ?? 1);

			const response = await run(context, event);
			for (const [key, value] of Object.entries(context.headers)) {
				response.headers.set(key, value);
			}
			response.headers.set('X-Request-Id', context.requestId);
			return response;
		} catch (thrown) {
			if (thrown instanceof ApiError) {
				const headers = (thrown as ApiError & { headers?: Record<string, string> }).headers ?? {};
				return jsonError(thrown, requestId, headers);
			}

			// The real error goes to the log with the id; the caller gets a sentence
			// that says nothing. An exception message is written for whoever wrote
			// the code, not for whoever is calling.
			console.error(`[api ${requestId}]`, thrown);

			return jsonError(new ApiError('internal', 'Something went wrong at our end.'), requestId);
		}
	};
}

/* -------------------------------------------------------------------------- */
/* Small helpers every route wants                                             */
/* -------------------------------------------------------------------------- */

/** Parse a JSON body, refusing anything that is not an object. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
	let parsed: unknown;

	try {
		parsed = await request.json();
	} catch {
		throw new ApiError('invalid_request', 'The body must be JSON.');
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new ApiError('invalid_request', 'The body must be a JSON object.');
	}

	return parsed as Record<string, unknown>;
}

/**
 * Translate an authorisation denial into an API error.
 *
 * `not_found` stays `not_found` — the tenant-boundary rule from `authz.ts`
 * survives the trip out to HTTP, which it would not if this mapped everything
 * to 403 for tidiness.
 */
export function apiErrorFrom(thrown: unknown): ApiError {
	if (thrown instanceof ApiError) return thrown;

	const reason = (thrown as { reason?: string })?.reason;

	if (reason === 'not_found') return new ApiError('not_found', 'Not found.');
	if (reason !== undefined) {
		return new ApiError('forbidden', thrown instanceof Error ? thrown.message : 'Forbidden.');
	}

	throw thrown;
}
