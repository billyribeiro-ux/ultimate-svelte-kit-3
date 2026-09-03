import type { PageLoad } from './$types.js';
import { getPublished } from '#lib/remote/sheets.remote.ts';
import { tabulate } from '#lib/sheet/render.ts';

/** The embed is the published table with nothing else: no JavaScript, no header, framed by anyone. */
export const csr = false;

export const load: PageLoad = async ({ params }) => {
	const published = await getPublished(params.id);
	return { published, rendered: tabulate(published.doc, 'en-US', { rows: 200, cols: 26 }) };
};
