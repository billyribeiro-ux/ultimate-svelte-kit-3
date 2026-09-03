/**
 * The landing page is prerendered: it is the same for everybody, it changes
 * when the app is deployed and not before, and a static file is the fastest
 * thing a server can send. The featured strip inside it is a `prerender`
 * remote function, so the crawler runs that at build time too and the page
 * needs no database to serve.
 */
export const prerender = true;
