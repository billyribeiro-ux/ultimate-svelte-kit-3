/**
 * The landing page is prerendered: the same for everybody, changed by a
 * deploy and nothing else, so a static file is the fastest thing a server
 * can send — and, with server-side route resolution, its route resolution
 * is prerendered beside it.
 */
export const prerender = true;
