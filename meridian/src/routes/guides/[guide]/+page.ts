import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';
import { guideBySlug, guides } from '#lib/guides/index.ts';

export const prerender = true;
export const csr = false;

/*
 * WHICH PAGES EXIST
 * =================
 *
 * A dynamic route can only be prerendered if SvelteKit knows the values of
 * its parameters. The crawler finds most of them by following links from
 * pages it has already rendered; `entries` says them out loud, so a guide
 * that nothing links to is still built.
 */
export const entries: EntryGenerator = () => guides.map((guide) => ({ guide: guide.slug }));

export const load: PageLoad = ({ params }) => {
	const guide = guideBySlug(params.guide);
	if (!guide) error(404, 'There is no guide by that name.');
	return { guide };
};
