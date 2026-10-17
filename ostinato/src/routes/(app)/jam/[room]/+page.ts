import type { PageLoad } from './$types.js';
import { getRoomName } from '#lib/remote/rooms.remote.ts';

/**
 * Whether the room exists, asked before the page renders. The live room
 * itself is awaited in the page, inside a boundary that streams it in after
 * hydration; this is what lets the server answer `/jam/nowhere` with a `404`
 * instead of a page that says so a moment later.
 */
export const load: PageLoad = async ({ params }) => {
	return { name: await getRoomName(params.room) };
};
