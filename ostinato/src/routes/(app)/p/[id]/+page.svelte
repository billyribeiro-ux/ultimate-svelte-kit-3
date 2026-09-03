<script lang="ts">
	import { page } from '$app/state';
	import type { RouteParams } from '$app/types';
	import type { PageProps } from './$types.js';
	import PatternView from '#lib/components/PatternView.svelte';

	let { data }: PageProps = $props();

	/**
	 * `$app/types` knows every route. `RouteParams<'/(app)/p/[id]'>` is
	 * `{ id: string }`, derived from the folder name — layout group included,
	 * because the group is part of the route's id even though it is not part
	 * of its URL — and it would stop compiling if the folder were renamed,
	 * which is what a type for a URL should do.
	 */
	const params = $derived(page.params as RouteParams<'/(app)/p/[id]'>);
	const card = $derived(`${page.url.origin}/p/${params.id}/card.svg`);
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
