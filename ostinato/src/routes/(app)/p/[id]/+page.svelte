<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageProps } from './$types.js';
	import PatternView from '#lib/components/PatternView.svelte';

	/**
	 * `params` arrives as a prop, typed by the generated `PageProps` from the
	 * folder name: `{ id: string }`, with no cast, and it would stop compiling
	 * if the folder were renamed — which is what a type for a URL should do.
	 */
	let { data, params }: PageProps = $props();

	/*
	 * The card's address from its route id — layout group included, because
	 * the group is part of the route's id even though it is not part of its
	 * URL. Absolute, because `og:image` is read by a crawler on another site.
	 */
	const card = $derived(
		new URL(resolve('/(app)/p/[id]/card.svg', { id: params.id }), page.url.origin).href
	);
</script>

<svelte:head>
	<title>{data.published.title} by @{data.published.artist.handle} — Ostinato</title>
	<meta
		name="description"
		content="{data.published.title}: a {data.published.bpm} bpm groove by @{data.published.artist
			.handle}. Play it, remix it, embed it."
	/>
	<meta property="og:title" content={data.published.title} />
	<meta property="og:image" content={card} />
	<meta property="og:type" content="music.song" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="page pattern-page">
	<PatternView published={data.published} />

	<section class="stack">
		<h2>Share card</h2>
		<p class="hint">
			Drawn on the server from the pattern itself, and what appears when this page is linked.
		</p>
		<img
			class="card"
			src={card}
			alt="Share card for {data.published.title}"
			width="1200"
			height="630"
		/>
	</section>
</div>

<style>
	.pattern-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-7);
		padding-block: var(--space-5) var(--space-8);
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
</style>
