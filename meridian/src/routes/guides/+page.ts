/*
 * PRERENDERED, AND NO JAVASCRIPT
 * ==============================
 *
 * `prerender = true`: this page is rendered once, at build time, to a file
 * that any static host — or the adapter-node server — sends as-is.
 *
 * `csr = false`: no client-side JavaScript is shipped for it. Not "deferred",
 * not "hydrated later" — none. A list of links needs none, and a page that
 * ships nothing cannot be slow to become interactive.
 *
 * Both are page options: exported from `+page.ts` so SvelteKit reads them
 * before rendering anything.
 */
export const prerender = true;
export const csr = false;
