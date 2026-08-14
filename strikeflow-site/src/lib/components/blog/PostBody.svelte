<!--
	POST BODY

	Renders the typed block array from `data/posts.ts`.

	Note what is NOT here: `{@html}`. Every block is rendered by a real element with
	Svelte's automatic escaping intact, so there is no code path where a string in the
	content becomes markup. When this eventually gets wired to a CMS, that property
	holds — which is the whole reason the content is structured rather than HTML.

	The `switch` over `block.type` is exhaustive against the `Block` union. Add a
	variant to the union without handling it here and TypeScript reports it, because
	the union narrows to `never` in the final branch.
-->

<script lang="ts">
	import type { Block } from '#lib/data/posts.ts';

	interface Props {
		blocks: readonly Block[];
	}

	let { blocks }: Props = $props();
</script>

<div class="post-body">
	{#each blocks as block, index (index)}
		{#if block.type === 'p'}
			<p>{block.text}</p>
		{:else if block.type === 'h2'}
			<!-- The `id` makes every heading a linkable anchor. -->
			<h2 id={block.id}>{block.text}</h2>
		{:else if block.type === 'h3'}
			<h3 id={block.id}>{block.text}</h3>
		{:else if block.type === 'ul'}
			<ul>
				{#each block.items as item (item)}
					<li>{item}</li>
				{/each}
			</ul>
		{:else if block.type === 'ol'}
			<ol>
				{#each block.items as item (item)}
					<li>{item}</li>
				{/each}
			</ol>
		{:else if block.type === 'quote'}
			<figure class="post-body__quote">
				<blockquote><p>{block.text}</p></blockquote>
				{#if block.cite}
					<figcaption>— {block.cite}</figcaption>
				{/if}
			</figure>
		{:else if block.type === 'callout'}
			<aside class="post-body__callout">
				<h3 class="post-body__callout-title">{block.title}</h3>
				<p>{block.text}</p>
			</aside>
		{/if}
	{/each}
</div>

<style>
	.post-body {
		/* A comfortable reading measure. Prose wider than ~70 characters is
		   measurably slower to read — the eye loses its place on the return sweep. */
		max-width: 68ch;
	}

	.post-body p {
		margin-block-end: var(--space-5);
		font-size: var(--fs-md);
		line-height: var(--lh-relaxed);
	}

	.post-body h2 {
		font-size: var(--fs-xl);
		margin-block: var(--space-10) var(--space-4);
		/* Clears the sticky header when jumped to via an anchor link. */
		scroll-margin-top: calc(var(--header-height) + var(--space-6));
	}

	.post-body h3 {
		font-size: var(--fs-lg);
		margin-block: var(--space-8) var(--space-3);
		scroll-margin-top: calc(var(--header-height) + var(--space-6));
	}

	.post-body ul,
	.post-body ol {
		margin-block-end: var(--space-6);
		padding-inline-start: var(--space-6);
	}

	.post-body li {
		margin-block-end: var(--space-3);
		font-size: var(--fs-md);
		line-height: var(--lh-relaxed);
	}

	.post-body__quote {
		margin-block: var(--space-8);
		padding-inline-start: var(--space-6);
		border-inline-start: 3px solid var(--accent);
	}

	.post-body__quote blockquote p {
		font-size: var(--fs-lg);
		color: var(--text-primary);
		font-style: italic;
		margin-block-end: var(--space-3);
	}

	.post-body__quote figcaption {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.post-body__callout {
		margin-block: var(--space-8);
		padding: var(--space-5) var(--space-6);
		border: 1px solid var(--border-brand);
		border-radius: var(--radius-lg);
		background-color: color-mix(in srgb, var(--brand-500) 8%, var(--surface));
	}

	.post-body__callout-title {
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-caps);
		color: var(--brand-300);
		margin-block: 0 var(--space-3);
	}

	.post-body__callout p {
		margin-block-end: 0;
		font-size: var(--fs-base);
	}
</style>
