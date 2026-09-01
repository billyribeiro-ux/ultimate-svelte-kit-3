/**
 * SERVER HOOKS
 * ============
 *
 * Four handlers, composed with `sequence`, in an order that matters:
 *
 *   1. locale    — needed by everything that renders text, including errors
 *   2. auth      — populates `locals.user`, and owns `/api/auth/*`
 *   3. security  — headers, including the two the export worker cannot run without
 *   4. resolve   — the rest of the app
 *
 * Getting (1) after (2) would mean an unauthenticated error page renders in
 * English for a French visitor, which is a small thing that reads as carelessness.
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
	type HandleServerError,
	type ServerInit
} from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';
import { DEFAULT_LOCALE, HTML_LANG, isLocale, negotiate, type Locale } from '#lib/i18n/index.ts';

/**
 * Work out the language before anything renders.
 *
 * Order of preference: an explicit prefix in the URL, then the cookie somebody
 * set by using the language switcher, then the browser's own header. The header
 * comes last because it is a guess about a person and the other two are
 * statements by one.
 */
const handleLocale: Handle = async ({ event, resolve }) => {
	const [, first] = event.url.pathname.split('/');
	const cookie = event.cookies.get('locale');

	const locale: Locale = isLocale(first)
		? first
		: isLocale(cookie)
			? cookie
			: negotiate(event.request.headers.get('accept-language'));

	event.locals.locale = locale;

	return resolve(event, {
		/*
		 * `%lang%` in `app.html`, replaced here.
		 *
		 * Not decoration: `lang` decides which dictionary a screen reader
		 * pronounces the page with, and how the browser hyphenates and selects
		 * fonts. A French page announced by an English voice is close to unusable,
		 * and it is one attribute.
		 */
		transformPageChunk: ({ html }) => html.replace('%lang%', HTML_LANG[locale] ?? DEFAULT_LOCALE)
	});
};

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

/**
 * Headers.
 *
 * `cross-origin-opener-policy` and `cross-origin-embedder-policy` are what make
 * `SharedArrayBuffer` available, which the export worker uses to hand back pixel
 * data without copying a multi-megabyte buffer through `postMessage`.
 *
 * They are scoped to the application's own pages rather than set globally,
 * because `require-corp` also forbids loading any cross-origin resource that
 * does not opt in — and the embed route deliberately renders inside other
 * people's sites. Turning it on there would break the one page whose whole
 * purpose is to be embedded.
 */
const handleSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	if (!event.url.pathname.startsWith('/embed/')) {
		response.headers.set('cross-origin-opener-policy', 'same-origin');
		response.headers.set('cross-origin-embedder-policy', 'require-corp');
	}

	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');

	return response;
};

export const handle: Handle = sequence(handleLocale, handleAuth, handleSecurity);

/**
 * Turn an unexpected throw into something a person can quote back to us.
 *
 * The `id` is the only part shown to the user; the rest goes to the log. Sending
 * a stack trace to the browser tells an attacker the shape of the codebase, and
 * tells everybody else nothing.
 */
export const handleError: HandleServerError = ({ error, event, kind }) => {
	/*
	 * `kind` rather than a status code.
	 *
	 * SvelteKit 3 discriminates the three cases that used to be inferred from a
	 * number: `app` is a deliberate `error(...)` call and already says what it
	 * means, `framework` is a 404 or a malformed request, and `unknown` is
	 * something genuinely broken. Only the last is worth a log line and an id —
	 * writing a correlation id for every 404 buries the one that matters.
	 */
	if (kind !== 'unknown') return;

	const id = crypto.randomUUID();
	console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, error);

	// Only the overrides. Anything omitted keeps SvelteKit's default, so there is
	// no need to restate the status or invent a message for a case we did not
	// mean to handle.
	return { message: 'Something went wrong on our side.', id };
};

/**
 * Runs once, before the first request is served.
 *
 * A place to fail loudly at boot rather than quietly on the first person to open
 * a board. Reaching the database here turns "the deploy is broken" into a
 * process that never claims to be healthy, which is what a load balancer needs
 * in order to keep the old version serving.
 */
export const init: ServerInit = async () => {
	if (building) return;

	const { db } = await import('#lib/server/db/index.ts');
	const { sql } = await import('drizzle-orm');
	await db.run(sql`select 1`);
};
