import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types.js';
import { tabulate } from '#lib/sheet/render.ts';
import { TEMPLATE_SLUGS, TEMPLATES, templateDocument } from '#lib/sheet/templates.ts';

/**
 * Every template page is prerendered. A dynamic route cannot be crawled
 * unless something links to it, so `entries` lists the parameters — and
 * the list is the same array the templates module exports, so adding a
 * template adds a page.
 */
export const prerender = true;

export const entries: EntryGenerator = () => TEMPLATE_SLUGS.map((slug) => ({ slug }));

export const load: PageLoad = ({ params }) => {
	const template = TEMPLATES[params.slug];
	if (!template) error(404, 'No such template');
	return { template, rendered: tabulate(templateDocument(params.slug), 'en-US') };
};
