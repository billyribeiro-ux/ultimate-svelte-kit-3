<script lang="ts">
	import type { Snippet } from 'svelte';
	import MiniGrid from './MiniGrid.svelte';
	import type { Pattern } from '#lib/pattern/model.ts';
	import type { Published } from '#lib/server/patterns.ts';

	/**
	 * One published pattern, as a card. The link is the whole card; the
	 * optional `actions` snippet is where a gallery puts its delete form or its
	 * preview button, so this component does not have to know about either.
	 */
	let {
		published,
		counts,
		href = `/p/${published.id}`,
		actions,
		grid,
		onopen
	}: {
		published: Published;
		counts?: { plays: number; likes: number };
		href?: string;
		actions?: Snippet;
		/** Replaces the default picture — the gallery uses it to crossfade into a preview. */
		grid?: Snippet<[Pattern]>;
		onopen?: (event: MouseEvent) => void;
	} = $props();
</script>

<article class="card pattern-card">
	<a {href} class="pattern-card__link" onclick={onopen}>
		{#if grid}
			{@render grid(published.pattern)}
		{:else}
			<MiniGrid pattern={published.pattern} />
		{/if}
		<h3 class="pattern-card__title">{published.title}</h3>
	</a>
	<p class="pattern-card__meta">
		<span>@{published.artist.handle}</span>
		<span class="mono">{published.bpm} bpm</span>
		{#if counts}
			<span class="mono" title="plays">▶ {counts.plays}</span>
			<span class="mono" title="loves">♥ {counts.likes}</span>
		{/if}
	</p>
	{#if actions}
		<div class="pattern-card__actions">{@render actions()}</div>
	{/if}
</article>

<style>
	.pattern-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
	}

	.pattern-card__link {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		color: inherit;
		text-decoration: none;
	}

	.pattern-card__title {
		font-size: var(--fs-md);
	}

	.pattern-card__meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.pattern-card__actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
