import { version } from '$app/env';

/**
 * THE PAGES THIS DEVICE KEEPS
 * ===========================
 *
 * The service worker keeps a copy of each page it serves, so a trip opened
 * once can be read again in a train tunnel (`src/service-worker/index.ts`).
 * Those copies were rendered on the server *for the person signed in*: a
 * private trip's itinerary, their name in the header. On a shared device
 * the next person must not be able to read them offline, so the app empties
 * this cache when somebody signs out (the header's sign-out form), and
 * whenever it finds nobody signed in (the `(site)` layout) — which also
 * covers a session that ended without the button.
 *
 * Both sides need the name, which is why it lives in a module of its own
 * that the worker and the app import: the worker opens the cache by it, the
 * app deletes by it.
 *
 * The deploy's `version` is part of the name. A page refers to the build's
 * hashed files, so a page from the last deploy is useless with this one's,
 * and the worker's `activate` drops every cache that is not its own. But
 * the app deletes by the *prefix*: a tab running this deploy's code can sit
 * beside a worker that is still the last deploy's — a new worker waits for
 * the old one's tabs to close — and that worker's pages carry the last
 * deploy's name. A privacy rule that missed them would not be one.
 */

const PREFIX = 'meridian-pages-';

/** This deploy's page cache. */
export const PAGES = `${PREFIX}${version}`;

/** Delete every page cache on this device, whichever deploy made it. */
export async function forgetPages(): Promise<void> {
	// Cache Storage only exists on a secure origin: https, or localhost.
	if (!('caches' in globalThis)) return;
	/*
	 * Never rejects. Sign-out awaits this before it submits, and a failed
	 * purge must not keep a session alive — on a shared device that is worse
	 * than a copy left behind, which the `(site)` layout retries to delete on
	 * the next page anyway.
	 */
	try {
		const names = await caches.keys();
		await Promise.all(
			names.filter((name) => name.startsWith(PREFIX)).map((name) => caches.delete(name))
		);
	} catch (error) {
		console.warn('[meridian] could not empty the offline copies', error);
	}
}
