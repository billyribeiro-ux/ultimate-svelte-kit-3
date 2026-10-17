<script lang="ts">
	import { MapTrifoldIcon, PlusIcon } from 'phosphor-svelte';
	import { formatDistance } from '@meridian/waypoint/geo';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { dayCount, formatRange } from '#lib/domain/dates.ts';
	import type { Role } from '#lib/domain/schemas.ts';
	import { tripPreview } from '#lib/remote/geo.remote.ts';
	import { myTrips } from '#lib/remote/trips.remote.ts';
	import { boundaryMessage } from '#lib/ui/errors.ts';
	import Empty from '#lib/ui/Empty.svelte';
	import RouteThumb from '#lib/ui/RouteThumb.svelte';

	const locale = getLocale();

	const roleLabel: Record<Role, () => string> = {
		owner: m.role_owner,
		editor: m.role_editor,
		viewer: m.role_viewer
	};

	/*
	 * THE CARD BECOMES THE HEADER
	 * ---------------------------
	 * A `view-transition-name` must be unique on the page, so it cannot sit
	 * on every card's title at once. It is given to the one card the person
	 * is about to open — on pointer down, or on Enter when the link has
	 * focus — and the trip page's `<h1>` carries the same name, so the
	 * browser morphs this title into that one during the navigation.
	 */
	let leaving: string | null = $state(null);
</script>

<svelte:head>
	<title>{m.trips_title()} — {m.app_name()}</title>
</svelte:head>

<section class="container stack stack--lg trips">
	<header class="trips__header">
		<h1 class="title-page">{m.trips_title()}</h1>
		<a class="btn btn--primary" href={href('/(site)/(app)/trips/new')}>
			<PlusIcon size={16} aria-hidden="true" />
			{m.nav_new_trip()}
		</a>
	</header>

	<!--
		`await` in markup. On the server every promise inside the boundary is
		awaited before the HTML is sent, so the first paint is the list — which
		is why the boundary has a `failed` snippet and no `pending` one: a
		`pending` snippet is what the server would render *instead*.

		Every card also awaits `tripPreview(trip.id)`. Those calls are made in
		the same tick, and `query.batch` sends them as ONE request — a list of
		twenty trips is two round trips (the list, the previews), not twenty-one.

		`failed` is handed an `App.Error` — what `handleError` made of the
		failure, `{ status, message }`, and not an `Error` — so the server's
		sentence is on `message`; `boundaryMessage` reads it without a cast
		(`#lib/ui/errors.ts` says why there is no annotation). Both
		declarations are `$derived`, so a refreshed query redraws the list; a
		bare `{const}` would keep the first.
	-->
	<svelte:boundary>
		{#snippet failed(error, reset)}
			<p class="issue">{boundaryMessage(error)}</p>
			<button class="btn" onclick={reset}>{m.live_reconnect()}</button>
		{/snippet}

		{const trips = $derived(await myTrips())}

		{#if trips.length === 0}
			<Empty icon={MapTrifoldIcon} title={m.trips_empty_title()} body={m.trips_empty()}>
				{#snippet action()}
					<a class="btn btn--primary" href={href('/(site)/(app)/trips/new')}>
						<PlusIcon size={16} aria-hidden="true" />
						{m.nav_new_trip()}
					</a>
				{/snippet}
			</Empty>
		{:else}
			<ul class="grid" role="list" style:--grid-min="18rem">
				{#each trips as { trip, role, members, stops } (trip.id)}
					{const preview = $derived(await tripPreview(trip.id))}
					<li class="card card--link trip">
						<div class="trip__thumb">
							<RouteThumb points={preview.points} label={trip.name} />
							<span class={['chip trip__role', { 'chip--sea': role === 'owner' }]}>
								{roleLabel[role]()}
							</span>
						</div>
						<!--
							One link per card, named by the trip. The `::after` on it covers
							the whole card, so the card is the click target while the
							accessible name stays the name — no "click here", no nested links.
						-->
						<a
							class="trip__link"
							href={href('/(site)/t/[slug=slug]', { slug: trip.slug })}
							onpointerdown={() => (leaving = trip.id)}
							onkeydown={(event) => {
								if (event.key === 'Enter') leaving = trip.id;
							}}
						>
							<h2
								class="trip__name"
								style:view-transition-name={leaving === trip.id ? 'trip-title' : undefined}
							>
								{trip.name}
							</h2>
						</a>
						<p class="trip__dates">{formatRange(trip.startDate, trip.endDate, locale)}</p>
						<p class="trip__facts dotted tabular">
							<span>{m.trips_days({ count: dayCount(trip.startDate, trip.endDate) })}</span>
							<span>{m.trips_stops({ count: stops })}</span>
							<span>{m.trips_companions({ count: members })}</span>
							{#if preview.total > 0}
								<span>{formatDistance(preview.total, locale)}</span>
							{/if}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</svelte:boundary>
</section>

<style>
	.trips {
		padding-block: var(--space-6) var(--section);
	}

	.trips__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.trip {
		position: relative;
		display: grid;
		gap: var(--space-1);
		padding: var(--space-3);
	}

	.trip__thumb {
		position: relative;
		margin-block-end: var(--space-2);
	}

	/* The role sits on the thumbnail as a translucent tier-3 chip; it is a fact about the card, not a row of it. */
	.trip__role {
		position: absolute;
		inset: var(--space-2) var(--space-2) auto auto;
		background: color-mix(in oklab, var(--paper-4) 90%, transparent);
		backdrop-filter: blur(6px);
		box-shadow: var(--shadow-1);
	}

	/* At least a compact control tall, though its pseudo-element makes the whole card the target. */
	.trip__link {
		display: flex;
		align-items: center;
		min-height: var(--control-sm);
		text-decoration: none;
		color: inherit;
	}

	.trip__link::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	/* The ring goes on the card the link covers, so the link wears neither the ring nor the reset's halo. */
	.trip__link:focus-visible {
		outline: none;
		box-shadow: none;
	}

	.trip:has(.trip__link:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.trip__name {
		font-size: var(--text-xl);
	}

	.trip__dates {
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	/* `.dotted` (utilities.css) wraps the facts without leaving a separator at either end of a line. */
	.trip__facts {
		color: var(--ink-3);
		font-size: var(--text-xs);
	}
</style>
