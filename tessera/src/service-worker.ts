/// <reference types="@sveltejs/kit" />

/**
 * THE SERVICE WORKER
 * ==================
 *
 * Tessera already works offline: the document lives in IndexedDB and edits queue
 * in an outbox. What it *cannot* do without this file is start while offline —
 * the browser has no HTML, no JavaScript and no CSS to run any of that with.
 *
 * So this worker has exactly one job: make the application shell available with
 * no network. Everything about the *data* is somebody else's problem, and
 * deliberately so; a worker that also cached API responses would become a third
 * cache with its own idea of the truth, alongside IndexedDB and the server.
 *
 * THREE RULES
 * -----------
 *   `immutable`, `assets`  cache-first, forever. Vite's output carries a content
 *                          hash in the URL, so a changed file is a *different*
 *                          file and a cached one can never be stale.
 *   navigations            network first, shell from cache on failure. The other
 *                          order serves yesterday's HTML to somebody who is
 *                          online, which is the classic way a deployed fix
 *                          appears not to have deployed.
 *   everything else        straight to the network, never cached. That is the
 *                          rule that keeps the operation stream and the remote
 *                          functions out of here.
 *
 * WHERE THESE LISTS COME FROM
 * ---------------------------
 * SvelteKit 3 split the old `$service-worker` module apart: the build manifest
 * is `$app/manifest` (`immutable`, `assets`, `prerendered`, `routes`), the build
 * id is `version` from `$app/env`, and `$app/service-worker` now exports only a
 * correctly-typed `self`. Bringing the SvelteKit 2 import forward gives four
 * "has no exported member" errors at once, which at least says so plainly.
 */

import { self } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';

/*
 * `version` is unique per build, so a new deployment gets a new cache and the
 * old one is deleted on activate. Naming the cache anything stable is how a
 * service worker ends up serving an application from two releases ago with no
 * way to clear it short of asking people to open devtools.
 */
const CACHE = `tessera-${version}`;

/**
 * Everything the shell needs, known at build time.
 *
 * `immutable` is Vite's hashed output; `assets` is whatever is in `static/`,
 * which for this application is the two font files. Both arrive as
 * `{ path }` objects rather than bare strings.
 */
const PRECACHE = [...immutable, ...assets].map((entry) => entry.path);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			// Activate immediately rather than waiting for every tab to close. The
			// alternative leaves somebody on an old shell for as long as they keep a
			// tab open, which for a tool people leave open all day is forever.
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;

	// Only GET is cacheable, and only our own origin is ours to cache.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	/*
	 * The stream and the remote functions never touch the cache.
	 *
	 * `/api/boards/…/stream` is an endless response; putting it through a
	 * cache-aware handler is at best pointless and at worst holds the whole
	 * response in memory waiting for an end that never comes.
	 */
	if (url.pathname.startsWith('/api/') || url.pathname.includes('/_app/remote/')) return;

	event.respondWith(respond(request, url));
});

async function respond(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(CACHE);

	// Hashed assets: cache first, and never revalidate.
	if (PRECACHE.includes(url.pathname)) {
		const hit = await cache.match(url.pathname);
		if (hit) return hit;
	}

	try {
		const response = await fetch(request);

		/*
		 * `response.status === 200` and nothing else.
		 *
		 * A redirect, a 206 range response or an opaque cross-origin response all
		 * break `cache.put` in ways that surface much later as a blank page. This
		 * is one of the few places where being conservative costs nothing.
		 */
		if (response.status === 200 && request.mode === 'navigate') {
			cache.put(request, response.clone());
		}

		return response;
	} catch (thrown) {
		const hit = await cache.match(request);
		if (hit) return hit;

		// A navigation with nothing cached: fall back to the root shell, which the
		// client router can take over from.
		if (request.mode === 'navigate') {
			const shell = await cache.match('/');
			if (shell) return shell;
		}

		throw thrown;
	}
}
