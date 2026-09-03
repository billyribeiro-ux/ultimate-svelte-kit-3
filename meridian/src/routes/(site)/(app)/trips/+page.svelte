<script lang="ts">
	import { resolve } from '$app/paths';
	import { PlusIcon } from 'phosphor-svelte';
	import { formatDistance } from '@meridian/waypoint/geo';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import { dayCount, formatRange } from '#lib/domain/dates.ts';
	import type { Role } from '#lib/domain/schemas.ts';
	import { tripPreview } from '#lib/remote/geo.remote.ts';
	import { myTrips } from '#lib/remote/trips.remote.ts';
	import RouteThumb from '#lib/ui/RouteThumb.svelte';

	const locale = getLocale();

	const roleLabel: Record<Role, () => string> = {
		owner: m.role_owner,
		editor: m.role_editor,
		viewer: m.role_viewer
	};
</script>

<svelte:head>
	<title>{m.trips_title()} — {m.app_name()}</title>
</svelte:head>

<section class="container stack stack--lg trips">
	<header class="cluster cluster--between">
		<h1>{m.trips_title()}</h1>
		<a class="btn btn--primary" href={localizeHref('/trips/new')}>
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
	-->
	<svelte:boundary>
		{#snippet failed(error, reset)}
			<p class="issue">{error instanceof Error ? error.message : String(error)}</p>
			<button class="btn" onclick={reset}>{m.live_reconnect()}</button>
		{/snippet}

		{const trips = await myTrips()}

		{#if trips.length === 0}
			<p class="card card--pad muted">{m.trips_empty()}</p>
		{:else}
			<ul class="grid" role="list" style:--grid-min="18rem">
				{#each trips as { trip, role, members, stops } (trip.id)}
					{const preview = await tripPreview(trip.id)}
					<li class="card trip">
						<a
							class="trip__link"
							href={localizeHref(resolve('/(site)/t/[slug=slug]', { slug: trip.slug }))}
						>
							<RouteThumb points={preview.points} label={trip.name} />
							<h2 class="trip__name">{trip.name}</h2>
						</a>
						<p class="muted">{formatRange(trip.startDate, trip.endDate, locale)}</p>
						<p class="cluster muted trip__facts">
							<span>{m.trips_days({ count: dayCount(trip.startDate, trip.endDate) })}</span>
							<span>·</span>
							<span>{m.trips_stops({ count: stops })}</span>
							<span>·</span>
							<span>{m.trips_companions({ count: members })}</span>
							{#if preview.total > 0}
								<span>·</span>
								<span>{formatDistance(preview.total, locale)}</span>
							{/if}
						</p>
						<span class="chip" class:chip--sea={role === 'owner'}>{roleLabel[role]()}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</svelte:boundary>
</section>

<style>
	.trips {
		padding-block: var(--space-6) var(--space-8);
	}

	.trip {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
	}

	.trip__link {
		display: grid;
		gap: var(--space-3);
		text-decoration: none;
	}

	.trip__name {
		font-size: var(--text-lg);
	}

	.trip__facts {
		font-size: var(--text-sm);
	}
</style>
