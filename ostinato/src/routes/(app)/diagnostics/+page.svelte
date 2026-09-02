<script lang="ts">
	import { version } from '$app/env';
	import { updated } from '$app/state';
	import { entries, name as adapter, precompress } from 'virtual:adapter';
	import { getRuntime, getSpans, getTrace } from '#lib/remote/diagnostics.remote.ts';
	import Section from '#lib/components/Section.svelte';

	/**
	 * WHAT THE SERVER KNOWS ABOUT ITSELF
	 * ==================================
	 *
	 * Spans from the in-memory ring, the adapter's platform object, and the
	 * version check. Nothing here is secret and none of it needs a second
	 * service — it exists to make "why was that slow" answerable from the app.
	 */
	let filters = $state({ limit: 120 });
	let selected = $state<string | null>(null);
	let checked = $state<boolean | null>(null);

	/**
	 * `updated.check()` asks the server for its version right now, rather than
	 * waiting for the next poll, and resolves with whether it changed.
	 */
	async function check() {
		checked = await updated.check();
	}
</script>

<svelte:head>
	<title>Diagnostics — Ostinato</title>
</svelte:head>

<div class="page diagnostics">
	<Section eyebrow="Diagnostics" title="Under the hood">
		<svelte:boundary>
			{const runtime = $derived(await getRuntime())}
			<dl class="facts">
				<div>
					<dt>Build</dt>
					<dd class="mono">{version}</dd>
				</div>
				<div>
					<dt>Adapter</dt>
					<dd class="mono">
						{adapter} · {entries.join(' / ')} · {precompress ? 'precompressed' : 'uncompressed'}
					</dd>
				</div>
				<div>
					<dt>Answered by</dt>
					<dd class="mono">
						{runtime.platform?.adapter ?? '—'} · {runtime.platform?.entry ?? '—'}
					</dd>
				</div>
				<div>
					<dt>Process started</dt>
					<dd class="mono">
						{runtime.platform ? new Date(runtime.platform.startedAt).toISOString() : '—'}
					</dd>
				</div>
				<div>
					<dt>This call</dt>
					<dd class="mono">
						remote: {runtime.isRemoteRequest} · sub-request: {runtime.isSubRequest}
					</dd>
				</div>
				<div>
					<dt>Database</dt>
					<dd class="mono">
						{runtime.patterns} patterns · {runtime.artists} artists · {runtime.rooms} rooms
					</dd>
				</div>
				<div>
					<dt>Live streams open</dt>
					<dd class="mono">{runtime.connections}</dd>
				</div>
				<div>
					<dt>New version?</dt>
					<dd class="cluster">
						<span class="mono"
							>{updated.current
								? 'yes'
								: checked === null
									? 'not checked'
									: checked
										? 'yes'
										: 'no'}</span
						>
						<button type="button" class="btn btn--sm" onclick={check}>Check now</button>
					</dd>
				</div>
			</dl>
			{#snippet pending()}
				<p class="hint">Asking the server…</p>
			{/snippet}
		</svelte:boundary>
	</Section>

	<Section eyebrow="Tracing" title="Recent server spans">
		<label class="field limit">
			<span class="field__label">Show the last</span>
			<input class="input" type="number" min="10" max="500" bind:value={filters.limit} />
		</label>

		<svelte:boundary>
			<!-- `$state.snapshot`: a plain copy of the filters object for the remote function, with no proxy in it. -->
			{const spans = $derived(await getSpans($state.snapshot(filters)))}
			<div class="table-wrap">
				<table class="spans">
					<thead>
						<tr><th>When</th><th>Span</th><th>ms</th><th>Trace</th></tr>
					</thead>
					<tbody>
						{#each spans as span (span.spanId)}
							<tr
								class={{
									'spans__row--error': !span.ok,
									'spans__row--selected': span.traceId === selected
								}}
							>
								<td class="mono">{new Date(span.start).toLocaleTimeString()}</td>
								<td>
									{span.name}{span.attributes['sveltekit.remote.call.name']
										? ` · ${span.attributes['sveltekit.remote.call.name']}`
										: ''}{span.attributes['artist.handle']
										? ` · @${span.attributes['artist.handle']}`
										: ''}
								</td>
								<td class="mono">{span.duration}</td>
								<td>
									<button
										type="button"
										class="btn btn--sm btn--ghost mono"
										onclick={() => (selected = span.traceId)}
									>
										{span.traceId.slice(0, 8)}
									</button>
								</td>
							</tr>
						{:else}
							<tr
								><td colspan="4" class="hint"
									>No spans yet — use the app for a moment and come back.</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
			{#snippet pending()}
				<p class="hint">Loading spans…</p>
			{/snippet}
		</svelte:boundary>
	</Section>

	{#if selected}
		<Section eyebrow="Trace {selected.slice(0, 8)}" title="One request, as a waterfall" level={3}>
			<svelte:boundary>
				{const spans = $derived(await getTrace(selected))}
				{const start = $derived(Math.min(...spans.map((s) => s.start)))}
				{const total = $derived(Math.max(1, ...spans.map((s) => s.start + s.duration - start)))}
				<ol class="waterfall">
					{#each spans as span (span.spanId)}
						{const left = ((span.start - start) / total) * 100}
						{const width = Math.max(0.5, (span.duration / total) * 100)}
						<li class="waterfall__row">
							<span class="waterfall__name">{span.name}</span>
							<span class="waterfall__track">
								<span
									class={['waterfall__bar', { 'waterfall__bar--error': !span.ok }]}
									style:left="{left}%"
									style:width="{width}%"
								></span>
							</span>
							<span class="mono waterfall__ms">{span.duration}ms</span>
						</li>
					{/each}
				</ol>
				{#snippet pending()}
					<p class="hint">Loading the trace…</p>
				{/snippet}
			</svelte:boundary>
		</Section>
	{/if}
</div>

<style>
	.diagnostics {
		padding-block-end: var(--space-8);
	}

	.facts {
		display: grid;
		gap: var(--space-3);
	}

	.facts div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	dt {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.limit {
		max-width: 12rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.spans {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}

	.spans th,
	.spans td {
		padding: var(--space-2);
		text-align: left;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	.spans__row--error td {
		color: var(--danger);
	}

	.spans__row--selected td {
		background: var(--accent-soft);
	}

	.waterfall {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.waterfall__row {
		display: grid;
		grid-template-columns: 10rem 1fr 4rem;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-xs);
	}

	.waterfall__name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.waterfall__track {
		position: relative;
		height: 10px;
		background: var(--surface-active);
		border-radius: var(--radius-pill);
	}

	.waterfall__bar {
		position: absolute;
		top: 0;
		height: 100%;
		border-radius: var(--radius-pill);
		background: var(--accent);
	}

	.waterfall__bar--error {
		background: var(--danger);
	}

	.waterfall__ms {
		text-align: right;
	}

	@media (min-width: 40rem) {
		.facts {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
