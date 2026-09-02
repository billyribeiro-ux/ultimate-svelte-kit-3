/**
 * WHO YOU ARE
 * ===========
 *
 * Choosing a handle and forgetting it. Both are forms, because both set a
 * cookie, and a cookie set by a form works with JavaScript off.
 */

import * as v from 'valibot';
import { invalid, isHttpError } from '@sveltejs/kit';
import { form, query } from '$app/server';
import { claimHandle, currentArtist, forgetArtist } from '#lib/server/artist.ts';
import { HandleSchema } from '#lib/handle.ts';
import { watchRoom } from './rooms.remote.ts';

export const whoAmI = query(() => currentArtist());

export const becomeArtist = form(
	v.object({
		handle: HandleSchema,
		/** The jam room this was submitted from, if any. */
		room: v.optional(v.string())
	}),
	async ({ handle, room }, issue) => {
		try {
			await claimHandle(handle);
		} catch (e) {
			if (isHttpError(e) && e.status === 409) invalid(issue.handle(e.body.message));
			throw e;
		}

		void whoAmI().refresh();

		/*
		 * The room's live stream read the cookie when it opened, so it still
		 * thinks this browser is "someone". `reconnect()` schedules a fresh
		 * stream — carried back in this same response, no extra round trip —
		 * and the new one reads the new cookie. The documented case for this is
		 * exactly a mutation that changes a cookie a live query depends on.
		 */
		if (room) watchRoom(room).reconnect();
	}
);

export const forget = form(async () => {
	forgetArtist();
	void whoAmI().refresh();
});
