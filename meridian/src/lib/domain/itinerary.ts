/**
 * WHERE A STOP SITS
 * =================
 *
 * A stop has a `date` — or `null`, for an idea that has not been given a
 * day yet — and a `position` within that date. Positions are small integers,
 * renumbered from zero whenever a day changes, rather than fractional keys:
 * an itinerary day has a dozen stops, not a million, and integers are what a
 * person expects to see when they look at the database.
 *
 * `place` is the one function that moves a stop. It returns the *changes*,
 * not the new list, because the changes are what the server writes and what
 * `withOverride` applies optimistically before the server answers.
 */

export interface Placed {
	readonly id: string;
	readonly date: string | null;
	readonly position: number;
}

export interface DayGroup<T extends Placed> {
	/** `null` is the "ideas" bucket: stops with no day yet. */
	readonly date: string | null;
	readonly stops: T[];
}

export function byPosition<T extends Placed>(a: T, b: T): number {
	return a.position - b.position || (a.id < b.id ? -1 : 1);
}

/**
 * One group per day of the trip, in order, empty days included — a day with
 * nothing planned is still a day on the page — and one last group for the
 * ideas. A stop dated outside the trip (the trip was shortened) lands with
 * the ideas rather than vanishing.
 */
export function groupByDay<T extends Placed>(
	stops: readonly T[],
	days: readonly string[]
): DayGroup<T>[] {
	const known = new Set(days);
	const groups = new Map<string | null, T[]>(days.map((date) => [date, []]));
	groups.set(null, []);

	for (const stop of stops) {
		const key = stop.date !== null && known.has(stop.date) ? stop.date : null;
		groups.get(key)!.push(stop);
	}

	return [...groups].map(([date, list]) => ({ date, stops: list.sort(byPosition) }));
}

export interface Placement {
	readonly id: string;
	readonly date: string | null;
	readonly position: number;
}

/**
 * Move stop `id` to `date` at `index` within that day. Returns the placements
 * that changed — the moved stop, plus any neighbours whose positions shifted.
 * Throws for an unknown stop; a move onto its own spot returns `[]`.
 */
export function place<T extends Placed>(
	stops: readonly T[],
	id: string,
	date: string | null,
	index: number
): Placement[] {
	const moving = stops.find((s) => s.id === id);
	if (!moving) throw new RangeError(`no stop ${id}`);

	const source = stops.filter((s) => s.date === moving.date && s.id !== id).sort(byPosition);
	const target =
		date === moving.date ? source : stops.filter((s) => s.date === date).sort(byPosition);

	const at = Math.max(0, Math.min(index, target.length));
	const reordered: Placed[] = [...target.slice(0, at), { ...moving, date }, ...target.slice(at)];

	const changes: Placement[] = [];
	const renumber = (list: readonly Placed[], listDate: string | null) => {
		list.forEach((stop, position) => {
			const before = stop.id === id ? moving : stop;
			if (before.position !== position || before.date !== listDate) {
				changes.push({ id: stop.id, date: listDate, position });
			}
		});
	};

	renumber(reordered, date);
	if (date !== moving.date) renumber(source, moving.date);

	return changes;
}

/** Where a new stop goes: after the last one on that day. */
export function nextPosition(stops: readonly Placed[], date: string | null): number {
	let max = -1;
	for (const stop of stops) if (stop.date === date && stop.position > max) max = stop.position;
	return max + 1;
}
