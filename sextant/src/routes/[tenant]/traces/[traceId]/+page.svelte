<script lang="ts">
	import FlameGraph from '#lib/components/FlameGraph.svelte';
	import Waterfall from '#lib/components/Waterfall.svelte';
	import { trace as traceQuery } from '#lib/remote/query.remote.ts';
	import { serviceTotals } from '#lib/trace/assemble.ts';
	import { formatDuration } from '#lib/time/range.ts';
	import type { PageProps } from './$types.js';

	/**
	 * THE FULL TRACE PAGE
	 * ===================
	 *
	 * The same trace the drawer shows, at the URL the drawer put in the address
	 * bar. That is the whole reason it exists: shallow routing changes the URL
	 * without navigating, and a URL that only works if you arrived at it a
	 * particular way is a broken URL. Somebody who reloads, or who receives the
	 * link in a chat message, lands here.
	 *
	 * It is a genuinely different rendering, not a wrapper around the drawer: with
	 * a whole page there is room for the waterfall to be tall, and there is no
	 * results table behind it to preserve. Sharing the two view components is what
	 * keeps them from drifting; sharing the *layout* would give a page with a
	 * drawer's proportions.
	 */
	let { data }: PageProps = $props();

	let selected = $state<string | null>(null);

	const assembled = $derived(await traceQuery({ tenant: data.tenant, traceId: data.traceId }));
</script>

<svelte:head>
	<title>Trace {data.traceId} · Sextant</title>
	<!-- A trace id is not a secret and is not interesting to a search engine. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<header class="page__head">
		<h1>Trace</h1>
		<p class="mono page__id">{data.traceId}</p>
		<a class="btn btn--sm" href="/{data.tenant}/explore">Back to explore</a>
	</header>

	<svelte:boundary>
		{#if assembled}
			<ul class="totals">
				{#each serviceTotals(assembled) as total (total.service)}
					<li>
						<span class="truncate">{total.service}</span>
						<strong>{formatDuration(total.total)}</strong>
					</li>
				{/each}
			</ul>

			<FlameGraph trace={assembled} {selected} onselect={(id) => (selected = id)} />
			<Waterfall trace={assembled} {selected} onselect={(id) => (selected = id)} />
		{:else}
			<p class="empty">
				No spans for this trace. They may still be arriving, or they may have aged out of retention.
			</p>
		{/if}

		{#snippet pending()}
			<p class="empty" role="status">Loading the trace…</p>
		{/snippet}

		{#snippet failed(error)}
			<p class="empty" role="alert">
				{(error as { body?: { message?: string } })?.body?.message ?? 'The trace could not load.'}
			</p>
		{/snippet}
	</svelte:boundary>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		flex: 1;
		min-height: 0;
		padding: var(--space-3);
	}

	.page__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-lg);
	}

	.page__id {
		margin: 0;
		color: var(--text-faint);
		overflow-wrap: anywhere;
	}

	.page__head .btn {
		margin-inline-start: auto;
	}

	.totals {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.totals li {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		max-width: 16rem;
		padding: var(--space-1) var(--space-2);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.totals strong {
		font-family: var(--font-mono);
		color: var(--text);
	}

	.empty {
		padding: var(--space-5);
		color: var(--text-muted);
	}

	/* The waterfall takes the rest of the page rather than a fixed height. */
	.page > :global(section) {
		min-height: 0;
	}
</style>
