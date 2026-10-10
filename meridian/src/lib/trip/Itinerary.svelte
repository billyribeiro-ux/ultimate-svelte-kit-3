<script lang="ts">
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import { dndzone, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { toast } from 'svelte-sonner';
	import { errorMessage } from '#lib/ui/errors.ts';
	import { LightbulbIcon, PlusIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { fromIso } from '#lib/domain/dates.ts';
	import type { DayGroup } from '#lib/domain/itinerary.ts';
	import { moveStop, removeStop } from '#lib/remote/stops.remote.ts';
	import type { Stop } from '#lib/server/db/schema.ts';
	import { reducedMotion } from '#lib/motion/prefers.svelte.ts';
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
	/*
	 * The rail shows the day of the month and a short weekday; the heading
	 * shows the whole date — "Sunday, May 10", "Sonntag, 10. Mai" — without
	 * the year, which is the same for every day of the trip. On a phone the
	 * heading is the short date — "Sun, May 10" — because the rail already
	 * says the day and the weekday, and the long one wrapped onto two lines
	 * beside the "Add a stop" button. All of them format in UTC, like
	 * `formatDate`, so the calendar date is the one that comes out.
	 */
	const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
	const heading = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	});
	const headingShort = new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});

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

	/*
	 * MOTION, FROM ONE SOURCE OF TRUTH
	 * --------------------------------
	 * `animate:flip` slides the other cards out of the way of a drag, and
	 * the library's own FLIP does the same for the dragged one; both take
	 * their duration from here, and here reads `reducedMotion` — so the
	 * itinerary's JavaScript-driven motion honours the operating system
	 * setting that the CSS `--dur-*` tokens cannot reach.
	 *
	 * No `in:`/`out:` transitions on the items: svelte-dnd-action says
	 * plainly that it does not play well with them. A card that has just
	 * arrived is marked instead — the effect below compares the stop ids
	 * with the last render's and puts a new one in `fresh` for 1.2 seconds,
	 * and the stop card turns that into a highlight that fades over 700ms.
	 * The first render marks nothing: forty stops do not all light up.
	 */
	const duration = $derived(reducedMotion.current ? 0 : 240);

	const fresh = new SvelteSet<string>();
	let known: ReadonlySet<string> | null = null;

	$effect(() => {
		// A snapshot to compare against, never read reactively — so a plain Set, not a SvelteSet.
		const ids = new Set(groups.flatMap((group) => group.stops.map((stop) => stop.id)));
		untrack(() => {
			if (known && !reducedMotion.current) {
				for (const id of ids) {
					if (known.has(id)) continue;
					fresh.add(id);
					setTimeout(() => fresh.delete(id), 1200);
				}
			}
			known = ids;
		});
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
			toast.error(errorMessage(error));
		}
	}

	async function remove(stop: Stop) {
		try {
			await removeStop({ tripId: view.trip.id, id: stop.id });
			toast.success(m.stop_removed());
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	/* The dragged card: lifted, tilted a degree, a little larger. Applied by the library to its own clone. */
	function lift(element?: HTMLElement) {
		if (!element) return;
		element.style.boxShadow = 'var(--shadow-3)';
		element.style.rotate = '1deg';
		element.style.scale = '1.02';
		element.style.borderRadius = 'var(--radius)';
	}
</script>

<!-- The panel's heading, for the outline: the page's h1, this h2, and a day's h3 under it. -->
<h2 class="visually-hidden">{m.tab_itinerary()}</h2>

<div class="days">
	{#each groups as group (group.date ?? 'ideas')}
		<!--
			Each day is a rail and a column. The rail carries the day of the month
			in the display face with a hairline running down to the next day — the
			route as a line down the page — and the Ideas section carries a bulb
			instead of a number.
		-->
		<section class="day" data-date={group.date ?? 'ideas'}>
			<div class="day__rail" aria-hidden="true">
				{#if group.date}
					<span class="day__number tabular">{fromIso(group.date).day}</span>
					<span class="day__weekday">{weekday.format(fromIso(group.date).toDate('UTC'))}</span>
				{:else}
					<span class="day__bulb"><LightbulbIcon size={20} /></span>
				{/if}
			</div>

			<header class="day__header">
				<h3 class="day__title">
					{#if group.date}
						{const day = $derived(fromIso(group.date).toDate('UTC'))}
						<span class="day__long">{heading.format(day)}</span>
						<span class="day__short">{headingShort.format(day)}</span>
					{:else}
						{m.day_ideas()}
					{/if}
				</h3>
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
					flipDurationMs: duration,
					dragDisabled: !editable,
					dropTargetStyle: {},
					dropTargetClasses: ['day__list--target'],
					transformDraggedElement: lift
				}}
				onconsider={(e) => consider(group.date, e)}
				onfinalize={(e) => finalize(group.date, e)}
			>
				{#each group.stops as stop (stop.id)}
					<li class="day__item" animate:flip={{ duration }}>
						<StopCard
							{stop}
							number={numbers.get(stop.id) ?? null}
							selected={view.selectedStopId === stop.id}
							fresh={fresh.has(stop.id)}
							{editable}
							lookers={lookers.get(stop.id) ?? []}
							onselect={() => view.select(view.selectedStopId === stop.id ? null : stop.id)}
							onedit={() => onedit?.(stop)}
							onremove={() => remove(stop)}
						/>
					</li>
				{/each}
				{#if group.stops.length === 0}
					<li class="day__empty">{editable ? m.day_empty_editable() : m.day_empty()}</li>
				{/if}
			</ul>
		</section>
	{/each}
</div>

<style>
	.days {
		display: grid;
		gap: var(--space-5);
	}

	/* A 36px rail on a phone, where every pixel of the stop's name counts; 44px from 40em. */
	.day {
		display: grid;
		grid-template-columns: 2.25rem minmax(0, 1fr);
		grid-template-rows: auto auto;
		column-gap: var(--space-3);
		row-gap: var(--space-2);
	}

	/* The rail spans both rows; its hairline runs from under the number to the bottom of the day. */
	.day__rail {
		position: relative;
		grid-row: 1 / 3;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-block-start: var(--space-1);
	}

	.day__rail::after {
		content: '';
		flex: 1;
		width: 1px;
		margin-block-start: var(--space-2);
		background: var(--line);
	}

	.day__number {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		line-height: 1;
		letter-spacing: var(--tracking-xl);
		color: var(--ink);
	}

	.day__weekday {
		margin-block-start: var(--space-0);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}

	.day__bulb {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--paper-3);
		color: var(--ink-3);
	}

	.day__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: var(--control-sm);
	}

	/*
	 * The heading takes the room that is left and wraps inside it; the
	 * button keeps its size and its icon. Without `flex: none` the button was
	 * the thing that gave way, and squeezed its plus sign to a dot.
	 */
	.day__title {
		flex: 1 1 0;
		min-width: 0;
		font-size: var(--text-lg);
	}

	.day__long {
		display: none;
	}

	.day__add {
		flex: none;
	}

	.day__add :global(svg) {
		flex-shrink: 0;
	}

	@media (min-width: 40em) {
		.day {
			grid-template-columns: 2.75rem minmax(0, 1fr);
		}

		.day__long {
			display: inline;
		}

		.day__short {
			display: none;
		}
	}

	.day__list {
		display: grid;
		gap: var(--space-2);
		min-height: 3.5rem;
		padding: var(--space-1);
		margin: calc(-1 * var(--space-1));
		border-radius: var(--radius);
		transition: background-color var(--dur-2) var(--ease-out);
	}

	/* Where the card would land: the soft sea, fading in and out with the drag. */
	:global(.day__list--target) {
		background: var(--sea-soft);
	}

	.day__empty {
		display: flex;
		align-items: center;
		min-height: 3rem;
		padding-inline: var(--space-3);
		color: var(--ink-3);
		font-size: var(--text-sm);
	}
</style>
