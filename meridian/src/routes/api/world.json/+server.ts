/**
 * THE WORLD, AS A STATIC FILE
 * ===========================
 *
 * `GET /api/world.json` answers with every country as GeoJSON. It is
 * prerendered: the function runs once, at build time, and the adapter ships
 * the result as a file that the built server — or any CDN in front of it —
 * serves without running a line of code. The map fetches it once.
 *
 * The atlas is read with `read()` from `$app/server`, the way to open a file
 * that was imported through Vite. It works the same in development, in the
 * build, and in an adapter with no filesystem of its own, because Vite has
 * already turned the import into an asset the runtime knows about.
 *
 * WHY AN ENDPOINT AND NOT A `prerender()` REMOTE FUNCTION
 * ------------------------------------------------------
 * The first version was one. It built fine and then failed to prerender:
 * `Asset does not exist`. SvelteKit registers the assets `read()` may open
 * by walking the server modules of routes and hooks — and, as of 3.0.0-next.25,
 * not the `.remote.ts` modules. An endpoint is walked; so this is one. The
 * gazetteer in `geo.remote.ts` is the `prerender()` example instead, because
 * it imports its data as a module and needs no `read()`.
 */

import { json } from '@sveltejs/kit';
import { read } from '$app/server';
import worldUrl from 'world-atlas/countries-110m.json?url';
import { countriesFromTopology } from '#lib/server/geodata.ts';

export const prerender = true;

export async function GET() {
	const topology = await read(worldUrl).json();
	return json(countriesFromTopology(topology), {
		headers: { 'cache-control': 'public, max-age=86400, immutable' }
	});
}
