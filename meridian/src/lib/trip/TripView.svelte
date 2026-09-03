<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { GearSixIcon } from 'phosphor-svelte';
	import { formatDistance } from '@meridian/waypoint/geo';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import { formatRange } from '#lib/domain/dates.ts';
	import { canEdit, isOwner, type ViewerRole } from '#lib/domain/roles.ts';
	import { fireAndForget } from '#lib/remote/fire-and-forget.ts';
	import { heartbeat, leave, watchTrip } from '#lib/remote/live.remote.ts';
	import { updateStop } from '#lib/remote/stops.remote.ts';
	import type { TripDocument } from '#lib/server/trips.ts';
	import MapView from '#lib/map/MapView.svelte';
	import Itinerary from './Itinerary.svelte';
	import Presence from './Presence.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import Companions from './Companions.svelte';
	import Expenses from './Expenses.svelte';
	import Notes from './Notes.svelte';
	import StopDialog, { type Mode } from './StopDialog.svelte';
	import { TABS, TripState, type Tab } from './state.svelte.ts';

	interface Props {
		initial: { document: TripDocument; role: ViewerRole; viewerId: string | null };
		slug: string;
	}

	let { initial, slug }: Props = $props();

	/*
	 * THE LIVE QUERY
	 * --------------
	 * `watchTrip(slug)` is a `query.live`: `.current` is the latest snapshot the
	 * server sent, `.connected` says whether the stream is up. `TripState` reads
	 * `live.current` through a getter, so everything derived from the document
	 * follows the stream, and falls back to the first paint's document until
	 * the stream delivers.
	 */
	/*
	 * The props are read once, on purpose: the page keys this component on
	 * the slug, so a different trip is a different instance. `untrack` says
	 * so, and keeps the compiler from asking whether that was meant.
	 */
	const live = untrack(() => watchTrip(slug));
	const view = untrack(() => new TripState(initial.document, () => live.current));

	const editable = untrack(() => canEdit(initial.role));
	const owner = untrack(() => isOwner(initial.role));
	const member = untrack(() => initial.viewerId !== null && initial.role !== 'link');
	const locale = getLocale();

	const tab: Tab = $derived.by(() => {
		const wanted = page.url.searchParams.get('tab');
		return (TABS as readonly string[]).includes(wanted ?? '') ? (wanted as Tab) : 'itinerary';
	});

	const tabLabels: Record<Tab, () => string> = {
		itinerary: m.tab_itinerary,
		map: m.tab_map,
		globe: m.tab_globe,
		expenses: m.tab_expenses,
		notes: m.tab_notes,
		companions: m.tab_companions
	};

	/*
	 * PRESENCE
	 * --------
	 * Two effects, on purpose. The first owns the heartbeat and the goodbye
	 * and depends on nothing that changes, so it runs once. The second sends
	 * a beat whenever the selected stop changes, so companions see the chip
	 * move — and does not tear the interval down to do it.
	 *
	 * Neither reads `view.trip`. The first version did, and it was a loop:
	 * a heartbeat wakes the room, the live query yields a new snapshot,
	 * `view.trip` is a new object, the effect re-runs, its cleanup says
	 * goodbye, the goodbye wakes the room… The id is a string that never
	 * changes for the life of this component, so it is read once, here.
	 *
	 * And the command itself is called inside `untrack`. A remote command
	 * keeps a little reactive state of its own — how many calls are in
	 * flight — and reads it as it starts. Read inside an effect, that state
	 * becomes a dependency of the effect, and the write that follows re-runs
	 * it: a synchronous loop that Svelte stops with
	 * `effect_update_depth_exceeded`. `untrack` says: run this, depend on
	 * nothing it touches.
	 */
	const tripId = untrack(() => initial.document.trip.id);

	$effect(() => {
		if (!member) return;
		const beat = () =>
			fireAndForget(
				heartbeat({ tripId, stopId: untrack(() => view.selectedStopId) }),
				'presence heartbeat'
			);
		untrack(beat);
		const timer = setInterval(beat, 15_000);
		return () => {
			clearInterval(timer);
			fireAndForget(leave({ tripId }), 'presence goodbye');
		};
	});

	$effect(() => {
		if (!member) return;
		const stopId = view.selectedStopId;
		untrack(() => fireAndForget(heartbeat({ tripId, stopId }), 'presence heartbeat'));
	});

	/** The stop dialog: closed, adding at a day (and maybe a point), or editing a stop. */
	let dialog: Mode | null = $state(null);

	async function moveTo(id: string, point: { lng: number; lat: number }) {
		try {
			await updateStop({ id, lng: point.lng, lat: point.lat });
			toast(m.stop_moved());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}
</script>

<svelte:head>
	<title>{view.trip.name} — {m.app_name()}</title>
</svelte:head>

<article class="trip container">
	<header class="trip__header">
		<div class="stack stack--sm">
			<h1 class="trip__name">{view.trip.name}</h1>
			<p class="cluster muted">
				<span>{formatRange(view.trip.startDate, view.trip.endDate, locale)}</span>
				{#if view.total > 0}
					<span>·</span>
					<span>{m.route_total({ distance: formatDistance(view.total, locale) })}</span>
				{/if}
			</p>
			{#if view.trip.description}
				<p class="trip__lede">{view.trip.description}</p>
			{/if}
		</div>

		<div class="trip__status cluster">
			<Presence {view} viewerId={initial.viewerId} />
			<CommandPalette {view} {editable} onadd={() => (dialog = { kind: 'add', date: null })} />
			{#if live.connected}
				<span class="chip chip--sea live" title={m.live_connected()}>
					<span class="live__dot" aria-hidden="true"></span>
					{m.live_connected()}
				</span>
			{:else if live.current}
				<button class="btn btn--sm" type="button" onclick={() => live.reconnect()}>
					{m.live_reconnect()}
				</button>
			{/if}
			{#if owner}
				<a
					class="btn btn--sm btn--ghost"
					href={localizeHref(resolve('/(site)/t/[slug=slug]/settings', { slug }))}
				>
					<GearSixIcon size={16} aria-hidden="true" />
					{m.trip_settings()}
				</a>
			{/if}
		</div>
	</header>

	<nav class="tabs no-print" aria-label={m.app_name()}>
		{#each TABS as name (name)}
			<a
				class="tabs__link"
				href="?tab={name}"
				aria-current={tab === name ? 'page' : undefined}
				data-sveltekit-noscroll
			>
				{tabLabels[name]()}
			</a>
		{/each}
	</nav>

	{#if tab === 'itinerary'}
		<div class="split">
			<Itinerary
				{view}
				{editable}
				viewerId={initial.viewerId}
				onadd={(date) => (dialog = { kind: 'add', date })}
				onedit={(stop) => (dialog = { kind: 'edit', stop })}
			/>
			<div class="split__map">
				<MapView
					stops={view.scheduled}
					selected={view.selectedStopId}
					{editable}
					onselect={(id) => view.select(id)}
					onadd={(point) => (dialog = { kind: 'add', date: null, point })}
					onmove={moveTo}
				/>
			</div>
		</div>
	{:else if tab === 'map'}
		<div class="full-map">
			<MapView
				stops={view.scheduled}
				selected={view.selectedStopId}
				{editable}
				onselect={(id) => view.select(id)}
				onadd={(point) => (dialog = { kind: 'add', date: null, point })}
				onmove={moveTo}
			/>
		</div>
	{:else if tab === 'globe'}
		<!--
			THE GLOBE, WHEN ASKED FOR
			-------------------------
			three.js and Threlte are the largest dependency in the project, and
			most visits never open this tab. `import()` in markup loads them on
			demand; the boundary shows the pending snippet until the chunk is
			here, and the failed snippet if the network is not. `browser`
			guards it because a WebGL scene has no server-rendered form.
		-->
		<div class="full-map">
			{#if browser}
				<svelte:boundary>
					{#snippet pending()}
						<p class="muted">{m.globe_loading()}</p>
					{/snippet}
					{#snippet failed(error, reset)}
						<p class="issue">
							{error instanceof Error ? error.message : m.error_title()}
							<button class="btn btn--sm" type="button" onclick={reset}>{m.live_reconnect()}</button
							>
						</p>
					{/snippet}
					{const { default: Globe } = await import('#lib/globe/Globe.svelte')}
					<Globe
						stops={view.scheduled}
						selected={view.selectedStopId}
						onselect={(id) => view.select(id)}
					/>
				</svelte:boundary>
			{:else}
				<p class="muted">{m.globe_loading()}</p>
			{/if}
		</div>
	{:else if tab === 'expenses'}
		<Expenses {view} {editable} viewerId={initial.viewerId} />
	{:else if tab === 'notes'}
		<Notes {view} {editable} />
	{:else if tab === 'companions'}
		<Companions {view} role={initial.role} viewerId={initial.viewerId} />
	{/if}
</article>

{#if editable}
	<StopDialog
		mode={dialog}
		tripId={view.trip.id}
		days={view.days}
		onclose={() => (dialog = null)}
		onsaved={(stop) => view.select(stop.id)}
	/>
{/if}

<style>
	/*
	 * `minmax(0, 1fr)`, not the implicit `auto` column. A grid track sized
	 * `auto` refuses to be narrower than its content, and a grid item in it
	 * refuses to be narrower than *its* content — so the expenses table, seven
	 * columns wide, would push the whole page out past a phone's screen even
	 * though its own wrapper scrolls. With a zero minimum the column is the
	 * container's width, the item is the column's width, and the table
	 * scrolls inside its wrapper as intended. The desktop `.split` below
	 * needs the same, for the same reason.
	 */
	.trip {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		padding-block: var(--space-5) var(--space-8);
	}

	.trip__header {
		display: grid;
		gap: var(--space-4);
	}

	.trip__name {
		font-size: var(--text-2xl);
		view-transition-name: trip-title;
	}

	.trip__lede {
		color: var(--ink-2);
		max-width: var(--measure);
	}

	.live {
		gap: var(--space-2);
	}

	.live__dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.live__dot {
			animation: none;
		}
	}

	.tabs {
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
		border-bottom: 1px solid var(--line);
		scrollbar-width: none;
	}

	.tabs__link {
		flex: 0 0 auto;
		padding: var(--space-2) var(--space-3);
		text-decoration: none;
		color: var(--ink-2);
		font-weight: 500;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.tabs__link[aria-current='page'] {
		color: var(--sea);
		border-bottom-color: var(--sea);
	}

	.split {
		display: grid;
		gap: var(--space-5);
	}

	.split__map {
		height: 22rem;
	}

	.full-map {
		height: min(70dvh, 44rem);
	}

	@media (min-width: 64em) {
		.trip__header {
			grid-template-columns: 1fr auto;
			align-items: start;
		}

		.split {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
		}

		.split__map {
			position: sticky;
			top: calc(var(--header-h) + var(--space-4));
			height: calc(100dvh - var(--header-h) - var(--space-8));
		}
	}
</style>
