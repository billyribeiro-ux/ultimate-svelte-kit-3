/**
 * ONE PATTERN, FOR THE EMBEDDABLE PLAYER
 * ======================================
 *
 * `<ostinato-player>` on somebody else's page fetches this. It is plain JSON
 * — the DTO, with numbers for notes — because the element bundles its own
 * copy of the pattern model and rebuilds `Note`s itself; it has no SvelteKit
 * and no `transport` hook.
 *
 * `Access-Control-Allow-Origin: *`, because the whole point is other origins.
 * It is read-only and public, so there is nothing to protect by withholding
 * it — the same data is on the pattern's page for anyone to look at.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { toDto } from '#lib/pattern/dto.ts';
import { getPattern } from '#lib/server/patterns.ts';
import { vanityPath } from '#lib/vanity.ts';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const published = await getPattern(params.id);
	if (!published) error(404, 'No such pattern');

	setHeaders({
		'cache-control': 'public, max-age=300',
		'access-control-allow-origin': '*'
	});

	return json({
		id: published.id,
		title: published.title,
		artist: published.artist.handle,
		url: vanityPath({ handle: published.artist.handle, slug: published.slug }),
		pattern: toDto(published.pattern)
	});
};
