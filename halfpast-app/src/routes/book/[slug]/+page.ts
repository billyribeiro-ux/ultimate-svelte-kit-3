import type { PageLoad } from './$types';

/**
 * Pass the slug through as data.
 *
 * A remote function cannot read `event.params` — SvelteKit makes the property
 * throw inside a query, precisely so nobody builds an authorisation decision on
 * a value the client could have shaped. Everything a query needs has to be a
 * validated argument, so the page reads the slug here and hands it over
 * explicitly.
 *
 * A universal load (`+page.ts`, not `+page.server.ts`) because there is nothing
 * secret here and nothing to fetch: it is a rename of a route parameter, and
 * running it in the browser during client-side navigation costs one function
 * call instead of a network round trip.
 */
export const load: PageLoad = ({ params }) => {
	return { slug: params.slug };
};
