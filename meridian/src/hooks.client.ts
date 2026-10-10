/**
 * CLIENT HOOKS
 * ============
 *
 * The browser's `handleError`: what SvelteKit makes of a failure in this
 * tab — a `<svelte:boundary>` whose content threw, a chunk that never
 * arrived, a component that broke while hydrating — before a `failed`
 * snippet or `+error.svelte` sees it. Both of those are handed the result,
 * an `App.Error` — `{ status, message }` — and print `message`.
 *
 * It looks at `kind`, as the server's hook does. An `app` error already
 * says what it means, and a remote function's refusal does not come here at
 * all: it went through the server's hook, in the request's language, and
 * arrives finished. Only an `unknown` error needs words, because SvelteKit's
 * own are `'Internal Error'`, in English, on a page that may be German — so
 * it gets the product's one sentence for "that did not work", in the page's
 * language. The detail goes to the console, where somebody debugging looks.
 */

import type { HandleClientError } from '@sveltejs/kit/hooks';
import { m } from '#lib/paraglide/messages.js';

export const handleError: HandleClientError = ({ error, kind }) => {
	if (kind !== 'unknown') return;

	console.error('[meridian]', error);
	return { message: m.error_title() };
};
