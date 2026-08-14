<!--
	SECTION HEADER — eyebrow + heading + optional lede.

	The `level` prop exists for a reason worth internalising: heading levels are a
	document outline, not font sizes. A screen reader user can pull up a list of
	headings and navigate by it, and skipping from <h1> to <h3> makes that outline
	read as though content is missing.

	So: the visual size comes from CSS, and the level comes from where the section
	genuinely sits in the page's hierarchy. They are separate decisions.
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Small uppercase label above the heading. */
		eyebrow?: string;
		title: string;
		/** Intro paragraph below the heading. */
		lede?: string;
		/** Heading level. Defaults to 2 — correct for a section inside a page with one h1. */
		level?: 2 | 3;
		align?: 'start' | 'center';
		/** Anchor id, so the section can be linked to directly. */
		id?: string;
		/** Optional extra content (buttons, badges) below the lede. */
		children?: Snippet;
	}

	let { eyebrow, title, lede, level = 2, align = 'start', id, children }: Props = $props();
</script>

<div class="section-header section-header--{align}" {id}>
	{#if eyebrow}
		<p class="eyebrow">{eyebrow}</p>
	{/if}

	<svelte:element this={`h${level}`} class="section-header__title">
		{title}
	</svelte:element>

	{#if lede}
		<p class="lede">{lede}</p>
	{/if}

	{#if children}
		<div class="section-header__extra">{@render children()}</div>
	{/if}
</div>

<style>
	.section-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-width: 46rem;
	}

	.section-header--center {
		align-items: center;
		text-align: center;
		margin-inline: auto;
	}

	.section-header__title {
		font-size: var(--fs-2xl);
	}

	.section-header__extra {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-block-start: var(--space-2);
	}

	.section-header--center .section-header__extra {
		justify-content: center;
	}
</style>
