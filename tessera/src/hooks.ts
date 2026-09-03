/**
 * UNIVERSAL HOOKS
 * ===============
 *
 * `hooks.server.ts` runs on the server. `hooks.client.ts` runs in the browser.
 * This one runs in **both**, which is exactly what its two exports need: a URL
 * must resolve to the same route whether the navigation was rendered on the
 * server or handled by the client router, and a value must be encoded and
 * decoded by the same pair of functions on either side of the wire.
 */

import type { Reroute, Transport } from '@sveltejs/kit/hooks';
import { LOCALES } from '#lib/i18n/index.ts';
import { BoardRevision } from '#lib/history/revision.ts';
import { LoadedBoard } from '#lib/board/loaded.ts';

/* ------------------------------------------------------------------ */
/* reroute                                                             */
/* ------------------------------------------------------------------ */

/** Matches a two-or-three letter first segment that looks like a language tag. */
const LANGUAGE_LIKE = /^\/([a-z]{2,3})(?:-[A-Za-z]{2,4})?(\/|$)/;

/**
 * First segments that are this application's own, and must never be mistaken for
 * a language.
 *
 * This list exists because of a real bug. The fallback below strips anything
 * that *looks* like a language tag and is not one — and `api` is three lowercase
 * letters. Every request to `/api/boards/…/stream` was quietly rewritten to
 * `/boards/…/stream` and answered 404, so boards loaded, rendered their chrome,
 * and then sat empty while the browser retried a stream that could never exist.
 * Nothing logged an error; the reroute was doing exactly what it was told.
 *
 * Deriving this from the route manifest would be tidier and is not possible: the
 * universal hook runs in the browser too, where the manifest is not available.
 * A short explicit list, next to the code that needs it, is the honest version.
 */
const RESERVED = new Set(['api', 'b', 'embed']);

/**
 * Rewrite the URL before the router looks at it.
 *
 * Two jobs, and neither could be done by the route tree:
 *
 * **Short links.** `/b/<id>` is what gets pasted into chat, and it resolves to
 * the same page as `/boards/<id>` without a redirect — so the address bar keeps
 * the short form and there is no extra round trip. A `+page.server.ts` that
 * threw a `redirect()` would cost both.
 *
 * **Unsupported languages.** `[[lang=locale]]` is matched by `params.ts`, so
 * `/de/boards` matches nothing and 404s. A German speaker whose browser sent them
 * there deserves the application in English rather than an error page, so
 * anything that *looks* like a language tag and is not one gets stripped —
 * except this application's own top-level segments, which is a distinction that
 * cost an afternoon (see `RESERVED`).
 *
 * The function is pure and synchronous. It is allowed to be async, and making it
 * so would put a network round trip in front of every navigation on both sides —
 * a tempting place to put a lookup table, and a very expensive one.
 */
export const reroute: Reroute = ({ url }) => {
	if (url.pathname === '/b' || url.pathname.startsWith('/b/')) {
		return `/boards${url.pathname.slice(2)}`;
	}

	const language = LANGUAGE_LIKE.exec(url.pathname);
	if (
		language &&
		!RESERVED.has(language[1]!) &&
		!(LOCALES as readonly string[]).includes(language[1]!)
	) {
		const rest = url.pathname.slice(language[0].length - (language[2] === '/' ? 1 : 0));
		return rest === '' ? '/' : rest;
	}

	// `void` — the URL is fine as it is. Returning `url.pathname` would work and
	// would make every navigation look like a rewrite in the devtools.
	return;
};

/* ------------------------------------------------------------------ */
/* transport                                                           */
/* ------------------------------------------------------------------ */

/**
 * Custom types that survive the server/client boundary.
 *
 * **Read this before adding an entry.** SvelteKit serialises with devalue, which
 * already handles `Date`, `Map`, `Set`, `RegExp`, `BigInt`, `URL`, `Infinity`,
 * `NaN`, `-0` and cyclic references. Most reaching for `transport` is
 * unnecessary, and every unnecessary entry is a pair of functions that can drift
 * apart. Both entries below carry *behaviour*, which is the thing devalue
 * genuinely cannot reconstruct.
 *
 * `encode` returns a falsy value for anything it does not recognise, so the
 * order of these checks does not matter and a value only ever matches one.
 */
export const transport: Transport = {
	/**
	 * The board itself. `decode` gives the browser an object that knows how to
	 * build a reactive document from the snapshot it is carrying, so no component
	 * has to remember the actor id.
	 */
	LoadedBoard: {
		encode: (value) => value instanceof LoadedBoard && value.toTuple(),
		decode: (tuple) => LoadedBoard.fromTuple(tuple)
	},

	/**
	 * One entry in the version history. It arrives with `describe()` attached, so
	 * the list component formats a revision by asking it rather than by
	 * re-implementing the rules next to the markup.
	 */
	BoardRevision: {
		encode: (value) => value instanceof BoardRevision && value.toTuple(),
		decode: (tuple) => BoardRevision.fromTuple(tuple)
	}
};
