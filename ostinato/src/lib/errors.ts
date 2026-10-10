/**
 * WHAT THE SERVER SAID
 * ====================
 *
 * A remote call awaited in the browser — `await lovePattern(id)`, `await
 * f.submit()` inside a form's `enhance` — rejects with SvelteKit's
 * `HttpError`: `{ status, body }`, where `body` is the `App.Error` the
 * server's `handleError` produced. The server's sentence is `body.message`.
 *
 * It is not an `Error`, and it has no `message` of its own. So the obvious
 * `(e as Error).message` is `undefined` — the jam room used to show an empty
 * toast for every refused edit — and a `catch` that ignores the value and
 * prints its own sentence throws away the one thing the server took the
 * trouble to say, like "No such track in this room".
 *
 * A `failed` snippet or an `onerror` handler is the other case, and the
 * opposite one: what a boundary is handed has already been through
 * `handleError` and *is* the `App.Error`, so it reads `error.message`
 * directly. Calling this there would answer the fallback every time.
 *
 * Anything that is not an `HttpError` — the network dropped, the tab went
 * offline — carries no message meant for a person, and gets the caller's
 * `fallback`, which says what was being attempted.
 */

import { isHttpError } from '@sveltejs/kit';

export function messageOf(error: unknown, fallback: string): string {
	return isHttpError(error) ? error.body.message : fallback;
}
