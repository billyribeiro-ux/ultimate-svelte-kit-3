/**
 * THE SHARE CARD, AS AN ENDPOINT
 * ==============================
 *
 * `/p/<id>/card.svg` is the picture a chat client or a social network shows
 * when the pattern's page is linked. It is a Svelte component rendered to a
 * string on the server with `render` from `svelte/server` — the same function
 * SvelteKit itself calls for every page, used here for a document that is not
 * a page.
 *
 * Two of `render`'s options are used and both are worth knowing:
 *
 * `csp: { hash: true }` asks for the SHA-256 of any inline script the render
 * produced, typed as `Sha256Source[]`. An SVG of rectangles produces none, and
 * the header below says so with `script-src 'none'` — but the list is read
 * rather than assumed, so a future `hydratable` in the card would be covered
 * rather than blocked.
 *
 * `transformError` decides what a `failed` snippet may know. A render error
 * carries a stack trace and, sometimes, a database message; the card gets a
 * sentence and the log gets the rest.
 */

import { error } from '@sveltejs/kit';
import { render } from 'svelte/server';
import type { RequestHandler } from './$types.js';
import Card from '#lib/share/Card.svelte';
import { getPattern } from '#lib/server/patterns.ts';

export const GET: RequestHandler = async ({ params, url }) => {
	const published = await getPattern(params.id);
	if (!published) error(404, 'No such pattern');

	const { body, hashes } = await render(Card, {
		props: { published, origin: url.origin },
		csp: { hash: true },
		transformError: (e) => {
			console.error(`card ${params.id} failed to render`, e);
			return { message: 'This card could not be drawn in full.' };
		}
	});

	const scripts =
		hashes.script.length > 0 ? hashes.script.map((hash) => `'${hash}'`).join(' ') : "'none'";

	return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'cache-control': 'public, max-age=300',
			'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src ${scripts}`
		}
	});
};
