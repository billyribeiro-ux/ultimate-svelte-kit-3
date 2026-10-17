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
 * `handleError` and *is* the `App.Error`, so its sentence is `error.message`.
 * `messageOf` is for the `catch` blocks; `failureOf`, below, for the snippets.
 *
 * Anything that is not an `HttpError` — the network dropped, the tab is
 * offline — has no message meant for a person, and gets the caller's
 * `fallback`, which says what was being attempted.
 */

import { isHttpError } from '@sveltejs/kit';

export function messageOf(error: unknown, fallback: string): string {
	return isHttpError(error) ? error.body.message : fallback;
}

/**
 * What a `failed` snippet should say.
 *
 * SvelteKit hands the snippet an `App.Error` — `{ message }`, plus the `id`
 * this app adds — but Svelte, which knows nothing of SvelteKit, types the
 * parameter `unknown`. `(error as App.Error).message` would compile and
 * would also compile if the shape were ever something else; checking costs
 * one line and turns a wrong shape into a sentence instead of a blank.
 */
export function failureOf(error: unknown): string {
	return typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string'
		? error.message
		: 'Something went wrong.';
}
