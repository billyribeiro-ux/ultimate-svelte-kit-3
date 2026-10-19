/**
 * SERVER HOOKS
 * ============
 *
 * Handlers composed with `sequence`, in an order that matters:
 *
 *   1. paraglide — works out the locale for this request and strips the
 *      `/de` prefix off the URL SvelteKit routes on
 *   2. auth      — reads the session into `locals.user`, and answers the
 *      `/api/auth/*` routes that Better Auth owns
 *   3. security  — headers, which fonts to preload, and the one route that
 *      may be framed
 *
 * plus `handleFetch`, `handleError` and `init`. The universal hooks —
 * `reroute` and `transport` — live in `src/hooks.ts` because the browser
 * needs them too.
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
import { m } from '#lib/paraglide/messages.js';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { auth } from '#lib/server/auth.ts';
import { localeUrl } from '#lib/server/locale-url.ts';

/**
 * Paraglide's middleware does two things around `resolve`: it decides the
 * locale from the URL, the cookie or `Accept-Language` (in the order
 * `vite.config.ts` gave it), and it stores that locale in an
 * `AsyncLocalStorage`, so `m.some_message()` anywhere in this request — a
 * remote function, a `load`, a component, the sentence in an `error()` —
 * speaks the right language without being told.
 *
 * The middleware also offers a request whose URL has had the `/de` prefix
 * removed. It is not used: `event.request` is read-only in SvelteKit 3,
 * and the routing half of the job belongs to `reroute` in `src/hooks.ts`,
 * which the browser runs too. Two mechanisms for the same rewrite is how a
 * redirect loop starts, and Paraglide's own docs say so.
 *
 * The two placeholders in `app.html` are filled here, once, so every page
 * says `<html lang="de">` without a layout having to know. `replaceAll`,
 * not `replace`: with a string pattern `replace` swaps the *first* match,
 * and the first match was the one in the comment above the `<html>` tag —
 * a bug that shipped a page that looked right and said `lang="%paraglide.lang%"`.
 *
 * WHICH URL SAYS THE LANGUAGE
 * ---------------------------
 * Not the request's own URL, which for a remote function is its endpoint,
 * `/_app/remote/…`, with no `/de` in it — and the URL strategy's answer for
 * a URL with no prefix is English, so the cookie was never asked. Read that
 * way, a German sign-in form answered "Enter an email address" from its
 * schema while the rest of the page spoke German. `localeUrl` gives the
 * middleware a URL that carries the language: the calling page, which
 * SvelteKit puts back into `event.url` for a form or a command, and for a
 * `query` — which comes from no page — the endpoint under the cookie's
 * language (`#lib/server/locale-url.ts` says how, and why that order).
 */
const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(
		event.request,
		({ locale }) =>
			resolve(event, {
				transformPageChunk: ({ html }) =>
					html
						.replaceAll('%paraglide.lang%', locale)
						.replaceAll('%paraglide.dir%', getTextDirection(locale))
			}),
		{ effectiveRequestUrl: localeUrl(event) }
	);

/**
 * Who is making this request, once, on `locals`, so no page has to ask —
 * and, more importantly, no page has to *remember* to ask.
 *
 * `svelteKitHandler` wraps `resolve` because Better Auth owns the
 * `/api/auth/*` routes — sign-in, sign-out, session refresh — and they are
 * not SvelteKit routes. It answers those and passes everything else on.
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
 * The latin subsets, and only those. Both fonts ship several; the
 * `unicode-range` on each `@font-face` means the browser fetches only what
 * a page needs, and for this interface that is latin.
 */
const PRELOAD_FONTS = [
	'@fontsource-variable/fraunces/files/fraunces-latin-standard-normal.woff2',
	'@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
];

const handleSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event, {
		/*
		 * Preload the two fonts the first paint needs, by source filename.
		 *
		 * SvelteKit preloads `js` and `css` by default and never fonts. Since
		 * SvelteKit 3 a `font` input carries its `filename` — the project-relative
		 * source path, before hashing — so this can name the exact file rather than
		 * guessing at a hashed URL.
		 */
		preload: (input) => {
			if (input.type === 'js' || input.type === 'css') return true;
			if (input.type !== 'font') return false;
			return PRELOAD_FONTS.some((font) => input.filename.endsWith(font));
		}
	});

	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	// Geolocation is the one capability this app asks for: "where am I" on the map.
	response.headers.set('permissions-policy', 'microphone=(), camera=(), geolocation=(self)');

	/*
	 * THE ONE ROUTE THAT MAY BE FRAMED
	 * --------------------------------
	 * `vite.config.ts` says `frame-ancestors 'none'` for the whole app, which
	 * is right: a trip planner inside somebody else's iframe is a clickjacking
	 * target. `/embed/<slug>` exists to be framed — it is the read-only route
	 * summary the custom element loads — so for that route, and only that
	 * route, the directive is replaced after SvelteKit has built the policy.
	 *
	 * "That route" is `event.route.id`, not the path in the address bar.
	 * `reroute` serves `/de/embed/<slug>` from the same route, and a pathname
	 * test let the German frame keep `frame-ancestors 'none'`. A route id is
	 * what the router matched, after `reroute`; a pathname is what was typed.
	 */
	if (event.route.id === '/embed/[slug=slug]') {
		const policy = response.headers.get('content-security-policy');
		if (policy) {
			response.headers.set(
				'content-security-policy',
				policy.replace(/frame-ancestors [^;]*/, 'frame-ancestors *')
			);
		}
	}

	/*
	 * `Vary: Cookie` on the pages, because the header shows the person's name
	 * and the locale cookie changes the language, and a shared cache must not
	 * serve one person's page to another. Not on the machine endpoints, whose
	 * answers name nobody, and not on remote function calls — by route and by
	 * request kind, for the reason above: `/de/api/…` is the same endpoint.
	 */
	if (!event.isRemoteRequest && !event.route.id?.startsWith('/api/')) {
		response.headers.append('vary', 'Cookie');
	}

	return response;
};

export const handle: Handle = sequence(handleParaglide, handleAuth, handleSecurity);

/**
 * `handleFetch` sees every `fetch` made with the event's `fetch`. A same-origin
 * call is left to SvelteKit, which answers it in-process; anything else gets a
 * ten second timeout and a `User-Agent` that says who is calling.
 */
export const handleFetch: HandleFetch = ({ request, fetch, event }) => {
	if (new URL(request.url).origin === event.url.origin) return fetch(request);
	return fetch(
		new Request(request, {
			signal: AbortSignal.timeout(10_000),
			headers: new Headers([...request.headers, ['user-agent', 'Meridian/1.0']])
		})
	);
};

/**
 * Every error the server catches, in one place, told apart by `kind`.
 *
 *   `app`         a deliberate `error(404, m.error_no_trip())` — already says
 *                 what it means, in the request's language
 *   `framework`   SvelteKit's own: a 404 for a missing route, a bad request
 *   `validation`  a remote function argument that failed its schema
 *   `unknown`     something genuinely broken — the only one worth an id
 *
 * Returning nothing keeps SvelteKit's defaults — the status and the safe
 * message — which is right for `app` and `framework` errors. The two
 * messages written here are Paraglide's: this hook runs inside the request,
 * so they come out in the request's language — a German page that sent a
 * bad request reads German in its toast.
 */
export const handleError: HandleServerError = ({ error, event, kind, issues }) => {
	if (kind === 'validation') {
		const first = issues[0];
		const path = first?.path
			?.map((segment) => (typeof segment === 'object' ? String(segment.key) : String(segment)))
			.join('.');
		console.warn(`validation failed for ${event.url.pathname}${path ? ` at ${path}` : ''}`);
		return { message: m.error_bad_request() };
	}

	if (kind !== 'unknown') return;

	const id = crypto.randomUUID();
	console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, error);
	return { message: m.error_server(), id };
};

/**
 * Runs once, before the first request. Reaching the database here turns "the
 * deploy is broken" into a process that never claims to be healthy — which is
 * what a load balancer needs in order to keep the old version serving.
 */
export const init: ServerInit = async () => {
	if (building) return;
	const { client } = await import('#lib/server/db/index.ts');
	await client.execute('select 1');
};
