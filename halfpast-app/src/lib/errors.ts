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
 * So: check the shapes, in the order they actually occur.
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
 * A human-readable message for `thrown`, or `fallback` if it has nothing to say.
 *
 * @param thrown   Whatever landed in the `catch`.
 * @param fallback What to show when the thing genuinely carries no message —
 *                 a network drop, an aborted request, a bug in our own code.
 */
export function messageFrom(thrown: unknown, fallback: string): string {
	if (isHttpErrorShape(thrown) && typeof thrown.body.message === 'string') {
		const message = thrown.body.message.trim();
		if (message) return message;
	}

	if (thrown instanceof Error && thrown.message.trim()) {
		return thrown.message;
	}

	return fallback;
}

/** The HTTP status behind a rejection, when there is one. */
export function statusFrom(thrown: unknown): number | null {
	return isHttpErrorShape(thrown) ? thrown.status : null;
}
