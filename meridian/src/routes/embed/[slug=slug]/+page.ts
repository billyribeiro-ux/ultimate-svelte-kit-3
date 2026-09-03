/*
 * The frame. `/embed/<slug>` is the one route `hooks.server.ts` allows other
 * sites to put in an `<iframe>`, and it is server-rendered with no client
 * JavaScript at all: a route summary does not need any, and a frame that
 * ships nothing cannot slow the page around it.
 */
export const csr = false;
