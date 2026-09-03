import type { PageLoad } from './$types.js';
import { getPublished } from '#lib/remote/sheets.remote.ts';
import { tabulate } from '#lib/sheet/render.ts';

/**
 * A published sheet ships no JavaScript. `csr = false` means the server
 * renders the page and the browser gets HTML and CSS and nothing else:
 * nothing to hydrate, nothing to download, a page that prints. The table
 * is computed here — the engine runs on the server — and arrives as text.
 */
export const csr = false;

export const load: PageLoad = async ({ params }) => {
	const published = await getPublished(params.id);
	return { published, rendered: tabulate(published.doc, 'en-US') };
};
