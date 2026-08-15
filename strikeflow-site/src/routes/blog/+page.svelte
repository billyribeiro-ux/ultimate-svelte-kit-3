<script lang="ts">
	import { resolve } from '$app/paths';
	import { ClockIcon } from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl } from '#lib/data/site.ts';
	import { postsByDate } from '#lib/data/posts.ts';
	import { getPerson } from '#lib/data/team.ts';

	import Badge from '#lib/components/ui/Badge.svelte';
	import CtaBand from '#lib/components/marketing/CtaBand.svelte';
	import { revealGroup } from '#lib/motion/index.ts';

	const pageUrl = absoluteUrl('/blog');

	/** Dates render in a fixed locale so server and client agree during hydration. */
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	});

	function formatDate(iso: string): string {
		return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
	}
</script>

<Seo
	title="Insights — research on options market structure"
	description="Research notes from the StrikeFlow team on reading the options tape: order flow, dealer gamma, volume against open interest, and the mistakes most scanners make."
	schema={[
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Insights', path: '/blog' }
		])
	]}
/>

<section class="page-hero">
	<div class="container container--wide">
		<h1>Insights</h1>
		<p class="lede">
			Notes on market structure from the people who build the platform. No trade ideas, no
			predictions — just how this machinery actually works.
		</p>
	</div>
</section>

<section class="section section--tight" aria-label="Articles">
	<div class="container container--wide">
		<ul class="posts" role="list" {@attach revealGroup('.posts__item', { scale: true })}>
			{#each postsByDate as post (post.slug)}
				{@const author = getPerson(post.authorId)}
				<li class="posts__item">
					<article class="post-card">
						<div class="post-card__meta">
							{#each post.tags as tag (tag)}
								<Badge tone="brand">{tag}</Badge>
							{/each}
						</div>

						<h2 class="post-card__title">
							<!--
								The whole heading is the link, not a "read more" beneath it.

								Screen-reader users often navigate by pulling up a list of links.
								A page full of links all reading "read more" is useless in that
								view; a link whose text is the article title is self-describing.
							-->
							<a href={resolve('/blog/[slug]', { slug: post.slug })}>{post.title}</a>
						</h2>

						<p class="post-card__excerpt">{post.description}</p>

						<footer class="post-card__footer">
							{#if author}
								<span class="post-card__author">{author.name}</span>
								<span aria-hidden="true">·</span>
							{/if}
							<!-- <time> with a machine-readable datetime is both a semantic win
							     and what Article structured data expects to corroborate. -->
							<time datetime={post.published}>{formatDate(post.published)}</time>
							<span aria-hidden="true">·</span>
							<span class="post-card__reading">
								<ClockIcon size={14} aria-hidden="true" />
								{post.readingMinutes} min read
							</span>
						</footer>
					</article>
				</li>
			{/each}
		</ul>
	</div>
</section>

<CtaBand />

<style>
	.page-hero {
		padding-block: calc(var(--header-height) + var(--space-10)) var(--space-2);
		background:
			radial-gradient(
				70% 60% at 20% -10%,
				color-mix(in srgb, var(--brand-500) 14%, transparent),
				transparent 70%
			),
			var(--bg-root);
	}

	.page-hero .lede {
		margin-block-start: var(--space-5);
	}

	.posts {
		display: grid;
		gap: var(--space-5);
	}

	.posts__item {
		margin: 0;
		max-width: none;
	}

	.post-card {
		/* Required — the stretched-link ::after below is absolutely positioned
		   against this. Without it, the overlay escapes to the nearest positioned
		   ancestor and covers the whole page. */
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		height: 100%;
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background-color: var(--surface);
		transition:
			border-color var(--dur-base) var(--ease-out),
			transform var(--dur-base) var(--ease-out);
	}

	@media (hover: hover) {
		.post-card:hover {
			border-color: var(--border-strong);
			transform: translateY(-2px);
		}
	}

	.post-card:focus-within {
		border-color: var(--border-brand);
	}

	.post-card__meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.post-card__title {
		font-size: var(--fs-lg);
	}

	.post-card__title a {
		color: var(--text-primary);
		text-decoration: none;
	}

	/*
	 * Stretched link: the <a> is the only interactive element, but its ::after
	 * expands to cover the whole card. You get a large click target without
	 * nesting the card inside an <a> (invalid — a link can't contain a heading
	 * plus block content) and without an onclick on the container (not keyboard
	 * accessible). The link text stays the title, so it reads correctly out of
	 * context.
	 */
	.post-card__title a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.post-card__excerpt {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		max-width: 62ch;
	}

	.post-card__footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-block-start: auto;
		padding-block-start: var(--space-4);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.post-card__author {
		color: var(--text-secondary);
		font-weight: var(--weight-semibold);
	}

	.post-card__reading {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	@media (min-width: 48em) {
		.posts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 80em) {
		.posts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
