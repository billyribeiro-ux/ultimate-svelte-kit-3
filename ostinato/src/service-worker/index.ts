/**
 * THE SERVICE WORKER
 * ==================
 *
 * An instrument should not stop working because the train went into a
 * tunnel. This caches the application shell — every immutable built file and
 * every static file — on install, serves those from the cache, and lets
 * everything else go to the network with the cache as a fallback for pages.
 *
 * WHAT IT MUST NOT CACHE
 * ----------------------
 * Remote function calls and the API. A `query.live` response is a stream that
 * stays open as long as the page does; a cached clone of it would keep
 * streaming into the cache long after the page closed, which is the failure
 * the docs warn about by name. Both live under paths this file refuses to
 * touch, and the `no-store` header those responses carry is checked as well —
 * belt and braces, because the cost of being wrong is a leak.
 *
 * WHERE THE MANIFEST COMES FROM
 * -----------------------------
 * SvelteKit 3 removed the old `$service-worker` module, and three modules
 * replace it: the build's files are `$app/manifest` (`immutable`, `assets`,
 * `prerendered`), the build id is `version` from `$app/env`, and the path
 * helpers are `$app/paths`. A fourth, `$app/service-worker`, is new rather
 * than a replacement — `$service-worker` never had it — and exports one
 * thing: a correctly typed `self`, so the worker's global is a
 * `ServiceWorkerGlobalScope` without a cast.
 *
 * WHY IT HAS A FOLDER
 * -------------------
 * `src/service-worker/index.ts` rather than `src/service-worker.ts`, because
 * the worker is its own TypeScript project: the `tsconfig.json` beside this
 * file extends `$app/tsconfig/service-worker`, which uses the WebWorker
 * library instead of the DOM one, and the root `tsconfig.json` excludes the
 * folder so the two never type-check the same file with different globals.
 */

import { self } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { resolve } from '$app/paths';
import type { Path } from '$app/types';

const CACHE = `ostinato-${version}`;

/**
 * The shell: hashed build output, everything in `static/`, and the prerendered
 * pages. The manifest lists each one *relative to the base path* — `_app/…`,
 * `robots.txt`, and an empty string for the landing page — and the `fetch`
 * handler below compares against `url.pathname`, which is absolute. `resolve`
 * turns the one into the other; a relative name would cache fine on install
 * and then never match a request.
 *
 * Two casts, both honest. `resolve` is typed against the routes and static
 * files it knows at build time, and a hashed chunk name is not something a
 * type can enumerate — so `immutable` carries plain strings and is told it is
 * a `Path`. And the list is widened back to `string[]`, because `includes`
 * below is handed a `url.pathname`, which is any string at all.
 */
const ASSETS: string[] = [...immutable, ...assets, ...prerendered].map((file) =>
	resolve(file.path as Path)
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
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
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== location.origin) return;

	// Data, never. See the header comment.
	if (url.pathname.startsWith('/_app/remote/') || url.pathname.startsWith('/api/')) return;

	// The shell: cache first, because these files are immutable by name.
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
		return;
	}

	// Pages: network first, cache as the fallback, the studio as the last resort.
	event.respondWith(
		fetch(event.request)
			.then(async (response) => {
				const control = response.headers.get('cache-control') ?? '';
				if (response.ok && !control.includes('no-store')) {
					const cache = await caches.open(CACHE);
					await cache.put(event.request, response.clone());
				}
				return response;
			})
			.catch(
				async () =>
					(await caches.match(event.request)) ?? (await caches.match('/studio')) ?? Response.error()
			)
	);
});
