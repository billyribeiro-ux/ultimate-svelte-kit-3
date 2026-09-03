/**
 * UNIVERSAL HOOKS
 * ===============
 *
 * `src/hooks.ts` runs on **both** the server and the client. Two hooks live
 * here, because the browser has to agree with the server about both.
 *
 * `reroute` is the other half of internationalised URLs. Paraglide's
 * middleware (server) decides the locale from `/de/trips`; this tells
 * SvelteKit's router — on the server for the first request, in the browser
 * for every navigation after it — that `/de/trips` is served by
 * `src/routes/trips`. There is one `trips` route, not three.
 *
 * `transport` teaches SvelteKit's serialiser about `CalendarDate`. Load
 * results and remote function arguments cross the wire through devalue,
 * which knows `Map`, `Set`, `Date` and typed arrays and nothing about a
 * class from `@internationalized/date`. With this, the date range the
 * picker produces arrives on the server as a `CalendarDate` — `.compare()`
 * works, `.add()` works — instead of a string somebody has to remember to
 * parse.
 */

import type { Reroute, Transport } from '@sveltejs/kit/hooks';
import { CalendarDate, parseDate } from '@internationalized/date';
import { deLocalizeUrl } from '#lib/paraglide/runtime.js';

export const reroute: Reroute = ({ url }) => deLocalizeUrl(url).pathname;

export const transport: Transport = {
	CalendarDate: {
		// Something falsy for "not mine" is how devalue asks "is this yours?".
		encode: (value) => value instanceof CalendarDate && value.toString(),
		decode: (iso: string) => parseDate(iso)
	}
};
