/**
 * GEOMETRY
 * ========
 *
 * Board coordinates, not screen coordinates. Nothing in this file knows about
 * zoom, scroll or devicePixelRatio — that conversion lives in `canvas/camera`,
 * and keeping it out of here means every function below is a pure function of
 * numbers and can be tested without a browser.
 *
 * The y axis points down, matching the DOM and SVG. Every "top" here is a
 * smaller number than the corresponding "bottom", which is worth saying once
 * because half of the sign errors in canvas code come from someone assuming the
 * other convention for one function.
 */

import type { Point, Port, Rect } from './types';

export function contains(rect: Rect, point: Point): boolean {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.w &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.h
	);
}

/** Do two rectangles share any area? Touching edges count as overlapping. */
export function intersects(a: Rect, b: Rect): boolean {
	return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** The smallest rectangle containing all of them, or `null` for none. */
export function bounds(rects: Iterable<Rect>): Rect | null {
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	let seen = false;

	for (const rect of rects) {
		seen = true;
		left = Math.min(left, rect.x);
		top = Math.min(top, rect.y);
		right = Math.max(right, rect.x + rect.w);
		bottom = Math.max(bottom, rect.y + rect.h);
	}

	return seen ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}

/** Grow a rectangle on all sides. Negative shrinks. */
export function inflate(rect: Rect, by: number): Rect {
	return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

/** A rectangle from two corners, in any order. Used by the marquee. */
export function fromCorners(a: Point, b: Point): Rect {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y)
	};
}

export function centre(rect: Rect): Point {
	return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * The point on a node's edge where a connection attaches.
 *
 * `auto` picks the side facing the other end, which is what makes a diagram
 * rearrange itself sensibly when a box is dragged across the board.
 *
 * The choice is the dominant axis of the gap between centres: a total function
 * of two rectangles, with no trigonometry and no state. It does flip at the
 * diagonal — drag a box past 45 degrees and the arrow moves from the right edge
 * to the bottom one — and that is accepted rather than smoothed away.
 *
 * Hysteresis would remove the flip and would make the routing depend on where
 * the box came *from*. In a shared document that is a divergence: two people
 * whose boxes arrived at the same place by different paths would see the arrow
 * attached to different sides of the same node. Determinism wins.
 */
export function portPoint(rect: Rect, port: Port, towards: Point): Point {
	const middle = centre(rect);
	const side = port === 'auto' ? autoPort(middle, towards) : port;

	switch (side) {
		case 'top':
			return { x: middle.x, y: rect.y };
		case 'bottom':
			return { x: middle.x, y: rect.y + rect.h };
		case 'left':
			return { x: rect.x, y: middle.y };
		case 'right':
			return { x: rect.x + rect.w, y: middle.y };
		case 'auto':
			// Unreachable: `autoPort` never returns 'auto'. Present because the
			// compiler cannot know that, and a thrown error here would be a lie.
			return middle;
	}
}

function autoPort(from: Point, to: Point): Exclude<Port, 'auto'> {
	const dx = to.x - from.x;
	const dy = to.y - from.y;

	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
	return dy >= 0 ? 'bottom' : 'top';
}

/**
 * An orthogonal route between two nodes: the elbow polyline a system diagram
 * wants, rather than a straight line between centres.
 *
 * Three segments at most. A real router would avoid the other nodes; this one
 * deliberately does not, because a router that reroutes while you drag makes the
 * diagram feel unstable, and because "the line goes behind that box" is a
 * problem people fix by moving the box.
 */
export function route(from: Rect, to: Rect, fromPort: Port, toPort: Port): Point[] {
	const start = portPoint(from, fromPort, centre(to));
	const end = portPoint(to, toPort, centre(from));

	const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
	const middle = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2;

	if (horizontal) {
		return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
	}
	return [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
}

/**
 * An SVG path with rounded corners through a polyline.
 *
 * The radius shrinks to fit the shorter of the two adjoining segments, so a
 * tight elbow bends as far as it can rather than overshooting into a loop —
 * which is what a fixed radius does, and it looks like a knot.
 */
export function roundedPath(points: readonly Point[], radius = 10): string {
	if (points.length === 0) return '';
	if (points.length < 3)
		return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

	let path = `M${points[0]!.x} ${points[0]!.y}`;

	for (let i = 1; i < points.length - 1; i += 1) {
		const previous = points[i - 1]!;
		const corner = points[i]!;
		const next = points[i + 1]!;

		const inLength = distance(previous, corner);
		const outLength = distance(corner, next);
		const r = Math.min(radius, inLength / 2, outLength / 2);

		if (r < 0.5) {
			path += ` L${corner.x} ${corner.y}`;
			continue;
		}

		const enter = along(corner, previous, r);
		const leave = along(corner, next, r);

		path += ` L${enter.x} ${enter.y} Q${corner.x} ${corner.y} ${leave.x} ${leave.y}`;
	}

	const last = points.at(-1)!;
	return `${path} L${last.x} ${last.y}`;
}

function distance(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

/** `by` units from `from` in the direction of `to`. */
function along(from: Point, to: Point, by: number): Point {
	const length = distance(from, to);
	if (length === 0) return from;
	return {
		x: from.x + ((to.x - from.x) / length) * by,
		y: from.y + ((to.y - from.y) / length) * by
	};
}

/** Round to the nearest multiple. The grid is 8 units; snapping is opt-in. */
export function snap(value: number, grid: number): number {
	return grid <= 0 ? value : Math.round(value / grid) * grid;
}
