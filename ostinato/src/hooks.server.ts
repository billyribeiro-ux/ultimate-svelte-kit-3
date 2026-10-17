/**
 * SERVER HOOKS
 * ============
 *
 * Handlers composed with `sequence`, in an order that matters:
 *
 *   1. identity — reads the artist cookie into `locals.artist`
 *   2. security — headers, and which fonts to preload
 *
 * plus `handleFetch`, `handleError` and `init`. The universal hooks —
 * `transport` and `reroute` — live in `src/hooks.ts` because the browser
 * needs them too.
 */

import { building } from '$app/env';
import { SESSION_SECRET, TRACE_BUFFER } from '$app/env/private';
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
import { SECURITY_HEADERS } from '#lib/security.ts';
import { COOKIE, verify } from '#lib/server/identity.ts';
import { setCapacity } from '#lib/server/tracing.ts';

/*
 * The artist goes into `locals` and nowhere else. In particular not onto the
 * request's span: the spans are read back by `/diagnostics`, a page anybody
 * can open, and a handle beside every path somebody visited is a record of
 * what they did, published.
 */
const handleIdentity: Handle = async ({ event, resolve }) => {
	const artist = await verify(event.cookies.get(COOKIE), SESSION_SECRET);
	if (artist) event.locals.artist = artist;
	return resolve(event);
};

/**
 * The latin subsets, and only those. Outfit ships several; the `unicode-range`
 * on each `@font-face` means the browser fetches only what a page needs, and
 * for this interface that is latin.
 */
const PRELOAD_FONTS = [
	'@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2',
	'@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'
];

const handleSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event, {
		/*
		 * Preload the two fonts the first paint needs, by source filename.
		 *
		 * SvelteKit preloads `js` and `css` by default and never fonts. In
		 * SvelteKit 3 a `font` input carries its `filename` — the project-relative
		 * source path, before hashing — so this can name the exact file rather than
		 * guessing at a hashed URL. `endsWith`, because the path begins with a
		 * `node_modules/` prefix that a pnpm store layout can make longer than it
		 * looks.
		 */
		preload: (input) => {
			if (input.type === 'js' || input.type === 'css') return true;
			if (input.type !== 'font') return false;
			return PRELOAD_FONTS.some((font) => input.filename.endsWith(font));
		}
	});

	// The same three the adapter puts on every file it serves (`lib/security.ts`).
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);

	/*
	 * `Vary: Cookie` on the pages, because the header shows the artist's handle
	 * and a shared cache must not serve one person's page to another. The API
	 * and the remote functions are exempt: they set their own cache headers.
	 */
	if (!event.url.pathname.startsWith('/api/') && !event.url.pathname.startsWith('/_app/')) {
		response.headers.append('vary', 'Cookie');
	}

	return response;
};

export const handle: Handle = sequence(handleIdentity, handleSecurity);

/**
 * `handleFetch` sees every `fetch` made with the event's `fetch` — in `load`,
 * in remote functions, and in the `reroute` hook, which is the one this app
 * actually makes.
 *
 * SAME ORIGIN: LEFT TO SVELTEKIT
 * ------------------------------
 * A same-origin call is passed straight on. SvelteKit answers it in-process,
 * without a socket, by calling its own `respond` — and when the server it is
 * running in has no route for the path, it makes a real HTTP request instead
 * (`respond.js`: "we can't load the endpoint from our own manifest, so we need
 * to make an actual HTTP request"). That fallback is what carries the
 * adapter's catch-all, which has no routes at all, to the `api` function when
 * `reroute` asks `/api/resolve` what `/@handle/slug` means. It is also why
 * `PUBLIC_ORIGIN` has to name the port the server is really on: the fallback
 * request goes to the request's own origin. The vanity-address test in
 * `e2e/pattern.e2e.ts` is the proof that nothing more is needed here.
 *
 * Anything else — there is nothing else today, and the point of writing the
 * branch is that "today" is a word that stops being true — gets a ten second
 * timeout and a `User-Agent` that says who is calling.
 */
export const handleFetch: HandleFetch = ({ request, fetch, event }) => {
	const url = new URL(request.url);

	if (url.origin === event.url.origin) {
		// During `reroute` the route is not yet known and there is no span to
		// annotate; the optional chain is the difference between a note in a
		// trace and a 500 on every vanity address.
		event.tracing?.current?.addEvent('fetch.internal', { 'url.path': url.pathname });
		return fetch(request);
	}

	return fetch(
		new Request(request, {
			signal: AbortSignal.timeout(10_000),
			headers: new Headers([...request.headers, ['user-agent', 'Ostinato/1.0']])
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
 * SvelteKit 3 folded the old `handleValidationError` hook into this one: a
 * validation failure arrives with `kind: 'validation'` and its `issues`.
 * In the app's own code that cannot happen — the types would not compile —
 * so it is either an old tab on a new deployment or somebody prodding the
 * endpoints, and neither deserves detail. The log gets the path of the first
 * issue; the caller gets a sentence.
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
 * Runs once, before the first request.
 *
 * Reaching the database here turns "the deploy is broken" into a process that
 * never claims to be healthy, which is what a load balancer needs in order to
 * keep the old version serving. The default jam room is created here too, so
 * `/jam/lobby` exists on a fresh database without a seed.
 */
export const init: ServerInit = async () => {
	if (building) return;

	setCapacity(TRACE_BUFFER);

	const { ensureLobby } = await import('#lib/server/rooms.ts');
	await ensureLobby();
};
