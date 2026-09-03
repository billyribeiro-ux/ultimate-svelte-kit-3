import { describe, expect, it } from 'vitest';
import {
	arc,
	bearing,
	bounds,
	compassPoint,
	destination,
	distance,
	finalBearing,
	formatDistance,
	interpolate,
	midpoint,
	normalizeLng,
	pad,
	pathLength,
	unwrap
} from './index.js';

const LONDON = { lng: -0.1278, lat: 51.5074 };
const PARIS = { lng: 2.3522, lat: 48.8566 };
const NEW_YORK = { lng: -74.006, lat: 40.7128 };
const TOKYO = { lng: 139.6917, lat: 35.6895 };
const SAN_FRANCISCO = { lng: -122.4194, lat: 37.7749 };

describe('distance', () => {
	it('London to Paris is about 344 km', () => {
		expect(distance(LONDON, PARIS) / 1000).toBeCloseTo(343.5, 0);
	});

	it('is symmetric and zero to itself', () => {
		expect(distance(LONDON, PARIS)).toBeCloseTo(distance(PARIS, LONDON), 6);
		expect(distance(LONDON, LONDON)).toBe(0);
	});

	it('is accurate for points a metre apart', () => {
		const near = destination(LONDON, 90, 1);
		expect(distance(LONDON, near)).toBeCloseTo(1, 3);
	});

	it('sums along a path', () => {
		expect(pathLength([LONDON, PARIS, LONDON])).toBeCloseTo(2 * distance(LONDON, PARIS), 6);
		expect(pathLength([])).toBe(0);
		expect(pathLength([LONDON])).toBe(0);
	});
});

describe('bearing', () => {
	it('London to Paris sets out south-east', () => {
		expect(bearing(LONDON, PARIS)).toBeCloseTo(148.1, 0);
		expect(compassPoint(bearing(LONDON, PARIS))).toBe('SSE');
	});

	it('London to New York starts north of west and arrives south of west', () => {
		const start = bearing(LONDON, NEW_YORK);
		const end = finalBearing(LONDON, NEW_YORK);
		expect(start).toBeGreaterThan(270);
		expect(end).toBeLessThan(270);
	});

	it('is always in [0, 360)', () => {
		expect(bearing(PARIS, LONDON)).toBeGreaterThanOrEqual(0);
		expect(bearing(PARIS, LONDON)).toBeLessThan(360);
	});
});

describe('destination', () => {
	it('round-trips with distance and bearing', () => {
		const d = distance(LONDON, PARIS);
		const b = bearing(LONDON, PARIS);
		const there = destination(LONDON, b, d);
		expect(there.lat).toBeCloseTo(PARIS.lat, 4);
		expect(there.lng).toBeCloseTo(PARIS.lng, 4);
	});

	it('folds longitude across the antimeridian', () => {
		const east = destination({ lng: 179.9, lat: 0 }, 90, 50_000);
		expect(east.lng).toBeLessThan(-179);
		expect(normalizeLng(540)).toBe(-180);
		expect(normalizeLng(-190)).toBe(170);
	});
});

describe('interpolate', () => {
	it('is the endpoints at 0 and 1', () => {
		const start = interpolate(LONDON, PARIS, 0);
		const end = interpolate(LONDON, PARIS, 1);
		expect(start.lat).toBeCloseTo(LONDON.lat, 8);
		expect(end.lng).toBeCloseTo(PARIS.lng, 8);
	});

	it('the midpoint is equidistant', () => {
		const mid = midpoint(LONDON, NEW_YORK);
		expect(distance(LONDON, mid)).toBeCloseTo(distance(mid, NEW_YORK), 3);
	});

	it('follows the great circle, not the straight line on the map', () => {
		// The great circle from London to New York bows north of both cities.
		const mid = midpoint(LONDON, NEW_YORK);
		expect(mid.lat).toBeGreaterThan(Math.max(LONDON.lat, NEW_YORK.lat));
	});

	it('handles a zero-length leg', () => {
		expect(interpolate(LONDON, LONDON, 0.5)).toEqual(LONDON);
	});
});

describe('arc and unwrap', () => {
	it('has segments + 1 points from start to end', () => {
		const points = arc(LONDON, PARIS, 8);
		expect(points).toHaveLength(9);
		expect(points[0]![1]).toBeCloseTo(LONDON.lat, 6);
		expect(points[8]![1]).toBeCloseTo(PARIS.lat, 6);
	});

	it('does not leap across the map on a Pacific crossing', () => {
		const points = arc(TOKYO, SAN_FRANCISCO, 32);
		for (let i = 1; i < points.length; i += 1) {
			expect(Math.abs(points[i]![0] - points[i - 1]![0])).toBeLessThan(180);
		}
		// It keeps going east, past 180, rather than turning round.
		expect(points.at(-1)![0]).toBeGreaterThan(180);
	});

	it('unwrap leaves a well-behaved path alone', () => {
		const path = [
			[0, 0],
			[10, 0],
			[20, 0]
		] as const;
		expect(unwrap(path)).toEqual(path.map((p) => [...p]));
	});
});

describe('bounds and pad', () => {
	it('is null for nothing and a point for one', () => {
		expect(bounds([])).toBeNull();
		expect(bounds([PARIS])).toEqual({
			west: PARIS.lng,
			east: PARIS.lng,
			south: PARIS.lat,
			north: PARIS.lat
		});
	});

	it('encloses every point', () => {
		const box = bounds([LONDON, PARIS, NEW_YORK])!;
		expect(box.west).toBe(NEW_YORK.lng);
		expect(box.east).toBe(PARIS.lng);
		expect(box.south).toBe(NEW_YORK.lat);
		expect(box.north).toBe(LONDON.lat);
	});

	it('pads by a fraction and never below a minimum size', () => {
		const single = pad(bounds([PARIS])!);
		expect(single.east - single.west).toBeGreaterThan(0.05);
		const wide = pad({ west: 0, east: 10, south: 0, north: 10 }, 0.1);
		expect(wide.west).toBeCloseTo(-1, 8);
		expect(wide.north).toBeCloseTo(11, 8);
	});

	it('never pads past the poles', () => {
		const polar = pad({ west: 0, east: 1, south: 89, north: 90 }, 0.5);
		expect(polar.north).toBe(90);
	});
});

describe('compassPoint', () => {
	it('names the sixteen points and wraps at 360', () => {
		expect(compassPoint(0)).toBe('N');
		expect(compassPoint(22.5)).toBe('NNE');
		expect(compassPoint(40)).toBe('NE');
		expect(compassPoint(45)).toBe('NE');
		expect(compassPoint(90)).toBe('E');
		expect(compassPoint(202.5)).toBe('SSW');
		expect(compassPoint(225)).toBe('SW');
		expect(compassPoint(350)).toBe('N');
		expect(compassPoint(-90)).toBe('W');
	});
});

describe('formatDistance', () => {
	it('picks metres below a kilometre and rounds sensibly above', () => {
		expect(formatDistance(850, 'en')).toBe('850 m');
		expect(formatDistance(3_450, 'en')).toBe('3.5 km');
		expect(formatDistance(343_500, 'en')).toBe('344 km');
	});

	it('speaks the locale', () => {
		expect(formatDistance(343_500, 'de')).toBe('344 km');
		expect(formatDistance(3_450, 'de')).toBe('3,5 km');
		expect(formatDistance(3_450, 'pt-BR')).toBe('3,5 km');
	});

	it('does miles and feet on request', () => {
		expect(formatDistance(343_500, 'en', 'imperial')).toBe('213 mi');
		expect(formatDistance(100, 'en', 'imperial')).toBe('328 ft');
	});
});
