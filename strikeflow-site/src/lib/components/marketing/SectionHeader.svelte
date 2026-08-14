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
	import { headline, reveal } from '#lib/motion/index.ts';

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
		/**
		 * Animate the heading on scroll — a masked line-by-line reveal.
		 *
		 * Off by default. A page where *every* heading performs is exhausting; the
		 * effect works because it is used on the two or three that matter.
		 */
		animate?: boolean;
	}

	let {
		eyebrow,
		title,
		lede,
		level = 2,
		align = 'start',
		id,
		children,
		animate = false
	}: Props = $props();
</script>

<div class="section-header section-header--{align}" {id}>
	{#if eyebrow}
		<p class="eyebrow" data-reveal {@attach animate ? reveal({ distance: 14 }) : undefined}>
			{eyebrow}
		</p>
	{/if}

	<!--
		The attachment is applied conditionally by passing `undefined` when `animate`
		is false. `{@attach undefined}` is a no-op, which is cleaner than duplicating
		the whole element inside an {#if}.
	-->
	<svelte:element
		this={`h${level}`}
		class="section-header__title"
		{@attach animate ? headline({ onScroll: true, duration: 0.85 }) : undefined}
	>
		{title}
	</svelte:element>

	{#if lede}
		<p class="lede" data-reveal {@attach animate ? reveal({ delay: 0.12 }) : undefined}>
			{lede}
		</p>
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
