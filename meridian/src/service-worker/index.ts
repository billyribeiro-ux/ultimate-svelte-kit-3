/**
 * THE OFFLINE ITINERARY
 * =====================
 *
 * A trip opened once can be read again with no network: in a train tunnel,
 * on a plane, on a ferry between islands. That is the whole promise, and
 * this file keeps it with two caches and four rules.
 *
 *   - The build is copied on install. Vite's hashed output (`immutable`) is
 *     then served from the copy: a new version of one of those files gets a
 *     new name, so the copy can never be out of date.
 *   - The rest of the build — `static/` and everything prerendered — keeps
 *     its name from one deploy to the next (`guides/…`, `api/world.json`),
 *     so it is asked of the network first and the install-time copy is only
 *     the offline answer. Served from the copy, a guide edited in the next
 *     deploy would stay old *online* until every tab had closed.
 *   - A page is asked of the network first, every time, and a copy is kept.
 *     With no network, the copy is served. Online, the page is always
 *     today's; offline, it is the last one this device saw.
 *   - Everything else is not touched. A remote function's request — a
 *     query, a command, the live stream — and a `__data.json` go to the
 *     network exactly as if there were no worker, and fail as they would
 *     without one. A query answered from a cache would show yesterday's
 *     itinerary *online*, and the live stream cannot be cached at all.
 *
 * SvelteKit bundles this file for production and registers it itself:
 * `src/service-worker/index.ts` existing is the whole of the setup. It is
 * not bundled in development, so `pnpm dev` never runs it.
 */

import { self } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { PAGES } from '#lib/offline/pages.ts';

/*
 * The deploy's `version` names the build's cache, as it names the pages'.
 * A new deploy installs a new worker with a new, empty cache beside the
 * old; when it takes over, `activate` deletes the old.
 */
const BUILD = `meridian-build-${version}`;

/*
 * `$app/manifest` lists the build. Its paths are relative to the base
 * path — `_app/immutable/…`, `robots.txt`, `guides` — and the worker's
 * scope *is* the base path (SvelteKit serves the worker from there), so
 * resolving a path against the scope gives the pathname a request for it
 * will have, which is what the `fetch` handler compares. Not `resolve()`
 * from `$app/paths`: its argument is typed as a route or a pathname of
 * this app, and it refuses a hashed build file at compile time, rightly.
 * `immutable` and `prerendered` are empty in development, one more
 * reason the worker only runs in a build.
 */
const inScope = (path: string) => new URL(path, self.registration.scope).pathname;

const FILES = [...immutable, ...assets, ...prerendered].map((file) => inScope(file.path));
const IN_BUILD = new Set(FILES);
/** The files whose names change when their content does. */
const HASHED = new Set(immutable.map((file) => inScope(file.path)));

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(BUILD).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((names) =>
			Promise.all(
				names
					// Only this app's caches: SvelteKit keeps one of its own
					// (`sveltekit:<version>`, for prerendered remote functions).
					.filter((name) => name.startsWith('meridian-') && name !== BUILD && name !== PAGES)
					.map((name) => caches.delete(name))
			)
		)
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (HASHED.has(url.pathname)) {
		event.respondWith(fromBuild(url, request));
	} else if (IN_BUILD.has(url.pathname)) {
		event.respondWith(fresh(url, request));
	} else if (request.mode === 'navigate' && !url.pathname.startsWith('/api/')) {
		event.respondWith(page(event));
	}
	// Anything else: no `respondWith`, so the browser fetches it itself.
});

/** A hashed file of the build: from the copy made on install. */
async function fromBuild(url: URL, request: Request): Promise<Response> {
	const copy = await caches.match(url.pathname, { cacheName: BUILD });
	return copy ?? fetch(request);
}

/** A build file whose name outlives its content: the network, then the copy. */
async function fresh(url: URL, request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch (offline) {
		const copy = await caches.match(url.pathname, { cacheName: BUILD });
		if (copy) return copy;
		throw offline;
	}
}

/**
 * A page: the network's answer if there is one, and a copy kept for later;
 * the kept copy if there is not.
 *
 * The copy is written with `waitUntil`, beside the response rather than in
 * front of it, so the page streams to the screen while it is being kept.
 *
 * `ignoreVary`: the server sends `Vary: Cookie` on its pages, so that a
 * shared cache never hands one person's page to another. This cache is not
 * shared — it is this device's, it holds one person's pages, and the app
 * empties it when they sign out (`#lib/offline/pages.ts`) — and a worker
 * never sees the cookie anyway.
 */
async function page(event: FetchEvent): Promise<Response> {
	const { request } = event;
	try {
		const response = await fetch(request);
		if (worthKeeping(response)) {
			const copy = response.clone();
			event.waitUntil(caches.open(PAGES).then((cache) => cache.put(request, copy)));
		}
		return response;
	} catch (offline) {
		const kept = await caches.match(request, { cacheName: PAGES, ignoreVary: true });
		if (kept) return kept;
		throw offline;
	}
}

/**
 * Only a whole page is worth keeping. A redirect reaches the worker as an
 * opaque response with status 0, so it is never kept under the address it
 * came from; an error page is not the page; an endpoint answers something
 * that is not HTML; and `no-store` is the server saying "never write this
 * down", which a cache of the server's answers has to obey.
 */
function worthKeeping(response: Response): boolean {
	const type = response.headers.get('content-type') ?? '';
	const caching = response.headers.get('cache-control') ?? '';
	return response.status === 200 && type.startsWith('text/html') && !caching.includes('no-store');
}
