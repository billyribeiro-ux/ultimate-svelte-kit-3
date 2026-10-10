<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate, formatRange } from '#lib/domain/dates.ts';
	import { tripBySlug } from '#lib/remote/trips.remote.ts';
	import RouteThumb from '#lib/ui/RouteThumb.svelte';

	const slug = $derived(page.params.slug ?? '');
	const locale = getLocale();
</script>

{const { document } = $derived(await tripBySlug(slug))}

<!--
	Only a trip visible by link may be framed. `tripBySlug` already refuses a
	private trip to a stranger; this refuses it to a *member* too, because
	the frame is on somebody else's page and their visitors are strangers.
-->
{#if document.trip.visibility !== 'link'}
	{error(404, 'No such trip.')}
{/if}

{const scheduled = $derived(document.stops.filter((stop) => stop.date !== null))}

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
			<li data-kind={stop.kind}>
				<span>{stop.name}</span>
				{#if stop.date}<span class="muted">{formatDate(stop.date, locale, 'short')}</span>{/if}
			</li>
		{/each}
	</ol>

	<a
		class="embed__powered"
		href={href('/(site)/t/[slug=slug]', { slug })}
		target="_blank"
		rel="noopener"
	>
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

	/*
	 * The numbers are drawn, not the list's own markers: each row is a grid,
	 * and an item that is not `display: list-item` has no marker. A counter
	 * puts the route number in a disc of the stop's kind colour, the way the
	 * itinerary and the map number it. The list's own indent goes as well —
	 * the browser gives an `<ol>` 40px of padding for markers it no longer
	 * draws — so the discs line up with the title and the thumbnail above.
	 */
	.embed__stops {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: stop;
		font-size: var(--text-sm);
	}

	.embed__stops li {
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		counter-increment: stop;
	}

	.embed__stops li::before {
		content: counter(stop);
		display: grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: var(--kind, var(--sea));
		color: var(--on-fill);
		font-size: var(--text-xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	/* Small type, a full-size target: the frame is often on a phone. */
	.embed__powered {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		min-height: var(--control);
		font-size: var(--text-xs);
	}
</style>
