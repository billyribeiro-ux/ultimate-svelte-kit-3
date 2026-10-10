/**
 * ONE WAY TO WRITE A LINK
 * =======================
 *
 * `href('/(site)/t/[slug=slug]', { slug })` is two things that every
 * internal link in this app needs and that no link should be able to forget:
 *
 *   - `resolve()` from `$app/paths` — the route id checked against the routes
 *     that exist (groups included: `/(site)/(app)/trips/new`), the parameters
 *     checked against the matchers in `src/params.ts`, the base path applied.
 *     Rename a folder and every link to it is a type error, not a 404.
 *   - Paraglide's `localizeHref` — the language prefix in front, so the result
 *     is `/de/t/abc` for a German reader and `/t/abc` for an English one.
 *
 * A route id may carry its search or hash — `` href(`/(site)/t/[slug=slug]?tab=${tab}`, { slug }) ``
 * — because `resolve` accepts `RouteIdWithSearchOrHash` and keeps the suffix.
 *
 * It returns `ResolvedPathname`, and that is the honest type, not a white
 * lie for the linter. SvelteKit defines it as `/${Path}` *or*
 * `/${string}/${Path}` — room for a base path in front of every resolved
 * pathname — and `/de/trips` is exactly that shape: a prefix that `reroute`
 * in `src/hooks.ts` strips off again before routing. eslint-plugin-svelte's
 * `no-navigation-without-resolve` accepts an `href` or a `goto()` of that
 * type, which is the rule doing its job: it cannot see through
 * `localizeHref`, and it should not have to.
 *
 * Redirects on the server (`redirect(303, localizeHref('/trips'))` in the
 * remote functions) keep calling `localizeHref` directly: a redirect is not a
 * link, and the rule does not reach there.
 */

import { resolve } from '$app/paths';
import type {
	PathnameWithSearchOrHash,
	ResolvedPathname,
	RouteIdWithSearchOrHash
} from '$app/types';
import { localizeHref } from '#lib/paraglide/runtime.js';

export function href<T extends RouteIdWithSearchOrHash | PathnameWithSearchOrHash>(
	...args: Parameters<typeof resolve<T>>
): ResolvedPathname {
	return localizeHref(resolve<T>(...args)) as ResolvedPathname;
}
