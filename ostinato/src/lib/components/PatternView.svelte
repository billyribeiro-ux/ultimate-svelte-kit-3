<script lang="ts">
	import { HeartIcon } from 'phosphor-svelte';
	import { resolve } from '$app/paths';
	import { getCounts, lovePattern, recordPlay } from '#lib/remote/patterns.remote.ts';
	import type { Published } from '#lib/server/patterns.ts';
	import { vanityPath } from '#lib/vanity.ts';
	import Player from '#lib/studio/Player.svelte';
	import StepGrid from '#lib/studio/StepGrid.svelte';
	import { toast } from '#lib/toast/toast.ts';

	/**
	 * A PUBLISHED PATTERN
	 * ===================
	 *
	 * The page at `/p/<id>` and the gallery's preview dialog are the same
	 * component. Counts come through `query.batch` — every card and this view
	 * asking `getCounts(id)` in one render becomes one request.
	 */
	let { published, compact = false }: { published: Published; compact?: boolean } = $props();

	const vanity = $derived(vanityPath({ handle: published.artist.handle, slug: published.slug }));

	/**
	 * OPTIMISTIC, THEN CORRECTED
	 * --------------------------
	 * Loving a pattern bumps the number on screen *now* — `withOverride` —
	 * and asks the server to send the real count back in the same response.
	 * If the command fails, the override is dropped and the number returns to
	 * what the server last said. No spinner, no stale count.
	 */
	async function love() {
		try {
			await lovePattern(published.id).updates(
				getCounts(published.id).withOverride((counts) => ({ ...counts, likes: counts.likes + 1 }))
			);
		} catch {
			toast('Could not love that right now', 'error');
		}
	}

	function played() {
		void recordPlay(published.id)
			.updates(
				getCounts(published.id).withOverride((counts) => ({ ...counts, plays: counts.plays + 1 }))
			)
			.catch(() => {});
	}
</script>

<article class="view stack">
	<header class="view__head">
		<div>
			<h1 class={{ 'view__title--compact': compact }}>{published.title}</h1>
			<p class="view__meta">
				<a href={vanity}>@{published.artist.handle}</a>
				<span class="mono">{published.bpm} bpm</span>
				{#if published.remixOf}
					<span
						>remix of <a href={resolve('/(app)/p/[id]', { id: published.remixOf })}
							>{published.remixOf}</a
						></span
					>
				{/if}
			</p>
		</div>

		<!--
			`await` in markup: the batched counts, with nothing to show until they
			arrive. `$derived`, because the value must follow the query — a bare
			`{const counts = await …}` would evaluate once, and the optimistic
			override below would update a number nobody was watching.
		-->
		<svelte:boundary>
			{const counts = $derived(await getCounts(published.id))}
			<div class="cluster">
				<span class="chip mono" title="plays">▶ {counts.plays}</span>
				<button type="button" class="btn btn--sm" onclick={love}>
					<HeartIcon size={14} weight="fill" />
					{counts.likes}
				</button>
			</div>
			{#snippet pending()}
				<span class="hint">…</span>
			{/snippet}
		</svelte:boundary>
	</header>

	<Player pattern={published.pattern} onfirstplay={played}>
		{#snippet children({ step })}
			<StepGrid pattern={published.pattern} {step} readonly />
		{/snippet}
	</Player>

	<div class="cluster">
		<a class="btn btn--primary" href="/studio?remix={published.id}">Remix in the studio</a>
		<a class="btn" href={vanity}>Vanity address</a>
		{#if !compact}
			<a class="btn btn--ghost" href="/embed#{published.id}">Embed</a>
		{/if}
	</div>
</article>

<style>
	.view__head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.view__title--compact {
		font-size: var(--fs-xl);
	}

	.view__meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>
