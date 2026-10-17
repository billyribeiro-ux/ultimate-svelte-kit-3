/**
 * What to tell somebody when a remote call they made is refused.
 *
 * An awaited `command` or `query` that the server refuses rejects with
 * SvelteKit's `HttpError`: `{ status, body }`, where `body` is the `App.Error`
 * the server sent and the sentence is `body.message`. It does not extend
 * `Error`, so the reflex `thrown instanceof Error ? thrown.message : …` takes
 * the fallback every time the server said no on purpose — the one time it had
 * something worth saying.
 *
 * `isHttpError` is Kit's own guard: an `instanceof` check against the class
 * the client runtime throws, which narrows `body` to `App.Error` with no cast.
 * It covers the cases that matter here:
 *
 *   - a refusal from `error(…)` in a remote function — the server's sentence;
 *   - a response that was not Kit's JSON at all, such as the plain-text 403
 *     from our CSRF hook — still an `HttpError`, with the status text
 *     (`Forbidden`) as its message.
 *
 * Anything else never got an answer from the venue: `fetch` rejecting with a
 * `TypeError` because the connection dropped, most often. Its message —
 * "Failed to fetch" — is the browser talking to a developer, so the person
 * gets a sentence of ours instead.
 */
import { isHttpError } from '@sveltejs/kit';

export const NO_ANSWER = 'The venue did not answer. Check your connection and try again.';

export function messageFrom(thrown: unknown): string {
	return isHttpError(thrown) ? thrown.body.message : NO_ANSWER;
}
