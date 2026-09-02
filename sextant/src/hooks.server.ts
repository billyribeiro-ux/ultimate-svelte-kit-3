/**
 * SERVER HOOKS
 * ============
 *
 * Three handlers, composed with `sequence`, in an order that matters:
 *
 *   1. auth      — populates `locals.user`, and owns `/api/auth/*`
 *   2. security  — headers
 *   3. resolve   — the rest of the application
 */

import { building } from '$app/env';
/*
 * SvelteKit 3 moved every hook type into `@sveltejs/kit/hooks`. Importing them
 * from `@sveltejs/kit` compiles to `any` for each destructured argument — which
 * is not an error, so the file keeps working and every parameter silently loses
 * its type.
 */
import {
	sequence,
	type Handle,
	type HandleFetch,
	type HandleServerError,
	type ServerInit
} from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';

const handleAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	/*
	 * `svelteKitHandler` owns `/api/auth/*` and passes everything else through.
	 *
	 * `building` matters: during prerendering there is no request to read a
	 * session from, and without this flag the auth routes are invoked at build
	 * time and fail on a database that may not exist yet.
	 */
	return svelteKitHandler({ event, resolve, auth, building });
};

const handleSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');

	/*
	 * `Vary: Cookie` on anything a signed-in person sees.
	 *
	 * Without it a shared cache can serve one tenant's rendered page to another,
	 * which in a product whose whole content is other people's logs is the worst
	 * possible caching bug. The ingest endpoint is exempt because it has no cookie
	 * and answers the same to everybody with the same key.
	 */
	if (!event.url.pathname.startsWith('/api/v1/')) {
		response.headers.append('vary', 'Cookie');
	}

	return response;
};

export const handle: Handle = sequence(handleAuth, handleSecurity);

/**
 * OUTBOUND REQUESTS
 * =================
 *
 * `handleFetch` intercepts `fetch` calls made inside `load` functions and remote
 * functions. Two jobs here, and the second is the one worth having.
 *
 * **Internal calls skip the network.** A `load` that fetches its own app's
 * endpoint would otherwise make a real HTTP request to itself — a socket, a
 * round trip through the router, and a second copy of everything. Rewriting the
 * URL is what lets SvelteKit answer it directly.
 *
 * **Outbound calls get a timeout and a header.** An alert notification goes to
 * somebody else's webhook, and somebody else's webhook can hang forever. Without
 * a signal here, one slow endpoint holds a request open until the platform's own
 * timeout — which is measured in minutes and is not a limit anybody chose.
 */
export const handleFetch: HandleFetch = async ({ request, fetch, event }) => {
	const url = new URL(request.url);

	if (url.origin === event.url.origin) {
		return fetch(request);
	}

	/*
	 * Ten seconds, and a `User-Agent` that says who is calling.
	 *
	 * The header is not politeness: when a webhook receiver starts refusing
	 * requests, the first question its owner asks is what is making them, and
	 * "node" is not an answer. `AbortSignal.timeout` rather than a manual
	 * controller because it clears itself — a manual one leaks a timer per
	 * request that completed normally.
	 */
	return fetch(
		new Request(request, {
			signal: AbortSignal.timeout(10_000),
			headers: new Headers([
				...request.headers,
				['user-agent', 'Sextant/1.0 (+https://github.com/sextant)']
			])
		})
	);
};

/**
 * Turn an unexpected throw into something a person can quote back.
 *
 * `kind` rather than a status code: SvelteKit 3 discriminates the three cases
 * that used to be inferred from a number. `app` is a deliberate `error(...)` and
 * already says what it means, `framework` is a 404 or a malformed request, and
 * `unknown` is something genuinely broken — only the last is worth a log line
 * and an id, because writing a correlation id for every 404 buries the one that
 * matters.
 */
export const handleError: HandleServerError = ({ error, event, kind }) => {
	if (kind !== 'unknown') return;

	const id = crypto.randomUUID();
	console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, error);

	return { message: 'Something went wrong on our side.', id };
};

/**
 * Runs once, before the first request.
 *
 * Reaching the database here turns "the deploy is broken" into a process that
 * never claims to be healthy, which is what a load balancer needs in order to
 * keep the old version serving.
 */
export const init: ServerInit = async () => {
	if (building) return;

	const { db } = await import('#lib/server/db/index.ts');
	const { sql } = await import('drizzle-orm');
	await db.run(sql`select 1`);

	/*
	 * The background loops start here, after the database has answered.
	 *
	 * Starting them at module scope would run them during the build — `init` is the
	 * hook that says "a real server is coming up" — and starting them before the
	 * `select 1` would have the first alert evaluation racing a database that is
	 * not there yet.
	 *
	 * BOTH ASSUME A SINGLE PROCESS, AND THAT IS A REAL LIMIT.
	 *
	 * Two instances behind a load balancer would each evaluate every rule and each
	 * drain the same outbox, so every alert is delivered twice. Making this
	 * multi-process needs a lease — a row somebody holds for thirty seconds and
	 * renews — and that is genuinely the next piece of work rather than something
	 * this comment can wave away. Saying so here is better than a deployment
	 * discovering it.
	 */
	const { startAlertLoop, startOutboxWorker } = await import('#lib/server/alerts.ts');
	startAlertLoop();
	startOutboxWorker();
};
