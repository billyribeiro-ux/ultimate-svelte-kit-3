/**
 * WHAT A FAILED CALL SAYS
 * =======================
 *
 * Two helpers, for the two places a failure reaches a person.
 *
 * A remote `command` that fails throws SvelteKit's `HttpError` in the
 * browser: `{ status, body: { message } }`, and *not* an `Error` — so the
 * old `error instanceof Error ? error.message : String(error)` printed the
 * whole body as JSON in the toast, `{"status":400,"message":"…"}`.
 * `errorMessage` reads `body.message`. The server wrote that sentence, and
 * every sentence it writes is a Paraglide message — `error(404,
 * m.error_no_stop())`, `error(422, m.stop_limit(…))`, or `handleError`'s
 * `m.error_bad_request()` for an argument that failed its schema — worked
 * out inside the request's locale, so it arrives in the page's language.
 * Anything else (the network went away, a bug) is not something the person
 * can act on in detail, and the browser's own text for it is English, so it
 * gets the product's one sentence for "that did not work".
 *
 * A `<svelte:boundary>`'s `failed` snippet is handed an `App.Error` — the
 * `{ status, message }` that `handleError` made — which is not an
 * `HttpError` either, so `errorMessage` would answer its fallback every
 * time. `boundaryMessage` is the boundary's half.
 *
 * WHY A GUARD, AND NOT `failed(error: App.Error)`
 * -----------------------------------------------
 * SvelteKit's own docs write `{#snippet failed(error: App.Error)}`, and inside
 * SvelteKit an `App.Error` is what arrives. The annotation does not
 * type-check: Svelte types the snippet as `Snippet<[error: unknown, reset:
 * () => void]>`, because a boundary is a Svelte feature, and outside
 * SvelteKit it is handed whatever was thrown — so a parameter that claims
 * more than `unknown` is refused. The way round that the type system
 * offers is a cast, `(error as App.Error).message`, and a cast is a claim
 * nobody checks. A guard checks: four comparisons, and the snippet relies on
 * exactly what it was given — a string `message`, or nothing.
 */

import { isHttpError } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';

/** The sentence for a toast, from whatever a `command` or a `form` threw. */
export function errorMessage(error: unknown): string {
	if (isHttpError(error)) return error.body.message;
	return m.error_title();
}

/** The sentence for a boundary's `failed` snippet, from whatever it was handed. */
export function boundaryMessage(error: unknown): string {
	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return m.error_title();
}
