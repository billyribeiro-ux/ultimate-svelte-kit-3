/**
 * VANITY ADDRESSES
 * ================
 *
 * A published pattern lives at `/p/<id>`, and that is the route. It is also
 * reachable at `/@handle/slug`, which is the address people share, and which
 * is *not* a route: the `reroute` hook in `src/hooks.ts` asks the server what
 * `/@handle/slug` means and returns `/p/<id>`, and SvelteKit renders that
 * route with the vanity address still in the bar.
 *
 * Shared by the hook, the resolver endpoint and the page that prints the
 * address, so that all three agree on the shape of it.
 */

const VANITY = /^\/@([a-z0-9_]{3,20})\/([a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?)\/?$/;

export interface Vanity {
	handle: string;
	slug: string;
}

/** `/@handle/slug` → `{ handle, slug }`, or `null` for any other path. */
export function parseVanity(pathname: string): Vanity | null {
	const match = VANITY.exec(pathname);
	if (!match) return null;
	return { handle: match[1]!, slug: match[2]! };
}

export function vanityPath({ handle, slug }: Vanity): string {
	return `/@${handle}/${slug}`;
}

/**
 * A title as a slug: lower-case, ASCII, hyphens, at most sixty characters.
 * `normalize('NFKD')` splits accented letters into a letter and a mark, and
 * the range removes the marks, so "Café groove" becomes `cafe-groove` rather
 * than `caf-groove`.
 */
export function slugify(title: string): string {
	const slug = title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	return slug || 'untitled';
}
