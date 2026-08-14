/**
 * ROOT LAYOUT CONFIG
 *
 * Options exported from a layout cascade to every page beneath it, so these two
 * lines configure the entire site.
 */

/**
 * Prerender everything by default.
 *
 * At build time SvelteKit crawls the site, renders each page, and writes plain HTML
 * files. At request time a user gets a static file from the CDN edge — no server
 * render, no database, no cold start. Time to First Byte drops to whatever the
 * network costs, which is the single biggest lever on Largest Contentful Paint.
 *
 * This is the right default for a marketing site: the content is the same for every
 * visitor. Pages that genuinely need per-request work (the ebook thank-you page,
 * which validates a signed token) opt out with `export const prerender = false`.
 *
 * A useful side effect: prerendering fails the build on a broken internal link,
 * because the crawler follows every link and reports any that 404. Combined with
 * `handleHttpError: 'fail'` in vite.config.ts, it's impossible to ship a dead
 * internal link.
 */
export const prerender = true;

/**
 * Trailing slashes.
 *
 * `/about` and `/about/` are different URLs to a search engine. If both resolve,
 * you've split your ranking signals in two. Picking one and being consistent is the
 * whole fix — SvelteKit will redirect the other form for you.
 */
export const trailingSlash = 'never';
