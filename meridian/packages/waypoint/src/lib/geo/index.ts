/**
 * GEODESY ON A SPHERE
 * ===================
 *
 * Everything a trip planner needs to know about the shape of the Earth, and
 * nothing it does not. The Earth is treated as a sphere of mean radius
 * 6,371,008.8 m — the WGS84 mean — which puts every distance within 0.3 % of
 * the ellipsoid answer. A route between two cities is planned to the nearest
 * kilometre, not the nearest metre, and the ellipsoid formulas (Vincenty's)
 * cost a page of iteration for a difference nobody would see on a map.
 *
 * Conventions, because they are where geo code goes wrong:
 *
 *   - A point is `{ lng, lat }`, in DEGREES, longitude first — the same order
 *     as GeoJSON and MapLibre, and the opposite of the way people say it.
 *     `toPosition` converts to the `[lng, lat]` tuple GeoJSON wants.
 *   - A bearing is in degrees clockwise from north, in `[0, 360)`.
 *   - A distance is in METRES. Formatting to kilometres or miles is the last
 *     thing that happens, in `formatDistance`, and only for a person to read.
 *
 * Nothing here imports Svelte. The `./geo` subpath of the package is for
 * anybody, in any framework, or in none.
 */

/** A point on the sphere, in degrees. Longitude first, like GeoJSON. */
export interface LngLat {
	readonly lng: number;
	readonly lat: number;
}

/** The same point as the tuple GeoJSON uses. */
export type Position = readonly [lng: number, lat: number];

/** A rectangle on the sphere, in degrees. */
export interface Bounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

/** WGS84 mean radius, in metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function toPosition(point: LngLat): [number, number] {
	return [point.lng, point.lat];
}

export function fromPosition([lng, lat]: Position): LngLat {
	return { lng, lat };
}

/** Longitude folded into `[-180, 180)`. */
export function normalizeLng(lng: number): number {
	return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** A bearing folded into `[0, 360)`. */
export function normalizeBearing(degrees: number): number {
	return ((degrees % 360) + 360) % 360;
}

/**
 * The great-circle distance between two points, in metres — the haversine
 * formula, which stays accurate for points a metre apart where the plain
 * spherical law of cosines loses every digit to rounding.
 */
export function distance(a: LngLat, b: LngLat): number {
	const φ1 = a.lat * RAD;
	const φ2 = b.lat * RAD;
	const Δφ = (b.lat - a.lat) * RAD;
	const Δλ = (b.lng - a.lng) * RAD;

	const h =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

	// `min(1, …)` guards against a floating-point 1.0000000002, whose square
	// root would hand `asin` a value it refuses.
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The sum of the distances along a path, in metres. */
export function pathLength(points: readonly LngLat[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i += 1) {
		total += distance(points[i - 1]!, points[i]!);
	}
	return total;
}

/**
 * The initial bearing from `a` to `b`: the compass direction you set out on.
 * A great circle curves, so the bearing changes along the way — London to
 * New York starts out north-west and arrives heading south-west.
 */
export function bearing(a: LngLat, b: LngLat): number {
	const φ1 = a.lat * RAD;
	const φ2 = b.lat * RAD;
	const Δλ = (b.lng - a.lng) * RAD;

	const y = Math.sin(Δλ) * Math.cos(φ2);
	const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

	return normalizeBearing(Math.atan2(y, x) * DEG);
}

/** The bearing you arrive on: the reverse of the initial bearing back. */
export function finalBearing(a: LngLat, b: LngLat): number {
	return normalizeBearing(bearing(b, a) + 180);
}

/** The point `meters` away from `from` along `bearingDeg`. */
export function destination(from: LngLat, bearingDeg: number, meters: number): LngLat {
	const δ = meters / EARTH_RADIUS_M;
	const θ = bearingDeg * RAD;
	const φ1 = from.lat * RAD;
	const λ1 = from.lng * RAD;

	const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
	const φ2 = Math.asin(sinφ2);
	const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
	const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
	const λ2 = λ1 + Math.atan2(y, x);

	return { lng: normalizeLng(λ2 * DEG), lat: φ2 * DEG };
}

/**
 * The point a fraction `t` of the way from `a` to `b` along the great circle.
 *
 * Not a linear blend of latitudes and longitudes — that would draw a straight
 * line on a flat map, which is the *long* way round. This blends the two
 * points as unit vectors on the sphere (spherical linear interpolation), so
 * `t = 0.5` is the true halfway point.
 */
export function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
	const d = distance(a, b) / EARTH_RADIUS_M;
	if (d === 0) return { lng: a.lng, lat: a.lat };

	const φ1 = a.lat * RAD;
	const λ1 = a.lng * RAD;
	const φ2 = b.lat * RAD;
	const λ2 = b.lng * RAD;

	const A = Math.sin((1 - t) * d) / Math.sin(d);
	const B = Math.sin(t * d) / Math.sin(d);

	const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
	const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
	const z = A * Math.sin(φ1) + B * Math.sin(φ2);

	return {
		lng: Math.atan2(y, x) * DEG,
		lat: Math.atan2(z, Math.hypot(x, y)) * DEG
	};
}

export function midpoint(a: LngLat, b: LngLat): LngLat {
	return interpolate(a, b, 0.5);
}

/**
 * The great circle from `a` to `b` as a polyline of `segments + 1` positions,
 * with longitudes unwrapped so a line across the Pacific does not leap from
 * +179 to −179 and draw itself across the whole map.
 */
export function arc(a: LngLat, b: LngLat, segments = 64): Position[] {
	const points: Position[] = [];
	for (let i = 0; i <= segments; i += 1) {
		const p = interpolate(a, b, i / segments);
		points.push([p.lng, p.lat]);
	}
	return unwrap(points);
}

/**
 * Make consecutive longitudes continuous across the antimeridian.
 *
 * A step of more than 180° between neighbours can only mean the path crossed
 * the date line; adding or subtracting 360° from everything after it keeps
 * the line whole. MapLibre draws longitudes beyond ±180 on the next copy of
 * the world, which is exactly what a person expects to see.
 */
export function unwrap(points: readonly Position[]): Position[] {
	const out: Position[] = [];
	let offset = 0;
	let previous: number | undefined;

	for (const [lng, lat] of points) {
		let l = lng + offset;
		if (previous !== undefined) {
			if (l - previous > 180) {
				offset -= 360;
				l -= 360;
			} else if (l - previous < -180) {
				offset += 360;
				l += 360;
			}
		}
		out.push([l, lat]);
		previous = l;
	}

	return out;
}

/** The smallest rectangle around the points, or `null` for no points. */
export function bounds(points: readonly LngLat[]): Bounds | null {
	if (points.length === 0) return null;

	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;

	for (const { lng, lat } of points) {
		if (lng < west) west = lng;
		if (lng > east) east = lng;
		if (lat < south) south = lat;
		if (lat > north) north = lat;
	}

	return { west, south, east, north };
}

/**
 * A rectangle grown by a fraction of its own size on every side, and never
 * smaller than `minimum` degrees across — so that a single stop still gets
 * a view around it rather than a rectangle of zero width.
 */
export function pad(box: Bounds, fraction = 0.15, minimum = 0.05): Bounds {
	const width = Math.max(box.east - box.west, minimum);
	const height = Math.max(box.north - box.south, minimum);
	const dx = width * fraction;
	const dy = height * fraction;
	const cx = (box.east + box.west) / 2;
	const cy = (box.north + box.south) / 2;

	return {
		west: cx - width / 2 - dx,
		east: cx + width / 2 + dx,
		south: Math.max(-90, cy - height / 2 - dy),
		north: Math.min(90, cy + height / 2 + dy)
	};
}

/** The sixteen points of the compass, clockwise from north. */
export const COMPASS_POINTS = [
	'N',
	'NNE',
	'NE',
	'ENE',
	'E',
	'ESE',
	'SE',
	'SSE',
	'S',
	'SSW',
	'SW',
	'WSW',
	'W',
	'WNW',
	'NW',
	'NNW'
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** The nearest of the sixteen compass points to a bearing. */
export function compassPoint(degrees: number): CompassPoint {
	const index = Math.round(normalizeBearing(degrees) / 22.5) % 16;
	return COMPASS_POINTS[index]!;
}

export type DistanceUnit = 'metric' | 'imperial';

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.280839895;

/**
 * A distance for a person to read, in their locale and their units.
 *
 * `Intl.NumberFormat` with `style: 'unit'` knows that German writes "343 km"
 * with a space and that a mile is "mi" — so the library never carries a table
 * of unit strings, and a locale it has never heard of still comes out right.
 */
export function formatDistance(
	meters: number,
	locale = 'en',
	unit: DistanceUnit = 'metric'
): string {
	if (unit === 'imperial') {
		const miles = meters / METERS_PER_MILE;
		if (miles < 0.1) {
			return new Intl.NumberFormat(locale, {
				style: 'unit',
				unit: 'foot',
				maximumFractionDigits: 0
			}).format(meters * FEET_PER_METER);
		}
		return new Intl.NumberFormat(locale, {
			style: 'unit',
			unit: 'mile',
			maximumFractionDigits: miles < 10 ? 1 : 0
		}).format(miles);
	}

	if (meters < 1000) {
		return new Intl.NumberFormat(locale, {
			style: 'unit',
			unit: 'meter',
			maximumFractionDigits: 0
		}).format(meters);
	}

	const km = meters / 1000;
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: 'kilometer',
		maximumFractionDigits: km < 10 ? 1 : 0
	}).format(km);
}
