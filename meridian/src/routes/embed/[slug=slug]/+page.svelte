<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import { formatDate, formatRange } from '#lib/domain/dates.ts';
	import { tripBySlug } from '#lib/remote/trips.remote.ts';
	import RouteThumb from '#lib/ui/RouteThumb.svelte';

	const slug = $derived(page.params.slug ?? '');
	const locale = getLocale();
</script>

{const { document } = await tripBySlug(slug)}

<!--
	Only a trip visible by link may be framed. `tripBySlug` already refuses a
	private trip to a stranger; this refuses it to a *member* too, because
	the frame is on somebody else's page and their visitors are strangers.
-->
{#if document.trip.visibility !== 'link'}
	{error(404, 'No such trip.')}
{/if}

{const scheduled = document.stops.filter((stop) => stop.date !== null)}

<svelte:head>
	<title>{m.embed_title({ name: document.trip.name })}</title>
</svelte:head>

<article class="embed">
	<header class="stack stack--sm">
		<h1 class="embed__name">{document.trip.name}</h1>
		<p class="muted">{formatRange(document.trip.startDate, document.trip.endDate, locale)}</p>
	</header>

	<RouteThumb
		points={scheduled.map((stop): [number, number] => [stop.lng, stop.lat])}
		width={320}
		height={160}
		label={document.trip.name}
	/>

	<ol class="embed__stops">
		{#each scheduled as stop (stop.id)}
			<li>
				<span>{stop.name}</span>
				{#if stop.date}<span class="muted">{formatDate(stop.date, locale, 'short')}</span>{/if}
			</li>
		{/each}
	</ol>

	<a class="embed__powered" href={localizeHref(`/t/${slug}`)} target="_blank" rel="noopener">
		{m.embed_powered()}
	</a>
</article>

<style>
	.embed {
		display: grid;
		gap: var(--space-3);
		max-width: 22rem;
		padding: var(--space-4);
	}

	.embed__name {
		font-size: var(--text-lg);
	}

	.embed__stops {
		display: grid;
		gap: var(--space-1);
		padding-inline-start: 1.2em;
		font-size: var(--text-sm);
	}

	.embed__stops li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.embed__powered {
		font-size: var(--text-xs);
	}
</style>
