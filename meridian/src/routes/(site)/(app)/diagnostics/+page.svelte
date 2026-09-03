<script lang="ts">
	import { ArrowsClockwiseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { diagnostics } from '#lib/remote/diagnostics.remote.ts';

	/*
	 * DIAGNOSTICS
	 * ===========
	 *
	 * The tracing SvelteKit emits (`tracing: { server: true }` in the config)
	 * goes through `src/instrumentation.server.ts` into a ring buffer, and
	 * this page reads it back. Every remote function call, every `load`,
	 * every `handle` is a span with a name and a duration — which is how you
	 * find out that the trip page spends its time in one query, before a
	 * person tells you it feels slow.
	 */
	const locale = getLocale();
	const clock = new Intl.DateTimeFormat(locale, { timeStyle: 'medium' });
	const millis = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
	const hours = new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'long' });
	const minutes = new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: 'minute',
		unitDisplay: 'long'
	});

	function uptime(from: number, to: number): string {
		const total = Math.max(0, Math.round((to - from) / 60_000));
		const h = Math.floor(total / 60);
		const min = total % 60;
		return h > 0 ? `${hours.format(h)} ${minutes.format(min)}` : minutes.format(min);
	}
</script>

<svelte:head>
	<title>{m.diagnostics_title()} — {m.app_name()}</title>
</svelte:head>

<section class="container diagnostics stack stack--lg">
	<header class="cluster cluster--between">
		<div class="stack stack--sm">
			<h1>{m.diagnostics_title()}</h1>
			<p class="lede">{m.diagnostics_lede()}</p>
		</div>
		<button class="btn btn--sm" type="button" onclick={() => diagnostics().refresh()}>
			<ArrowsClockwiseIcon size={16} aria-hidden="true" />
			{m.diagnostics_refresh()}
		</button>
	</header>

	<svelte:boundary>
		{#snippet failed(error)}
			<p class="issue">{error instanceof Error ? error.message : m.error_title()}</p>
		{/snippet}

		{const report = await diagnostics()}

		<dl class="facts card card--pad">
			<div>
				<dt class="label">{m.diagnostics_version()}</dt>
				<dd><code>{report.version}</code></dd>
			</div>
			<div>
				<dt class="label">{m.diagnostics_node()}</dt>
				<dd><code>{report.node}</code></dd>
			</div>
			<div>
				<dt class="label">{m.diagnostics_uptime()}</dt>
				<dd>{uptime(report.startedAt, report.now)}</dd>
			</div>
		</dl>

		<section class="stack stack--sm">
			<h2>{m.diagnostics_rooms()}</h2>
			{#if report.rooms.length === 0}
				<p class="muted">{m.diagnostics_no_rooms()}</p>
			{:else}
				<ul class="cluster" role="list">
					{#each report.rooms as room (room.tripId)}
						<li class="chip chip--sea">
							<code>{room.tripId.slice(0, 8)}</code>
							{m.diagnostics_watchers({ count: room.watchers })}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="stack stack--sm">
			<h2>{m.diagnostics_spans()}</h2>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr>
							<th>{m.diagnostics_name()}</th>
							<th class="num">{m.diagnostics_duration()}</th>
							<th>{m.diagnostics_status()}</th>
							<th>{m.diagnostics_trace()}</th>
						</tr>
					</thead>
					<tbody>
						{#each report.spans as span (span.spanId)}
							<tr class:span--child={span.parentId !== null}>
								<td>
									<span class="span__name">{span.name}</span>
									<span class="muted">{clock.format(span.start)}</span>
								</td>
								<td class="num tabular">{millis.format(span.duration)} ms</td>
								<td>
									<span class="chip" class:chip--coral={!span.ok}>{span.ok ? 'ok' : 'error'}</span>
								</td>
								<td><code class="muted">{span.traceId.slice(0, 8)}</code></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</svelte:boundary>
</section>

<style>
	.diagnostics {
		padding-block: var(--space-6) var(--space-8);
	}

	.lede {
		color: var(--ink-2);
		max-width: var(--measure);
	}

	.facts {
		display: grid;
		gap: var(--space-3);
	}

	.facts dd {
		margin: 0;
	}

	.span--child .span__name {
		padding-inline-start: var(--space-4);
		color: var(--ink-2);
	}

	.span__name {
		display: block;
	}

	@media (min-width: 40em) {
		.facts {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
