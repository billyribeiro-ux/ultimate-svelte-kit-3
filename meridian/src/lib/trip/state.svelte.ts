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
 *   - what THIS PERSON is doing: the selected stop. Local `$state`, never
 *     sent anywhere. (The open tab is not here: it lives in the URL, so a
 *     link to the expenses tab is a link to the expenses tab.)
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
	/** metres along the scheduled stops */
	readonly total: number = $derived(pathLength(this.scheduled));

	readonly presence = $derived.by(() => this.#live()?.presence ?? []);

	constructor(initial: TripDocument, live: () => LiveTrip | null | undefined) {
		this.#initial = initial;
		this.#live = live;
	}

	select(id: string | null): void {
		this.selectedStopId = id;
	}
}
