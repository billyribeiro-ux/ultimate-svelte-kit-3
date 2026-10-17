/**
 * Getting a sentence out of whatever a remote call rejected with.
 *
 * `error(400, 'A shift has to end after it starts.')` on the server arrives in
 * the browser as SvelteKit's `HttpError`, and `HttpError` **does not extend
 * `Error`** — it is a small class carrying `status` and `body`, where `body` is
 * the `App.Error` object with the message in it.
 *
 * That matters because the obvious catch block:
 *
 *     catch (thrown) {
 *         message = thrown instanceof Error ? thrown.message : 'Something broke.';
 *     }
 *
 * takes the *else* branch for every deliberate server error. The message you
 * carefully wrote is discarded and the user is shown the generic fallback — and
 * nothing looks broken, because a plausible sentence still appears on screen.
 * We only caught it because an end-to-end test asserted on the real wording.
 *
 * So: read `body.message`, and only from a 4xx. The other things a remote call
 * rejects with are not sentences for a customer. A dropped connection rejects
 * with the browser's own `TypeError: Failed to fetch`, and a bug in our code
 * with whatever the bug said. Neither has been through `handleError`, so
 * neither is vetted for the screen, and both get the fallback.
 *
 * This is for a `catch` only. A boundary's `failed` snippet and `+error.svelte`
 * receive a different shape: an `App.Error`, `{ status, message }`, already
 * through `handleError`, with no `body`. Hand one of those to this function and
 * the fallback wins every time; read its `message` directly instead.
 */

import { isHttpError } from '@sveltejs/kit';

/**
 * The server's message for `thrown`, or `fallback` if the server did not send one.
 *
 * `isHttpError` is SvelteKit's own test, and it is the right one: the browser's
 * rejection is an instance of the same `HttpError` class that `error()` throws
 * on the server, so this is an `instanceof` rather than a guess at the object's
 * shape, and it narrows `thrown.body` to our `App.Error`.
 *
 * Why only a 4xx. A response that never reached SvelteKit — a proxy's 502
 * page, say — also becomes an `HttpError`, an instance of the very same class,
 * carrying the HTTP status text as its message: "Bad Gateway", in a customer's
 * alert, a sentence nobody here wrote. The sentences this app writes on
 * purpose are all 4xx — "A shift has to end after it starts." is a 400 — and
 * the only 5xx sentence it sends is `handleError`'s generic apology, which the
 * caller's own fallback says better. So a 5xx gets the fallback, whoever sent
 * it.
 *
 * The emptiness check is the same idea for the 4xx a proxy might send: over
 * HTTP/2 there is no status text at all, and an alert with nothing in it is
 * worse than the fallback.
 *
 * @param thrown   Whatever landed in the `catch`.
 * @param fallback What to show when there is no server message — a network
 *                 drop, an aborted request, a bug in our own code.
 */
export function messageFrom(thrown: unknown, fallback: string): string {
	if (isHttpError(thrown) && thrown.status < 500) {
		const message = thrown.body.message.trim();
		if (message) return message;
	}

	return fallback;
}
