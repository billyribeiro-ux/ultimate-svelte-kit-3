import { describe, expect, it } from 'vitest';
import {
	bounds,
	centre,
	contains,
	fromCorners,
	inflate,
	intersects,
	portPoint,
	roundedPath,
	route,
	snap
} from './geometry';

const box = { x: 10, y: 20, w: 100, h: 50 };

describe('hit testing', () => {
	it('includes the edges', () => {
		expect(contains(box, { x: 10, y: 20 })).toBe(true);
		expect(contains(box, { x: 110, y: 70 })).toBe(true);
		expect(contains(box, { x: 9, y: 20 })).toBe(false);
	});

	it('treats touching rectangles as intersecting', () => {
		// The marquee selects what it touches. A strict test makes a shape the
		// rubber band is visibly resting against fail to select, which reads as lag.
		expect(intersects(box, { x: 110, y: 20, w: 10, h: 10 })).toBe(true);
		expect(intersects(box, { x: 111, y: 20, w: 10, h: 10 })).toBe(false);
	});
});

describe('bounds', () => {
	it('wraps everything given', () => {
		expect(bounds([box, { x: -10, y: 0, w: 20, h: 20 }])).toEqual({
			x: -10,
			y: 0,
			w: 120,
			h: 70
		});
	});

	it('is null for nothing', () => {
		expect(bounds([])).toBeNull();
	});

	it('inflates and finds a centre', () => {
		expect(inflate(box, 5)).toEqual({ x: 5, y: 15, w: 110, h: 60 });
		expect(centre(box)).toEqual({ x: 60, y: 45 });
	});
});

describe('fromCorners', () => {
	it('normalises a rectangle dragged in any direction', () => {
		const downRight = fromCorners({ x: 0, y: 0 }, { x: 10, y: 10 });
		const upLeft = fromCorners({ x: 10, y: 10 }, { x: 0, y: 0 });
		expect(downRight).toEqual(upLeft);
	});
});

describe('ports', () => {
	it('picks the side facing the other node', () => {
		expect(portPoint(box, 'auto', { x: 500, y: 45 })).toEqual({ x: 110, y: 45 });
		expect(portPoint(box, 'auto', { x: -500, y: 45 })).toEqual({ x: 10, y: 45 });
		expect(portPoint(box, 'auto', { x: 60, y: 500 })).toEqual({ x: 60, y: 70 });
		expect(portPoint(box, 'auto', { x: 60, y: -500 })).toEqual({ x: 60, y: 20 });
	});

	it('honours an explicit side', () => {
		expect(portPoint(box, 'left', { x: 500, y: 45 })).toEqual({ x: 10, y: 45 });
	});

	it('is a pure function of the two positions, flip and all', () => {
		/*
		 * The port does change at the diagonal, and that is the accepted cost of
		 * having no state. What must never vary is the answer for a given geometry:
		 * two people whose boxes ended up in the same place by different routes have
		 * to see the arrow on the same side.
		 */
		const justInside = { x: 60 + 100, y: 45 + 99 };
		const justOutside = { x: 60 + 100, y: 45 + 101 };

		expect(portPoint(box, 'auto', justInside)).toEqual({ x: 110, y: 45 }); // right
		expect(portPoint(box, 'auto', justOutside)).toEqual({ x: 60, y: 70 }); // bottom
		expect(portPoint(box, 'auto', justInside)).toEqual(portPoint(box, 'auto', justInside));
	});
});

describe('routing', () => {
	it('produces an elbow with a mid-point turn', () => {
		const from = { x: 0, y: 0, w: 100, h: 50 };
		const to = { x: 300, y: 200, w: 100, h: 50 };
		const points = route(from, to, 'auto', 'auto');

		expect(points).toHaveLength(4);
		expect(points[0]).toEqual({ x: 100, y: 25 }); // right side of `from`
		expect(points.at(-1)).toEqual({ x: 300, y: 225 }); // left side of `to`
	});

	it('draws a path whose corners bend rather than knot', () => {
		const path = roundedPath([
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
			{ x: 50, y: 50 }
		]);

		expect(path.startsWith('M0 0')).toBe(true);
		expect(path).toContain('Q50 0');
	});

	it('falls back to a straight corner when the segments are too short to bend', () => {
		// A fixed radius on a one-unit segment overshoots the corner and loops.
		const path = roundedPath(
			[
				{ x: 0, y: 0 },
				{ x: 0.5, y: 0 },
				{ x: 0.5, y: 0.5 }
			],
			10
		);

		expect(path).not.toContain('Q');
		expect(path).toBe('M0 0 L0.5 0 L0.5 0.5');
	});

	it('handles degenerate input', () => {
		expect(roundedPath([])).toBe('');
		expect(roundedPath([{ x: 1, y: 2 }])).toBe('M1 2');
	});
});

describe('snap', () => {
	it('rounds to the grid, and is a no-op when the grid is off', () => {
		expect(snap(13, 8)).toBe(16);
		expect(snap(11, 8)).toBe(8);
		expect(snap(13, 0)).toBe(13);
	});
});
