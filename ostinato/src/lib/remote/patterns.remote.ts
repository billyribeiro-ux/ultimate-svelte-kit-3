/**
 * PATTERNS, OVER THE WIRE
 * =======================
 *
 * Every read and write of a published pattern. A `.remote.ts` file is the
 * server/client boundary made explicit: each export here becomes a function
 * the browser can call, with its argument validated by the schema on the way
 * in and its result serialised — `Note`s and all, thanks to `transport` — on
 * the way out.
 *
 * Six of the seven kinds of remote function are in this one file: `query`,
 * `query.batch`, `prerender`, `command`, `form` and the `requested()` helper.
 * `query.live` is in `rooms.remote.ts`, where there is something live.
 */

import * as v from 'valibot';
import { error, invalid, isHttpError, redirect } from '@sveltejs/kit';
import { command, form, prerender, query, requested } from '$app/server';
import { fromDto, PatternDtoSchema } from '#lib/pattern/dto.ts';
import { HandleSchema } from '#lib/handle.ts';
import { claimHandle, currentArtist, requireArtist } from '#lib/server/artist.ts';
import * as store from '#lib/server/patterns.ts';
import { vanityPath } from '#lib/vanity.ts';

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** One pattern, or a 404 the page does not have to write. */
export const getPattern = query(v.string(), async (id) => {
	const found = await store.getPattern(id);
	if (!found) error(404, 'No such pattern');
	return found;
});

const ListSchema = v.object({
	sort: v.optional(v.picklist(['new', 'loved', 'played']), 'new'),
	limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(60)), 24)
});

export const getPatterns = query(ListSchema, ({ sort, limit }) => store.listPatterns(sort, limit));

/** The current artist's own patterns; empty for a browser with no handle. */
export const getMine = query(async () => {
	const artist = currentArtist();
	return artist ? store.patternsBy(artist.id) : [];
});

/**
 * BATCHED COUNTS
 * --------------
 * A gallery page shows thirty cards and every card wants its play count.
 * Thirty `getCounts(id)` calls in one render become *one* request with
 * `query.batch`: SvelteKit collects every argument used during the render,
 * calls this once with all of them, and the function returns a lookup that
 * hands each caller its own answer.
 */
export const getCounts = query.batch(v.string(), async (ids) => {
	const counts = await store.countsFor(ids);
	return (id) => counts.get(id) ?? { plays: 0, likes: 0 };
});

/**
 * PRERENDERED
 * -----------
 * The featured strip on the landing page is computed at build time and served
 * as a static file, which is what `prerender` means. It changes when the app
 * is deployed and not before — "featured" is a curated list, and a curated
 * list changing between deploys would be surprising anyway.
 *
 * `dynamic: true` is deliberately *absent*: with no argument there is only one
 * possible call, and it was prerendered, so the function is left out of the
 * server bundle entirely.
 */
export const getFeatured = prerender(() => store.featuredPatterns());

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * A play was heard. Fire-and-forget from the player, and the interesting part
 * is on the client: `recordPlay(id).updates(getCounts(id).withOverride(...))`
 * bumps the number on screen immediately and asks the server to send the real
 * one back in the same response. `requested` is how the server honours that:
 * it refreshes exactly the query instances the client named, up to a limit.
 */
export const recordPlay = command(v.string(), async (id) => {
	await store.countPlay(id);
	await requested(getCounts, 8).refreshAll();
});

export const lovePattern = command(v.string(), async (id) => {
	const likes = await store.love(id);
	// Server-driven refresh: this handler knows exactly which query changed.
	void getPattern(id).refresh();
	await requested(getCounts, 8).refreshAll();
	return likes;
});

/**
 * THE PUBLISH FORM
 * ================
 *
 * A form, not a command, because publishing is the one write that should
 * work with JavaScript off — somebody pasting a link into a text field and
 * pressing a button is the oldest interaction on the web, and it degrades to
 * exactly that.
 *
 * The pattern travels as one hidden field of JSON, named `_pattern`. The
 * underscore is SvelteKit's convention for a value that must not be echoed
 * back into the page after a failed non-JS submission — designed for
 * passwords, and just as useful for two kilobytes the studio already holds.
 *
 * Two submit buttons share the form: `action` says which was pressed.
 */
export const publish = form(
	v.object({
		handle: HandleSchema,
		title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give it a title'), v.maxLength(60)),
		_pattern: v.pipe(v.string(), v.minLength(2)),
		remixOf: v.optional(v.string()),
		action: v.picklist(['stay', 'open'])
	}),
	async ({ handle, title, _pattern, remixOf, action }, issue) => {
		let dto;
		try {
			dto = v.parse(PatternDtoSchema, JSON.parse(_pattern));
		} catch {
			// A form-level issue: not about any one field, shown by `allIssues()`.
			invalid('That pattern could not be read. Reload the studio and try again.');
		}

		let artist;
		try {
			artist = await claimHandle(handle);
		} catch (e) {
			/*
			 * `claimHandle` says "taken" with a 409. On a form that is not an
			 * error page, it is a message under the handle field — which is what
			 * `invalid(issue.handle(...))` produces, and why it exists.
			 */
			if (isHttpError(e) && e.status === 409) invalid(issue.handle(e.body.message));
			throw e;
		}

		const pattern = fromDto({ ...dto, title });
		const published = await store.publishPattern(artist, pattern, remixOf ?? null);

		// Single-flight: the lists that just changed come back with this response.
		void getMine().refresh();
		await requested(getPatterns, 3).refreshAll();

		if (action === 'open') redirect(303, `/p/${published.id}`);

		return {
			id: published.id,
			url: vanityPath({ handle: artist.handle, slug: published.slug })
		};
	}
);

/**
 * Deleting is a form too, and one that is rendered once per card with
 * `remove.for(id)`, so each card's pending state is its own.
 */
export const remove = form(v.object({ id: v.string() }), async ({ id }) => {
	const artist = requireArtist();
	const deleted = await store.deletePattern(id, artist.id);
	if (!deleted) error(404, 'Not yours, or not there');

	void getMine().refresh();
	await requested(getPatterns, 3).refreshAll();
});
