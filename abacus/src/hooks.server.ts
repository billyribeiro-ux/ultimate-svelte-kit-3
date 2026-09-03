/**
 * SERVER HOOKS
 * ============
 *
 * Handlers composed with `sequence`, in an order that matters:
 *
 *   1. identity — reads the session cookie into `locals.user`
 *   2. security — headers, which fonts to preload, and the one route that may
 *      be framed
 *
 * plus `handleFetch`, `handleError` and `init`. The universal hooks —
 * `transport` and `reroute` — live in `src/hooks.ts` because the browser
 * needs them too.
 */

import { building } from '$app/env';
import { SESSION_SECRET } from '$app/env/private';
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
import { COOKIE, verify } from '#lib/server/identity.ts';

const handleIdentity: Handle = async ({ event, resolve }) => {
	const user = await verify(event.cookies.get(COOKIE), SESSION_SECRET);
	if (user) event.locals.user = user;
	return resolve(event);
};

/**
 * The latin subsets, and only those. Inter ships several; the `unicode-range`
 * on each `@font-face` means the browser fetches only what a page needs, and
 * for this interface that is latin.
 */
const PRELOAD_FONTS = [
	'@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
	'@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'
];

const handleSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event, {
		/*
		 * Preload the two fonts the first paint needs, by source filename.
		 *
		 * SvelteKit preloads `js` and `css` by default and never fonts. Since
		 * 3.0.0-next.24 a `font` input carries its `filename` — the project-relative
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
	response.headers.set('permissions-policy', 'microphone=(), camera=(), geolocation=()');

	/*
	 * THE ONE ROUTE THAT MAY BE FRAMED
	 * --------------------------------
	 * `vite.config.ts` says `frame-ancestors 'none'` for the whole app, which
	 * is right: a spreadsheet inside somebody else's iframe is a clickjacking
	 * target. `/embed/<id>` exists to be framed — it is a read-only view of a
	 * published sheet for other people's pages — so for that route, and only
	 * that route, the directive is replaced after SvelteKit has built the
	 * policy. The config is the rule; the hook is the exception, stated once.
	 */
	if (event.url.pathname.startsWith('/embed/')) {
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
	 * and a shared cache must not serve one person's page to another. The API
	 * and the remote functions set their own cache headers.
	 */
	if (!event.url.pathname.startsWith('/api/') && !event.url.pathname.startsWith('/_app/')) {
		response.headers.append('vary', 'Cookie');
	}

	return response;
};

export const handle: Handle = sequence(handleIdentity, handleSecurity);

/**
 * `handleFetch` sees every `fetch` made with the event's `fetch`. A same-origin
 * call is left to SvelteKit, which answers it in-process; anything else gets a
 * ten second timeout and a `User-Agent` that says who is calling. There is
 * no "anything else" today, and the point of writing the branch is that
 * "today" is a word that stops being true.
 */
export const handleFetch: HandleFetch = ({ request, fetch, event }) => {
	if (new URL(request.url).origin === event.url.origin) return fetch(request);
	return fetch(
		new Request(request, {
			signal: AbortSignal.timeout(10_000),
			headers: new Headers([...request.headers, ['user-agent', 'Abacus/1.0']])
		})
	);
};

/**
 * Every error the server catches, in one place, told apart by `kind`.
 *
 *   `app`         a deliberate `error(404, …)` — already says what it means
 *   `framework`   SvelteKit's own: a 404 for a missing route, a bad request
 *   `validation`  a remote function argument that failed its schema
 *   `unknown`     something genuinely broken — the only one worth an id
 *
 * Returning nothing keeps SvelteKit's defaults — the status and the safe
 * message — which is right for `app` and `framework` errors.
 */
export const handleError: HandleServerError = ({ error, event, kind, issues }) => {
	if (kind === 'validation') {
		const first = issues[0];
		const path = first?.path
			?.map((segment) => (typeof segment === 'object' ? String(segment.key) : String(segment)))
			.join('.');
		console.warn(`validation failed for ${event.url.pathname}${path ? ` at ${path}` : ''}`);
		return { message: 'That request did not make sense.' };
	}

	if (kind !== 'unknown') return;

	const id = crypto.randomUUID();
	console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, error);
	return { message: 'Something went wrong on our side.', id };
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
