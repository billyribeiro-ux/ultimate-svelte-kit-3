/**
 * WHAT A FAILED CALL SAYS
 * =======================
 *
 * A remote `command` that fails throws SvelteKit's `HttpError` in the
 * browser: `{ status, body: { message } }`, and *not* an `Error` — so the
 * old `error instanceof Error ? error.message : String(error)` printed the
 * whole body as JSON in the toast, `{"status":400,"message":"…"}`.
 *
 * The body's message is the one to show. The server wrote it — `error(422,
 * m.stop_limit(…))`, or `handleError`'s `m.error_bad_request()` for an
 * argument that failed its schema — in the request's language. Anything
 * else (the network went away, a bug) is not something the person can act
 * on in detail, and the browser's own text for it is English, so it gets
 * the product's one sentence for "that did not work".
 *
 * Not for a `<svelte:boundary>`. Its `failed` snippet is handed an
 * `App.Error` — the `{ status, message }` that `handleError` made — which is
 * not an `HttpError` either, so this would answer the fallback every time.
 * A boundary reads `error.message`; a `catch` around a command calls this.
 */

import { isHttpError } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';

export function errorMessage(error: unknown): string {
	if (isHttpError(error)) return error.body.message;
	return m.error_title();
}
