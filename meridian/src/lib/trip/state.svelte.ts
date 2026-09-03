/**
 * THE TRIP ON SCREEN
 * ==================
 *
 * One object every part of the trip page reads from. It holds two kinds of
 * thing and keeps them apart:
 *
 *   - what the SERVER says: the document, arriving first from `tripBySlug`
 *     and then, whenever anything changes, from the live query. `document`
 *     is derived from whichever is newer; nothing here ever mutates it.
 *   - what THIS PERSON is doing: the selected stop, the open tab. Local
 *     `$state`, never sent anywhere.
 *
 * Everything else — the days, the stops grouped by day, the scheduled
 * route and its length — is `$derived` from the two, so a change on the
 * server or a click on the screen re-derives exactly the parts that depend
 * on it.
 */

import { pathLength } from '@meridian/waypoint/geo';
import { eachDay } from '#lib/domain/dates.ts';
import { groupByDay, type DayGroup } from '#lib/domain/itinerary.ts';
import type { LiveTrip } from '#lib/remote/live.remote.ts';
import type { Stop } from '#lib/server/db/schema.ts';
import type { TripDocument } from '#lib/server/trips.ts';

export const TABS = ['itinerary', 'map', 'globe', 'expenses', 'notes', 'companions'] as const;
export type Tab = (typeof TABS)[number];

export class TripState {
	#initial: TripDocument;
	#live: () => LiveTrip | null | undefined;

	selectedStopId: string | null = $state(null);
	tab: Tab = $state('itinerary');

	/*
	 * `$derived.by` with a closure rather than `$derived(expr)`: the private
	 * fields are assigned in the constructor, after field initialisers run,
	 * and TypeScript rightly refuses a direct read of them here. Inside the
	 * closure the read happens later, on first access, when they exist.
	 */
	readonly document: TripDocument = $derived.by(() => this.#live()?.document ?? this.#initial);
	readonly trip = $derived(this.document.trip);
	readonly days: string[] = $derived(eachDay(this.trip.startDate, this.trip.endDate));
	readonly groups: DayGroup<Stop>[] = $derived(groupByDay(this.document.stops, this.days));

	/** The stops that have a day, in the order the days and positions say. */
	readonly scheduled: Stop[] = $derived(
		this.groups.filter((group) => group.date !== null).flatMap((group) => group.stops)
	);
	readonly ideas: Stop[] = $derived(this.groups.find((group) => group.date === null)?.stops ?? []);

	/** metres along the scheduled stops */
	readonly total: number = $derived(pathLength(this.scheduled));

	readonly presence = $derived.by(() => this.#live()?.presence ?? []);
	readonly updatedAt: number | null = $derived.by(() => this.#live()?.at ?? null);

	readonly selected: Stop | null = $derived(
		this.document.stops.find((stop) => stop.id === this.selectedStopId) ?? null
	);

	constructor(initial: TripDocument, live: () => LiveTrip | null | undefined) {
		this.#initial = initial;
		this.#live = live;
	}

	member(userId: string) {
		return this.document.members.find((member) => member.userId === userId);
	}

	select(id: string | null): void {
		this.selectedStopId = id;
	}
}
