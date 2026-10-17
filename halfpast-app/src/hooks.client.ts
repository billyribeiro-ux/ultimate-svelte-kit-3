// Hook types live in `@sveltejs/kit/hooks` in SvelteKit 3, not the package root.
import type { HandleClientError } from '@sveltejs/kit/hooks';

/**
 * Errors that happen in the browser.
 *
 * The server has `handleError` in `hooks.server.ts`; this is its counterpart,
 * and it is easy to forget precisely because everything appears to work without
 * it. It does not: a bug that throws in the browser after a client-side
 * navigation — a component reading route data that is momentarily absent, say
 * — renders `+error.svelte` with the words "Internal Error" and writes nothing
 * anywhere. The server log stays clean, because the server was never involved.
 * Hours can be lost to that.
 *
 * Which remote-call failures arrive here depends on whether SvelteKit's server
 * answered. A rejection the server produced — its own `error(404, …)`, or an
 * unknown failure its `handleError` has already logged and reworded — reaches
 * the browser in its final shape, and SvelteKit hands it to the screen without
 * asking this hook a second time. A request that never got a SvelteKit answer
 * does come here. Offline, the browser's `TypeError: Failed to fetch` arrives
 * as `kind: 'unknown'`, so it is logged below like a bug; a proxy's 502 page
 * arrives as an `HttpError` with `kind: 'app'`, carrying the status text. We
 * checked both in a real browser, by aborting the request and by answering it
 * with an HTML 502, rather than taking either on trust.
 *
 * `kind` discriminates the same four categories as on the server. Only `unknown`
 * is a bug; a 404 from a mistyped URL is not worth a console entry.
 */
export const handleError: HandleClientError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return {};

	const id = crypto.randomUUID().slice(0, 8);

	// Goes to the browser console, which means it also lands in a Playwright
	// trace and in whatever error reporter is wired up in production.
	console.error(`[${id}] client error at ${event.url.pathname}`, error);

	return {
		id,
		message: 'Something went wrong in your browser. Reloading the page usually fixes it.'
	};
};
