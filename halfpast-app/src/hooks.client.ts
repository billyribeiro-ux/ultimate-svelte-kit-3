// Hook types live in `@sveltejs/kit/hooks` in SvelteKit 3, not the package root.
import type { HandleClientError } from '@sveltejs/kit/hooks';

/**
 * Errors that happen in the browser.
 *
 * The server has `handleError` in `hooks.server.ts`; this is its counterpart,
 * and it is easy to forget precisely because everything appears to work without
 * it. It does not: an error thrown during a client-side navigation — a remote
 * query rejecting, say — renders SvelteKit's default error page with the words
 * "Internal Error" and writes nothing anywhere. The server log stays clean,
 * because the server was never involved. Hours can be lost to that.
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
