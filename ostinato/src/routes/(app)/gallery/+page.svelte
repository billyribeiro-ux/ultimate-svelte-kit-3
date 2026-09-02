<script lang="ts">
	import { crossfade, fade } from 'svelte/transition';
	import { innerWidth } from 'svelte/reactivity/window';
	import { goto, preloadData, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { whoAmI } from '#lib/remote/artist.remote.ts';
	import {
		getCounts,
		getMine,
		getPattern,
		getPatterns,
		remove
	} from '#lib/remote/patterns.remote.ts';
	import type { Sort } from '#lib/server/patterns.ts';
	import MiniGrid from '#lib/components/MiniGrid.svelte';
	import PatternCard from '#lib/components/PatternCard.svelte';
	import PatternView from '#lib/components/PatternView.svelte';
	import Section from '#lib/components/Section.svelte';
	import { toast } from '#lib/toast/toast.ts';

	const sorts: { value: Sort; label: string }[] = [
		{ value: 'new', label: 'Newest' },
		{ value: 'loved', label: 'Most loved' },
		{ value: 'played', label: 'Most played' }
	];

	/** The sort lives in the URL, so a sorted gallery is a link. */
	const sort = $derived.by((): Sort => {
		const wanted = page.url.searchParams.get('sort');
		return sorts.some((s) => s.value === wanted) ? (wanted as Sort) : 'new';
	});

	/**
	 * CROSSFADE
	 * =========
	 * `crossfade` returns a pair of transitions. An element leaving with
	 * `out:send` and another entering with `in:receive` under the same key are
	 * animated as one thing moving between two places — here, a card's picture
	 * travelling into the preview dialog. When there is no partner (the dialog
	 * closed by the back button before the card re-rendered), `fallback` runs.
	 */
	const [send, receive] = crossfade({
		duration: 320,
		fallback: (node) => fade(node, { duration: 160 })
	});

	/**
	 * PREVIEW WITHOUT LEAVING
	 * =======================
	 * On a wide screen, clicking a card opens it in a dialog rather than
	 * navigating away. `preloadData` runs the pattern page's `load` — which
	 * warms the `getPattern` cache — and `pushState` then changes the URL to
	 * the pattern's address with `{ preview }` in the history state, *without*
	 * rendering the pattern page. Reload, and the real page appears at that
	 * URL; press back, and the dialog closes. On a phone, the link is a link.
	 */
	async function open(event: MouseEvent, id: string) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || (innerWidth.current ?? 0) < 640) return;
		event.preventDefault();

		const href = `/p/${id}`;
		const result = await preloadData(href);
		if (result.type === 'loaded' && result.status === 200) {
			pushState(href, { preview: id });
		} else {
			await goto(href);
		}
	}

	function close() {
		history.back();
	}
</script>

<svelte:head>
	<title>Gallery — Ostinato</title>
	<meta name="description" content="Published grooves: play them, love them, remix them." />
</svelte:head>

<div class="page">
	<Section eyebrow="Gallery" title="Published grooves">
		<nav class="cluster" aria-label="Sort">
			{#each sorts as option (option.value)}
				<a
					class="chip"
					href="?sort={option.value}"
					aria-current={sort === option.value ? 'true' : undefined}
				>
					{option.label}
				</a>
			{/each}
		</nav>

		<svelte:boundary>
			<ul class="cards">
				{#each await getPatterns({ sort }) as published (published.id)}
					<li>
						<PatternCard
							{published}
							counts={await getCounts(published.id)}
							onopen={(e) => open(e, published.id)}
						>
							{#snippet grid(pattern)}
								{#if page.state.preview !== published.id}
									<div out:send={{ key: published.id }} in:receive={{ key: published.id }}>
										<MiniGrid {pattern} />
									</div>
								{/if}
							{/snippet}
						</PatternCard>
					</li>
				{:else}
					<li class="hint">Nothing published yet.</li>
				{/each}
			</ul>

			{#snippet pending()}
				<p class="hint">Loading the gallery…</p>
			{/snippet}
			{#snippet failed(error, reset)}
				<p class="issue">The gallery could not be loaded: {(error as Error).message}</p>
				<button type="button" class="btn" onclick={reset}>Try again</button>
			{/snippet}
		</svelte:boundary>
	</Section>

	<svelte:boundary>
		{const me = $derived(await whoAmI())}
		{#if me}
			<Section eyebrow="@{me.handle}" title="Yours">
				<svelte:boundary>
					<ul class="cards" id="yours">
						{#each await getMine() as mine (mine.id)}
							{const del = remove.for(mine.id)}
							<li>
								<PatternCard published={mine} counts={await getCounts(mine.id)}>
									{#snippet actions()}
										<!--
										One form per card, isolated by `remove.for(id)`, so a pending
										delete disables *its* button and no other. The optimistic
										override removes the card before the server has answered;
										a failure puts it back.
									-->
										<form
											{...del.enhance(async (f) => {
												try {
													await f
														.submit()
														.updates(
															getMine().withOverride((list) => list.filter((p) => p.id !== mine.id))
														);
													toast('Deleted');
												} catch {
													toast('Could not delete that', 'error');
												}
											})}
										>
											<input {...del.fields.id.as('hidden', mine.id)} />
											<button class="btn btn--sm btn--danger" disabled={!!del.pending}
												>Delete</button
											>
										</form>
									{/snippet}
								</PatternCard>
							</li>
						{:else}
							<li class="hint">You have not published anything from this browser yet.</li>
						{/each}
					</ul>
					{#snippet pending()}
						<p class="hint">Loading yours…</p>
					{/snippet}
				</svelte:boundary>
			</Section>
		{/if}
	</svelte:boundary>
</div>

{#if page.state.preview}
	{const id = page.state.preview}
	<div
		class="backdrop"
		role="presentation"
		onclick={close}
		transition:fade={{ duration: 160 }}
	></div>
	<div
		class="preview"
		role="dialog"
		aria-label="Pattern preview"
		transition:fade={{ duration: 160 }}
	>
		<svelte:boundary>
			{const published = $derived(await getPattern(id))}
			<div class="preview__picture" in:receive={{ key: id }} out:send={{ key: id }}>
				<MiniGrid pattern={published.pattern} />
			</div>
			<PatternView {published} compact />
			<p class="cluster">
				<a class="btn btn--ghost" href="/p/{id}" data-sveltekit-reload>Open the full page</a>
				<button type="button" class="btn btn--ghost" onclick={close}>Close</button>
			</p>
			{#snippet pending()}
				<p class="hint">Opening…</p>
			{/snippet}
		</svelte:boundary>
	</div>
{/if}

<style>
	.cards {
		display: grid;
		gap: var(--space-4);
		list-style: none;
		padding: 0;
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-dialog);
		background: rgb(0 0 0 / 0.5);
	}

	.preview {
		position: fixed;
		inset: 5vh 0 auto;
		z-index: var(--z-dialog);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		width: min(56rem, 100% - 2 * var(--gutter));
		max-height: 90vh;
		margin-inline: auto;
		padding: var(--space-5);
		overflow-y: auto;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		box-shadow: var(--shadow-lg);
	}

	.preview__picture {
		max-width: 16rem;
	}

	@media (min-width: 40rem) {
		.cards {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 64rem) {
		.cards {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
