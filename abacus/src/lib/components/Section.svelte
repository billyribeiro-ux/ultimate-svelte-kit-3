<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A titled section whose heading level is a prop.
	 *
	 * `<svelte:element this={...}>` renders whichever tag the string names, so
	 * the same component is an `h2` on the landing page and an `h3` inside a
	 * panel — and the document outline stays honest, which is what a screen
	 * reader navigates by.
	 */
	let {
		level = 2,
		title,
		eyebrow,
		children
	}: { level?: 2 | 3 | 4; title: string; eyebrow?: string; children: Snippet } = $props();
</script>

<section class="section">
	<header class="section__head">
		{#if eyebrow}<p class="section__eyebrow">{eyebrow}</p>{/if}
		<svelte:element this={`h${level}`} class="section__title">{title}</svelte:element>
	</header>
	{@render children()}
</section>

<style>
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-block: var(--space-6);
	}

	.section__head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.section__eyebrow {
		color: var(--accent);
		font-size: var(--fs-xs);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.section__title {
		margin: 0;
	}

	@media (min-width: 40rem) {
		.section {
			padding-block: var(--space-7);
		}
	}
</style>
