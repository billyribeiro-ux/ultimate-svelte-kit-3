/**
 * BLOG POST — load and prerender entries
 */

import { error } from '@sveltejs/kit';
import type { PageLoad, EntryGenerator } from './$types';
import { getPost } from '#lib/data/posts.ts';
import { getPerson } from '#lib/data/team.ts';
import { posts } from '#lib/data/posts.ts';

/**
 * `entries()` tells the prerenderer which values of `[slug]` exist.
 *
 * SvelteKit finds most pages by crawling links from the ones it already knows about,
 * which would in fact discover all three of these from `/blog`. So why declare them?
 *
 * Because crawling makes prerendering depend on your navigation. Unlink a post from
 * the index — move it to a "load more" button, say — and it silently stops being
 * built, with no error. `entries()` states the truth directly: these slugs exist and
 * must be rendered, regardless of what links to them.
 *
 * It also lets `handleUnseenRoutes: 'fail'` do its job. Without an entries function,
 * a dynamic route that nothing happens to link to fails the build — which is the
 * error you hit if you write this page before wiring up the index.
 */
export const entries: EntryGenerator = () => {
	return posts.map((post) => ({ slug: post.slug }));
};

export const load: PageLoad = ({ params }) => {
	const post = getPost(params.slug);

	if (!post) {
		// 404 rather than a redirect. A missing article is genuinely not found, and
		// telling a crawler otherwise (by bouncing it to /blog with a 302) creates a
		// soft 404 — one of the more common ways sites confuse Google about which of
		// their URLs are real.
		error(404, `No article found at /blog/${params.slug}`);
	}

	const author = getPerson(post.authorId);

	if (!author) {
		// A post whose author id doesn't resolve is a data bug, not a user error.
		// Failing loudly at build time is exactly what we want — an article with no
		// byline is an E-E-A-T problem we'd rather never ship.
		error(500, `Post "${post.slug}" references unknown author "${post.authorId}"`);
	}

	return { post, author };
};
