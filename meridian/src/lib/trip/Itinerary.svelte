<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dndzone, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { toast } from 'svelte-sonner';
	import { PlusIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/domain/dates.ts';
	import type { DayGroup } from '#lib/domain/itinerary.ts';
	import { moveStop, removeStop } from '#lib/remote/stops.remote.ts';
	import type { Stop } from '#lib/server/db/schema.ts';
	import StopCard from './StopCard.svelte';
	import type { TripState } from './state.svelte.ts';

	/**
	 * DAYS YOU CAN DRAG
	 * =================
	 *
	 * One `dndzone` per day (and one for the ideas), all of the same `type`,
	 * so a card can be dragged from Tuesday to Thursday or parked in Ideas.
	 * `svelte-dnd-action` handles pointer, touch and keyboard — focus a card,
	 * press space, use the arrows — and tells us two things: `consider`
	 * (the list as it would look if you dropped here) and `finalize` (you
	 * dropped here).
	 *
	 * The server is the source of truth, and the live query will send the
	 * new order a few hundred milliseconds after the drop. In between, the
	 * screen shows what the drag said. That is the `override`: a copy of the
	 * groups that wins until the server's version moves past the one we
	 * dropped on. Derived, not synced — `groups` picks whichever is right
	 * *now*, and there is no effect that could get out of step.
	 */
	interface Props {
		/** Named `view`, not `state`: a local called `state` makes `$state` read as a store subscription. */
		view: TripState;
		editable: boolean;
		viewerId: string | null;
		onadd?: (date: string | null) => void;
		onedit?: (stop: Stop) => void;
	}

	let { view, editable, viewerId, onadd, onedit }: Props = $props();

	const locale = getLocale();

	interface Override {
		readonly version: number;
		readonly groups: DayGroup<Stop>[];
	}

	let override = $state<Override | null>(null);

	const groups = $derived(
		override && view.trip.version <= override.version ? override.groups : view.groups
	);

	/** The route number of a scheduled stop, so the list agrees with the map's pins. */
	const numbers = $derived(new Map(view.scheduled.map((stop, i) => [stop.id, i + 1])));

	/** Who is looking at which stop, by stop id. */
	const lookers = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built whole inside the derivation and never mutated after; a reactive Map would signal on every insert for nobody
		const out = new Map<string, string[]>();
		for (const person of view.presence) {
			if (!person.stopId || person.userId === viewerId) continue;
			out.set(person.stopId, [...(out.get(person.stopId) ?? []), person.name]);
		}
		return out;
	});

	function withZone(date: string | null, items: Stop[]): DayGroup<Stop>[] {
		return groups.map((group) => (group.date === date ? { date, stops: items } : group));
	}

	// `svelte-dnd-action` types items as `Record<string, any>`; ours are stops.
	const itemsOf = (event: CustomEvent<DndEvent>) => event.detail.items as Stop[];

	function consider(date: string | null, event: CustomEvent<DndEvent>) {
		override = { version: Number.MAX_SAFE_INTEGER, groups: withZone(date, itemsOf(event)) };
	}

	async function finalize(date: string | null, event: CustomEvent<DndEvent>) {
		const items = itemsOf(event);
		const dropped = view.trip.version;
		override = { version: dropped, groups: withZone(date, items) };

		// Both the zone that lost the card and the one that gained it fire
		// `finalize`; only the one that received it sends the move.
		if (event.detail.info.trigger !== TRIGGERS.DROPPED_INTO_ZONE) return;
		const index = items.findIndex((stop) => stop.id === event.detail.info.id);
		if (index < 0) return;

		try {
			await moveStop({ tripId: view.trip.id, id: event.detail.info.id, date, index });
		} catch (error) {
			override = null;
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function remove(stop: Stop) {
		try {
			await removeStop({ tripId: view.trip.id, id: stop.id });
			toast(m.stop_removed());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}
</script>

<div class="days">
	{#each groups as group (group.date ?? 'ideas')}
		<section class="day" data-date={group.date ?? 'ideas'}>
			<header class="day__header">
				<h3 class="day__title">
					{group.date ? formatDate(group.date, locale, 'day') : m.day_ideas()}
				</h3>
				{#if group.date}
					<span class="muted">{formatDate(group.date, locale, 'short')}</span>
				{/if}
				{#if editable}
					<button
						class="btn btn--sm btn--ghost day__add"
						type="button"
						onclick={() => onadd?.(group.date)}
					>
						<PlusIcon size={14} aria-hidden="true" />
						{m.day_add_stop()}
					</button>
				{/if}
			</header>

			<ul
				class="day__list"
				role="list"
				use:dndzone={{
					items: group.stops,
					type: 'stops',
					flipDurationMs: 200,
					dragDisabled: !editable,
					dropTargetStyle: {},
					dropTargetClasses: ['day__list--target']
				}}
				onconsider={(e) => consider(group.date, e)}
				onfinalize={(e) => finalize(group.date, e)}
			>
				{#each group.stops as stop (stop.id)}
					<li class="day__item" animate:flip={{ duration: 200 }}>
						<StopCard
							{stop}
							number={numbers.get(stop.id) ?? null}
							selected={view.selectedStopId === stop.id}
							{editable}
							lookers={lookers.get(stop.id) ?? []}
							onselect={() => view.select(view.selectedStopId === stop.id ? null : stop.id)}
							onedit={() => onedit?.(stop)}
							onremove={() => remove(stop)}
						/>
					</li>
				{/each}
				{#if group.stops.length === 0}
					<li class="day__empty muted">{m.day_empty()}</li>
				{/if}
			</ul>
		</section>
	{/each}
	{#if editable}
		<p class="hint">{m.stop_drag_hint()}</p>
	{/if}
</div>

<style>
	.days {
		display: grid;
		gap: var(--space-5);
	}

	.day__header {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-block-end: var(--space-2);
	}

	.day__title {
		font-size: var(--text-md);
		font-family: var(--font-body);
		font-weight: 600;
	}

	.day__add {
		margin-inline-start: auto;
	}

	.day__list {
		display: grid;
		gap: var(--space-2);
		min-height: 3rem;
		padding: var(--space-1);
		border-radius: var(--radius);
		transition: background-color var(--dur-fast) var(--ease-out);
	}

	:global(.day__list--target) {
		background: var(--sea-soft);
	}

	.day__empty {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
	}
</style>
