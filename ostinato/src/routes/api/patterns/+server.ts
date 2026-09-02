/**
 * THE READ API
 * ============
 *
 * Two handlers on one route:
 *
 *   GET    the newest patterns, for anything that can only make a GET
 *   QUERY  a search, with the criteria in the body
 *
 * `QUERY` is the HTTP method for "a read with a body" — a GET may not carry
 * one, and a POST says "this changes something", which a search does not.
 * SvelteKit 3.0.0-next.24 added it to the methods a `+server.ts` may export,
 * and it is used here for the reason it exists: a search with a title, a tempo
 * range and a sort does not fit in a query string that anybody wants to read.
 *
 * The response is deliberately plain JSON with numbers where the app has
 * `Note`s. This is for scripts, and a script does not have the `transport`
 * hook.
 */

import * as v from 'valibot';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { toDto } from '#lib/pattern/dto.ts';
import * as store from '#lib/server/patterns.ts';
import { vanityPath } from '#lib/vanity.ts';

/**
 * Exported with a leading underscore, which is SvelteKit's escape hatch for
 * "this export is not a handler": the co-located test imports it.
 */
export const _SearchSchema = v.object({
	q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80))),
	bpm: v.optional(
		v.object({
			min: v.optional(v.pipe(v.number(), v.integer(), v.minValue(40)), 40),
			max: v.optional(v.pipe(v.number(), v.integer(), v.maxValue(240)), 240)
		}),
		{ min: 40, max: 240 }
	),
	sort: v.optional(v.picklist(['new', 'loved', 'played']), 'new'),
	limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(60)), 24)
});

function summary(pattern: store.Published) {
	return {
		id: pattern.id,
		title: pattern.title,
		bpm: pattern.bpm,
		artist: pattern.artist.handle,
		url: vanityPath({ handle: pattern.artist.handle, slug: pattern.slug }),
		plays: pattern.plays,
		likes: pattern.likes,
		createdAt: new Date(pattern.createdAt).toISOString(),
		tracks: toDto(pattern.pattern).tracks.map((track) => ({ kind: track.kind, name: track.name }))
	};
}

export const GET: RequestHandler = async ({ setHeaders }) => {
	const patterns = await store.listPatterns('new', 24);
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return json({ patterns: patterns.map(summary) });
};

export const QUERY: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Send a JSON body');
	}

	const parsed = v.safeParse(_SearchSchema, body);
	if (!parsed.success) {
		error(400, parsed.issues[0]?.message ?? 'Bad request');
	}

	const { q, bpm, sort, limit } = parsed.output;
	const needle = q?.toLowerCase();

	// The table is small and the filter is simple, so this filters in memory
	// over a generous page rather than growing a query builder for one endpoint.
	const all = await store.listPatterns(sort, 60);
	const matched = all
		.filter((p) => p.bpm >= bpm.min && p.bpm <= bpm.max)
		.filter(
			(p) => !needle || p.title.toLowerCase().includes(needle) || p.artist.handle.includes(needle)
		)
		.slice(0, limit);

	return json({ patterns: matched.map(summary), total: matched.length });
};
