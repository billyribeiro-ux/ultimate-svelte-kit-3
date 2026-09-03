/**
 * THE CURRENT ARTIST
 * ==================
 *
 * Helpers around the cookie in `identity.ts`, for remote functions to call.
 * `getRequestEvent()` is what makes them possible: a remote function has no
 * `event` argument, but it runs inside a request, and this reaches it.
 */

import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { SESSION_SECRET } from '$app/env/private';
import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.ts';
import { artistId, COOKIE, sign, type Artist } from './identity.ts';

/** Whoever this request is, or `null`. Read once per request by the `handle` hook. */
export function currentArtist(): Artist | null {
	return getRequestEvent().locals.artist ?? null;
}

/** Whoever this request is, or a 401 that the caller does not have to write. */
export function requireArtist(): Artist {
	const artist = currentArtist();
	if (!artist) error(401, 'Choose a handle first');
	return artist;
}

/**
 * Become `handle`: either the artist this browser already is, or a new one.
 *
 * A handle that belongs to a *different* browser is refused. There is no
 * password to prove it is yours, so the first browser to claim a handle keeps
 * it — which is exactly as much identity as a groovebox needs and is spelled
 * out on the form.
 */
export async function claimHandle(handle: string): Promise<Artist> {
	const event = getRequestEvent();
	const existing = event.locals.artist;

	if (existing?.handle === handle) return existing;

	const taken = await db.query.artists.findFirst({ where: eq(schema.artists.handle, handle) });
	if (taken && taken.id !== existing?.id) {
		error(409, `@${handle} is already taken`);
	}

	let artist: Artist;
	if (existing) {
		await db.update(schema.artists).set({ handle }).where(eq(schema.artists.id, existing.id));
		artist = { id: existing.id, handle };
	} else {
		artist = { id: artistId(), handle };
		await db.insert(schema.artists).values(artist);
	}

	/*
	 * A year, `httpOnly` so a script on the page cannot read it, `sameSite: 'lax'`
	 * so a link from elsewhere still arrives signed in, and `secure` whenever the
	 * app is served over HTTPS — which `event.url.protocol` knows and a constant
	 * would have to guess.
	 */
	event.cookies.set(COOKIE, await sign(artist, SESSION_SECRET), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: 60 * 60 * 24 * 365
	});
	event.locals.artist = artist;

	return artist;
}

export function forgetArtist(): void {
	const event = getRequestEvent();
	event.cookies.delete(COOKIE, { path: '/' });
	delete event.locals.artist;
}
