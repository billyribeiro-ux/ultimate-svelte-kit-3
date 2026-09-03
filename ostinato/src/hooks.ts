/**
 * UNIVERSAL HOOKS
 * ===============
 *
 * `src/hooks.ts` runs on **both** the server and the client. Two hooks live
 * here, and both are here because the browser has to agree with the server
 * about them: what a `Note` looks like on the wire, and what `/@handle/slug`
 * means.
 */

import type { Reroute, Transport } from '@sveltejs/kit/hooks';
import { Note } from '#lib/music/note.ts';
import { parseVanity } from '#lib/vanity.ts';

/**
 * TRANSPORT
 * =========
 *
 * SvelteKit serialises what crosses the server/client boundary — `load`
 * results, remote function arguments and results — with devalue, which knows
 * about `Map`, `Set`, `Date`, typed arrays and a few more, and knows nothing
 * about a class called `Note`. A transporter teaches it: `encode` returns a
 * plain value for an instance (and something falsy for anything else, which is
 * how devalue asks "is this yours?"), `decode` builds the instance back.
 *
 * The payoff is that a pattern returned by `getPattern(id)` arrives with real
 * `Note`s in it — `.frequency` and `.name` work — instead of `{ midi: 57 }`
 * objects that every consumer would have to remember to rehydrate. And it is
 * symmetric: a `Note` inside a `command` argument makes the same trip the
 * other way, which is what lets the jam room's `setStep` accept a `Step`
 * exactly as the grid holds it.
 */
export const transport: Transport = {
	Note: {
		encode: (value) => value instanceof Note && value.midi,
		decode: (midi: number) => new Note(midi)
	}
};

/**
 * REROUTE
 * =======
 *
 * `/@handle/slug` is not a route. This asks the server which pattern it names
 * and returns `/p/<id>`, and SvelteKit renders that route with the vanity
 * address still in the bar.
 *
 * It is `async` and uses the `fetch` it is given, which behaves like the one
 * in a `load` function: on the server it calls the endpoint directly without
 * a network hop, on the client it is a real request. The result is cached per
 * URL, so a shared link costs one lookup per session — and the hook returns
 * early for every path that is not a vanity address, because a hook that
 * fetched on every navigation would be a hook that made every navigation slow.
 *
 * A handle that does not exist returns nothing, so the URL falls through to a
 * 404 rather than to a guess.
 */
export const reroute: Reroute = async ({ url, fetch }) => {
	const vanity = parseVanity(url.pathname);
	if (!vanity) return;

	const api = new URL('/api/resolve', url);
	api.searchParams.set('handle', vanity.handle);
	api.searchParams.set('slug', vanity.slug);

	const response = await fetch(api);
	if (!response.ok) return;

	const { pathname } = (await response.json()) as { pathname: string | null };
	return pathname ?? undefined;
};
