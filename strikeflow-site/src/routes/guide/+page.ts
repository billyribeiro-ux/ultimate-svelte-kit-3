/**
 * The guide page cannot be prerendered.
 *
 * WHY — this one is not obvious and the error message is worth recognising:
 *
 *   Error: Cannot access url.search on a page with prerendering enabled
 *
 * A remote `form()` builds its own `action` attribute from the CURRENT request URL,
 * so that a submission returns you to the page you submitted from with any query
 * string intact. Prerendering happens at build time, where there is no request and
 * therefore no meaningful URL — so SvelteKit throws rather than baking in a wrong one.
 *
 * The rule to remember: **a page hosting a remote form must be server-rendered.**
 *
 * The cost is small and worth being clear about. This page is now rendered per
 * request instead of served as a static file, which adds a few milliseconds of
 * server time. Everything expensive about it — the CSS, the fonts, the JavaScript —
 * is still static and still cached at the edge. Only the HTML shell is dynamic.
 *
 * If you genuinely needed this page static, the alternative is a plain
 * `<form method="POST" action="/api/subscribe">` posting to a `+server.ts` endpoint.
 * You would give up the typed client/server bridge and write the endpoint and its
 * types by hand. For one page, server-rendering is the better trade.
 */
export const prerender = false;
