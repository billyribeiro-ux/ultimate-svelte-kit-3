import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';

/**
 * Server hooks: the code that runs on every request, before any route does.
 *
 * `sequence` composes several handles into one. Each receives the next as its
 * `resolve`, so they nest like middleware — the first one wraps everything after
 * it. Order therefore matters, and it is the order they appear at the bottom of
 * this file.
 */

/**
 * Work out who is making this request, once, and put the answer on `locals`.
 *
 * Doing it here rather than in each `load` means a page never has to ask, and —
 * more importantly — never has to *remember* to ask. `locals` is per-request, so
 * there is no way for one visitor's session to be visible to another; the object
 * is created fresh by SvelteKit for every request and thrown away after.
 *
 * `svelteKitHandler` must wrap `resolve`, because Better Auth also owns the
 * `/api/auth/*` routes — sign-in, sign-out, session refresh — and they are not
 * SvelteKit routes at all. It intercepts those and passes everything else on.
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * Security headers.
 *
 * Small, cheap, and the sort of thing that gets postponed until an audit asks
 * for it. Set here so every response has them, including error pages — which are
 * exactly the responses people forget.
 */
const handleHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Never let a browser guess a response is HTML when we said it was not.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	// Do not leak the path a customer came from to another site.
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// We use none of these. Saying so is free.
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	return response;
};

export const handle: Handle = sequence(handleAuth, handleHeaders);

/**
 * What to do with an error nobody caught.
 *
 * SvelteKit 3 hands this a `kind` that says where the error came from, and that
 * distinction is the whole value of the hook:
 *
 *   `app`        — we threw it ourselves with `error(403, '…')`. Intentional.
 *   `framework`  — SvelteKit generated it, e.g. a 404. Expected.
 *   `validation` — a remote function was called with arguments that failed its
 *                  schema. Usually a stale client, occasionally somebody poking.
 *   `unknown`    — something genuinely broke. This is the only one that is a bug.
 *
 * Logging all four fills the log with 404s from bots and buries the one entry
 * that mattered. Logging only `unknown` means every line in the error log is
 * something a person should look at.
 *
 * Whatever is returned reaches `+error.svelte` and is therefore shown to the
 * person who triggered it, so it must never carry a stack trace, a query, or a
 * database message. `id` is the bridge: the same short code goes to the log and
 * to the screen, so "it said error a3f9c1" is a support ticket that can actually
 * be traced. Omitted fields keep SvelteKit's own defaults.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') {
		// Keep the framework's status and message; just satisfy our own `App.Error`.
		return {};
	}

	const id = crypto.randomUUID().slice(0, 8);

	console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, error);

	return {
		id,
		message: 'Something went wrong at our end. Please try again.'
	};
};
