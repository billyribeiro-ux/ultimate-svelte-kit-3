/**
 * WHICH FUNCTION OWNS WHICH ROUTE
 * ===============================
 *
 * The adapter deploys the app as two functions and a catch-all:
 *
 *   `pages`   every page and layout that is not prerendered
 *   `api`     everything under `/api`, plus remote function calls
 *   `router`  nothing at all — a SvelteKit server with an empty route table,
 *             whose only job is to run the `reroute` hook and say where the
 *             request should have gone
 *
 * The split is the point, not the performance. A single function would be
 * simpler and, for this app, faster. But a single function never *needs*
 * `applyReroute`, and the reason SvelteKit 3 added it is precisely that
 * platforms split apps across functions — so an adapter that shows how the
 * hand-off works has to split something. `/api` is the natural seam: it is the
 * part somebody would scale, cache and rate-limit differently.
 *
 * Pure functions, so they can be tested without a build.
 */

/**
 * @typedef {{ id: string; pattern: RegExp; prerender: import('@sveltejs/kit').PrerenderOption }} RouteLike
 */

/** @param {RouteLike} route */
export function isApi(route) {
	return route.id === '/api' || route.id.startsWith('/api/');
}

/**
 * Split the route table. Fully prerendered routes go to neither function —
 * they are files, and the runtime serves them as files — which mirrors what
 * `builder.generateManifest()` does by default when no subset is given.
 *
 * @template {RouteLike} R
 * @param {R[]} routes
 */
export function partition(routes) {
	const dynamic = routes.filter((route) => route.prerender !== true);

	return {
		pages: dynamic.filter((route) => !isApi(route)),
		api: dynamic.filter(isApi),
		prerendered: routes.filter((route) => route.prerender === true)
	};
}

/**
 * A request pathname with SvelteKit's internal suffixes removed, so that it
 * can be matched against the *route* patterns. `/p/abc/__data.json` is a data
 * request for `/p/abc`; `/p/abc/__route.js` is a route resolution request for
 * the same route.
 *
 * @param {string} pathname
 */
export function stripInternal(pathname) {
	return pathname.replace(/\/__data\.json$/, '').replace(/\/__route\.js$/, '') || '/';
}

/**
 * Which function should answer a request.
 *
 * Remote function calls live under `/_app/remote/` and belong to `api`, on the
 * grounds that they are data, not documents. Everything that matches no route
 * at all — a vanity URL the `reroute` hook understands, `/_app/env.js`, a
 * genuine 404 — goes to the catch-all.
 *
 * @param {string} pathname
 * @param {{ pages: RegExp[]; api: RegExp[] }} patterns
 * @returns {'pages' | 'api' | 'router'}
 */
export function pick(pathname, patterns) {
	const path = stripInternal(pathname);

	if (path.startsWith('/_app/remote/')) return 'api';
	if (patterns.api.some((pattern) => pattern.test(path))) return 'api';
	if (patterns.pages.some((pattern) => pattern.test(path))) return 'pages';
	return 'router';
}
