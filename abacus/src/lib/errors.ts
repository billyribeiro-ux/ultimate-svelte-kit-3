/**
 * WHAT THE SERVER SAID
 * ====================
 *
 * A remote call awaited in the browser — `await publish(id)`, `await
 * form.submit()`, `await getPublished(id)` outside the markup — rejects with
 * SvelteKit's `HttpError`: `{ status, body }`, where `body` is the `App.Error`
 * the server's `handleError` produced. The server's words are in
 * `body.message`. There is no `message` on the error itself, and it is not an
 * `Error` at all, so the obvious `(e as Error).message` is `undefined` — a
 * toast with nothing in it — and `e instanceof Error ? … : 'Something went
 * wrong'` throws the server's sentence away every time.
 *
 * A `failed` snippet is different: what it receives has already been through
 * `handleError` and *is* the `App.Error`, so it reads `error.message`
 * directly. This function is for the `catch` blocks.
 *
 * Anything that is not an `HttpError` — the network dropped, the tab is
 * offline — has no message meant for a person, and gets the caller's
 * `fallback`, which says what was being attempted.
 */

import { isHttpError } from '@sveltejs/kit';

export function messageOf(error: unknown, fallback: string): string {
	return isHttpError(error) ? error.body.message : fallback;
}
