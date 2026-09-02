<script lang="ts">
	import { runQuery } from '#lib/remote/query.remote.ts';
	import RangePicker from '#lib/components/RangePicker.svelte';
	import { formatDuration, formatTimestamp, resolve } from '#lib/time/range.ts';
	import type { PageProps } from './$types.js';

	/**
	 * RECENT TRACES
	 * =============
	 *
	 * A list built by running a query, not by a bespoke endpoint.
	 *
	 * That is the payoff of having a query language: "the slowest root spans in the
	 * last hour" is one line of SQF, and it goes through the same parser, checker,
	 * planner and permission check as anything a person types. A hand-written
	 * endpoint for it would be a second code path to secure, a second one to make
	 * fast, and a second one to keep correct when the schema changes.
	 *
	 * The query is written out in full below rather than assembled from fragments,
	 * because a query somebody can read is a query somebody can copy into the
	 * explore page and change — which is exactly what they want to do the moment
	 * this list nearly shows what they need.
	 */
	let { data }: PageProps = $props();

	let range = $state('-1h');
	let sort = $state<'slowest' | 'newest'>('slowest');

	const q = $derived(
		[
			'from spans',
			'| where parentId == ""',
			`| project traceId, service, name, timestamp, duration, status`,
			sort === 'slowest' ? '| sort duration desc' : '| sort timestamp desc',
			'| take 100'
		].join(' ')
	);

	const result = $derived(await runQuery({ tenant: data.tenant, q, range }));
	const window_ = $derived(resolve(range));
</script>

<svelte:head>
	<title>Traces · {data.tenant} · Sextant</title>
</svelte:head>

<div class="page">
	<header class="page__head">
		<h1>Traces</h1>

		<div class="page__controls">
			<div role="group" aria-label="Order">
				<button
					type="button"
					class="btn btn--sm"
					aria-pressed={sort === 'slowest'}
					onclick={() => (sort = 'slowest')}>Slowest</button
				>
				<button
					type="button"
					class="btn btn--sm"
					aria-pressed={sort === 'newest'}
					onclick={() => (sort = 'newest')}>Newest</button
				>
			</div>
			<RangePicker bind:value={range} />
		</div>
	</header>

	<p class="page__query mono">{q}</p>

	<svelte:boundary>
		{#if result.rows.length === 0}
			<p class="empty">No traces in this range.</p>
		{:else}
			<ul class="list">
				{#each result.rows as row (String(row.traceId))}
					<li>
						<a class="trace" href="/{data.tenant}/traces/{encodeURIComponent(String(row.traceId))}">
							<span class="trace__name truncate">
								<span class="trace__service">{row.service}</span>
								{row.name}
							</span>
							<span class="trace__time">{formatTimestamp(Number(row.timestamp), window_)}</span>
							<span class="trace__duration" class:trace__duration--error={row.status === 'error'}>
								{formatDuration(Number(row.duration))}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		{#snippet pending()}
			<p class="empty" role="status">Loading…</p>
		{/snippet}

		{#snippet failed(error)}
			<p class="empty" role="alert">
				{(error as { body?: { message?: string } })?.body?.message ?? 'Could not load traces.'}
			</p>
		{/snippet}
	</svelte:boundary>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		flex: 1;
		min-height: 0;
	}

	.page__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-lg);
	}

	.page__controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-inline-start: auto;
	}

	.page__controls .btn[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}

	.page__query {
		margin: 0;
		padding: var(--space-2);
		background: var(--surface-sunken);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		overflow-x: auto;
		white-space: nowrap;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.trace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'name duration'
			'time duration';
		gap: 0 var(--space-3);
		align-items: center;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		font-size: var(--fs-sm);
	}

	.trace:hover {
		background: var(--surface-hover);
	}

	.trace__name {
		grid-area: name;
		font-family: var(--font-mono);
	}

	.trace__service {
		color: var(--accent);
	}

	.trace__time {
		grid-area: time;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}

	.trace__duration {
		grid-area: duration;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.trace__duration--error {
		color: var(--danger);
	}

	.empty {
		padding: var(--space-5);
		color: var(--text-muted);
	}

	@media (min-width: 48rem) {
		.trace {
			grid-template-columns: minmax(0, 1fr) auto auto;
			grid-template-areas: 'name time duration';
		}
	}
</style>
