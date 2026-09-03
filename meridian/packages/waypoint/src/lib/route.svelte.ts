/**
 * A ROUTE THAT KNOWS ITS OWN LENGTH
 * =================================
 *
 * A `Route` is an ordered list of waypoints and everything that follows from
 * the order: the legs between them, the total distance, the rectangle that
 * encloses them. The list is `$state`; the rest is `$derived`, so a consumer
 * that renders `route.total` re-renders when a waypoint moves and at no other
 * time.
 *
 * This file is a `.svelte.ts` module inside a *published library*, which is
 * the point of it being here: `svelte-package` copies it across as
 * `route.svelte.js`, the consuming app's Svelte compiler compiles the runes,
 * and the class works in the consumer exactly as it does here. A library can
 * ship reactive state without shipping a store abstraction.
 */

import { bearing, bounds, distance, type Bounds, type LngLat } from './geo/index.js';

/** A stop on a route. `id` is what `remove` and `move` address it by. */
export interface Waypoint extends LngLat {
	readonly id: string;
	readonly name?: string;
}

/** The leg from one waypoint to the next. */
export interface Leg<W extends Waypoint = Waypoint> {
	readonly from: W;
	readonly to: W;
	/** metres */
	readonly distance: number;
	/** degrees clockwise from north, at the start of the leg */
	readonly bearing: number;
}

export class Route<W extends Waypoint = Waypoint> {
	waypoints: W[] = $state([]);

	readonly legs: Leg<W>[] = $derived.by(() => {
		const legs: Leg<W>[] = [];
		for (let i = 1; i < this.waypoints.length; i += 1) {
			const from = this.waypoints[i - 1]!;
			const to = this.waypoints[i]!;
			legs.push({ from, to, distance: distance(from, to), bearing: bearing(from, to) });
		}
		return legs;
	});

	/** metres, end to end */
	readonly total: number = $derived(this.legs.reduce((sum, leg) => sum + leg.distance, 0));

	readonly bounds: Bounds | null = $derived(bounds(this.waypoints));

	/** The longest leg, or `null` for a route with fewer than two stops. */
	readonly longest: Leg<W> | null = $derived(
		this.legs.reduce<Leg<W> | null>(
			(best, leg) => (best === null || leg.distance > best.distance ? leg : best),
			null
		)
	);

	constructor(waypoints: readonly W[] = []) {
		this.waypoints = [...waypoints];
	}

	/** Insert at `index`, or append. */
	add(waypoint: W, index = this.waypoints.length): void {
		this.waypoints.splice(index, 0, waypoint);
	}

	/** Remove by id. Returns whether anything was removed. */
	remove(id: string): boolean {
		const index = this.indexOf(id);
		if (index < 0) return false;
		this.waypoints.splice(index, 1);
		return true;
	}

	/** Move the waypoint at `from` so that it sits at `to`. */
	move(from: number, to: number): void {
		if (from === to) return;
		const [item] = this.waypoints.splice(from, 1);
		if (item === undefined) return;
		this.waypoints.splice(to, 0, item);
	}

	/** Replace the whole list — what a drag-and-drop zone does on drop. */
	replace(waypoints: readonly W[]): void {
		this.waypoints = [...waypoints];
	}

	indexOf(id: string): number {
		return this.waypoints.findIndex((w) => w.id === id);
	}

	get(id: string): W | undefined {
		return this.waypoints.find((w) => w.id === id);
	}

	/** A plain copy, for sending over the wire. */
	toJSON(): W[] {
		return $state.snapshot(this.waypoints) as W[];
	}
}
