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
 * So: read `body.message`, and nothing else. The other things a remote call
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

/** SvelteKit's `HttpError`, structurally. Not imported — it is not exported to us. */
interface HttpErrorShape {
	status: number;
	body: { message?: unknown };
}

function isHttpErrorShape(value: unknown): value is HttpErrorShape {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as HttpErrorShape).status === 'number' &&
		typeof (value as HttpErrorShape).body === 'object' &&
		(value as HttpErrorShape).body !== null
	);
}

/**
 * The server's message for `thrown`, or `fallback` if the server did not send one.
 *
 * @param thrown   Whatever landed in the `catch`.
 * @param fallback What to show when there is no server message — a network
 *                 drop, an aborted request, a bug in our own code.
 */
export function messageFrom(thrown: unknown, fallback: string): string {
	if (isHttpErrorShape(thrown) && typeof thrown.body.message === 'string') {
		const message = thrown.body.message.trim();
		if (message) return message;
	}

	return fallback;
}

/** The HTTP status behind a rejection, when there is one. */
export function statusFrom(thrown: unknown): number | null {
	return isHttpErrorShape(thrown) ? thrown.status : null;
}
