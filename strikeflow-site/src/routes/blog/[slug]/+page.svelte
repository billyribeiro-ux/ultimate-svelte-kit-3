<script lang="ts">
	import { resolve } from '$app/paths';
	import { ClockIcon, CaretLeftIcon } from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import { articleSchema, breadcrumbSchema, personSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl } from '#lib/data/site.ts';

	import Badge from '#lib/components/ui/Badge.svelte';
	import PostBody from '#lib/components/blog/PostBody.svelte';
	import CtaBand from '#lib/components/marketing/CtaBand.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const post = $derived(data.post);
	const author = $derived(data.author);
	const pageUrl = $derived(absoluteUrl(`/blog/${post.slug}`));

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

<!--
	The full structured-data set for an article:

	  Article        — the content itself, with a real author and dates
	  Person         — the author as an entity, with off-site profiles to verify them
	  BreadcrumbList — the path, which Google renders instead of a raw URL

	They cross-reference by @id, so a search engine can resolve "who wrote this, do
	they know the subject, and who publishes them" without guessing.
-->
<Seo
	title={post.seoTitle ?? post.title}
	description={post.description}
	type="article"
	article={{
		published: post.published,
		modified: post.updated,
		authorName: author.name,
		tags: post.tags
	}}
	schema={[
		articleSchema(post, author, pageUrl),
		personSchema(author),
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Insights', path: '/blog' },
			{ name: post.title, path: `/blog/${post.slug}` }
		])
	]}
/>

<article class="post">
	<div class="container container--wide">
		<!--
			A visible breadcrumb, matching the BreadcrumbList above.

			They must match. Structured data describing a breadcrumb the user cannot
			see is exactly the "markup doesn't reflect visible content" case Google's
			spam policies target.
		-->
		<nav class="post__breadcrumb" aria-label="Breadcrumb">
			<ol role="list">
				<li><a href={resolve('/')}>Home</a></li>
				<li aria-hidden="true">/</li>
				<li><a href={resolve('/blog')}>Insights</a></li>
				<li aria-hidden="true">/</li>
				<!-- aria-current marks the final crumb as the page you're on. -->
				<li><span aria-current="page">{post.title}</span></li>
			</ol>
		</nav>

		<header class="post__header">
			<div class="post__tags">
				{#each post.tags as tag (tag)}
					<Badge tone="brand">{tag}</Badge>
				{/each}
			</div>

			<h1 class="post__title">{post.title}</h1>
			<p class="lede">{post.description}</p>

			<div class="post__byline">
				<span class="post__avatar" aria-hidden="true">{author.initials}</span>
				<div class="post__byline-text">
					<p class="post__author">
						<!-- The author name links to their section on /about, which is the
						     stable author page the Person schema points at. -->
						<a href={`${resolve('/about')}#${author.id}`}>
							{author.name}{#if author.credentials}, {author.credentials}{/if}
						</a>
					</p>
					<p class="post__author-role">{author.role}</p>
				</div>

				<div class="post__dates">
					<time datetime={post.published}>{formatDate(post.published)}</time>
					{#if post.updated && post.updated !== post.published}
						<span class="post__updated">Updated {formatDate(post.updated)}</span>
					{/if}
					<span class="post__reading">
						<ClockIcon size={14} aria-hidden="true" />
						{post.readingMinutes} min read
					</span>
				</div>
			</div>
		</header>

		<div class="post__content">
			<PostBody blocks={post.body} />
		</div>

		<footer class="post__footer">
			<div class="post__disclaimer">
				<p>
					This article is educational and describes market mechanics. It is not investment advice
					and not a recommendation to buy or sell any security. See our
					<a href={resolve('/legal/risk-disclosure')}>risk disclosure</a>.
				</p>
			</div>

			<a class="post__back" href={resolve('/blog')}>
				<CaretLeftIcon size={16} aria-hidden="true" />
				All insights
			</a>
		</footer>
	</div>
</article>

<CtaBand />

<style>
	.post {
		padding-block: calc(var(--header-height) + var(--space-8)) var(--space-8);
	}

	.post__breadcrumb ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-xs);
		color: var(--text-muted);
		padding: 0;
	}

	.post__breadcrumb li {
		margin: 0;
		max-width: none;
		/* Keeps a long article title from blowing out the breadcrumb row on a phone. */
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 22ch;
	}

	.post__breadcrumb a {
		color: var(--text-muted);
		text-decoration: none;
	}

	.post__breadcrumb a:hover {
		color: var(--text-primary);
	}

	.post__header {
		margin-block-start: var(--space-8);
		padding-block-end: var(--space-8);
		border-bottom: 1px solid var(--border);
	}

	.post__tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-block-end: var(--space-4);
	}

	.post__title {
		font-size: var(--fs-3xl);
		max-width: 22ch;
	}

	.post__header .lede {
		margin-block-start: var(--space-4);
	}

	.post__byline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
		margin-block-start: var(--space-8);
	}

	.post__avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background-color: color-mix(in srgb, var(--brand-500) 18%, transparent);
		color: var(--brand-300);
		font-family: var(--font-heading);
		font-weight: var(--weight-bold);
		font-size: var(--fs-xs);
	}

	.post__byline-text {
		margin-inline-end: auto;
	}

	.post__author {
		font-family: var(--font-heading);
		font-weight: var(--weight-semibold);
		font-size: var(--fs-sm);
		max-width: none;
	}

	.post__author a {
		color: var(--text-primary);
		text-decoration: none;
	}

	.post__author a:hover {
		color: var(--brand-300);
	}

	.post__author-role {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		max-width: none;
	}

	.post__dates {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.post__updated {
		color: var(--brand-400);
	}

	.post__reading {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.post__content {
		margin-block-start: var(--space-10);
	}

	.post__footer {
		margin-block-start: var(--space-12);
		padding-block-start: var(--space-6);
		border-top: 1px solid var(--border);
	}

	.post__disclaimer p {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		max-width: 70ch;
	}

	.post__back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-block-start: var(--space-6);
		font-family: var(--font-heading);
		font-weight: var(--weight-semibold);
		font-size: var(--fs-sm);
		text-decoration: none;
	}

	@media (min-width: 64em) {
		.post__content {
			/* Indents the body to align with the header text rather than the page
			   edge — a small typographic courtesy that makes long reads feel composed. */
			padding-inline-start: 0;
		}
	}
</style>
